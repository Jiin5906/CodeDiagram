//AI 기능 라우트 앞에 붙이는 미들웨어다.
//쿠키의 세션ID로 로그인한 사용자의 키를 찾아 res.locals.aiApiKey에 넣는다.
//로그인하지 않았으면 서버 공용 키(.env의 ANTHROPIC_API_KEY)를 쓰고, 그것도 없으면 401을 준다.

const sessionStore = require('../services/sessionStore');
const { readSessionId } = require('../utils/cookies');

//서버 공용 키. 화면에서 개인 키 등록을 뺐으므로 운영에서도 이 키 하나로 AI를 쓴다.
//누구나 서버 주인의 비용으로 호출하게 되므로 aiRateLimit이 IP 기준으로 엄격하게 횟수를 제한한다.
function serverKey() {
  return process.env.ANTHROPIC_API_KEY || null;
}

function requireAiKey(req, res, next) {
  const sessionKey = sessionStore.getApiKey(readSessionId(req));
  //더미 로그인 세션은 빈 키('')라서 공용 키로 넘어간다
  const apiKey = sessionKey || serverKey();
  if (!apiKey && sessionKey === '') {
    return res.status(401).json({
      error:
        '더미 키로는 AI를 쓸 수 없습니다. 실제 API 키를 등록하거나 web/.env에 ANTHROPIC_API_KEY를 넣어 주세요.',
      code: 'LOGIN_REQUIRED',
    });
  }
  if (!apiKey) {
    return res.status(401).json({
      error: 'AI 기능이 설정되지 않았습니다. 서버의 ANTHROPIC_API_KEY를 확인해 주세요.',
      code: 'LOGIN_REQUIRED',
    });
  }
  res.locals.aiApiKey = apiKey;
  //AI 호출 횟수 제한(aiRateLimit)이 누구의 비용인지 구분하는 데 쓴다
  res.locals.aiKeySource = sessionKey ? 'session' : 'fallback';
  next();
}

module.exports = requireAiKey;
