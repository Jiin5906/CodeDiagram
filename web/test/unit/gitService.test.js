//단위 테스트: gitService의 보안 검사
//- findFiles가 심볼릭 링크를 따라가지 않아 프로젝트 밖 파일 내용이 분석에 섞이지 않는지
//- validateGitUrl이 https·허용 호스트만 통과시키는지
//- clone 환경이 진짜 git에서 https 외 프로토콜을 막는지 (네트워크 없이 차단 메시지만 확인)
//- pruneRepos가 오래된 clone 폴더부터 지우고 사용 중인 폴더는 남기는지
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  findFiles,
  validateGitUrl,
  cloneRepo,
  holdRepo,
  pruneRepos,
} = require('../../server/services/gitService');
const { registerProject } = require('../../server/services/projectRegistry');
const { canSymlink } = require('../helpers/symlink');

const symlinkTest = canSymlink ? test : test.skip;

//git이 설치되지 않은 환경에서는 진짜 git 테스트를 건너뛴다
function hasGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const gitTest = hasGit() ? test : test.skip;

//validateGitUrl이 던진 에러의 status (통과하면 'ok')
function urlStatus(source) {
  try {
    validateGitUrl(source);
    return 'ok';
  } catch (err) {
    return err.status;
  }
}

describe('validateGitUrl', () => {
  const originalHosts = process.env.GIT_HOSTS;

  afterEach(() => {
    if (originalHosts === undefined) delete process.env.GIT_HOSTS;
    else process.env.GIT_HOSTS = originalHosts;
  });

  test.each([
    ['https://github.com/pallets/itsdangerous', 'ok'],
    ['https://GitHub.com/x/y.git', 'ok'],
    ['https://gitlab.com/x/y', 'ok'],
    ['https://github.com:443/x/y', 'ok'],
    ['http://github.com/x/y', 400],
    ['git@github.com:x/y.git', 400],
    ['file:///etc', 400],
    ['ftp://github.com/x', 400],
    ['ext::sh -c touch% /tmp/pwned', 400],
    ['https://user:pw@github.com/x/y', 400],
    ['https://token@github.com/x/y', 400],
    ['https://github.com:8443/x/y', 403],
    ['https://127.0.0.1/x.git', 403],
    ['https://[::1]/x', 403],
    ['https://169.254.169.254/', 403],
    ['https://2130706433/x', 403],
    ['https://localhost/x', 403],
    ['https://github.com.evil.com/x', 403],
    ['https://evilgithub.com/x', 403],
  ])('%s → %s', (source, expected) => {
    expect(urlStatus(source)).toBe(expected);
  });

  test('GIT_HOSTS로 호스트를 추가한다', () => {
    process.env.GIT_HOSTS = 'git.example.com, git.corp.dev:8443';
    expect(urlStatus('https://git.example.com/x/y')).toBe('ok');
    expect(urlStatus('https://git.corp.dev:8443/x/y')).toBe('ok');
    //포트를 적은 호스트는 그 포트로만, 포트 없이 적은 호스트는 기본 포트로만 허용
    expect(urlStatus('https://git.corp.dev/x/y')).toBe(403);
    expect(urlStatus('https://git.example.com:8443/x/y')).toBe(403);
  });

  test('정규화한 URL을 돌려준다', () => {
    expect(validateGitUrl('https://GitHub.com/x/y')).toBe('https://github.com/x/y');
  });
});

describe('cloneRepo 프로토콜 차단 (진짜 git)', () => {
  //응답용 에러에는 git 출력이 없으므로, git이 실제로 막았는지는 서버 로그(console.error)로 확인한다
  /** @type {jest.SpyInstance} */
  let errorSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function loggedText() {
    return errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
  }

  //validateGitUrl을 우회해 cloneRepo를 직접 불러도 git 단계에서 막히는지 본다
  gitTest('file:// 은 git이 거부한다', async () => {
    await expect(cloneRepo('file:///cd-test-not-exist')).rejects.toMatchObject({ status: 502 });
    expect(loggedText()).toMatch(/transport 'file' not allowed/);
  });

  gitTest('http:// 은 접속 전에 git이 거부한다', async () => {
    await expect(cloneRepo('http://127.0.0.1:9/cd-test.git')).rejects.toMatchObject({
      status: 502,
    });
    expect(loggedText()).toMatch(/transport 'http' not allowed/);
  });
});

describe('findFiles 심볼릭 링크', () => {
  /** @type {string} */
  let tmpDir;
  /** @type {string} */
  let proj;

  //tmp/
  //  secret.py          ← 프로젝트 밖 파일
  //  outside/inner.py   ← 프로젝트 밖 디렉터리
  //  proj/main.py
  //  proj/leak.py       → ../secret.py (파일 링크, 권한이 있을 때만)
  //  proj/linkdir       → ../outside (정션, Windows에서도 권한 없이 만들어진다)
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-symlink-'));
    proj = path.join(tmpDir, 'proj');
    fs.mkdirSync(proj);
    fs.mkdirSync(path.join(tmpDir, 'outside'));
    fs.writeFileSync(path.join(tmpDir, 'secret.py'), 'def leaked():\n    pass\n');
    fs.writeFileSync(path.join(tmpDir, 'outside', 'inner.py'), 'def inner():\n    pass\n');
    fs.writeFileSync(path.join(proj, 'main.py'), 'def main():\n    pass\n');
    fs.symlinkSync(path.join(tmpDir, 'outside'), path.join(proj, 'linkdir'), 'junction');
    if (canSymlink) {
      fs.symlinkSync(path.join(tmpDir, 'secret.py'), path.join(proj, 'leak.py'));
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('링크된 디렉터리 안의 파일은 수집하지 않는다', () => {
    const { files } = findFiles(proj);
    expect(files.map((f) => f.relativePath)).not.toContain('linkdir/inner.py');
    expect(files.map((f) => f.relativePath)).toContain('main.py');
  });

  symlinkTest('지원 확장자의 링크 파일은 건너뛰고 경고를 남긴다', () => {
    const { files, warnings } = findFiles(proj);
    expect(files.map((f) => f.relativePath)).toEqual(['main.py']);
    expect(warnings).toContain('Skipped leak.py: symbolic link');
  });
});

describe('pruneRepos', () => {
  /** @type {string} */
  let dir;
  const HOUR = 60 * 60 * 1000;

  //이름과 "몇 시간 전에 썼는지"로 폴더를 만든다
  function makeRepo(name, hoursAgo) {
    const fullPath = path.join(dir, name);
    fs.mkdirSync(fullPath);
    const time = new Date(Date.now() - hoursAgo * HOUR);
    fs.utimesSync(fullPath, time, time);
    return fullPath;
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-prune-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('상한을 넘으면 오래 쓰지 않은 폴더부터 지운다', () => {
    makeRepo('newest-1', 1);
    makeRepo('middle-1', 2);
    makeRepo('oldest-1', 3);
    pruneRepos(dir, 2);
    expect(fs.readdirSync(dir).sort()).toEqual(['middle-1', 'newest-1']);
  });

  test('분석 중이거나 등록된 폴더는 오래됐어도 남긴다', () => {
    makeRepo('newest-1', 1);
    const inUse = makeRepo('in-use-1', 5);
    const registered = makeRepo('registered-1', 6);
    makeRepo('oldest-1', 7);

    const release = holdRepo(inUse);
    registerProject(registered);
    pruneRepos(dir, 1);
    release();

    expect(fs.readdirSync(dir).sort()).toEqual(['in-use-1', 'newest-1', 'registered-1']);
  });

  test('임시 폴더는 clone 시간 상한보다 오래된 것만 지운다', () => {
    makeRepo('repo-1.tmp-aaaa', 0);
    makeRepo('repo-2.tmp-bbbb', 1);
    pruneRepos(dir, 10);
    expect(fs.readdirSync(dir)).toEqual(['repo-1.tmp-aaaa']);
  });
});
