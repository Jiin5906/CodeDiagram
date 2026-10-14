//통합 테스트: /api/explain의 캐시 동작. aiService를 mock으로 바꿔 외부 API를 호출하지 않는다.
const request = require('supertest');

jest.mock('../../server/services/aiService', () => ({
  explainFunction: jest.fn(),
}));

const { explainFunction } = require('../../server/services/aiService');
const cache = require('../../server/services/cacheService');
const app = require('../../server/index');

const body = { name: 'add', code: 'def add(a, b):\n    return a + b', filePath: 'math_ops.py' };

beforeEach(() => {
  cache.clear();
  jest.mocked(explainFunction).mockReset();
});

test('calls the AI once and serves the second request from cache', async () => {
  jest.mocked(explainFunction).mockResolvedValue('두 수를 더한다.');

  const first = await request(app).post('/api/explain').send(body);
  expect(first.status).toBe(200);
  expect(first.body).toEqual({ explanation: '두 수를 더한다.', cached: false });

  const second = await request(app).post('/api/explain').send(body);
  expect(second.body).toEqual({ explanation: '두 수를 더한다.', cached: true });
  expect(explainFunction).toHaveBeenCalledTimes(1);
});

test('fills optional fields with empty strings', async () => {
  jest.mocked(explainFunction).mockResolvedValue('설명');
  await request(app).post('/api/explain').send(body);
  expect(explainFunction).toHaveBeenCalledWith({
    name: 'add',
    code: body.code,
    docstring: '',
    comment: '',
    filePath: 'math_ops.py',
  });
});

test('502 when the AI call fails', async () => {
  jest.mocked(explainFunction).mockRejectedValue(new Error('overloaded'));
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await request(app).post('/api/explain').send(body);
  expect(res.status).toBe(502);
  errorSpy.mockRestore();
});
