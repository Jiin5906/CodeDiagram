//통합 테스트: Express 앱 전체를 supertest로 호출한다 (포트를 열지 않음, 네트워크 없음).
//Git URL 분석은 네트워크가 필요하므로 여기서는 로컬 픽스처 경로만 사용한다.
const request = require('supertest');
const app = require('../../server/index');
const { fixture } = require('../helpers/fixtures');

describe('GET /', () => {
  test('serves the frontend', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('POST /api/analyze', () => {
  test('400 when source is missing', async () => {
    const res = await request(app).post('/api/analyze').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('400 when the local path does not exist', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({ source: fixture('does_not_exist') });
    expect(res.status).toBe(400);
  });

  test('returns a graph and analysisId for a local project', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({ source: fixture('sample_project') });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
    expect(res.body.fileCounts.python).toBe(3);
    expect(typeof res.body.analysisId).toBe('string');
  });
});

describe('GET /api/file', () => {
  /** @type {string} */
  let analysisId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({ source: fixture('sample_project') });
    analysisId = res.body.analysisId;
  });

  test('returns the source of a file inside the project', async () => {
    const res = await request(app).get('/api/file').query({ id: analysisId, path: 'main.py' });
    expect(res.status).toBe(200);
    expect(res.body.code).toContain('def main');
  });

  test('400 when path is missing', async () => {
    const res = await request(app).get('/api/file').query({ id: analysisId });
    expect(res.status).toBe(400);
  });

  test('404 for an unknown analysisId', async () => {
    const res = await request(app).get('/api/file').query({ id: 'unknown', path: 'main.py' });
    expect(res.status).toBe(404);
  });

  test('400 for an unsupported extension', async () => {
    const res = await request(app)
      .get('/api/file')
      .query({ id: analysisId, path: '../../../package.json' });
    expect(res.status).toBe(400);
  });

  test('403 for a path outside the project root', async () => {
    const res = await request(app)
      .get('/api/file')
      .query({ id: analysisId, path: '../js_project/app.js' });
    expect(res.status).toBe(403);
  });

  test('404 for a missing file', async () => {
    const res = await request(app).get('/api/file').query({ id: analysisId, path: 'nope.py' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/explain without login', () => {
  test('로그인하지 않으면 입력 검사 전에 401', async () => {
    const res = await request(app).post('/api/explain').send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  test('로그인하지 않으면 AI를 호출하지 않고 401 LOGIN_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/explain')
      .send({ name: 'f', code: 'def f():\n    pass  # 401 test' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('LOGIN_REQUIRED');
  });
});
