//서버 에러 처리 공용 함수다.
//응답에는 원인 상세(stack, 절대경로, git 출력)를 싣지 않고, 서버 로그와 응답에 같은 오류 ID를 남겨 연결한다.
//사용자가 "오류 ID abc123"이라고 알려주면 서버 로그에서 바로 찾을 수 있다.

const crypto = require('crypto');

//에러를 서버 로그에만 자세히 남기고 오류 ID를 돌려준다
function logError(label, err) {
  const errorId = crypto.randomBytes(4).toString('hex');
  console.error(`[${errorId}] ${label}:`, err);
  return errorId;
}

//async 라우트 래퍼다. Express 4는 async 함수가 reject해도 에러 핸들러로 넘기지 않아 요청이 응답 없이 멈춘다.
//라우트마다 try/catch가 있지만, 빠뜨린 경우에도 JSON 에러 핸들러로 가게 하는 안전장치다.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { logError, asyncHandler };
