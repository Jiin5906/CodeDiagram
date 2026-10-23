//분석한 프로젝트의 파일 원본을 돌려주는 코드
//"코드 보기" 버튼에서 파일 전체 소스를 보여줄 때 사용한다.

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { getProjectRoot } = require('../services/projectRegistry');
const { SUPPORTED_EXTENSIONS } = require('../services/gitService');
const { readSourceFile } = require('../utils/fileEncoding');

const MAX_SIZE = 512 * 1024; // 512KB

router.get('/', (req, res) => {
  const { id, path: relPath } = req.query;

  if (typeof id !== 'string' || typeof relPath !== 'string' || !relPath) {
    return res.status(400).json({ error: 'id와 path가 필요합니다' });
  }

  const root = getProjectRoot(id);
  if (!root) {
    return res.status(404).json({ error: '분석 정보가 만료되었습니다. 다시 분석해 주세요' });
  }

  //지원하는 소스 파일만 허용
  const ext = path.extname(relPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS[ext]) {
    return res.status(400).json({ error: '지원하지 않는 파일 형식입니다' });
  }

  try {
    //심볼릭 링크까지 풀어서 프로젝트 루트 밖으로 나가는 경로(../ 등)를 차단한다
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 루트 경로는 projectRegistry에 등록된 값
    const realRoot = fs.realpathSync(root);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- realpath 후 아래에서 루트 밖 경로를 차단
    const realFile = fs.realpathSync(path.resolve(realRoot, relPath));
    if (!realFile.startsWith(realRoot + path.sep)) {
      return res.status(403).json({ error: '허용되지 않은 경로입니다' });
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 루트 내부로 검증된 경로
    const stat = fs.statSync(realFile);
    if (!stat.isFile()) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다' });
    }
    if (stat.size > MAX_SIZE) {
      return res.status(413).json({ error: '파일이 너무 커서 표시할 수 없습니다' });
    }

    //UTF-8 우선 시도 및 EUC-KR(CP949) 자동 감지 디코딩
    res.json({ path: relPath, code: readSourceFile(realFile) });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다' });
    }
    console.error('File read error:', err);
    res.status(500).json({ error: '파일을 읽지 못했습니다' });
  }
});

module.exports = router;
