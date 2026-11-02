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
