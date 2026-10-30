//로그인 시도 횟수 제한 미들웨어다.
//남의 키가 맞는지 이 서버로 대신 시험해 보는 것을 막으려고 같은 IP의 시도 횟수를 제한한다.

const { createRateLimiter } = require('./rateLimit');

const WINDOW_MS = 15 * 60 * 1000; //15분
const MAX_ATTEMPTS = 10;

const limiter = createRateLimiter({
  windowMs: WINDOW_MS,
  code: 'TOO_MANY_ATTEMPTS',
  message: '키 등록 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
});

function loginRateLimit(req, res, next) {
  if (limiter.take(req.ip || 'unknown', MAX_ATTEMPTS, res)) next();
}

//테스트에서 기록을 비운다
function resetLoginAttempts() {
  limiter.reset();
}

module.exports = { loginRateLimit, resetLoginAttempts };
