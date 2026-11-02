//DNS rebinding 방어 미들웨어다.
//외부 사이트가 자기 도메인을 127.0.0.1로 돌려 로컬 서버를 호출하면 Host 헤더에 그 도메인이 남으므로 거부한다.
//req.hostname은 trust proxy 설정에 따라 X-Forwarded-Host를 읽을 수 있어서 원본 Host 헤더를 직접 본다.

//10.0.2.2: Android 에뮬레이터 WebView가 호스트 PC에 접속할 때 쓰는 주소
const DEFAULT_HOSTS = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'];

//기본 목록 + .env의 ALLOWED_HOSTS(쉼표 구분). 배포 도메인이 생기면 여기에 넣는다.
function allowedHosts() {
  const extra = (process.env.ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_HOSTS, ...extra]);
}

//Host 헤더에서 포트를 뗀다. [::1]:3000 → [::1], localhost:3000 → localhost
function stripPort(host) {
  const value = host.trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value : value.slice(0, end + 1);
  }
  const colon = value.lastIndexOf(':');
  return colon === -1 ? value : value.slice(0, colon);
}

function hostCheck(req, res, next) {
  const host = req.headers.host;
  if (!host || !allowedHosts().has(stripPort(host))) {
    return res.status(403).json({ error: '허용되지 않은 Host입니다', code: 'INVALID_HOST' });
  }
  next();
}

module.exports = { hostCheck, stripPort };
