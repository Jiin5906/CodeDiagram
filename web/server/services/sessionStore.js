//API 키 로그인 세션 저장소다.
//세션ID(추측할 수 없는 난수) → { apiKey, expiresAt }를 서버 메모리에만 보관한다.
//키를 디스크나 로그에 남기지 않으려고 일부러 메모리에만 둔다. 서버를 재시작하면 모두 사라진다.

const crypto = require('crypto');

//세션 유지 시간 기본값 (8시간). .env의 AUTH_SESSION_TTL_MINUTES로 바꿀 수 있다.
const DEFAULT_TTL_MINUTES = 480;

const sessions = new Map();

function ttlMs() {
  const minutes = Number(process.env.AUTH_SESSION_TTL_MINUTES) || DEFAULT_TTL_MINUTES;
  return minutes * 60 * 1000;
}

//새 세션을 만들고 세션ID를 돌려준다.
function create(apiKey, now = Date.now()) {
  const id = crypto.randomBytes(32).toString('base64url');
  sessions.set(id, { apiKey, expiresAt: now + ttlMs() });
  return id;
}

//세션ID로 키를 찾는다. 없거나 만료됐으면 null을 돌려주고, 만료된 세션은 이때 지운다.
function getApiKey(id, now = Date.now()) {
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= now) {
    sessions.delete(id);
    return null;
  }
  return session.apiKey;
}

function destroy(id) {
  sessions.delete(id);
}

//만료된 세션을 한꺼번에 지운다. 로그아웃하지 않고 떠난 세션이 메모리에 쌓이지 않게 한다.
function purgeExpired(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}

function size() {
  return sessions.size;
}

function clear() {
  sessions.clear();
}

module.exports = { create, getApiKey, destroy, purgeExpired, size, clear };
