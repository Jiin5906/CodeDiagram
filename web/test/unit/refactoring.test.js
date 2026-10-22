//리팩토링 제안 서비스 단위 테스트: 결합도 제안은 HAZARD 파일에만, 사유별 문구로 만들어지는지 검사한다.
const { generateSuggestions } = require('../../server/services/refactoringService');
const { COUPLING_CRITERIA } = require('../../server/config/couplingThresholds');

//결합도 항목 생성 도우미 (diagnostics.coupling.files의 한 줄)
function entry(file, status, { ca = 0, ce = 0, instability = null, reasons = [] } = {}) {
  return {
    node_id: file,
    file,
    metrics: { ca, ce, cbo: ca + ce, instability, status, hazard_reasons: reasons },
    refactor_target: status === 'HAZARD',
  };
}

//다른 진단은 비워 둔 diagnostics 객체
function diagnosticsWith(files, extra = {}) {
  return {
    cycles: { functions: [], files: [] },
    coupling: { criteria: COUPLING_CRITERIA, files },
    ...extra,
  };
}

function couplingOnly(suggestions) {
  return suggestions.filter((s) => s.type === 'coupling');
}

describe('generateSuggestions — 결합도 제안', () => {
  test('HAZARD 파일에만 제안을 만든다', () => {
    const files = [
      entry('src/hub.py', 'HAZARD', { ca: 1, ce: 4, instability: 0.8, reasons: ['instability'] }),
      entry('src/mid.py', 'WARN', { ca: 2, ce: 2, instability: 0.5 }),
      entry('src/base.py', 'SAFE', { ca: 3, ce: 0, instability: 0 }),
      entry('src/alone.py', 'N/A'),
    ];
    const result = couplingOnly(generateSuggestions(diagnosticsWith(files)));
    expect(result).toHaveLength(1);
    expect(result[0].relatedNodes).toEqual(['src/hub.py']);
  });

  test('제목에는 파일 이름만, 제안에는 지표 원값을 싣는다', () => {
    const metrics = { ca: 2, ce: 11, instability: 0.846, reasons: ['instability', 'efferent'] };
    const [sug] = couplingOnly(
      generateSuggestions(diagnosticsWith([entry('src/core/hub.py', 'HAZARD', metrics)])),
    );
    expect(sug.title).toContain('hub.py');
    expect(sug.title).not.toContain('src/core');
    expect(sug.description).toContain('Ca 2');
    expect(sug.description).toContain('Ce 11');
    expect(sug.description).toContain('I 0.846');
    expect(sug.metrics).toMatchObject({ ca: 2, ce: 11, status: 'HAZARD' });
  });

  test('사유가 instability면 I 기준과 의존성 역전을 안내한다', () => {
    const files = [
      entry('a.py', 'HAZARD', { ca: 1, ce: 4, instability: 0.8, reasons: ['instability'] }),
    ];
    const [sug] = couplingOnly(generateSuggestions(diagnosticsWith(files)));
    expect(sug.description).toContain(`I > ${COUPLING_CRITERIA.warnMax}`);
    expect(sug.suggestion).toContain('의존성 역전');
    expect(sug.suggestion).not.toContain('파사드');
  });

  test('사유가 efferent면 Ce 기준과 책임 분리를 안내한다', () => {
    const files = [
      entry('a.py', 'HAZARD', { ca: 10, ce: 10, instability: 0.5, reasons: ['efferent'] }),
    ];
    const [sug] = couplingOnly(generateSuggestions(diagnosticsWith(files)));
    expect(sug.description).toContain(`Ce ≥ ${COUPLING_CRITERIA.ceHazard}`);
    expect(sug.suggestion).toContain('파사드');
    expect(sug.suggestion).not.toContain('의존성 역전');
  });

  test('사유가 둘 다면 두 안내를 모두 담는다', () => {
    const files = [
      entry('a.py', 'HAZARD', {
        ca: 1,
        ce: 12,
        instability: 0.923,
        reasons: ['instability', 'efferent'],
      }),
    ];
    const [sug] = couplingOnly(generateSuggestions(diagnosticsWith(files)));
    expect(sug.suggestion).toContain('의존성 역전');
    expect(sug.suggestion).toContain('파사드');
  });

  test('결합도 항목이 비어 있으면 결합도 제안도 없다', () => {
    expect(couplingOnly(generateSuggestions(diagnosticsWith([])))).toEqual([]);
  });
});

describe('generateSuggestions — 기존 제안 유지', () => {
  test('순환 참조 제안은 그대로 만든다', () => {
    const diagnostics = diagnosticsWith([], {
      cycles: { functions: [['a.py::f', 'a.py::g', 'a.py::f']], files: [['a.py', 'b.py', 'a.py']] },
    });
    const types = generateSuggestions(diagnostics).map((s) => s.type);
    expect(types).toEqual(['cycle', 'cycle']);
  });
});
