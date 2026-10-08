//보안 스캐너(gitleaks, Trivy)를 Docker 이미지로 실행하는 스크립트다.
//로컬에 바이너리를 설치하지 않아도 되고, Windows/리눅스 어디서든 같은 명령으로 동작한다.
//사용법: node scripts/scan.js secrets | staged | image [이미지명]
//- staged(pre-commit용)는 설치된 gitleaks가 있으면 그것을 먼저 쓴다 (Docker보다 빠름)
const { spawnSync } = require('child_process');
const path = require('path');

//이미지는 태그 + digest로 고정한다 (CI와 같은 버전)
const GITLEAKS_IMAGE =
  'ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f';
const TRIVY_IMAGE =
  'aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function docker(args) {
  const result = spawnSync('docker', ['run', '--rm', ...args], { stdio: 'inherit' });
  if (result.error) {
    console.error('docker 실행 실패:', result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

//gitleaks 공통 옵션: 찾은 값은 출력에서 가리고(--redact), 하나라도 찾으면 실패
const GITLEAKS_FLAGS = ['--redact', '--no-banner', '--exit-code', '1'];

//저장소 루트를 /repo로 마운트해서 gitleaks git 명령을 실행한다
function gitleaksDocker(extra) {
  docker([
    '-v',
    `${REPO_ROOT}:/repo`,
    '-e',
    'GIT_CONFIG_COUNT=1',
    '-e',
    'GIT_CONFIG_KEY_0=safe.directory',
    '-e',
    'GIT_CONFIG_VALUE_0=/repo',
    GITLEAKS_IMAGE,
    'git',
    '/repo',
    ...extra,
    ...GITLEAKS_FLAGS,
  ]);
}

const [command, target] = process.argv.slice(2);

if (command === 'secrets') {
  //저장소 전체 커밋 기록에서 비밀값을 찾는다
  gitleaksDocker([]);
} else if (command === 'staged') {
  //스테이징된 변경(git add 한 내용)만 검사한다
  const local = spawnSync('gitleaks', ['git', REPO_ROOT, '--staged', ...GITLEAKS_FLAGS], {
    stdio: 'inherit',
  });
  if (!local.error) process.exit(local.status ?? 1);
  if (local.error.code !== 'ENOENT') {
    console.error('gitleaks 실행 실패:', local.error.message);
    process.exit(1);
  }
  //로컬에 gitleaks가 없으면 Docker 이미지로 대신 실행한다
  console.error(
    'gitleaks가 설치되어 있지 않아 Docker로 실행합니다. (설치: winget install --id Gitleaks.Gitleaks -e)',
  );
  gitleaksDocker(['--staged']);
} else if (command === 'image') {
  //빌드된 Docker 이미지의 OS/npm 패키지 취약점을 검사한다. 고칠 수 있는 HIGH 이상이면 실패.
  docker([
    '-v',
    '/var/run/docker.sock:/var/run/docker.sock',
    '-v',
    'code-diagram-trivy-cache:/root/.cache/trivy',
    TRIVY_IMAGE,
    'image',
    '--severity',
    'HIGH,CRITICAL',
    '--ignore-unfixed',
    '--exit-code',
    '1',
    '--no-progress',
    target || 'code-diagram:local',
  ]);
} else {
  console.error('사용법: node scripts/scan.js secrets | staged | image [이미지명]');
  process.exit(2);
}
