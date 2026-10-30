//파일명 그대로 깃과 파일을 관리해주는 서비스 코드다.

const { simpleGit } = require('simple-git');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { isRegistered } = require('./projectRegistry');
const { logError } = require('../utils/errors');

//clone 폴더 위치. .env의 REPOS_DIR로 바꿀 수 있다 (Docker 볼륨, 테스트용 임시 폴더)
const REPOS_DIR = process.env.REPOS_DIR
  ? path.resolve(process.env.REPOS_DIR)
  : path.join(__dirname, '..', '..', 'repos');

//clone 중인 임시 폴더 이름 표시. 성공하면 표시 없는 이름으로 바뀐다.
const TMP_MARK = '.tmp-';

//repos 디렉토리가 없으면 생성
// eslint-disable-next-line security/detect-non-literal-fs-filename -- 서버 설정 경로
if (!fs.existsSync(REPOS_DIR)) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- 서버 설정 경로
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

//서버 시작 시점에는 진행 중인 clone이 없으므로, 이전 실행에서 남은 임시 폴더를 모두 지운다
// eslint-disable-next-line security/detect-non-literal-fs-filename -- 서버 설정 경로
for (const name of fs.readdirSync(REPOS_DIR)) {
  if (name.includes(TMP_MARK)) removeQuietly(path.join(REPOS_DIR, name));
}

//status가 붙은 에러를 만든다. 라우트에서 그대로 HTTP 응답 코드로 쓴다.
function pathError(status, message) {
  return Object.assign(new Error(message), { status });
}

//Windows는 경로 대소문자를 구분하지 않으므로 비교할 때만 소문자로 맞춘다
function normalizeForCompare(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

const OUTSIDE_ROOTS_MESSAGE =
  '허용되지 않은 로컬 경로입니다. LOCAL_ROOTS 안의 경로만 분석할 수 있습니다.';

//로컬 분석을 허용할 루트 목록 (.env의 LOCAL_ROOTS, 쉼표 구분). 존재하지 않는 루트는 건너뛴다.
//루트 자체가 심볼릭 링크일 수 있어 적힌 경로와 실제 경로를 둘 다 넣는다.
//테스트에서 환경변수를 바꿔 끼울 수 있게 호출할 때마다 읽는다.
function localRoots() {
  const roots = [];
  for (const entry of (process.env.LOCAL_ROOTS || '').split(',')) {
    if (!entry.trim()) continue;
    const resolved = path.resolve(entry.trim());
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- 서버 설정(.env)에서 읽은 경로
      roots.push(resolved, fs.realpathSync(resolved));
    } catch {
      //없는 루트는 무시
    }
  }
  return roots;
}

//경로가 허용 루트 안쪽인지 확인한다. root + sep으로 비교해야 C:\proj가 C:\proj-secret을 허용하지 않는다.
function isInsideRoots(targetPath, roots) {
  const target = normalizeForCompare(targetPath);
  return roots.some((root) => {
    const base = normalizeForCompare(root);
    return target === base || target.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
  });
}

//로컬 경로 분석 정책
//- LOCAL_ROOTS 설정됨: 그 루트 안쪽만 허용
//- 미설정 + 개발/테스트: 전부 허용 (서버가 127.0.0.1에서만 받으므로 이 PC 사용자만 쓴다)
//- 미설정 + 운영: 전면 차단, Git URL만 허용
function resolveLocalPath(source) {
  const roots = localRoots();
  if (roots.length === 0 && process.env.NODE_ENV === 'production') {
    throw pathError(403, '로컬 경로 분석은 비활성화되어 있습니다. Git URL을 입력해 주세요.');
  }

  const absPath = path.resolve(source);
  //존재 확인보다 먼저 막는다. 그렇지 않으면 400/403 차이로 루트 밖 경로의 존재 여부가 드러난다.
  if (roots.length > 0 && !isInsideRoots(absPath, roots)) {
    throw pathError(403, OUTSIDE_ROOTS_MESSAGE);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- 허용 루트 검사를 통과한 경로
  if (!fs.existsSync(absPath)) {
    //서버 기준으로 풀린 경로(absPath) 대신 입력값을 보여 준다. 상대경로를 넣어도 서버 작업 폴더가 드러나지 않는다.
    throw pathError(400, `Local path does not exist: ${source}`);
  }

  //..·심볼릭 링크·정션을 모두 풀어서 루트 밖으로 나가는 경로를 차단한다
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- 존재가 확인된 경로
  const realPath = fs.realpathSync(absPath);
  if (roots.length > 0 && !isInsideRoots(realPath, roots)) {
    throw pathError(403, OUTSIDE_ROOTS_MESSAGE);
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- 허용 루트 검사를 통과한 경로
  if (!fs.statSync(realPath).isDirectory()) {
    throw pathError(400, `Path is not a directory: ${source}`);
  }
  return realPath;
}

//clone을 허용할 Git 호스트. .env의 GIT_HOSTS(쉼표 구분)로 추가한다.
//기본 포트(443)가 아닌 서버는 git.example.com:8443처럼 포트까지 적어야 그 포트가 허용된다.
//내부 IP 차단 목록 대신 허용 목록을 쓰는 이유: IP 표기 변형·DNS rebinding으로 우회할 여지가 없다.
//허용한 호스트가 다른 곳으로 리다이렉트하면 git이 따라가므로(http.followRedirects 기본값) 신뢰하는 호스트만 넣는다.
const DEFAULT_GIT_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];

function gitHosts() {
  const extra = (process.env.GIT_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_GIT_HOSTS, ...extra]);
}

//스킴(xxx://)이 붙었거나 SSH 형식(git@)이면 URL로 본다. Windows 경로 C:\는 ://가 없어 해당하지 않는다.
function looksLikeUrl(source) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(source) || source.startsWith('git@');
}

//clone해도 되는 URL인지 검사하고 정규화한 URL을 돌려준다. 문제가 있으면 status가 붙은 에러를 던진다.
function validateGitUrl(source) {
  if (source.startsWith('git@')) {
    throw pathError(400, 'SSH 주소(git@)는 지원하지 않습니다. https Git URL을 입력해 주세요.');
  }
  let url;
  try {
    url = new URL(source);
  } catch {
    throw pathError(400, '올바른 URL이 아닙니다.');
  }
  if (url.protocol !== 'https:') {
    throw pathError(400, 'https Git URL만 지원합니다.');
  }
  //https://토큰@github.com/... 형태는 토큰이 clone 폴더의 .git/config에 남는다
  if (url.username || url.password) {
    throw pathError(400, 'URL에 계정 정보를 넣을 수 없습니다.');
  }
  //hostname은 URL이 소문자·IP 표기(2130706433 → 127.0.0.1)까지 정규화해 준다. 정확히 일치할 때만 허용한다.
  const hostKey = url.port ? `${url.hostname}:${url.port}` : url.hostname;
  if (!gitHosts().has(hostKey)) {
    throw pathError(403, `허용되지 않은 Git 호스트입니다: ${hostKey}`);
  }
  return url.href;
}

//프로젝트 경로를 가져오는 함수다. URL이면 검사 후 clone하고 로컬 경로면 허용 루트 정책을 거친다.
async function getProjectPath(source) {
  if (looksLikeUrl(source)) {
    return await cloneRepo(validateGitUrl(source));
  }

  return resolveLocalPath(source);
}

//git에 넘길 환경변수. process.env를 통째로 넘기면 simple-git이 GIT_EDITOR 같은 변수를 보고 실행을 거부하고,
//사용자 전역 설정(~/.gitconfig)의 insteadOf·proxy가 요청을 바꿀 수 있어서 필요한 것만 골라 넘긴다.
const PASSTHROUGH_ENV = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'SystemRoot', //Windows git의 네트워크 초기화에 필요
  'TEMP',
  'TMP',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'no_proxy',
];

const GIT_SAFETY_ENV = {
  GIT_ALLOW_PROTOCOL: 'https', //리다이렉트·서브모듈로 file/ext/ssh 등에 접근하는 것 차단
  GIT_TERMINAL_PROMPT: '0', //비공개·없는 레포에서 비밀번호 입력을 기다리며 멈추지 않게
  GCM_INTERACTIVE: 'never', //Windows Git Credential Manager 로그인 창 방지
  GIT_LFS_SKIP_SMUDGE: '1', //레포의 .lfsconfig가 lfs.url을 내부 주소로 지정하는 SSRF 차단
  //전역 설정 격리. 시스템 설정은 Git for Windows의 TLS 설정(http.sslBackend)이 있어 그대로 둔다.
  //Git for Windows도 /dev/null을 이해한다 (os.devNull인 \\.\nul은 거부함)
  GIT_CONFIG_GLOBAL: '/dev/null',
};

function gitEnv() {
  const env = {};
  for (const key of PASSTHROUGH_ENV) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, ...GIT_SAFETY_ENV };
}

//clone 옵션
//- core.longpaths: Windows 경로 길이 제한(260자)을 넘는 파일이 있는 저장소도 checkout되게 한다
//- core.symlinks=false: 레포 안의 심볼릭 링크를 텍스트 파일로 받는다 (findFiles의 링크 차단과 이중 장치)
//- credential.helper=: 시스템 설정의 credential manager까지 비워 서버 PC의 저장된 자격증명을 쓰지 않는다 (공개 레포 전용)
const CLONE_ARGS = [
  '--depth',
  '1',
  '--config',
  'core.longpaths=true',
  '--config',
  'core.symlinks=false',
  '--config',
  'credential.helper=',
];

//60초 동안 git 출력이 없으면 프로세스를 끝낸다 (응답 없는 서버에 붙잡히지 않게)
const CLONE_IDLE_TIMEOUT_MS = 60_000;

//clone 전체 시간 상한 기본값 (3분). 출력을 조금씩 흘려 유휴 타임아웃을 피하는 서버도 여기서 끊긴다.
const DEFAULT_CLONE_TIMEOUT_SEC = 180;
//repos/에 남겨 둘 clone 폴더 수 기본값. projectRegistry의 MAX_PROJECTS(20)보다 크게 둔다.
const DEFAULT_MAX_REPOS = 30;

//.env 값을 테스트에서 바꿔 끼울 수 있게 호출할 때마다 읽는다
function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return value > 0 ? value : fallback;
}

function cloneGit(signal) {
  return simpleGit({
    allowEnvironment: Object.keys(GIT_SAFETY_ENV),
    timeout: { block: CLONE_IDLE_TIMEOUT_MS },
    abort: signal,
    //simple-git은 설정 파일 경로·credential.helper 변경을 막는데, 여기서는 사용자 입력이 아니라
    //위에 고정한 더 안전한 값(/dev/null, 빈 helper)으로 바꾸는 것이라 이 둘만 허용한다
    unsafe: { allowUnsafeConfigPaths: true, allowUnsafeCredentialHelper: true },
  }).env(gitEnv());
}

//git 출력에서 원인을 골라 사용자용 메시지로 바꾼다.
//git 출력 원문(임시 폴더 절대경로 등)은 서버 로그에만 남기고 응답에는 오류 ID만 붙인다.
const GIT_ERROR_CLASSES = [
  {
    pattern: /not found|could not read username|authentication failed|terminal prompts disabled/i,
    status: 404,
    message: '저장소를 찾을 수 없거나 비공개 저장소입니다. URL을 확인해 주세요.',
  },
  {
    pattern:
      /could not resolve host|failed to connect|connection timed out|connection refused|network is unreachable/i,
    status: 502,
    message: 'Git 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.',
  },
];

function toCloneError(err) {
  const errorId = logError('Clone error', err);
  const matched = GIT_ERROR_CLASSES.find((c) => c.pattern.test(String(err && err.message)));
  const { status, message } = matched || { status: 502, message: '저장소를 가져오지 못했습니다.' };
  return Object.assign(pathError(status, message), { errorId });
}

//진행 중인 clone. 같은 URL을 동시에 요청하면 clone을 한 번만 하고 결과를 나눠 갖는다.
//targetDir → Promise<targetDir>
const inflightClones = new Map();

//분석에 쓰이고 있는 폴더. 정리(pruneRepos)가 지우지 않게 한다. path → 사용 수
const reposInUse = new Map();

//폴더를 사용 중으로 표시하고, 다 쓰면 부를 해제 함수를 돌려준다. 두 번 불러도 한 번만 해제된다.
function holdRepo(dirPath) {
  reposInUse.set(dirPath, (reposInUse.get(dirPath) || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = reposInUse.get(dirPath) - 1;
    if (count > 0) reposInUse.set(dirPath, count);
    else reposInUse.delete(dirPath);
  };
}

//git 저장소를 repos/ 디렉토리에 얕은 복제하는 함수다. 이미 있으면 재사용함.
//url은 validateGitUrl을 거친 값이어야 한다.
async function cloneRepo(url) {
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 12);
  const repoName = url.split('/').pop().replace('.git', '') || 'repo';
  const targetDir = path.join(REPOS_DIR, `${repoName}-${hash}`);

  //임시 폴더에 받은 뒤 이름을 바꾸므로, 표시 없는 이름의 폴더는 항상 완성된 clone이다
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- REPOS_DIR 아래 해시로 만든 경로
  if (fs.existsSync(targetDir)) {
    touchRepo(targetDir);
    return targetDir;
  }

  const pending = inflightClones.get(targetDir);
  if (pending) return pending;

  const job = cloneIntoPlace(url, targetDir).finally(() => inflightClones.delete(targetDir));
  inflightClones.set(targetDir, job);
  return job;
}

//임시 폴더에 clone하고 성공하면 targetDir로 이름을 바꾼다.
//중간에 실패·중단돼도 targetDir에는 반쯤 받은 폴더가 생기지 않아 다음 요청이 깨진 폴더를 재사용하지 않는다.
async function cloneIntoPlace(url, targetDir) {
  const tmpDir = `${targetDir}${TMP_MARK}${crypto.randomBytes(4).toString('hex')}`;
  const signal = AbortSignal.timeout(
    numberFromEnv('CLONE_TIMEOUT_SEC', DEFAULT_CLONE_TIMEOUT_SEC) * 1000,
  );

  try {
    await cloneGit(signal).clone(url, tmpDir, CLONE_ARGS);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- REPOS_DIR 아래 해시로 만든 경로
    fs.renameSync(tmpDir, targetDir);
  } catch (err) {
    //Windows에서 강제 종료된 git이 파일을 잠그고 있으면 지우지 못할 수 있다. 다음 서버 시작 때 지워진다.
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      //무시
    }
    if (signal.aborted) {
      throw pathError(
        504,
        '저장소 다운로드 시간이 초과되었습니다. 저장소가 너무 크거나 네트워크가 느립니다.',
      );
    }
    throw toCloneError(err);
  }

  pruneRepos();
  return targetDir;
}

//재사용한 폴더의 수정 시각을 갱신해 정리 순서에서 뒤로 보낸다
function touchRepo(dirPath) {
  const now = new Date();
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- REPOS_DIR 아래 폴더
    fs.utimesSync(dirPath, now, now);
  } catch {
    //시각 갱신 실패는 정리 순서에만 영향이 있어 무시한다
  }
}

//repos/의 clone 폴더가 maxRepos개를 넘으면 오래 쓰지 않은 것부터 지운다.
//분석 중인 폴더, 진행 중인 clone, /api/file이 쓰는 등록된 프로젝트는 지우지 않는다.
//임시 폴더는 clone 시간 상한보다 오래된 것(중단 후 못 지운 것)만 지운다.
function pruneRepos(dir = REPOS_DIR, maxRepos = numberFromEnv('MAX_REPOS', DEFAULT_MAX_REPOS)) {
  const now = Date.now();
  const staleTmpMs = numberFromEnv('CLONE_TIMEOUT_SEC', DEFAULT_CLONE_TIMEOUT_SEC) * 1000;
  const repos = [];

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- REPOS_DIR 또는 테스트 임시 폴더
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(dir, entry.name);
    let mtimeMs;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- REPOS_DIR 아래 폴더
      mtimeMs = fs.statSync(fullPath).mtimeMs;
    } catch {
      continue;
    }

    if (entry.name.includes(TMP_MARK)) {
      if (now - mtimeMs > staleTmpMs) removeQuietly(fullPath);
      continue;
    }
    if (reposInUse.has(fullPath) || inflightClones.has(fullPath) || isRegistered(fullPath)) {
      continue;
    }
    repos.push({ fullPath, mtimeMs });
  }

  //보호 대상은 개수에서 빠지므로, 보호 대상이 아닌 폴더만 maxRepos개까지 남긴다
  repos.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const { fullPath } of repos.slice(maxRepos)) {
    removeQuietly(fullPath);
  }
}

function removeQuietly(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    //잠긴 파일 등으로 못 지우면 다음 정리 때 다시 시도한다
  }
}

//디렉토리에서 지원하는 모든 파일을 재귀적으로 찾는 함수다.
//지원 확장자: .py, .html, .css, .js, .cpp, .h, .cs, .ts, .tsx, .java
//반환값에 language 필드를 포함한다.
const SUPPORTED_EXTENSIONS = {
  '.py': 'python',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.js': 'javascript',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.java': 'java',
};

function findFiles(dirPath) {
  const files = [];
  const warnings = [];
  const MAX_FILES = 200;
  const MAX_SIZE = 100 * 1024; // 100KB

  function walk(dir) {
    if (files.length >= MAX_FILES) return;

    let entries;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- 프로젝트 루트 아래 디렉터리 순회
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (
          entry.name.startsWith('.') ||
          entry.name === '__pycache__' ||
          entry.name === 'venv' ||
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'env' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === 'vendor' ||
          entry.name === 'bower_components' ||
          entry.name === 'bin' ||
          entry.name === 'obj' ||
          entry.name === 'Debug' ||
          entry.name === 'Release' ||
          entry.name === 'cmake-build-debug' ||
          entry.name === 'cmake-build-release' ||
          entry.name === 'target' ||
          entry.name === 'out'
        ) {
          continue;
        }
        walk(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const language = SUPPORTED_EXTENSIONS[ext];
        if (!language) continue;

        //심볼릭 링크는 따라가지 않는다. 레포에 /etc/passwd 등을 가리키는 leak.py를 넣으면
        //대상 파일 내용이 분석 결과에 실려 나가기 때문이다. (디렉터리 링크·정션은 isDirectory가 false라 원래 재귀하지 않는다)
        if (entry.isSymbolicLink()) {
          warnings.push(`Skipped ${path.relative(dirPath, fullPath)}: symbolic link`);
          continue;
        }

        // eslint-disable-next-line security/detect-non-literal-fs-filename -- 프로젝트 루트 아래 디렉터리 순회
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_SIZE) {
          warnings.push(
            `Skipped ${path.relative(dirPath, fullPath)}: file too large (${Math.round(stat.size / 1024)}KB)`,
          );
          continue;
        }
        files.push({
          path: fullPath,
          relativePath: path.relative(dirPath, fullPath).replace(/\\/g, '/'),
          language,
        });
      }
    }
  }

  walk(dirPath);

  if (files.length >= MAX_FILES) {
    warnings.push(`Stopped after ${MAX_FILES} files`);
  }

  return { files, warnings };
}

module.exports = {
  getProjectPath,
  validateGitUrl,
  cloneRepo,
  holdRepo,
  pruneRepos,
  findFiles,
  SUPPORTED_EXTENSIONS,
};
