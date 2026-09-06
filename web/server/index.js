//서버를 생성, 시작하는 코드
//env파일에서 환경변수를 로드하고 미들웨어 설정을 한다.
require('dotenv').config({ path: __dirname + '/../.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');

const analyzeRouter = require('./routes/analyze');
const explainRouter = require('./routes/explain');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/analyze', analyzeRouter);
app.use('/api/explain', explainRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
