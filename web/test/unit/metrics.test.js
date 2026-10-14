//결합도 지표(CR-RFC-2026-002) 단위 테스트: 판정 경계값과 Ca·Ce 집계 규칙을 검사한다.
const {
  computeFileMetrics,
  classifyCoupling,
  judgeInstability,
} = require('../../server/services/metricsService');

//엣지 생성 도우미
function edge(source, target) {
  return { source, target, references: [{ line: 1 }] };
}

describe('judgeInstability — I 경계값', () => {
  test.each([
    [0.0, 'SAFE'],
    [0.4, 'SAFE'],
    [0.4001, 'WARN'],
    [0.7, 'WARN'],
    [0.7001, 'HAZARD'],
    [1.0, 'HAZARD'],
  ])('I = %s → %s', (instability, expected) => {
    expect(judgeInstability(instability, 0).status).toBe(expected);
  });
});

describe('judgeInstability — Ce 경계값과 HAZARD 사유', () => {
  test('Ce = 9는 I 구간대로 판정한다', () => {
    expect(judgeInstability(0.5, 9)).toEqual({ status: 'WARN', hazardReasons: [] });
  });

  test('Ce = 10이면 I가 낮아도 HAZARD (사유: efferent)', () => {
    expect(judgeInstability(0.5, 10)).toEqual({ status: 'HAZARD', hazardReasons: ['efferent'] });
  });

  test('I > 0.7만 넘으면 사유는 instability', () => {
    expect(judgeInstability(0.8, 3).hazardReasons).toEqual(['instability']);
  });

  test('둘 다 넘으면 사유 두 개', () => {
    expect(judgeInstability(0.9, 12).hazardReasons).toEqual(['instability', 'efferent']);
  });
});

describe('classifyCoupling', () => {
  test('Ca = Ce = 0이면 N/A, instability는 null', () => {
    expect(classifyCoupling({ ca: 0, ce: 0 })).toEqual({
      instability: null,
      status: 'N/A',
      hazardReasons: [],
    });
  });

  test('instability는 소수점 셋째 자리로 반올림한다 (Ca 2, Ce 11 → 0.846)', () => {
    const result = classifyCoupling({ ca: 2, ce: 11 });
    expect(result.instability).toBe(0.846);
    expect(result.status).toBe('HAZARD');
    expect(result.hazardReasons).toEqual(['instability', 'efferent']);
  });
});

describe('computeFileMetrics — Ca·Ce 집계 규칙', () => {
  const files = ['a.py', 'b.py', 'c.py', 'd.py'];
  test('같은 파일을 여러 번 참조해도 1로 센다', () => {
    const calls = [
      edge('a.py::f', 'b.py::g'),
      edge('a.py::h', 'b.py::k'),
      edge('a.py::f', 'b.py::k'),
    ];
    const m = computeFileMetrics([calls, [], []], files);
    expect(m['a.py'].ce).toBe(1);
    expect(m['b.py'].ca).toBe(1);
  });

  test('같은 파일 내부 참조는 제외한다', () => {
    const calls = [edge('a.py::f', 'a.py::g')];
    const m = computeFileMetrics([calls, [], []], files);
    expect(m['a.py']).toMatchObject({ ca: 0, ce: 0, cbo: 0, status: 'N/A', instability: null });
  });

  test('분석 대상 밖 파일 참조는 제외한다', () => {
    const calls = [edge('a.py::f', 'lib/external.py::g')];
    const m = computeFileMetrics([calls, [], []], files);
    expect(m['a.py'].ce).toBe(0);
    expect(m['lib/external.py']).toBeUndefined();
  });

  test('상속 엣지만 있어도 반영한다', () => {
    const inheritance = [edge('c.py::Child', 'd.py::Parent')];
    const m = computeFileMetrics([[], inheritance, []], files);
    expect(m['c.py']).toMatchObject({ ca: 0, ce: 1, cbo: 1, instability: 1, status: 'HAZARD' });
    expect(m['d.py']).toMatchObject({ ca: 1, ce: 0, cbo: 1, instability: 0, status: 'SAFE' });
  });

  test('변수 참조 엣지만 있어도 반영한다', () => {
    const variables = [edge('a.py::main', 'c.py::CONFIG')];
    const m = computeFileMetrics([[], [], variables], files);
    expect(m['a.py'].ce).toBe(1);
    expect(m['c.py'].ca).toBe(1);
  });

  test('엣지 종류가 달라도 같은 파일 쌍이면 1로 센다', () => {
    const calls = [edge('a.py::f', 'b.py::g')];
    const inheritance = [edge('a.py::A', 'b.py::B')];
    const m = computeFileMetrics([calls, inheritance, []], files);
    expect(m['a.py'].ce).toBe(1);
  });

  test('연결이 없는 파일도 결과에 포함한다 (N/A)', () => {
    const m = computeFileMetrics([[], [], []], files);
    expect(Object.keys(m).sort()).toEqual(files);
    expect(m['d.py'].status).toBe('N/A');
  });
});
