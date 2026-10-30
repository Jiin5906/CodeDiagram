//통합 테스트: 보안 응답 헤더, CSP 위반 보고, API 에러 응답이 JSON이고 서버 내부 정보를 드러내지 않는지 검사한다.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const request = require('supertest');
const app = require('../../server/index');

describe('보안 헤더', () => {
  const originalAncestors = process.env.FRAME_ANCESTORS;
  const originalReportOnly = process.env.CSP_REPORT_ONLY;

  afterEach(() => {
    if (originalAncestors === undefined) delete process.env.FRAME_ANCESTORS;
    else process.env.FRAME_ANCESTORS = originalAncestors;
    if (originalReportOnly === undefined) delete process.env.CSP_REPORT_ONLY;
    else process.env.CSP_REPORT_ONLY = originalReportOnly;
  });

  test('기본 헤더가 붙고 X-Powered-By는 없다', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  test('CSP: 스크립트는 자기 출처만, 스타일은 인라인 전체 허용 없음', async () => {
    const csp = (await request(app).get('/')).headers['content-security-policy'];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('report-uri /api/csp-report');
    const directive = (name) =>
      csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith(`${name} `));
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('style-src')).not.toContain('unsafe-inline');
  });

  test('index.html은 외부 스크립트를 쓰지 않고, 외부 CSS에는 SRI가 붙어 있다', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf-8');
    expect(html).not.toMatch(/<script[^>]+src="https?:/i);

    const externalLinks = [...html.matchAll(/<link\b[^>]*>/gis)]
      .map((m) => m[0])
      .filter((tag) => /href="https?:/i.test(tag));
    expect(externalLinks.length).toBeGreaterThan(0);
    for (const tag of externalLinks) {
      expect(tag).toMatch(/integrity="sha384-[A-Za-z0-9+/=]+"/);
      expect(tag).toMatch(/crossorigin="anonymous"/);
    }
  });

  test('vendor 라이브러리는 1년 캐시(immutable)로 서빙된다', async () => {
    const res = await request(app).get('/vendor/cytoscape@3.30.4/dist/cytoscape.min.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('vendor에 없는 경로나 node_modules는 서빙하지 않는다', async () => {
    expect((await request(app).get('/vendor/cytoscape@0.0.0/x.js')).status).toBe(404);
    expect((await request(app).get('/node_modules/express/package.json')).status).toBe(404);
  });

  test('CSP_REPORT_ONLY=true면 보고 전용 헤더로 바뀐다', async () => {
    process.env.CSP_REPORT_ONLY = 'true';
    const res = await request(app).get('/');
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['content-security-policy-report-only']).toBeDefined();
  });

  test('FRAME_ANCESTORS를 주면 그 출처만 허용하고 X-Frame-Options는 뺀다', async () => {
    process.env.FRAME_ANCESTORS = 'https://docs.example.com, bad;value';
    const res = await request(app).get('/');
    expect(res.headers['content-security-policy']).toContain(
      'frame-ancestors https://docs.example.com;',
    );
    expect(res.headers['content-security-policy']).not.toContain('bad');
    expect(res.headers['x-frame-options']).toBeUndefined();
  });

  test('API 응답만 no-store, 정적 파일은 캐시를 그대로 쓴다', async () => {
    expect((await request(app).get('/api/auth/me')).headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/')).headers['cache-control']).not.toBe('no-store');
  });

  test('index.html에 인라인 이벤트 핸들러가 없다 (CSP가 막는다)', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf-8');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });
});

describe('CSP 위반 보고', () => {
  /** @type {jest.SpyInstance} */
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('report-uri 형식을 받아 서버 로그에 한 줄로 남긴다', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('content-type', 'application/csp-report')
      .send(
        JSON.stringify({
          'csp-report': {
            'effective-directive': 'script-src-elem',
            'blocked-uri': 'https://evil.example/x.js',
            'source-file': 'http://localhost:3000/',
            'line-number': 12,
          },
        }),
      );
    expect(res.status).toBe(204);
    expect(warnSpy.mock.calls[0][0]).toContain('script-src-elem');
    expect(warnSpy.mock.calls[0][0]).toContain('https://evil.example/x.js');
  });

  test('report-to 형식도 받는다', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('content-type', 'application/reports+json')
      .send(
        JSON.stringify([
          {
            type: 'csp-violation',
            body: {
              effectiveDirective: 'style-src-attr',
              blockedURL: 'inline',
              disposition: 'report',
            },
          },
        ]),
      );
    expect(res.status).toBe(204);
    expect(warnSpy.mock.calls[0][0]).toContain('style-src-attr');
  });

  test('10KB가 넘는 보고는 받지 않는다', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('content-type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'blocked-uri': 'x'.repeat(11000) } }));
    expect(res.status).toBe(413);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('API 에러 응답', () => {
  //응답 본문에 stack trace나 서버 절대경로가 섞였는지 본다
  function expectNoInternals(res) {
    expect(res.text).not.toContain('node_modules');
    expect(res.text).not.toMatch(/\n\s+at /);
    expect(res.text).not.toContain(process.cwd());
  }

  test('깨진 JSON은 400 JSON', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .set('content-type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.code).toBe('INVALID_JSON');
    expectNoInternals(res);
  });

  test('너무 큰 본문은 413 JSON', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ source: 'x'.repeat(200000) }));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    expectNoInternals(res);
  });

  test('압축된 요청 본문은 풀지 않고 415 JSON', async () => {
    const gzipped = zlib.gzipSync(JSON.stringify({ source: 'x' }));
    const res = await request(app)
      .post('/api/analyze')
      .set('content-type', 'application/json')
      .set('content-encoding', 'gzip')
      .send(gzipped);
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('UNSUPPORTED_ENCODING');
    expectNoInternals(res);
  });

  test('압축되지 않은 본문(identity)은 그대로 받는다', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .set('content-encoding', 'identity')
      .send({ source: 'relative/none' });
    expect(res.status).toBe(400);
  });

  test('CSP 보고도 압축된 본문은 받지 않는다', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('content-type', 'application/csp-report')
      .set('content-encoding', 'gzip')
      .send(zlib.gzipSync(JSON.stringify({ 'csp-report': {} })));
    expect(res.status).toBe(415);
  });

  test('없는 API는 404 JSON', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('상대경로를 넣어도 서버 작업 폴더가 드러나지 않는다', async () => {
    const res = await request(app).post('/api/analyze').send({ source: 'relative/none' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('relative/none');
    expectNoInternals(res);
  });
});
