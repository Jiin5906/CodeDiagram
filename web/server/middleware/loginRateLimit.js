//로그인 시도 횟수 제한 미들웨어다.
//남의 키가 맞는지 이 서버로 대신 시험해 보는 것을 막으려고 같은 IP의 시도 횟수를 제한한다.
//express-rate-limit 의존성 대신 메모리 Map으로 직접 구현했다.

const WINDOW_MS = 15 * 60 * 1000; //15분
const MAX_ATTEMPTS = 10;

//IP → { count, resetAt }
const attempts = new Map();

function loginRateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.ip || 'unknown';

  let entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, entry);
  }
  entry.count++;

  if (entry.count > MAX_ATTEMPTS) {
    res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({
      error: '키 등록 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      code: 'TOO_MANY_ATTEMPTS',
    });
  }
  next();
}

//테스트에서 기록을 비운다
function resetLoginAttempts() {
  attempts.clear();
}

module.exports = { loginRateLimit, resetLoginAttempts };
