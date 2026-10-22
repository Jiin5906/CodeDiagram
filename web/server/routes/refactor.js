//AI 리팩토링 API
//진단 패널의 리팩토링 제안 하나를 받아, 대상 코드를 서버가 읽어 Claude에게 리팩토링안을 요청한다.
//결과는 미리보기용이며 사용자 파일에는 아무것도 쓰지 않는다.
//
//요청: { analysisId, suggestion: { type, title, description, suggestion, relatedNodes, metrics? } }
//응답: { result: (schemas/ai-refactor-schema.json), model, cached, warnings }

const express = require('express');
const router = express.Router();
const { getProjectRoot } = require('../services/projectRegistry');
const { buildRefactorContext } = require('../services/refactorContext');
const { buildRefactorRequest, suggestRefactoring } = require('../services/aiService');
const cache = require('../services/cacheService');

//aiService 에러 code별 응답 (상태 코드, 사용자 메시지)
const AI_ERRORS = {
  REFACTOR_PROMPT_MISSING: [
    503,
    '리팩토링 프롬프트가 설정되지 않았습니다. server/prompts/refactorPrompt.js의 SYSTEM_PROMPT를 작성해 주세요.',
  ],
  AI_REFUSED: [502, 'AI가 이 요청에 대한 답변을 거절했습니다.'],
  AI_TRUNCATED: [
    502,
    'AI 응답이 너무 길어 중간에 잘렸습니다. 더 작은 단위의 제안으로 시도해 주세요.',
  ],
  AI_BAD_RESPONSE: [502, 'AI 응답 형식이 올바르지 않습니다.'],
};

router.post('/', async (req, res) => {
  const { analysisId, suggestion } = req.body || {};

  if (typeof analysisId !== 'string' || !analysisId) {
    return res.status(400).json({ error: 'analysisId가 필요합니다' });
  }
  const root = getProjectRoot(analysisId);
  if (!root) {
    return res.status(404).json({ error: '분석 정보가 만료되었습니다. 다시 분석해 주세요' });
  }

  try {
    const context = buildRefactorContext(root, suggestion);
    const request = buildRefactorRequest(context);

    //모델·프롬프트·코드가 모두 같은 요청이면 캐시를 쓴다
    const cacheKey = JSON.stringify(request);
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        result: cached,
        model: request.model,
        cached: true,
        warnings: context.warnings,
      });
    }

    const result = await suggestRefactoring(request);
    cache.set(cacheKey, result);
    res.json({ result, model: request.model, cached: false, warnings: context.warnings });
  } catch (err) {
    //문맥 단계 에러(잘못된 제안, 경로, 크기)는 status가 붙어 있다
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err.message && err.message.includes('API_KEY')) {
      return res.status(503).json({
        error: 'API 키가 설정되지 않았습니다. .env 파일에 ANTHROPIC_API_KEY를 설정해주세요.',
      });
    }
    if (AI_ERRORS[err.code]) {
      const [status, message] = AI_ERRORS[err.code];
      return res.status(status).json({ error: message });
    }
    console.error('Refactor error:', err);
    res.status(502).json({ error: 'AI 리팩토링 생성에 실패했습니다.' });
  }
});

module.exports = router;
