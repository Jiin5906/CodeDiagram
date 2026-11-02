//계약 테스트: aiService가 Anthropic Messages API에 보내는 요청 형식과,
//응답(test/fixtures/anthropic/message_response.json, 공식 응답 형식)을 해석하는 방식을 검사한다.
//SDK는 mock으로 바꾸므로 네트워크 호출과 비용이 없다.
const response = require('../fixtures/anthropic/message_response.json');

const mockCreate = jest.fn();
const mockList = jest.fn();
//실제 SDK처럼 에러 클래스를 Anthropic의 정적 속성으로 둔다 (aiService가 instanceof로 검사한다)
jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  const Anthropic = Object.assign(
    jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
      models: { list: mockList },
    })),
    {
      AuthenticationError: class AuthenticationError extends APIError {},
      PermissionDeniedError: class PermissionDeniedError extends APIError {},
    },
  );
  return { Anthropic };
});
const { Anthropic } = require('@anthropic-ai/sdk');

const KEY = 'test-key-not-real';

/** @returns {typeof import('../../server/services/aiService')} */
function loadAiService() {
  //테스트끼리 모듈 상태가 섞이지 않게 테스트마다 새로 불러온다
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
  mockList.mockReset();
});

describe('Anthropic Messages API contract', () => {
  test('sends a valid Messages API request', async () => {
    mockCreate.mockResolvedValue(response);
    await loadAiService().explainFunction(input, KEY);

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
    await expect(loadAiService().explainFunction(input, KEY)).resolves.toBe(
      response.content[0].text,
    );
  });

  test('returns undefined when the first block is not text', async () => {
    mockCreate.mockResolvedValue({
      ...response,
      content: [{ type: 'tool_use', id: 'toolu_01', name: 'x', input: {} }],
    });
    await expect(loadAiService().explainFunction(input, KEY)).resolves.toBeUndefined();
  });

  test('throws AI_KEY_MISSING without calling the API when no key is given', async () => {
    await expect(loadAiService().explainFunction(input)).rejects.toMatchObject({
      code: 'AI_KEY_MISSING',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('turns an authentication error into AI_KEY_REJECTED', async () => {
    mockCreate.mockRejectedValue(new Anthropic.AuthenticationError('invalid x-api-key'));
    await expect(loadAiService().explainFunction(input, KEY)).rejects.toMatchObject({
      code: 'AI_KEY_REJECTED',
    });
  });

  test('propagates API errors to the caller', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('overloaded'), { status: 529 }));
    await expect(loadAiService().explainFunction(input, KEY)).rejects.toThrow('overloaded');
  });
});

describe('verifyApiKey', () => {
  test('lists one model with no retries and a short timeout', async () => {
    mockList.mockResolvedValue({ data: [] });
    await expect(loadAiService().verifyApiKey(KEY)).resolves.toBe(true);
    expect(mockList).toHaveBeenCalledWith({ limit: 1 });
    expect(Anthropic).toHaveBeenLastCalledWith({ apiKey: KEY, maxRetries: 0, timeout: 10_000 });
  });

  test.each([
    ['401', Anthropic.AuthenticationError],
    ['403', Anthropic.PermissionDeniedError],
  ])('returns false on %s', async (_, ErrorClass) => {
    mockList.mockRejectedValue(new ErrorClass('denied'));
    await expect(loadAiService().verifyApiKey(KEY)).resolves.toBe(false);
  });

  test('rethrows network errors', async () => {
    mockList.mockRejectedValue(new Error('ECONNRESET'));
    await expect(loadAiService().verifyApiKey(KEY)).rejects.toThrow('ECONNRESET');
  });
});
