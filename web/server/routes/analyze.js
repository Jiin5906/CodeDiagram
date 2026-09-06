//파일 명 그대로 코드를 분석하는 코드
//깃서비스로 프로젝트 경로를 확보

const express = require('express');
const router = express.Router();
const { getProjectPath } = require('../services/gitService');
const { buildGraph } = require('../services/graphBuilder');

router.post('/', async (req, res) => {
  const { source } = req.body;

  if (!source || typeof source !== 'string' || !source.trim()) {
    return res.status(400).json({ error: 'source is required (Git URL or local path)' });
  }

  try {
    const projectPath = await getProjectPath(source.trim());
    const graph = await buildGraph(projectPath);
    res.json(graph);
  } catch (err) {
    if (err.message.includes('does not exist') || err.message.includes('No .py files')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
