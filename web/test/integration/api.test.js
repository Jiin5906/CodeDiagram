//통합 테스트: Express 앱 전체를 supertest로 호출한다 (포트를 열지 않음, 네트워크 없음).
//Git URL 분석은 네트워크가 필요하므로 여기서는 로컬 픽스처 경로만 사용한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const app = require('../../server/index');
const { fixture, FIXTURES } = require('../helpers/fixtures');
const { canSymlink } = require('../helpers/symlink');

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

  //git을 실행하기 전에 URL 검사에서 막힌다 (네트워크 접속 없음)
  test.each([
    ['http://127.0.0.1:22/x.git', 400],
    ['git@github.com:x/y.git', 400],
    ['https://169.254.169.254/', 403],
  ])('%s → %s', async (source, status) => {
    const res = await request(app).post('/api/analyze').send({ source });
    expect(res.status).toBe(status);
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

describe('POST /api/analyze 로컬 경로 허용 루트', () => {
  const originalRoots = process.env.LOCAL_ROOTS;
  const originalEnv = process.env.NODE_ENV;
  /** @type {string} */
  let tmpDir;

  //접두어가 같은 형제 폴더(proj, proj-secret)를 만들어 root + sep 비교를 확인한다
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-roots-'));
    for (const name of ['proj', 'proj-secret']) {
      fs.mkdirSync(path.join(tmpDir, name));
      fs.writeFileSync(path.join(tmpDir, name, 'main.py'), 'def main():\n    pass\n');
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    if (originalRoots === undefined) delete process.env.LOCAL_ROOTS;
    else process.env.LOCAL_ROOTS = originalRoots;
    process.env.NODE_ENV = originalEnv;
  });

  function analyze(source) {
    return request(app).post('/api/analyze').send({ source });
  }

  test('LOCAL_ROOTS 안쪽 경로는 200', async () => {
    process.env.LOCAL_ROOTS = FIXTURES;
    const res = await analyze(fixture('sample_project'));
    expect(res.status).toBe(200);
  });

  test('LOCAL_ROOTS 밖 경로는 403', async () => {
    process.env.LOCAL_ROOTS = fixture('sample_project');
    const res = await analyze(fixture('js_project'));
    expect(res.status).toBe(403);
  });

  test('루트 밖의 없는 경로도 400이 아닌 403 (존재 여부를 드러내지 않는다)', async () => {
    process.env.LOCAL_ROOTS = fixture('sample_project');
    const res = await analyze(fixture('does_not_exist'));
    expect(res.status).toBe(403);
  });

  test('..로 루트 밖으로 나가는 경로는 403', async () => {
    process.env.LOCAL_ROOTS = fixture('sample_project');
    const res = await analyze(path.join(fixture('sample_project'), '..', 'js_project'));
    expect(res.status).toBe(403);
  });

  test('접두어만 같은 형제 폴더는 403', async () => {
    process.env.LOCAL_ROOTS = path.join(tmpDir, 'proj');
    expect((await analyze(path.join(tmpDir, 'proj'))).status).toBe(200);
    expect((await analyze(path.join(tmpDir, 'proj-secret'))).status).toBe(403);
  });

  test('운영에서 LOCAL_ROOTS가 없으면 로컬 경로를 막는다', async () => {
    delete process.env.LOCAL_ROOTS;
    process.env.NODE_ENV = 'production';
    const res = await analyze(fixture('sample_project'));
    expect(res.status).toBe(403);
  });

  test('운영이어도 LOCAL_ROOTS 안쪽은 허용한다', async () => {
    process.env.LOCAL_ROOTS = FIXTURES;
    process.env.NODE_ENV = 'production';
    const res = await analyze(fixture('sample_project'));
    expect(res.status).toBe(200);
  });

  (process.platform === 'win32' ? test : test.skip)(
    'Windows에서는 대소문자가 달라도 같은 경로로 본다',
    async () => {
      process.env.LOCAL_ROOTS = FIXTURES.toUpperCase();
      const res = await analyze(fixture('sample_project'));
      expect(res.status).toBe(200);
    },
  );
});

describe('POST /api/analyze 심볼릭 링크', () => {
  /** @type {string} */
  let tmpDir;

  //프로젝트 밖 secret.py를 가리키는 leak.py 링크를 넣은 레포를 흉내 낸다
  beforeAll(() => {
    if (!canSymlink) return;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-leak-'));
    fs.mkdirSync(path.join(tmpDir, 'proj'));
    fs.writeFileSync(path.join(tmpDir, 'secret.py'), 'def leaked_secret():\n    pass\n');
    fs.writeFileSync(path.join(tmpDir, 'proj', 'main.py'), 'def main():\n    pass\n');
    fs.symlinkSync(path.join(tmpDir, 'secret.py'), path.join(tmpDir, 'proj', 'leak.py'));
  });

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  (canSymlink ? test : test.skip)('링크 대상 파일 내용이 분석 결과에 실리지 않는다', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({ source: path.join(tmpDir, 'proj') });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('leaked_secret');
    expect(res.body.warnings).toContain('Skipped leak.py: symbolic link');
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
