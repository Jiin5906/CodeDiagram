//통합 테스트: /api/explain의 캐시 동작. aiService를 mock으로 바꿔 외부 API를 호출하지 않는다.
const request = require('supertest');

jest.mock('../../server/services/aiService', () => ({
  explainFunction: jest.fn(),
  explainCoupling: jest.fn(),
}));

const { explainFunction, explainCoupling } = require('../../server/services/aiService');
const cache = require('../../server/services/cacheService');
const app = require('../../server/index');

const body = { name: 'add', code: 'def add(a, b):\n    return a + b', filePath: 'math_ops.py' };

beforeEach(() => {
  cache.clear();
  jest.mocked(explainFunction).mockReset();
  jest.mocked(explainCoupling).mockReset();
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

test('POST /api/explain/coupling caches AI refactoring suggestions', async () => {
  const couplingBody = {
    filePath: 'order.py',
    code: 'import auth\ndef run(): pass',
    metrics: { status: 'HAZARD', instability: 0.9, ca: 0, ce: 5, cbo: 5 },
    dependencies: { incoming: [], outgoing: ['auth.py'] },
  };
  jest
    .mocked(explainCoupling)
    .mockResolvedValue('1. 결합도 진단: 높음\n2. 분리 대상: auth\n3. 리팩토링 방향: 분리');

  const first = await request(app).post('/api/explain/coupling').send(couplingBody);
  expect(first.status).toBe(200);
  expect(first.body).toEqual({
    explanation: '1. 결합도 진단: 높음\n2. 분리 대상: auth\n3. 리팩토링 방향: 분리',
    cached: false,
  });

  const second = await request(app).post('/api/explain/coupling').send(couplingBody);
  expect(second.body.cached).toBe(true);
  expect(explainCoupling).toHaveBeenCalledTimes(1);
});

test('POST /api/explain/coupling returns 400 when filePath or code is missing', async () => {
  const res = await request(app).post('/api/explain/coupling').send({ filePath: 'order.py' });
  expect(res.status).toBe(400);
});
