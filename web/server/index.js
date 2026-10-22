//서버를 생성, 시작하는 코드
//env파일에서 환경변수를 로드하고 미들웨어 설정을 한다.
//테스트(Jest는 NODE_ENV=test)에서는 로컬 .env의 실제 API 키를 읽지 않는다.
if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: __dirname + '/../.env' });
}
const express = require('express');
const cors = require('cors');
const path = require('path');

const analyzeRouter = require('./routes/analyze');
const explainRouter = require('./routes/explain');
const fileRouter = require('./routes/file');
const refactorRouter = require('./routes/refactor');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/analyze', analyzeRouter);
app.use('/api/explain', explainRouter);
app.use('/api/file', fileRouter);
app.use('/api/refactor', refactorRouter);

//node server/index.js로 직접 실행할 때만 포트를 연다. 테스트는 app만 require해서 supertest로 호출한다.
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
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
