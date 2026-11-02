//분석한 프로젝트의 파일 원본을 돌려주는 코드
//"코드 보기" 버튼에서 파일 전체 소스를 보여줄 때 사용한다.

const express = require('express');
const router = express.Router();
const { getProjectRoot } = require('../services/projectRegistry');
const { readProjectFile } = require('../utils/projectFile');

router.get('/', (req, res) => {
  const { id, path: relPath } = req.query;

  if (typeof id !== 'string' || typeof relPath !== 'string' || !relPath) {
    return res.status(400).json({ error: 'id와 path가 필요합니다' });
  }

  const root = getProjectRoot(id);
  if (!root) {
    return res.status(404).json({ error: '분석 정보가 만료되었습니다. 다시 분석해 주세요' });
  }

  try {
    res.json({ path: relPath, code: readProjectFile(root, relPath) });
  } catch (err) {
    //경로·형식·크기 문제는 readProjectFile이 status를 붙여 준다
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('File read error:', err);
    res.status(500).json({ error: '파일을 읽지 못했습니다' });
  }
});

module.exports = router;
