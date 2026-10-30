//API의 404와 에러 응답을 JSON으로 통일하는 미들웨어다.
//Express 기본 에러 핸들러는 개발 모드에서 stack trace(서버 절대경로 포함)를 HTML로 그대로 보여준다.

const { logError } = require('../utils/errors');

//등록된 라우트가 없는 /api 요청
function apiNotFound(req, res) {
  res.status(404).json({ error: '없는 API입니다', code: 'NOT_FOUND' });
}

//인자가 4개여야 Express가 에러 핸들러로 인식한다
function errorHandler(err, req, res, next) {
  //응답을 보내던 중에 난 에러는 Express 기본 처리(연결 종료)에 맡긴다
  if (res.headersSent) return next(err);

  //body-parser가 붙여 주는 type으로 사용자 실수를 구분한다. 사용자 실수는 서버 로그에 남기지 않는다.
  if (err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ error: '요청 본문이 올바른 JSON이 아닙니다', code: 'INVALID_JSON' });
  }
  //express.json({ inflate: false })가 압축된 본문을 거절한 경우
  if (err.type === 'encoding.unsupported') {
    return res
      .status(415)
      .json({ error: '압축된 요청 본문은 지원하지 않습니다', code: 'UNSUPPORTED_ENCODING' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '요청 본문이 너무 큽니다', code: 'PAYLOAD_TOO_LARGE' });
  }

  const errorId = logError(`${req.method} ${req.path}`, err);
  res.status(500).json({ error: '서버 오류가 발생했습니다', code: 'INTERNAL_ERROR', errorId });
}

module.exports = { apiNotFound, errorHandler };
