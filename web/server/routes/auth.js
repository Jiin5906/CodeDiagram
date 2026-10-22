//API 키 로그인 라우트다.
//POST /api/auth/login  { apiKey } → 키를 검증하고 세션 쿠키를 굽는다
//POST /api/auth/logout            → 세션과 쿠키를 지운다
//GET  /api/auth/me                → { loggedIn, dummyLogin } (키는 절대 돌려주지 않는다)
//
//더미 로그인: 개발 환경에서는 키 형식이 아닌 아무 값으로도 로그인된다 (팀원이 키 없이 화면을 확인하려고).
//이때 세션에는 빈 키('')를 넣고, AI 호출은 requireAiKey가 .env의 예비 키로 대신한다.
//개발 환경에서는 원래 로그인하지 않아도 예비 키를 쓰므로 새로 열리는 권한은 없다.

const express = require('express');
const sessionStore = require('../services/sessionStore');
const { verifyApiKey } = require('../services/aiService');
const { loginRateLimit } = require('../middleware/loginRateLimit');
const { readSessionId, setSessionCookie, clearSessionCookie } = require('../utils/cookies');

const router = express.Router();

//Anthropic API 키 형식. 길이 상한은 터무니없이 큰 입력을 Anthropic에 보내지 않기 위해서다.
const API_KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,200}$/;

//운영에서는 항상 끈다. 개발 환경에서도 .env에 AUTH_DUMMY_LOGIN=false를 두면 끌 수 있다.
function dummyLoginEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_DUMMY_LOGIN !== 'false';
}

router.post('/login', loginRateLimit, async (req, res) => {
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
  if (!API_KEY_PATTERN.test(apiKey)) {
    if (dummyLoginEnabled()) {
      startSession(req, res, '');
      return res.json({ loggedIn: true, dummy: true });
    }
    return res.status(400).json({
      error: 'Anthropic API 키 형식이 아닙니다. sk-ant-로 시작하는 키를 입력해 주세요.',
      code: 'INVALID_KEY_FORMAT',
    });
  }

  try {
    if (!(await verifyApiKey(apiKey))) {
      return res.status(401).json({
        error: 'API 키가 올바르지 않거나 권한이 없습니다.',
        code: 'INVALID_KEY',
      });
    }
  } catch (err) {
    //에러 객체 전체를 찍지 않는다 (요청 정보에 키가 섞여 있을 수 있다)
    console.error(`[auth] 키 검증 중 오류: ${err.name}`);
    return res.status(502).json({
      error: 'Anthropic 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      code: 'VERIFY_FAILED',
    });
  }

  startSession(req, res, apiKey);
  res.json({ loggedIn: true });
});

//이전 세션은 지우고 새 세션ID를 발급한다 (세션 고정 공격 방지)
function startSession(req, res, apiKey) {
  sessionStore.destroy(readSessionId(req));
  sessionStore.purgeExpired();
  setSessionCookie(res, sessionStore.create(apiKey));
}

router.post('/logout', (req, res) => {
  sessionStore.destroy(readSessionId(req));
  clearSessionCookie(res);
  res.json({ loggedIn: false });
});

router.get('/me', (req, res) => {
  res.json({
    loggedIn: sessionStore.getApiKey(readSessionId(req)) !== null,
    dummyLogin: dummyLoginEnabled(),
  });
});

module.exports = router;
