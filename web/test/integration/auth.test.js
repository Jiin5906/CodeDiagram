//통합 테스트: /api/auth 로그인·로그아웃과, 로그인 세션의 키가 AI 라우트로 전달되는지 검사한다.
//키 검증(verifyApiKey)과 AI 호출은 mock으로 바꿔 외부 API를 호출하지 않는다.
const request = require('supertest');

jest.mock('../../server/services/aiService', () => ({
  ...jest.requireActual('../../server/services/aiService'),
  verifyApiKey: jest.fn(),
  explainFunction: jest.fn(),
}));

const { verifyApiKey, explainFunction } = require('../../server/services/aiService');
const sessionStore = require('../../server/services/sessionStore');
const cache = require('../../server/services/cacheService');
const { resetLoginAttempts } = require('../../server/middleware/loginRateLimit');
const app = require('../../server/index');

const VALID_KEY = 'sk-ant-api03-' + 'a'.repeat(40);

//응답의 Set-Cookie에서 "cd_session=값" 부분만 꺼낸다
function sessionCookie(res) {
  const cookies = /** @type {string[]} */ (res.headers['set-cookie'] || []);
  const found = cookies.find((c) => c.startsWith('cd_session='));
  return found ? found.split(';')[0] : null;
}

function login(cookie) {
  const req = request(app).post('/api/auth/login');
  if (cookie) req.set('Cookie', cookie);
  return req.send({ apiKey: VALID_KEY });
}

async function isLoggedIn(cookie) {
  const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
  return res.body.loggedIn;
}

beforeEach(() => {
  sessionStore.clear();
  cache.clear();
  resetLoginAttempts();
  jest.mocked(verifyApiKey).mockReset().mockResolvedValue(true);
  jest.mocked(explainFunction).mockReset();
});

describe('POST /api/auth/login', () => {
  //더미 로그인을 끈 상태에서 실제 로그인 경로를 검사한다
  beforeEach(() => {
    process.env.AUTH_DUMMY_LOGIN = 'false';
  });
  afterEach(() => {
    delete process.env.AUTH_DUMMY_LOGIN;
  });

  test('형식이 틀리면 키 검증 없이 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ apiKey: 'hello' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_KEY_FORMAT');
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  test('본문이 없어도 500이 아니라 400', async () => {
    const res = await request(app).post('/api/auth/login');
    expect(res.status).toBe(400);
  });

  test('Anthropic이 거부한 키는 401이고 쿠키를 주지 않는다', async () => {
    jest.mocked(verifyApiKey).mockResolvedValue(false);
    const res = await login();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_KEY');
    expect(sessionCookie(res)).toBeNull();
  });

  test('검증 중 네트워크 오류는 502', async () => {
    jest.mocked(verifyApiKey).mockRejectedValue(new Error('ECONNRESET'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await login();
    spy.mockRestore();
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('VERIFY_FAILED');
  });

  test('성공하면 HttpOnly·SameSite=Strict 세션 쿠키를 주고, 키는 응답에 싣지 않는다', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ loggedIn: true });
    const raw = res.headers['set-cookie'][0];
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/SameSite=Strict/);
    expect(raw).toMatch(/Path=\/api/);
    expect(JSON.stringify(res.headers) + res.text).not.toContain(VALID_KEY);
  });

  test('다시 로그인하면 이전 세션ID는 무효가 된다 (세션 고정 방지)', async () => {
    const first = sessionCookie(await login());
    const second = sessionCookie(await login(first));
    expect(second).not.toBe(first);
    expect(await isLoggedIn(first)).toBe(false);
    expect(await isLoggedIn(second)).toBe(true);
  });

  test('같은 IP에서 11번째 시도는 429', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').send({ apiKey: 'x' });
    }
    const res = await request(app).post('/api/auth/login').send({ apiKey: 'x' });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('더미 로그인 (개발 환경)', () => {
  const body = { name: 'f', code: 'def f():\n    pass  # dummy' };
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AUTH_DUMMY_LOGIN;
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('아무 값이나 넣어도 키 검증 없이 로그인된다', async () => {
    const res = await request(app).post('/api/auth/login').send({ apiKey: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ loggedIn: true, dummy: true });
    expect(verifyApiKey).not.toHaveBeenCalled();
    expect(await isLoggedIn(sessionCookie(res))).toBe(true);
  });

  test('키 형식의 값은 더미가 아니라 실제 검증을 거친다', async () => {
    jest.mocked(verifyApiKey).mockResolvedValue(false);
    const res = await login();
    expect(res.status).toBe(401);
    expect(verifyApiKey).toHaveBeenCalled();
  });

  test('더미 로그인의 AI 호출은 예비 키를 쓴다', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-not-real';
    const cookie = sessionCookie(await request(app).post('/api/auth/login').send({ apiKey: 'x' }));
    jest.mocked(explainFunction).mockResolvedValue('설명');
    const res = await request(app).post('/api/explain').set('Cookie', cookie).send(body);
    expect(res.status).toBe(200);
    expect(explainFunction).toHaveBeenCalledWith(expect.any(Object), 'sk-ant-test-key-not-real');
  });

  test('예비 키가 없으면 더미 로그인으로는 AI를 쓸 수 없다', async () => {
    const cookie = sessionCookie(await request(app).post('/api/auth/login').send({ apiKey: 'x' }));
    const res = await request(app).post('/api/explain').set('Cookie', cookie).send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/더미 키/);
    expect(explainFunction).not.toHaveBeenCalled();
  });

  test('AUTH_DUMMY_LOGIN=false면 꺼진다', async () => {
    process.env.AUTH_DUMMY_LOGIN = 'false';
    const res = await request(app).post('/api/auth/login').send({ apiKey: 'hello' });
    expect(res.status).toBe(400);
  });

  test('운영 환경에서는 항상 꺼진다', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(app).post('/api/auth/login').send({ apiKey: 'hello' });
    expect(res.status).toBe(400);
    const me = await request(app).get('/api/auth/me');
    expect(me.body.dummyLogin).toBe(false);
  });
});

describe('/api/auth/me, /api/auth/logout', () => {
  test('쿠키가 없으면 로그인 안 됨', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.body).toEqual({ loggedIn: false, dummyLogin: true });
  });

  test('로그아웃하면 세션과 쿠키가 사라진다', async () => {
    const cookie = sessionCookie(await login());
    expect(await isLoggedIn(cookie)).toBe(true);

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(/^cd_session=;/);
    expect(await isLoggedIn(cookie)).toBe(false);
  });
});

describe('AI 라우트 로그인 확인', () => {
  const body = { name: 'f', code: 'def f():\n    pass' };

  test('로그인하지 않으면 401 LOGIN_REQUIRED', async () => {
    const res = await request(app).post('/api/explain').send(body);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('LOGIN_REQUIRED');
    expect(explainFunction).not.toHaveBeenCalled();
  });

  test('로그인한 사용자의 키로 AI를 호출한다', async () => {
    const cookie = sessionCookie(await login());
    jest.mocked(explainFunction).mockResolvedValue('설명');
    const res = await request(app).post('/api/explain').set('Cookie', cookie).send(body);
    expect(res.status).toBe(200);
    expect(explainFunction).toHaveBeenCalledWith(expect.any(Object), VALID_KEY);
  });

  test('로그인 뒤 키가 폐기되면 401로 다시 로그인을 요구한다', async () => {
    const cookie = sessionCookie(await login());
    jest
      .mocked(explainFunction)
      .mockRejectedValue(Object.assign(new Error('rejected'), { code: 'AI_KEY_REJECTED' }));
    const res = await request(app).post('/api/explain').set('Cookie', cookie).send(body);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AI_KEY_REJECTED');
  });
});
