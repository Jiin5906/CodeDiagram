//통합 테스트: /api/explain의 캐시 동작, 입력 검사, AI 호출 횟수 제한. aiService를 mock으로 바꿔 외부 API를 호출하지 않는다.
const request = require('supertest');

jest.mock('../../server/services/aiService', () => ({
  explainFunction: jest.fn(),
}));

const { explainFunction } = require('../../server/services/aiService');
const cache = require('../../server/services/cacheService');
const sessionStore = require('../../server/services/sessionStore');
const { resetAiQuota } = require('../../server/middleware/aiRateLimit');
const app = require('../../server/index');

const body = { name: 'add', code: 'def add(a, b):\n    return a + b', filePath: 'math_ops.py' };
const TEST_KEY = 'sk-ant-test-key-not-real';

beforeEach(() => {
  cache.clear();
  resetAiQuota();
  sessionStore.clear();
  jest.mocked(explainFunction).mockReset();
  //로그인 대신 예비 키로 requireAiKey를 통과한다 (로그인 경로는 auth.test.js에서 검사)
  process.env.ANTHROPIC_API_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
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
  expect(explainFunction).toHaveBeenCalledWith(
    {
      name: 'add',
      code: body.code,
      docstring: '',
      comment: '',
      filePath: 'math_ops.py',
    },
    TEST_KEY,
  );
});

test('400 when name or code is missing', async () => {
  const res = await request(app).post('/api/explain').send({ name: 'x' });
  expect(res.status).toBe(400);
  expect(explainFunction).not.toHaveBeenCalled();
});

test('502 when the AI call fails', async () => {
  jest.mocked(explainFunction).mockRejectedValue(new Error('overloaded'));
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await request(app).post('/api/explain').send(body);
  expect(res.status).toBe(502);
  errorSpy.mockRestore();
});

describe('입력 검사', () => {
  test('code가 문자열이 아니면 400', async () => {
    const res = await request(app)
      .post('/api/explain')
      .send({ ...body, code: { toString: 'x' } });
    expect(res.status).toBe(400);
  });

  test('선택 필드가 문자열이 아니면 400', async () => {
    const res = await request(app)
      .post('/api/explain')
      .send({ ...body, docstring: ['x'] });
    expect(res.status).toBe(400);
  });

  test('함수가 상한보다 길면 413이고 AI를 부르지 않는다', async () => {
    process.env.EXPLAIN_MAX_CODE_CHARS = '100';
    const res = await request(app)
      .post('/api/explain')
      .send({ ...body, code: 'x'.repeat(101) });
    delete process.env.EXPLAIN_MAX_CODE_CHARS;
    expect(res.status).toBe(413);
    expect(res.body.error).toContain('101자');
    expect(explainFunction).not.toHaveBeenCalled();
  });
});

describe('AI 호출 횟수 제한', () => {
  const saved = {};
  const ENV = { AI_RATE_LIMIT_FALLBACK_PER_MIN: '2', AI_RATE_LIMIT_SESSION_PER_MIN: '3' };

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    jest.mocked(explainFunction).mockResolvedValue('설명');
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  //캐시에 걸리지 않게 매번 다른 코드를 보낸다
  function explain(i, cookie) {
    const req = request(app).post('/api/explain');
    if (cookie) req.set('Cookie', cookie);
    return req.send({ ...body, code: `def f${i}():\n    pass` });
  }

  test('예비 키는 IP 기준 상한을 넘으면 429와 Retry-After', async () => {
    expect((await explain(1)).status).toBe(200);
    expect((await explain(2)).status).toBe(200);
    const res = await explain(3);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('AI_RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(explainFunction).toHaveBeenCalledTimes(2);
  });

  test('캐시 적중은 횟수에 넣지 않는다', async () => {
    expect((await explain(1)).status).toBe(200);
    for (let i = 0; i < 5; i++) {
      expect((await explain(1)).body.cached).toBe(true);
    }
    expect((await explain(2)).status).toBe(200);
  });

  test('자기 키로 로그인한 세션은 세션 기준의 별도 상한을 쓴다', async () => {
    const cookie = `cd_session=${sessionStore.create('sk-ant-api03-' + 'a'.repeat(40))}`;
    //예비 키 쪽 상한(2)을 다 써도 세션은 영향이 없다
    await explain(1);
    await explain(2);
    expect((await explain(3)).status).toBe(429);

    for (let i = 10; i < 13; i++) {
      expect((await explain(i, cookie)).status).toBe(200);
    }
    expect((await explain(13, cookie)).status).toBe(429);
  });
});
