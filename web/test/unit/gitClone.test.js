//단위 테스트: cloneRepo의 clone 실행 방식
//- simple-git에 보안 옵션·환경변수·clone 인자를 빠짐없이 넘기는지
//- 같은 URL 동시 요청은 clone을 한 번만 하는지, 임시 폴더에 받고 이름을 바꾸는지
//- 전체 시간 상한을 넘으면 504로 끝나고 반쯤 받은 폴더를 남기지 않는지
//simple-git을 mock으로 바꿔 실제 clone은 하지 않는다. (git이 실제로 막는지는 gitService.test.js에서 진짜 git으로 확인)
const fs = require('fs');
const path = require('path');

jest.mock('simple-git', () => {
  const instance = { env: jest.fn(), clone: jest.fn() };
  instance.env.mockReturnValue(instance);
  return { simpleGit: jest.fn(() => instance), __instance: instance };
});

const { simpleGit, __instance: git } = require('simple-git');
const { cloneRepo } = require('../../server/services/gitService');

const REPOS_DIR = /** @type {string} */ (process.env.REPOS_DIR);

//clone이 받는 폴더에 파일 하나를 만들어 성공한 것처럼 흉내 낸다
function fakeClone(_url, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.py'), 'def main():\n    pass\n');
  return Promise.resolve();
}

function reposEntries() {
  return fs.existsSync(REPOS_DIR) ? fs.readdirSync(REPOS_DIR) : [];
}

beforeEach(() => {
  jest.mocked(simpleGit).mockClear();
  git.env.mockClear();
  git.clone.mockReset();
  git.clone.mockImplementation(fakeClone);
  fs.rmSync(REPOS_DIR, { recursive: true, force: true });
  fs.mkdirSync(REPOS_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(REPOS_DIR, { recursive: true, force: true });
});

describe('cloneRepo 보안 설정', () => {
  const originalEditor = process.env.GIT_EDITOR;

  beforeEach(async () => {
    //process.env를 통째로 넘기면 simple-git이 거부하는 변수. 넘어가지 않아야 한다.
    process.env.GIT_EDITOR = 'true';
    await cloneRepo('https://github.com/cd-test/mocked-repo');
  });

  afterEach(() => {
    if (originalEditor === undefined) delete process.env.GIT_EDITOR;
    else process.env.GIT_EDITOR = originalEditor;
  });

  test('simple-git 옵션: 안전 환경변수 허용, 유휴·전체 타임아웃, 필요한 unsafe 두 가지만', () => {
    const options = jest.mocked(simpleGit).mock.calls[0][0];
    expect(options.allowEnvironment).toEqual(
      expect.arrayContaining([
        'GIT_ALLOW_PROTOCOL',
        'GIT_TERMINAL_PROMPT',
        'GCM_INTERACTIVE',
        'GIT_LFS_SKIP_SMUDGE',
        'GIT_CONFIG_GLOBAL',
      ]),
    );
    expect(options.timeout.block).toBeGreaterThan(0);
    expect(options.abort).toBeInstanceOf(AbortSignal);
    expect(options.unsafe).toEqual({
      allowUnsafeConfigPaths: true,
      allowUnsafeCredentialHelper: true,
    });
  });

  test('환경변수: 안전 설정은 넣고 GIT_EDITOR 같은 나머지는 넘기지 않는다', () => {
    const env = git.env.mock.calls[0][0];
    expect(env).toMatchObject({
      GIT_ALLOW_PROTOCOL: 'https',
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      GIT_LFS_SKIP_SMUDGE: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
    });
    expect(env.GIT_EDITOR).toBeUndefined();
    expect(env.PATH).toBeDefined();
  });

  test('clone 인자: 얕은 복제, 링크는 텍스트로, 저장된 자격증명 사용 안 함', () => {
    const [url, , args] = git.clone.mock.calls[0];
    expect(url).toBe('https://github.com/cd-test/mocked-repo');
    expect(args).toEqual(
      expect.arrayContaining(['--depth', '1', 'core.symlinks=false', 'credential.helper=']),
    );
  });
});

describe('cloneRepo 임시 폴더와 동시 요청', () => {
  test('임시 폴더에 받고 성공하면 최종 이름으로 바꾼다', async () => {
    const dir = await cloneRepo('https://github.com/cd-test/tmp-rename');
    const [, tmpDir] = git.clone.mock.calls[0];
    expect(tmpDir).toContain('.tmp-');
    expect(fs.existsSync(tmpDir)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'main.py'))).toBe(true);
    expect(reposEntries().some((name) => name.includes('.tmp-'))).toBe(false);
  });

  test('같은 URL을 동시에 요청하면 clone은 한 번만 하고 결과를 나눠 갖는다', async () => {
    /** @type {() => void} */
    let finish = () => {};
    git.clone.mockImplementation(
      (url, dir) =>
        new Promise((resolve) => {
          finish = () => fakeClone(url, dir).then(resolve);
        }),
    );

    const first = cloneRepo('https://github.com/cd-test/concurrent');
    const second = cloneRepo('https://github.com/cd-test/concurrent');
    //clone이 끝나기 전에는 최종 폴더가 없어야 한다 (반쯤 받은 폴더를 다른 요청이 보지 않음)
    await new Promise((resolve) => setImmediate(resolve));
    expect(reposEntries().filter((name) => !name.includes('.tmp-'))).toEqual([]);

    finish();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(git.clone).toHaveBeenCalledTimes(1);

    //끝난 뒤의 요청은 clone 없이 기존 폴더를 재사용한다
    await cloneRepo('https://github.com/cd-test/concurrent');
    expect(git.clone).toHaveBeenCalledTimes(1);
  });

  test('clone이 실패하면 임시 폴더를 지우고, 다음 요청은 다시 clone한다', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    git.clone.mockImplementationOnce(async (_url, dir) => {
      fs.mkdirSync(dir, { recursive: true });
      throw new Error('network down');
    });
    await expect(cloneRepo('https://github.com/cd-test/fail-once')).rejects.toMatchObject({
      status: 502,
    });
    expect(reposEntries()).toEqual([]);
    errorSpy.mockRestore();

    await cloneRepo('https://github.com/cd-test/fail-once');
    expect(git.clone).toHaveBeenCalledTimes(2);
  });
});

describe('cloneRepo 실패 메시지', () => {
  /** @type {jest.SpyInstance} */
  let errorSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  //git이 내는 실제 출력 형태. 임시 폴더 절대경로가 들어 있다.
  const gitOutput = (line) => `Cloning into '${REPOS_DIR}${path.sep}x.tmp-1234'...\nfatal: ${line}`;

  test.each([
    ["could not read Username for 'https://github.com': terminal prompts disabled", 404],
    ["repository 'https://github.com/a/b/' not found", 404],
    ["unable to access 'https://github.com/a/b/': Could not resolve host: github.com", 502],
    ["unable to access 'https://github.com/a/b/': Failed to connect to github.com", 502],
    ['something unexpected', 502],
  ])(
    '%s → %s, 응답에는 git 출력과 경로가 없고 로그와 같은 오류 ID가 있다',
    async (line, status) => {
      git.clone.mockRejectedValueOnce(new Error(gitOutput(line)));
      const err = await cloneRepo(`https://github.com/cd-test/fail-${status}-${line.length}`).catch(
        (e) => e,
      );

      expect(err.status).toBe(status);
      expect(err.message).not.toContain(REPOS_DIR);
      expect(err.message).not.toContain('fatal');
      expect(err.errorId).toMatch(/^[0-9a-f]{8}$/);
      expect(String(errorSpy.mock.calls[0][0])).toContain(err.errorId);
    },
  );
});

describe('cloneRepo 전체 시간 상한', () => {
  const originalTimeout = process.env.CLONE_TIMEOUT_SEC;

  afterEach(() => {
    if (originalTimeout === undefined) delete process.env.CLONE_TIMEOUT_SEC;
    else process.env.CLONE_TIMEOUT_SEC = originalTimeout;
  });

  test('시간을 넘기면 504로 끝나고 폴더를 남기지 않는다', async () => {
    process.env.CLONE_TIMEOUT_SEC = '0.05';
    //simple-git처럼 abort 신호를 받으면 실패하는 clone
    git.clone.mockImplementation((_url, dir) => {
      fs.mkdirSync(dir, { recursive: true });
      const { abort } = jest.mocked(simpleGit).mock.calls.at(-1)[0];
      return new Promise((_resolve, reject) => {
        abort.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    await expect(cloneRepo('https://github.com/cd-test/slow')).rejects.toMatchObject({
      status: 504,
    });
    expect(reposEntries()).toEqual([]);
  });
});
