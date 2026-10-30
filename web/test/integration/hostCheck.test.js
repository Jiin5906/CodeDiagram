//통합 테스트: Host 헤더 검사(DNS rebinding 방어)가 허용 목록 밖의 Host를 403으로 막는지 검사한다.
const request = require('supertest');
const app = require('../../server/index');
const { stripPort } = require('../../server/middleware/hostCheck');

describe('Host 헤더 검사', () => {
  const originalAllowed = process.env.ALLOWED_HOSTS;

  afterEach(() => {
    if (originalAllowed === undefined) delete process.env.ALLOWED_HOSTS;
    else process.env.ALLOWED_HOSTS = originalAllowed;
  });

  test('허용 목록에 없는 Host는 403', async () => {
    const res = await request(app).get('/').set('Host', 'evil.com');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INVALID_HOST');
  });

  test('API 요청도 같은 검사를 거친다', async () => {
    const res = await request(app).get('/api/auth/me').set('Host', 'evil.com:3000');
    expect(res.status).toBe(403);
  });

  test.each(['localhost:3000', '127.0.0.1:3000', '[::1]:3000', '10.0.2.2:3000', 'LOCALHOST'])(
    '%s 는 통과',
    async (host) => {
      const res = await request(app).get('/').set('Host', host);
      expect(res.status).toBe(200);
    },
  );

  test('ALLOWED_HOSTS에 넣은 도메인은 통과', async () => {
    process.env.ALLOWED_HOSTS = 'example.com, other.dev';
    const res = await request(app).get('/').set('Host', 'example.com');
    expect(res.status).toBe(200);
  });
});

describe('stripPort', () => {
  test.each([
    ['localhost:3000', 'localhost'],
    ['localhost', 'localhost'],
    ['[::1]:3000', '[::1]'],
    ['[::1]', '[::1]'],
    ['Example.COM:443', 'example.com'],
  ])('%s → %s', (input, expected) => {
    expect(stripPort(input)).toBe(expected);
  });
});
