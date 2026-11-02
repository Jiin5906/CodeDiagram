//분석한 프로젝트 안의 소스 파일을 안전하게 읽는 공용 함수
//"코드 보기"(/api/file)와 AI 리팩토링(/api/refactor)이 같은 검사를 거치도록 한 곳에 둔다.

const fs = require('fs');
const path = require('path');
const { SUPPORTED_EXTENSIONS } = require('../services/gitService');

const MAX_SIZE = 512 * 1024; // 512KB

//status가 붙은 에러를 만든다. 라우트에서 그대로 HTTP 응답 코드로 쓴다.
function fileError(status, message) {
  return Object.assign(new Error(message), { status });
}

//프로젝트 루트 안의 지원 파일만 읽어 문자열로 돌려준다. 문제가 있으면 status가 붙은 에러를 던진다.
function readProjectFile(root, relPath) {
  //지원하는 소스 파일만 허용
  const ext = path.extname(relPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS[ext]) {
    throw fileError(400, '지원하지 않는 파일 형식입니다');
  }

  try {
    //심볼릭 링크까지 풀어서 프로젝트 루트 밖으로 나가는 경로(../ 등)를 차단한다
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 루트 경로는 projectRegistry에 등록된 값
    const realRoot = fs.realpathSync(root);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- realpath 후 아래에서 루트 밖 경로를 차단
    const realFile = fs.realpathSync(path.resolve(realRoot, relPath));
    if (!realFile.startsWith(realRoot + path.sep)) {
      throw fileError(403, '허용되지 않은 경로입니다');
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 루트 내부로 검증된 경로
    const stat = fs.statSync(realFile);
    if (!stat.isFile()) {
      throw fileError(404, '파일을 찾을 수 없습니다');
    }
    if (stat.size > MAX_SIZE) {
      throw fileError(413, '파일이 너무 커서 표시할 수 없습니다');
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 루트 내부로 검증된 경로
    return fs.readFileSync(realFile, 'utf-8');
  } catch (err) {
    if (err.status) throw err;
    if (err.code === 'ENOENT') {
      throw fileError(404, '파일을 찾을 수 없습니다');
    }
    throw err;
  }
}

//확장자로 파서 언어를 판별한다. 지원하지 않으면 null
function languageOf(relPath) {
  return SUPPORTED_EXTENSIONS[path.extname(relPath).toLowerCase()] || null;
}

module.exports = { readProjectFile, languageOf, MAX_SIZE };
