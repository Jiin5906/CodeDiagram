//AI의 설명 API를 호출하는 코드인데, 현재 기본 MVP만 빠르게 완성을 하기 위한 목적으로 AI API키를 설정하지 않아 작동은 하지 않는다.
//추후에 API키를 설정하여 집어 넣으면 잘 작동할 것이다.

const express = require('express');
const router = express.Router();
const { explainFunction, explainCoupling } = require('../services/aiService');
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

//결합도 요청의 참조 목록(incoming/outgoing) 상한
const DEP_LIMITS = { maxItems: 200, maxChars: FIELD_LIMITS.filePath };
//metrics 객체를 JSON으로 바꾼 길이 상한 (지표 몇 개라 이 정도면 충분하다)
const MAX_METRICS_CHARS = 2000;

//참조 목록을 검사하고 프롬프트에 쓰는 두 배열만 남긴다. 문제가 있으면 { status, error }
function normalizeDependencies(dependencies) {
  const value = { incoming: [], outgoing: [] };
  if (dependencies === undefined || dependencies === null) return { value };
  for (const field of ['incoming', 'outgoing']) {
    const list = dependencies[field];
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')) {
      return { status: 400, error: `dependencies.${field}는 문자열 배열이어야 합니다` };
    }
    if (list.length > DEP_LIMITS.maxItems) {
      return {
        status: 413,
        error: `dependencies.${field}가 너무 많습니다 (최대 ${DEP_LIMITS.maxItems}개)`,
      };
    }
    if (list.some((item) => item.length > DEP_LIMITS.maxChars)) {
      return {
        status: 413,
        error: `dependencies.${field} 항목이 너무 깁니다 (최대 ${DEP_LIMITS.maxChars}자)`,
      };
    }
    value[field] = list;
  }
  return { value };
}

//파일 결합도 위험(HAZARD/WARN) 진단 및 3줄 리팩토링 제안 생성
//함수 해설과 같이 로그인한 사용자의 키와 사용 횟수 제한을 거친다.
router.post(
  '/coupling',
  requireAiKey,
  asyncHandler(async (req, res) => {
    const { filePath, code, metrics, dependencies } = req.body || {};

    if (typeof filePath !== 'string' || !filePath || typeof code !== 'string' || !code) {
      return res.status(400).json({ error: 'filePath and code are required' });
    }
    if (filePath.length > FIELD_LIMITS.filePath) {
      return res
        .status(413)
        .json({ error: `filePath가 너무 깁니다 (최대 ${FIELD_LIMITS.filePath}자)` });
    }
    //지표와 참조 목록은 객체여야 한다 (프롬프트에 그대로 들어가므로 형태를 확인한다)
    for (const [field, value] of Object.entries({ metrics, dependencies })) {
      if (
        value !== undefined &&
        value !== null &&
        (typeof value !== 'object' || Array.isArray(value))
      ) {
        return res.status(400).json({ error: `${field}는 객체여야 합니다` });
      }
    }

    const deps = normalizeDependencies(dependencies);
    if (deps.error) {
      return res.status(deps.status).json({ error: deps.error });
    }
    const metricsJson = JSON.stringify(metrics || {});
    if (metricsJson.length > MAX_METRICS_CHARS) {
      return res.status(413).json({ error: `metrics가 너무 깁니다 (최대 ${MAX_METRICS_CHARS}자)` });
    }

    //프롬프트에 들어가는 입력을 모두 키에 넣는다. 하나라도 빠지면 다른 입력으로 만든 결과가
    //같은 키로 저장되어 다른 사용자에게 나갈 수 있다 (캐시는 사용자끼리 공유된다)
    const cacheKey = JSON.stringify(['coupling', filePath, code, metrics || {}, deps.value]);
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ explanation: cached, cached: true });
    }

    if (!takeAiQuota(req, res)) return;

    try {
      const explanation = await explainCoupling(
        {
          filePath,
          code,
          metrics: metrics || {},
          dependencies: deps.value,
        },
        res.locals.aiApiKey,
      );

      cache.set(cacheKey, explanation);
      res.json({ explanation, cached: false });
    } catch (err) {
      if (err.code === 'AI_KEY_MISSING' || err.code === 'AI_KEY_REJECTED') {
        return res.status(401).json({
          error: 'API 키가 거부되었습니다. 키를 다시 등록해 주세요.',
          code: err.code,
        });
      }
      const errorId = logError('Coupling explain error', err);
      res.status(502).json({ error: 'AI 결합도 리팩토링 제안 생성에 실패했습니다.', errorId });
    }
  }),
);

module.exports = router;
