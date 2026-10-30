//CSP 위반 보고를 받는 라우트다.
//브라우저가 CSP에 막힌(Report-Only면 막혔을) 리소스를 알려 주면 서버 콘솔에 한 줄로 남긴다.
//코드가 바뀌어 CSP가 조용히 깨지는 것을 개발 중에 바로 알아차리려는 용도다.
//
//형식이 두 가지다.
//- report-uri: Content-Type application/csp-report, { "csp-report": {...} }
//- report-to:  Content-Type application/reports+json, [{ type: "csp-violation", body: {...} }]

const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

//아무나 이 경로로 로그를 쏟아붓지 못하게 크기와 횟수를 제한한다
const MAX_REPORTS_PER_MIN = 60;
const limiter = createRateLimiter({
  windowMs: 60 * 1000,
  code: 'TOO_MANY_REPORTS',
  message: 'CSP 보고가 너무 많습니다.',
});

const parseReport = express.json({
  type: ['application/csp-report', 'application/reports+json', 'application/json'],
  limit: '10kb',
  //압축된 보고는 받지 않는다 (server/index.js의 공용 파서와 같은 이유)
  inflate: false,
});

//두 형식에서 위반 정보만 뽑는다
function violationsOf(body) {
  if (Array.isArray(body)) {
    return body.filter((r) => r && r.type === 'csp-violation' && r.body).map((r) => r.body);
  }
  if (body && body['csp-report']) return [body['csp-report']];
  return [];
}

//로그 한 줄에 필요한 값만 짧게 남긴다 (보고 내용은 브라우저가 보낸 것이라 길이를 자른다)
function short(value) {
  return String(value ?? '-').slice(0, 200);
}

router.post('/', parseReport, (req, res) => {
  if (!limiter.take(req.ip || 'unknown', MAX_REPORTS_PER_MIN, res)) return;

  for (const v of violationsOf(req.body)) {
    const directive = v.effectiveDirective || v['effective-directive'] || v['violated-directive'];
    const blocked = v.blockedURL || v['blocked-uri'];
    const source = v.sourceFile || v['source-file'];
    const line = v.lineNumber || v['line-number'];
    const mode = v.disposition || '';
    console.warn(
      `[csp] ${short(mode)} ${short(directive)} blocked=${short(blocked)} at ${short(source)}:${short(line)}`,
    );
  }
  res.status(204).end();
});

module.exports = router;
