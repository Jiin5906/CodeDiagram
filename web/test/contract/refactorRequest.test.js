//계약 테스트: AI 리팩토링이 Messages API에 보내는 요청 형식(구조화 출력 포함)과
//응답(test/fixtures/anthropic/refactor_response.json)을 해석하는 방식, 응답 스키마 자체를 검사한다.
//SDK와 프롬프트 파일은 mock으로 바꾸므로 네트워크 호출과 비용이 없다.
const Ajv2020 = require('ajv/dist/2020').default;
const response = require('../fixtures/anthropic/refactor_response.json');
const schema = require('../../schemas/ai-refactor-schema.json');

const mockCreate = jest.fn();
//실제 SDK처럼 에러 클래스를 Anthropic의 정적 속성으로 둔다 (aiService가 instanceof로 검사한다)
jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  const Anthropic = Object.assign(
    jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
    {
      AuthenticationError: class AuthenticationError extends APIError {},
      PermissionDeniedError: class PermissionDeniedError extends APIError {},
    },
  );
  return { Anthropic };
});

const KEY = 'test-key-not-real';

//팀이 작성할 SYSTEM_PROMPT는 테스트마다 바꿔 끼운다
let mockSystemPrompt = '';
jest.mock('../../server/prompts/refactorPrompt', () => ({
  get SYSTEM_PROMPT() {
    return mockSystemPrompt;
  },
  buildUserPrompt: jest.requireActual('../../server/prompts/refactorPrompt').buildUserPrompt,
}));

/** @returns {typeof import('../../server/services/aiService')} */
function loadAiService() {
  //aiService는 프롬프트를 모듈 전역에 잡아 두므로 테스트마다 새로 불러온다
  let mod;
  jest.isolateModules(() => {
    mod = require('../../server/services/aiService');
  });
  return /** @type {any} */ (mod);
}

const context = {
  suggestion: {
    type: 'cycle',
    title: '함수 간 순환 호출 발견',
    description: '순환 경로: main → process_data → main',
    advice: '콜백 패턴으로 순환을 끊으세요',
    relatedNodes: ['main.py::process_data'],
  },
  targets: [
    {
      id: 'main.py::process_data',
      file: 'main.py',
      kind: 'function',
      startLine: 13,
      endLine: 17,
      code: 'def process_data(data):\n    return [clean(v) for v in data]',
    },
  ],
  warnings: [],
};

beforeEach(() => {
  mockCreate.mockReset();
  mockSystemPrompt = '너는 리팩토링 도우미다.';
  delete process.env.ANTHROPIC_REFACTOR_MODEL;
});

describe('refactor request', () => {
  test('구조화 출력과 시스템 프롬프트를 담은 Messages API 요청을 만든다', () => {
    const req = loadAiService().buildRefactorRequest(context);
    expect(req).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: expect.any(Number),
      system: '너는 리팩토링 도우미다.',
      messages: [{ role: 'user', content: expect.any(String) }],
      output_config: { format: { type: 'json_schema', schema } },
    });
    expect(req.messages[0].content).toContain('함수 간 순환 호출 발견');
    expect(req.messages[0].content).toContain(context.targets[0].code);
  });

  test('ANTHROPIC_REFACTOR_MODEL로 모델을 바꿀 수 있다', () => {
    process.env.ANTHROPIC_REFACTOR_MODEL = 'claude-sonnet-5-5';
    expect(loadAiService().buildRefactorRequest(context).model).toBe('claude-sonnet-5-5');
  });

  test('프롬프트가 비어 있으면 REFACTOR_PROMPT_MISSING', () => {
    mockSystemPrompt = '   ';
    expect(() => loadAiService().buildRefactorRequest(context)).toThrow(
      expect.objectContaining({ code: 'REFACTOR_PROMPT_MISSING' }),
    );
  });
});

describe('refactor response', () => {
  test('텍스트 블록의 JSON을 객체로 돌려준다', async () => {
    mockCreate.mockResolvedValue(response);
    const ai = loadAiService();
    const result = await ai.suggestRefactoring(ai.buildRefactorRequest(context), KEY);
    expect(result).toEqual(JSON.parse(response.content[0].text));
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['refusal', { stop_reason: 'refusal' }, 'AI_REFUSED'],
    ['max_tokens', { stop_reason: 'max_tokens' }, 'AI_TRUNCATED'],
    ['텍스트 블록 없음', { content: [] }, 'AI_BAD_RESPONSE'],
    ['JSON이 아님', { content: [{ type: 'text', text: '{"summary":' }] }, 'AI_BAD_RESPONSE'],
  ])('%s → %s', async (_, patch, code) => {
    mockCreate.mockResolvedValue({ ...response, ...patch });
    const ai = loadAiService();
    await expect(
      ai.suggestRefactoring(ai.buildRefactorRequest(context), KEY),
    ).rejects.toMatchObject({ code });
  });

  test('API 키가 없으면 호출하지 않고 AI_KEY_MISSING을 던진다', async () => {
    const ai = loadAiService();
    await expect(ai.suggestRefactoring(ai.buildRefactorRequest(context))).rejects.toMatchObject({
      code: 'AI_KEY_MISSING',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('ai-refactor-schema.json', () => {
  test('픽스처 응답이 스키마를 따른다', () => {
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const ok = validate(JSON.parse(response.content[0].text));
    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);
  });

  //구조화 출력은 일부 JSON Schema 키워드만 지원하므로, 스키마를 고칠 때 이 목록 밖의 키워드를 쓰지 않게 막는다
  test('구조화 출력이 지원하는 키워드만 쓴다', () => {
    const ALLOWED = new Set([
      'type',
      'properties',
      'required',
      'additionalProperties',
      'items',
      'description',
      '$defs',
      '$ref',
    ]);
    const used = new Set();
    (function walk(node, isPropertyMap) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return;
      for (const [key, value] of Object.entries(node)) {
        //properties·$defs 아래의 키는 필드 이름이므로 키워드가 아니다
        if (!isPropertyMap) used.add(key);
        walk(value, !isPropertyMap && (key === 'properties' || key === '$defs'));
      }
    })(schema, false);
    expect([...used].filter((k) => !ALLOWED.has(k))).toEqual([]);
  });
});
