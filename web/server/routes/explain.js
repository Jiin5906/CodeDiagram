//AI의 설명 API를 호출하는 코드인데, 현재 기본 MVP만 빠르게 완성을 하기 위한 목적으로 AI API키를 설정하지 않아 작동은 하지 않는다.
//추후에 API키를 설정하여 집어 넣으면 잘 작동할 것이다.

const express = require('express');
const router = express.Router();
const { explainFunction } = require('../services/aiService');
const cache = require('../services/cacheService');
const requireAiKey = require('../middleware/requireAiKey');
const { takeAiQuota } = require('../middleware/aiRateLimit');
const { logError, asyncHandler } = require('../utils/errors');

//함수 하나에 충분한 길이 (약 500줄). .env의 EXPLAIN_MAX_CODE_CHARS로 바꿀 수 있다.
const DEFAULT_MAX_CODE_CHARS = 20000;
//code 외 필드의 길이 상한
const FIELD_LIMITS = { name: 200, docstring: 2000, comment: 2000, filePath: 1000 };

function maxCodeChars() {
  const value = Number(process.env.EXPLAIN_MAX_CODE_CHARS);
  return value > 0 ? value : DEFAULT_MAX_CODE_CHARS;
}

//요청 본문을 검사한다. 문제가 있으면 { status, error }, 없으면 null
function validateBody(body) {
  const { name, code } = body;
  if (typeof code !== 'string' || !code || typeof name !== 'string' || !name) {
    return { status: 400, error: 'name and code are required' };
  }
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return { status: 400, error: `${field}는 문자열이어야 합니다` };
    if (value.length > limit)
      return { status: 413, error: `${field}가 너무 깁니다 (최대 ${limit}자)` };
  }
  //잘라서 보내면 잘린 코드에 대한 틀린 해설이 나오므로 거절한다
  const max = maxCodeChars();
  if (code.length > max) {
    return {
      status: 413,
      error: `함수가 너무 길어 AI 해설을 만들 수 없습니다 (${code.length}자, 최대 ${max}자)`,
    };
  }
  return null;
}

router.post(
  '/',
  requireAiKey,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const invalid = validateBody(body);
    if (invalid) {
      return res.status(invalid.status).json({ error: invalid.error });
    }
    const { name, code, docstring, comment, filePath } = body;

    //캐시에 있는지 먼저 확인 (캐시 적중은 비용이 들지 않아 횟수 제한에 넣지 않는다)
    const cached = cache.get(code);
    if (cached) {
      return res.json({ explanation: cached, cached: true });
    }

    if (!takeAiQuota(req, res)) return;

    try {
      const explanation = await explainFunction(
        {
          name,
          code,
          docstring: docstring || '',
          comment: comment || '',
          filePath: filePath || '',
        },
        res.locals.aiApiKey,
      );

      //캐시에 저장
      cache.set(code, explanation);

      res.json({ explanation, cached: false });
    } catch (err) {
      if (err.code === 'AI_KEY_MISSING' || err.code === 'AI_KEY_REJECTED') {
        return res.status(401).json({
          error: 'API 키가 거부되었습니다. 키를 다시 등록해 주세요.',
          code: err.code,
        });
      }
      const errorId = logError('Explain error', err);
      res.status(502).json({ error: 'AI 설명 생성에 실패했습니다.', errorId });
    }
  }),
);

module.exports = router;
