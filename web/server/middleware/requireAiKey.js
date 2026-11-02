//AI 기능 라우트 앞에 붙이는 미들웨어다.
//쿠키의 세션ID로 로그인한 사용자의 키를 찾아 res.locals.aiApiKey에 넣는다.
//로그인하지 않았으면 개발용 예비 키(.env)를 쓰고, 그것도 없으면 401로 로그인을 요구한다.

const sessionStore = require('../services/sessionStore');
const { readSessionId } = require('../utils/cookies');

//운영에서는 예비 키를 쓰지 않는다. 쓰면 로그인하지 않은 누구나 서버 주인의 키로 AI를 호출하게 된다.
function fallbackKey() {
  if (process.env.NODE_ENV === 'production') return null;
  return process.env.ANTHROPIC_API_KEY || null;
}

function requireAiKey(req, res, next) {
  const sessionKey = sessionStore.getApiKey(readSessionId(req));
  //더미 로그인 세션은 빈 키('')라서 예비 키로 넘어간다
  const apiKey = sessionKey || fallbackKey();
  if (!apiKey && sessionKey === '') {
    return res.status(401).json({
      error:
        '더미 키로는 AI를 쓸 수 없습니다. 실제 API 키를 등록하거나 web/.env에 ANTHROPIC_API_KEY를 넣어 주세요.',
      code: 'LOGIN_REQUIRED',
    });
  }
  if (!apiKey) {
    return res.status(401).json({
      error: 'AI 기능을 쓰려면 API 키를 등록해 주세요.',
      code: 'LOGIN_REQUIRED',
    });
  }
  res.locals.aiApiKey = apiKey;
  //AI 호출 횟수 제한(aiRateLimit)이 누구의 비용인지 구분하는 데 쓴다
  res.locals.aiKeySource = sessionKey ? 'session' : 'fallback';
  next();
}

module.exports = requireAiKey;
