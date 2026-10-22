//요청의 쿠키를 읽고, 응답에 로그인 세션 쿠키를 붙이거나 지우는 함수다.
//cookie-parser 의존성을 늘리지 않으려고 필요한 만큼만 직접 구현했다.

const SESSION_COOKIE = 'cd_session';

//HttpOnly: JS에서 읽을 수 없다 (XSS로 세션ID를 훔치지 못하게)
//SameSite=Strict: 다른 사이트에서 보낸 요청에는 쿠키가 실리지 않는다 (CSRF 차단)
//Secure: 운영(HTTPS)에서만 켠다. 로컬 http://localhost에서 켜면 쿠키가 저장되지 않는다.
//path: /api 아래 요청에만 쿠키를 보낸다
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: /** @type {const} */ ('strict'),
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
  };
}

//"a=1; b=2" 형태의 Cookie 헤더에서 name의 값을 찾는다. 없으면 null
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function readSessionId(req) {
  return readCookie(req, SESSION_COOKIE);
}

//maxAge를 주지 않아 브라우저를 닫으면 쿠키도 사라진다. 서버 쪽 만료는 sessionStore가 따로 지킨다.
function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, cookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

module.exports = { readSessionId, setSessionCookie, clearSessionCookie };
