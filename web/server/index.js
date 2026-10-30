//서버를 생성, 시작하는 코드
//env파일에서 환경변수를 로드하고 미들웨어 설정을 한다.
//테스트(Jest는 NODE_ENV=test)에서는 로컬 .env의 실제 API 키를 읽지 않는다.
if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: __dirname + '/../.env' });
}
const express = require('express');
const path = require('path');

const analyzeRouter = require('./routes/analyze');
const explainRouter = require('./routes/explain');
const fileRouter = require('./routes/file');
const refactorRouter = require('./routes/refactor');
const authRouter = require('./routes/auth');
const cspReportRouter = require('./routes/cspReport');
const { hostCheck } = require('./middleware/hostCheck');
const { securityHeaders, CSP_REPORT_PATH } = require('./middleware/securityHeaders');
const { apiNotFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
//기본은 이 PC에서만 접속 가능. LAN이나 Docker 컨테이너에서 열려면 HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';

//응답 헤더에 서버 종류(Express)를 알리지 않는다
app.disable('x-powered-by');

//정적 파일을 포함한 모든 요청이 Host 검사를 거치도록 가장 먼저 등록한다
app.use(hostCheck);
app.use(securityHeaders);
//CSP 보고는 자체 파서(크기 10KB)를 쓰므로 공용 JSON 파서보다 먼저 등록한다
app.use(CSP_REPORT_PATH, cspReportRouter);
//압축된 요청 본문(Content-Encoding: gzip 등)은 받을 일이 없으므로 풀지 않고 415로 거절한다.
//body-parser의 압축 해제 기능에서 나온 DoS 취약점(GHSA-27r3-jxmh-p828) 같은 문제를 기능째로 피한다.
app.use(express.json({ inflate: false }));
//public/vendor/의 라이브러리는 폴더 이름에 버전이 들어 있어(cytoscape@3.30.4/) 버전이 바뀌면 URL도 바뀐다.
//그래서 1년 캐시(immutable)를 걸어 페이지를 열 때마다 라이브러리 17개를 다시 확인하지 않게 한다.
app.use(
  '/vendor',
  express.static(path.join(__dirname, '..', 'public', 'vendor'), { maxAge: '1y', immutable: true }),
);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/analyze', analyzeRouter);
app.use('/api/explain', explainRouter);
app.use('/api/file', fileRouter);
app.use('/api/refactor', refactorRouter);
app.use('/api/auth', authRouter);

//여기까지 오면 없는 API다. 에러 핸들러는 모든 라우트 뒤에 둔다.
app.use('/api', apiNotFound);
app.use(errorHandler);

//node server/index.js로 직접 실행할 때만 포트를 연다. 테스트는 app만 require해서 supertest로 호출한다.
if (require.main === module) {
  const server = app.listen(Number(PORT), HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });

  server.on('error', (/** @type {NodeJS.ErrnoException} */ err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `포트 ${PORT}이(가) 이미 사용 중입니다. 기존 프로세스를 종료하거나 다른 포트를 사용하세요.`,
      );
      console.error(`다른 포트 사용: PORT=3001 node server/index.js`);
      process.exit(1);
    }
    throw err;
  });
}

module.exports = app;
