//AI 호출 횟수 제한이다.
//미들웨어로 걸면 캐시 적중(비용 0)까지 세므로, 라우트가 캐시를 확인한 뒤 실제로 API를 부르기 직전에 takeAiQuota를 호출한다.
//
//키를 누가 냈는지에 따라 기준을 나눈다 (requireAiKey가 res.locals.aiKeySource에 남긴다).
//- session: 사용자가 자기 키로 로그인. 비용은 그 사용자가 내므로 세션 기준으로 넉넉하게.
//  세션을 새로 만들어 우회하려면 진짜 키로 다시 로그인해야 하고, 그 비용도 본인이 낸다.
//- fallback: 개발용 예비 키(.env). 서버 주인의 비용이므로 IP 기준으로 엄격하게.

const { createRateLimiter } = require('./rateLimit');
const { readSessionId } = require('../utils/cookies');

const DEFAULT_SESSION_PER_MIN = 60;
const DEFAULT_FALLBACK_PER_MIN = 20;

const limiter = createRateLimiter({
  windowMs: 60 * 1000,
  code: 'AI_RATE_LIMITED',
  message: 'AI 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
});

//.env 값을 테스트에서 바꿔 끼울 수 있게 호출할 때마다 읽는다
function limitFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return value > 0 ? value : fallback;
}

//허용이면 true, 초과면 429를 응답하고 false
function takeAiQuota(req, res) {
  if (res.locals.aiKeySource === 'session') {
    const max = limitFromEnv('AI_RATE_LIMIT_SESSION_PER_MIN', DEFAULT_SESSION_PER_MIN);
    return limiter.take(`session:${readSessionId(req)}`, max, res);
  }
  const max = limitFromEnv('AI_RATE_LIMIT_FALLBACK_PER_MIN', DEFAULT_FALLBACK_PER_MIN);
  return limiter.take(`ip:${req.ip || 'unknown'}`, max, res);
}

//테스트에서 기록을 비운다
function resetAiQuota() {
  limiter.reset();
}

module.exports = { takeAiQuota, resetAiQuota };
