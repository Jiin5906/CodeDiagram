//진단 서비스 단위 테스트: 파일 결합도 요약(정렬·기준 포함)과 runDiagnostics 출력 형태를 검사한다.
const { summarizeCoupling, runDiagnostics } = require('../../server/services/diagnosticsService');
const { COUPLING_CRITERIA } = require('../../server/config/couplingThresholds');

//결합도 항목 생성 도우미 (graphBuilder가 넘겨줄 형태와 같다)
function entry(file, status, instability, cbo) {
  return {
    node_id: file,
    file,
    metrics: { ca: 0, ce: 0, cbo, instability, status, hazard_reasons: [] },
    refactor_target: status === 'HAZARD',
  };
}

describe('summarizeCoupling', () => {
  test('HAZARD → WARN → SAFE → N/A 순으로 정렬한다', () => {
    const entries = [
      entry('safe.py', 'SAFE', 0.2, 3),
      entry('na.py', 'N/A', null, 0),
      entry('hazard.py', 'HAZARD', 0.9, 5),
      entry('warn.py', 'WARN', 0.5, 4),
    ];
    const { files } = summarizeCoupling(entries);
    expect(files.map((f) => f.file)).toEqual(['hazard.py', 'warn.py', 'safe.py', 'na.py']);
  });

  test('같은 등급에서는 I 내림차순 → CBO 내림차순 → 경로순', () => {
    const entries = [
      entry('b.py', 'HAZARD', 0.8, 3),
      entry('a.py', 'HAZARD', 0.8, 3),
      entry('c.py', 'HAZARD', 0.8, 12),
      entry('d.py', 'HAZARD', 1, 2),
    ];
    const { files } = summarizeCoupling(entries);
    expect(files.map((f) => f.file)).toEqual(['d.py', 'c.py', 'a.py', 'b.py']);
  });

  test('I가 0인 SAFE 파일이 N/A보다 앞에 온다', () => {
    const entries = [entry('na.py', 'N/A', null, 0), entry('stable.py', 'SAFE', 0, 4)];
    const { files } = summarizeCoupling(entries);
    expect(files[0].file).toBe('stable.py');
  });

  test('입력 배열의 순서를 바꾸지 않는다', () => {
    const entries = [entry('safe.py', 'SAFE', 0.1, 1), entry('hazard.py', 'HAZARD', 0.9, 2)];
    summarizeCoupling(entries);
    expect(entries[0].file).toBe('safe.py');
  });

  test('판정 기준을 함께 돌려준다', () => {
    expect(summarizeCoupling([]).criteria).toBe(COUPLING_CRITERIA);
  });
});

describe('runDiagnostics', () => {
  test('coupling을 돌려주고 기존 couplingIssues는 없다', () => {
    const result = runDiagnostics([], [entry('a.py', 'SAFE', 0, 1)]);
    expect(result.coupling.files).toHaveLength(1);
    expect(result).not.toHaveProperty('couplingIssues');
    expect(result).not.toHaveProperty('antiPatterns');
  });

  test('결합도 항목을 넘기지 않아도 빈 목록으로 동작한다', () => {
    expect(runDiagnostics([]).coupling.files).toEqual([]);
  });
});

const { detectLargeFiles, detectGodClasses } = require('../../server/services/diagnosticsService');
const { SIZE_CRITERIA } = require('../../server/config/sizeThresholds');

describe('detectLargeFiles', () => {
  const F = SIZE_CRITERIA.file;
  const stat = (file, lines, funcCount) => ({ file, lines, funcCount });

  test('기준 미만 파일은 목록에 없다', () => {
    expect(detectLargeFiles([stat('a.py', F.warnLines - 1, F.warnFuncs - 1)])).toEqual([]);
  });

  test('줄 수 경계값에서 WARN·HAZARD로 나뉜다', () => {
    const [warn] = detectLargeFiles([stat('w.py', F.warnLines, 0)]);
    const [hazard] = detectLargeFiles([stat('h.py', F.hazardLines, 0)]);
    expect(warn).toMatchObject({ status: 'WARN', reasons: ['lines'] });
    expect(hazard).toMatchObject({ status: 'HAZARD', reasons: ['lines'] });
  });

  test('함수 수만으로도 판정한다', () => {
    const [e] = detectLargeFiles([stat('f.py', 10, F.hazardFuncs)]);
    expect(e).toMatchObject({ status: 'HAZARD', reasons: ['funcs'] });
  });

  test('HAZARD → WARN, 같은 등급은 줄 수 많은 순', () => {
    const files = detectLargeFiles([
      stat('w.py', F.warnLines, 0),
      stat('h1.py', F.hazardLines, 0),
      stat('h2.py', F.hazardLines + 10, 0),
    ]);
    expect(files.map((f) => f.file)).toEqual(['h2.py', 'h1.py', 'w.py']);
  });
});

describe('detectGodClasses', () => {
  const K = SIZE_CRITERIA.klass;
  const cls = (filePath, name, startLine, endLine) => ({
    filePath,
    name,
    startLine,
    endLine,
    superclasses: [],
  });
  const methods = (filePath, className, n) =>
    Array.from({ length: n }, (_, i) => ({ filePath, className, name: `m${i}` }));

  test('메서드 수로 판정하고, 다른 파일의 같은 이름 클래스는 따로 센다', () => {
    const result = detectGodClasses(
      [cls('a.py', 'Big', 1, 10), cls('b.py', 'Big', 1, 10)],
      [...methods('a.py', 'Big', K.hazardMethods), ...methods('b.py', 'Big', 1)],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      file: 'a.py',
      className: 'Big',
      status: 'HAZARD',
      reasons: ['methods'],
    });
  });

  test('줄 수로 판정한다', () => {
    const [e] = detectGodClasses([cls('a.py', 'Long', 1, K.warnLines)], []);
    expect(e).toMatchObject({ status: 'WARN', reasons: ['lines'], lines: K.warnLines });
  });

  test('C++은 .h 클래스와 같은 이름 .cpp의 메서드를 묶어 센다 (폴더가 달라도)', () => {
    const result = detectGodClasses(
      [cls('include/calc.h', 'Calc', 1, 10)],
      [
        ...methods('src/calc.cpp', 'Calc', K.warnMethods - 1),
        ...methods('include/calc.h', 'Calc', 1),
      ],
    );
    expect(result[0]).toMatchObject({
      file: 'include/calc.h',
      className: 'Calc',
      methods: K.warnMethods,
      status: 'WARN',
    });
  });

  test('C++이라도 파일 이름이 다르면 묶지 않는다', () => {
    const result = detectGodClasses(
      [cls('calc.h', 'Calc', 1, 10)],
      methods('other.cpp', 'Calc', K.hazardMethods),
    );
    expect(result).toEqual([]);
  });

  test('C++이 아닌 언어는 파일 이름이 같아도 묶지 않는다', () => {
    const result = detectGodClasses(
      [cls('a/model.py', 'M', 1, 10)],
      methods('b/model.py', 'M', K.hazardMethods),
    );
    expect(result).toEqual([]);
  });

  test('같은 파일에 같은 이름 클래스가 두 번 잡혀도 한 번만 본다', () => {
    const result = detectGodClasses(
      [cls('a.cs', 'P', 1, K.hazardLines), cls('a.cs', 'P', 1, K.hazardLines)],
      [],
    );
    expect(result).toHaveLength(1);
  });
});

describe('runDiagnostics size', () => {
  test('입력이 없어도 빈 목록과 기준을 돌려준다', () => {
    const { size } = runDiagnostics([]);
    expect(size).toEqual({ criteria: SIZE_CRITERIA, files: [], classes: [] });
  });
});
