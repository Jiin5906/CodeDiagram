//보안 응답 헤더 미들웨어다. helmet 의존성 대신 필요한 헤더만 직접 붙인다.
//
//CSP(Content-Security-Policy)는 XSS가 생겨도 허용하지 않은 스크립트가 실행되지 않게 하는 마지막 방어선이다.
//스크립트는 public/vendor/에 복사한 라이브러리를 직접 서빙하므로(scripts/vendor.js) 'self'만 허용한다.
//외부는 폰트(CSS + 폰트 파일)만 남았고, 도메인 전체가 아니라 패키지·버전 경로까지만 허용한다.
//위반은 브라우저가 /api/csp-report로 알려 주고 서버 콘솔에 남는다(routes/cspReport.js).

const crypto = require('crypto');

//폰트 CSS는 같은 패키지 경로 아래의 폰트 파일을 불러온다. index.html의 폰트 링크를 바꾸면 함께 고친다.
const FONT_PACKAGES = [
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/',
  'https://cdn.jsdelivr.net/npm/d2coding@1.3.2/',
];

//Cytoscape가 실행 중에 <head>에 넣는 <style> 내용. 'unsafe-inline' 대신 이 내용의 해시만 허용한다.
//Cytoscape를 올리면 내용이 바뀌었는지 test/unit/vendor.test.js가 vendor 파일에서 확인한다.
const CYTOSCAPE_INJECTED_STYLE = '.__________cytoscape_container { position: relative; }';
const CYTOSCAPE_STYLE_HASH = `'sha256-${crypto
  .createHash('sha256')
  .update(CYTOSCAPE_INJECTED_STYLE)
  .digest('base64')}'`;

const STYLE_SOURCES = [...FONT_PACKAGES, CYTOSCAPE_STYLE_HASH];

const CSP_REPORT_PATH = '/api/csp-report';

//다른 화면에 iframe으로 넣는 것을 허용할 출처 (.env의 FRAME_ANCESTORS, 쉼표 구분). 비우면 전부 차단.
//CSP 문법을 깨뜨리는 값(; 공백 따옴표 등)은 버린다.
function frameAncestors() {
  return (process.env.FRAME_ANCESTORS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9.:/*-]+$/i.test(s));
}

function buildCsp(ancestors) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    //우리 코드는 style 속성 대신 CSSOM(el.style)만 쓰므로 'unsafe-inline'이 필요 없다
    `style-src 'self' ${STYLE_SOURCES.join(' ')}`,
    `font-src 'self' ${FONT_PACKAGES.join(' ')}`,
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${ancestors.length > 0 ? ancestors.join(' ') : "'none'"}`,
    //report-to(Reporting API)를 같이 쓰면 Chrome이 report-uri를 무시하고 보고를 모아 늦게 보내서
    //헤드리스 확인에서 70초 동안 도착하지 않았다. 즉시 전송되고 모든 브라우저가 지원하는 report-uri만 쓴다.
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ');
}

function securityHeaders(req, res, next) {
  const ancestors = frameAncestors();

  res.set('X-Content-Type-Options', 'nosniff');
  //X-Frame-Options는 허용 목록을 표현하지 못하므로 FRAME_ANCESTORS가 없을 때만 붙인다 (구형 브라우저용, CSP와 중복)
  if (ancestors.length === 0) res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  //.env의 CSP_REPORT_ONLY=true면 차단하지 않고 위반 보고만 받는다 (CDN·라이브러리를 바꿀 때 확인용)
  const cspHeader =
    process.env.CSP_REPORT_ONLY === 'true'
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
  res.set(cspHeader, buildCsp(ancestors));

  //분석 결과·코드 원문이 브라우저나 프록시 캐시에 남지 않게 한다. 정적 파일은 캐시를 그대로 쓴다.
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { securityHeaders, CSP_REPORT_PATH, CYTOSCAPE_INJECTED_STYLE };
