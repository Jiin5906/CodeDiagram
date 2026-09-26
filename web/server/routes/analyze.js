//파일 명 그대로 코드를 분석하는 코드
//깃서비스로 프로젝트 경로를 확보

const express = require('express');
const router = express.Router();
const { getProjectPath } = require('../services/gitService');
const { buildGraph } = require('../services/graphBuilder');
const { registerProject } = require('../services/projectRegistry');

router.post('/', async (req, res) => {
  const { source } = req.body;

  if (!source || typeof source !== 'string' || !source.trim()) {
    return res.status(400).json({ error: 'source is required (Git URL or local path)' });
  }

  try {
    const projectPath = await getProjectPath(source.trim());
    const graph = await buildGraph(projectPath);
    //파일 원본 조회(/api/file)용 id
    graph.analysisId = registerProject(projectPath);
    res.json(graph);
  } catch (err) {
    if (err.message.includes('does not exist') || err.message.includes('지원하는 파일을 찾을 수 없습니다')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
