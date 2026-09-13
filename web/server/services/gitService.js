//파일명 그대로 깃과 파일을 관리해주는 서비스 코드다.

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const REPOS_DIR = path.join(__dirname, '..', '..', 'repos');

//repos 디렉토리가 없으면 생성
if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

//프로젝트 경로를 가져오는 함수다. URL이면 clone하고 로컬 경로면 존재 여부만 확인함.
async function getProjectPath(source) {
  //URL인지 확인
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('git@')) {
    return await cloneRepo(source);
  }

  //로컬 경로인 경우
  const absPath = path.resolve(source);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Local path does not exist: ${absPath}`);
  }
  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${absPath}`);
  }
  return absPath;
}

//git 저장소를 repos/ 디렉토리에 얕은 복제하는 함수다. 이미 있으면 재사용함.
async function cloneRepo(url) {
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 12);
  const repoName = url.split('/').pop().replace('.git', '') || 'repo';
  const targetDir = path.join(REPOS_DIR, `${repoName}-${hash}`);

  if (fs.existsSync(targetDir)) {
    return targetDir;
  }

  const git = simpleGit();
  await git.clone(url, targetDir, ['--depth', '1']);
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
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;

      const fullPath = path.join(dir, entry.name);

      //숨김 폴더, __pycache__, venv, node_modules, .git 등은 건너뜀
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === '__pycache__' ||
            entry.name === 'venv' || entry.name === 'node_modules' ||
            entry.name === '.git' || entry.name === 'env') {
          continue;
        }
        walk(fullPath);
      } else if (entry.name.endsWith('.py')) {
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_SIZE) {
          warnings.push(`Skipped ${path.relative(dirPath, fullPath)}: file too large (${Math.round(stat.size / 1024)}KB)`);
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

//디렉토리에서 지원하는 모든 파일(.py, .html, .css, .js)을 재귀적으로 찾는 함수다.
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
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === '__pycache__' ||
            entry.name === 'venv' || entry.name === 'node_modules' ||
            entry.name === '.git' || entry.name === 'env' ||
            entry.name === 'dist' || entry.name === 'build' ||
            entry.name === 'vendor' || entry.name === 'bower_components' ||
            entry.name === 'bin' || entry.name === 'obj' ||
            entry.name === 'Debug' || entry.name === 'Release' ||
            entry.name === 'cmake-build-debug' || entry.name === 'cmake-build-release') {
          continue;
        }
        walk(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const language = SUPPORTED_EXTENSIONS[ext];
        if (!language) continue;

        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_SIZE) {
          warnings.push(`Skipped ${path.relative(dirPath, fullPath)}: file too large (${Math.round(stat.size / 1024)}KB)`);
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

module.exports = { getProjectPath, findPythonFiles, findFiles };
