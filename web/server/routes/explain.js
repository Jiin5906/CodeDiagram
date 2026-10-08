//AI의 설명 API를 호출하는 코드인데, 현재 기본 MVP만 빠르게 완성을 하기 위한 목적으로 AI API키를 설정하지 않아 작동은 하지 않는다.
//추후에 API키를 설정하여 집어 넣으면 잘 작동할 것이다.

const express = require('express');
const router = express.Router();
const { explainFunction } = require('../services/aiService');
const cache = require('../services/cacheService');

router.post('/', async (req, res) => {
  const { name, code, docstring, comment, filePath } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'name and code are required' });
  }

  //캐시에 있는지 먼저 확인
  const cached = cache.get(code);
  if (cached) {
    return res.json({ explanation: cached, cached: true });
  }

  try {
    const explanation = await explainFunction({
      name,
      code,
      docstring: docstring || '',
      comment: comment || '',
      filePath: filePath || '',
    });

    //캐시에 저장
    cache.set(code, explanation);

    res.json({ explanation, cached: false });
  } catch (err) {
    if (err.message.includes('API_KEY')) {
      return res.status(503).json({
        error: 'API 키가 설정되지 않았습니다. .env 파일에 ANTHROPIC_API_KEY를 설정해주세요.',
      });
    }
    console.error('Explain error:', err);
    res.status(502).json({ error: 'AI 설명 생성에 실패했습니다.' });
  }
});

module.exports = router;
