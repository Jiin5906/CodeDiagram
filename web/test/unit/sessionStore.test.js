//단위 테스트: 로그인 세션 저장소의 발급·조회·만료·삭제. 시간은 now 인자로 고정한다.
const sessionStore = require('../../server/services/sessionStore');

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  sessionStore.clear();
  delete process.env.AUTH_SESSION_TTL_MINUTES;
});

test('발급한 세션ID로 키를 찾는다', () => {
  const id = sessionStore.create('sk-ant-a', 0);
  expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(sessionStore.getApiKey(id, HOUR)).toBe('sk-ant-a');
});

test('세션ID는 매번 다르다', () => {
  expect(sessionStore.create('k', 0)).not.toBe(sessionStore.create('k', 0));
});

test('없는 세션ID나 빈 값은 null', () => {
  expect(sessionStore.getApiKey('nope', 0)).toBeNull();
  expect(sessionStore.getApiKey(null, 0)).toBeNull();
});

test('기본 8시간이 지나면 null을 돌려주고 세션을 지운다', () => {
  const id = sessionStore.create('k', 0);
  expect(sessionStore.getApiKey(id, 8 * HOUR - 1)).toBe('k');
  expect(sessionStore.getApiKey(id, 8 * HOUR)).toBeNull();
  expect(sessionStore.size()).toBe(0);
});

test('AUTH_SESSION_TTL_MINUTES로 유지 시간을 바꾼다', () => {
  process.env.AUTH_SESSION_TTL_MINUTES = '1';
  const id = sessionStore.create('k', 0);
  expect(sessionStore.getApiKey(id, 60 * 1000)).toBeNull();
});

test('destroy는 그 세션만 지운다', () => {
  const a = sessionStore.create('a', 0);
  const b = sessionStore.create('b', 0);
  sessionStore.destroy(a);
  expect(sessionStore.getApiKey(a, 0)).toBeNull();
  expect(sessionStore.getApiKey(b, 0)).toBe('b');
});

test('purgeExpired는 만료된 세션만 지운다', () => {
  sessionStore.create('old', 0);
  const fresh = sessionStore.create('fresh', 8 * HOUR);
  sessionStore.purgeExpired(8 * HOUR);
  expect(sessionStore.size()).toBe(1);
  expect(sessionStore.getApiKey(fresh, 8 * HOUR)).toBe('fresh');
});
