//파일명 그대로 깃과 파일을 관리해주는 서비스 코드다.

const { simpleGit } = require('simple-git');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const REPOS_DIR = path.join(__dirname, '..', '..', 'repos');

//repos 디렉토리가 없으면 생성
if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

//Git 및 빌드/런타임, 게임 엔진(Unity 등)에서 제외할 디렉토리 목록
const IGNORED_DIRS = new Set([
  '__pycache__',
  'venv',
  'node_modules',
  '.git',
  'env',
  'dist',
  'build',
  'vendor',
  'bower_components',
  'bin',
  'obj',
  'Debug',
  'Release',
  'cmake-build-debug',
  'cmake-build-release',
  'target',
  'out',
  // Unity 및 게임 엔진 임시/캐시 디렉토리
  'Library',
  'Temp',
  'Logs',
  'UserSettings',
  'MemoryCaptures',
  'Recordings',
  'Build',
  'Builds',
]);

//GitHub/GitLab 브랜치 트리 URL(예: .../tree/dev) 또는 일반 Git URL 파싱
function parseGitSource(source) {
  const cleanSource = source.trim().replace(/\/+$/, '');
  const treeMatch = cleanSource.match(
    /^(https?:\/\/.+?\/([^/]+?))(?:\.git)?(?:\/-\/|\/)tree\/(.+)$/,
  );
  if (treeMatch) {
    const rawBranch = treeMatch[3].split('?')[0].split('#')[0].replace(/\/+$/, '');
    return {
      cloneUrl: `${treeMatch[1]}.git`,
      branch: rawBranch,
      repoName: treeMatch[2],
      cacheKey: cleanSource,
    };
  }

  const cleanUrl = cleanSource.split('?')[0].split('#')[0];
  const repoName =
    cleanUrl
      .split('/')
      .pop()
      .replace(/\.git$/, '') || 'repo';
  return {
    cloneUrl: cleanSource,
    branch: null,
    repoName,
    cacheKey: cleanSource,
  };
}

//프로젝트 경로를 가져오는 함수다. URL이면 clone하고 로컬 경로면 존재 여부만 확인함.
async function getProjectPath(source) {
  //URL인지 확인
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('git@')) {
    return await cloneRepo(source);
  }

  //로컬 경로인 경우
  const absPath = path.resolve(source);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- TODO(security): 사용자 입력 로컬 경로를 제한 없이 허용함, 수정 여부 결정 필요
  if (!fs.existsSync(absPath)) {
    throw new Error(`Local path does not exist: ${absPath}`);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- TODO(security): 사용자 입력 로컬 경로를 제한 없이 허용함, 수정 여부 결정 필요
  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${absPath}`);
  }
  return absPath;
}

//git 저장소를 repos/ 디렉토리에 얕은 복제하는 함수다. 이미 있으면 재사용함.
async function cloneRepo(url) {
  const { cloneUrl, branch, repoName, cacheKey } = parseGitSource(url);
  const hash = crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 12);
  const branchSuffix = branch ? `-${branch.replace(/[/\\?%*:|"<>]/g, '_')}` : '';
  const targetDir = path.join(REPOS_DIR, `${repoName}${branchSuffix}-${hash}`);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- REPOS_DIR 아래 해시로 만든 경로
  if (fs.existsSync(targetDir)) {
    return targetDir;
  }

  const git = simpleGit();
  const cloneArgs = ['--depth', '1', '--config', 'core.longpaths=true'];
  if (branch) {
    cloneArgs.push('--branch', branch);
  }

  try {
    //Windows 경로 길이 제한(260자)을 넘는 파일이 있는 저장소도 checkout되도록 longpaths를 켠다
    await git.clone(cloneUrl, targetDir, cloneArgs);
  } catch (err) {
    //실패한 clone 폴더가 남으면 다음 요청에서 깨진 상태로 재사용되므로 지운다
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw err;
  }
  return targetDir;
}

//디렉토리에서 .py 파일을 재귀적으로 찾는 함수다. 100KB 넘는 파일은 건너뛰고 200개까지만 수집함.
function findPythonFiles(dirPath) {
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

      //숨김 폴더, 빌드/의존성/임시 폴더 등은 건너뜀
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.name.endsWith('.py')) {
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
        });
      }
    }
  }

  walk(dirPath);

  if (files.length >= MAX_FILES) {
    warnings.push(`Stopped after ${MAX_FILES} .py files`);
  }

  return { files, warnings };
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
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const language = SUPPORTED_EXTENSIONS[ext];
        if (!language) continue;

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
  findPythonFiles,
  findFiles,
  SUPPORTED_EXTENSIONS,
  parseGitSource,
  IGNORED_DIRS,
};
