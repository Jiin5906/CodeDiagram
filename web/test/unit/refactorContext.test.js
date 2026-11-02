//단위 테스트: AI 리팩토링 문맥 빌더가 relatedNodes로 대상 코드를 올바르게 잘라내는지 검사한다.
const { buildRefactorContext, MAX_TARGETS } = require('../../server/services/refactorContext');
const { fixture } = require('../helpers/fixtures');

const root = fixture('sample_project');

function suggestion(relatedNodes, extra = {}) {
  return {
    type: 'cycle',
    title: 't',
    description: 'd',
    suggestion: 's',
    relatedNodes,
    ...extra,
  };
}

describe('buildRefactorContext', () => {
  test('함수 노드는 그 함수 범위만 보낸다', () => {
    const { targets, warnings } = buildRefactorContext(root, suggestion(['main.py::process_data']));
    expect(warnings).toEqual([]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ file: 'main.py', kind: 'function', startLine: 13 });
    expect(targets[0].code.startsWith('def process_data(data):')).toBe(true);
    expect(targets[0].code).not.toContain('def clean');
  });

  test('메서드는 qualifiedName으로, 클래스는 클래스 이름으로 찾는다', () => {
    const { targets } = buildRefactorContext(
      root,
      suggestion(['math_ops.py::Calculator.add', 'math_ops.py::Calculator']),
    );
    expect(targets[0]).toMatchObject({ kind: 'function', startLine: 2 });
    expect(targets[1]).toMatchObject({ kind: 'class', startLine: 1 });
    expect(targets[1].code).toContain('def multiply(self, a, b):');
    expect(targets[1].code).not.toContain('def add(a, b):');
  });

  test('파일 노드는 파일 전체를 보낸다', () => {
    const { targets } = buildRefactorContext(root, suggestion(['utils.py'], { type: 'coupling' }));
    expect(targets[0]).toMatchObject({ kind: 'file', startLine: 1, endLine: null });
    expect(targets[0].code).toContain('def helper_func');
    expect(targets[0].code).toContain('def format_text');
  });

  test('이름을 못 찾으면 경고와 함께 파일 전체를 보낸다', () => {
    const { targets, warnings } = buildRefactorContext(root, suggestion(['utils.py::nope']));
    expect(targets[0].kind).toBe('file');
    expect(warnings).toHaveLength(1);
  });

  test('순환 경로처럼 중복된 노드는 한 번만 보낸다', () => {
    const ids = ['main.py::main', 'main.py::process_data', 'main.py::main'];
    const { targets, suggestion: s } = buildRefactorContext(
      root,
      suggestion(ids, { type: 'cycle' }),
    );
    expect(targets).toHaveLength(2);
    expect(s.relatedNodes).toEqual(['main.py::main', 'main.py::process_data']);
  });

  test(`대상이 ${MAX_TARGETS}개를 넘으면 자르고 경고한다`, () => {
    const ids = Array.from({ length: MAX_TARGETS + 2 }, (_, i) => `utils.py::f${i}`);
    const { targets, warnings } = buildRefactorContext(root, suggestion(ids));
    expect(targets).toHaveLength(MAX_TARGETS);
    expect(warnings[0]).toContain(`${MAX_TARGETS}개`);
  });

  test('결합도 지표는 알려진 필드만 남긴다', () => {
    const metrics = { ca: 1, ce: 12, instability: 0.92, hazard_reasons: ['efferent'], extra: 'x' };
    const ctx = buildRefactorContext(root, suggestion(['utils.py'], { type: 'coupling', metrics }));
    expect(ctx.suggestion.metrics).toEqual({
      ca: 1,
      ce: 12,
      instability: 0.92,
      hazard_reasons: ['efferent'],
    });
  });

  test.each([
    ['제안이 없음', undefined],
    ['모르는 종류', suggestion(['main.py'], { type: 'unknown' })],
    ['relatedNodes가 비어 있음', suggestion([])],
    ['relatedNodes에 문자열이 아닌 값', suggestion([1])],
  ])('%s → 400', (_, input) => {
    expect(() => buildRefactorContext(root, input)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  test('루트 밖 경로는 403', () => {
    expect(() => buildRefactorContext(root, suggestion(['../js_project/app.js']))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });
});
