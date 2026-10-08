//계약 테스트: aiService가 Anthropic Messages API에 보내는 요청 형식과,
//응답(test/fixtures/anthropic/message_response.json, 공식 응답 형식)을 해석하는 방식을 검사한다.
//SDK는 mock으로 바꾸므로 네트워크 호출과 비용이 없다.
const response = require('../fixtures/anthropic/message_response.json');

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  Anthropic: jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}));

/** @returns {typeof import('../../server/services/aiService')} */
function loadAiService() {
  //aiService는 클라이언트를 모듈 전역에 캐시하므로 테스트마다 새로 불러온다
  let mod;
  jest.isolateModules(() => {
    mod = require('../../server/services/aiService');
  });
  return /** @type {any} */ (mod);
}

const input = {
  name: 'add',
  code: 'def add(a, b):\n    return a + b',
  docstring: 'Add two numbers.',
  comment: '',
  filePath: 'math_ops.py',
};

beforeEach(() => {
  mockCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe('Anthropic Messages API contract', () => {
  test('sends a valid Messages API request', async () => {
    mockCreate.mockResolvedValue(response);
    await loadAiService().explainFunction(input);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const req = mockCreate.mock.calls[0][0];
    expect(req).toEqual({
      model: expect.any(String),
      max_tokens: expect.any(Number),
      messages: [{ role: 'user', content: expect.any(String) }],
    });
    expect(req.max_tokens).toBeGreaterThan(0);
    expect(req.messages[0].content).toContain('add');
    expect(req.messages[0].content).toContain(input.code);
    expect(req.messages[0].content).toContain('Docstring: Add two numbers.');
  });

  test('returns the text of the first content block', async () => {
    mockCreate.mockResolvedValue(response);
    await expect(loadAiService().explainFunction(input)).resolves.toBe(response.content[0].text);
  });

  test('returns undefined when the first block is not text', async () => {
    mockCreate.mockResolvedValue({
      ...response,
      content: [{ type: 'tool_use', id: 'toolu_01', name: 'x', input: {} }],
    });
    await expect(loadAiService().explainFunction(input)).resolves.toBeUndefined();
  });

  test('throws an API_KEY error when the key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(loadAiService().explainFunction(input)).rejects.toThrow('ANTHROPIC_API_KEY');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('propagates API errors to the caller', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('overloaded'), { status: 529 }));
    await expect(loadAiService().explainFunction(input)).rejects.toThrow('overloaded');
  });
});
