# CI/CD 파이프라인 가이드

CodeDiagram의 품질 검사와 배포가 어떻게 연결되어 있는지, 매일 쓰는 명령어와 자주 만나는 문제를 정리한 문서입니다. 브랜치·커밋 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)를 보세요.

## 한눈에 보기

```
커밋 ──▶ pre-commit (내 PC)          PR / push ──▶ CI (GitHub Actions)         v* 태그 ──▶ Release
         ├ lint-staged                              ├ lint      린트·포맷·타입             ├ CI 재실행
         │  (ESLint --fix, Prettier)                ├ test      Docker 안에서 커버리지     ├ 이미지 → GHCR
         ├ gitleaks (스테이징분)                     ├ security  gitleaks·audit·Trivy      ├ Release 생성
         └ test:unit                                                                       └ deploy(자리만)
```

| 단계 | 어디서 | 파일 |
|---|---|---|
| 환경 고정 | 로컬·Docker·CI | `web/.nvmrc`, `web/.npmrc`, `web/package.json`의 `engines`, `web/Dockerfile`, `.editorconfig`, `.gitattributes` |
| 정적 분석 | 로컬·CI | `web/eslint.config.js`, `web/.prettierrc.json`, `web/tsconfig.json`, `web/scripts/scan.js` |
| 테스트 | 로컬·CI | `web/jest.config.js`, `web/jest.live.config.js`, `web/test/**` |
| pre-commit | 로컬 | `.husky/pre-commit`, `web/package.json`의 `lint-staged`·`prepare` |
| CI | GitHub | `.github/workflows/ci.yml` (`android.yml`은 보류, 수동 실행만) |
| CD | GitHub | `.github/workflows/release.yml` |
| 저장소 운영 | GitHub | `.github/dependabot.yml`, `.github/pull_request_template.md`, `.github/CONTRIBUTING.md` |

## 처음 설정

```powershell
cd web
npm install                                   # 의존성 설치 + git 훅 설치 (core.hooksPath = .husky/_)
winget install --id Gitleaks.Gitleaks -e      # 커밋 훅의 비밀값 검사가 빨라진다 (없으면 Docker로 실행)
copy .env.example .env                        # AI 해설을 쓰려면 ANTHROPIC_API_KEY 입력
```

- Node 22(`web/.nvmrc`)가 필요합니다. 다른 메이저 버전이면 `engine-strict` 때문에 `npm install`이 실패합니다.
- Docker Desktop이 켜져 있어야 `scan:*`, `docker:*` 명령과 (gitleaks가 없을 때의) 커밋 훅이 동작합니다.

## 명령어 (`web/`에서 실행)

| 명령 | 내용 |
|---|---|
| `npm run check` | PR 올리기 전 전체 검사: lint → format:check → typecheck → audit → test:coverage |
| `npm test` | Jest 단위 + 계약 + 통합 테스트 |
| `npm run test:unit` / `test:contract` / `test:integration` | 종류별 테스트 |
| `npm run test:coverage` | 커버리지 측정. 최소 기준(구문 85 / 분기 68 / 함수 90 / 줄 85%)보다 낮으면 실패 |
| `npm run test:live` | 실제 Anthropic API 호출 (**비용 발생**, 1회 최대 약 $0.008) |
| `npm run lint` / `lint:fix` | ESLint (경고 0개 허용) |
| `npm run format` / `format:check` | Prettier |
| `npm run typecheck` | TypeScript checkJs (`server/`만) |
| `npm run audit` | 운영 의존성 high 이상 취약점이면 실패 |
| `npm run scan:secrets` | gitleaks로 커밋 기록 전체의 비밀값 검사 (Docker) |
| `npm run scan:staged` | gitleaks로 스테이징된 변경만 검사 (커밋 훅이 사용) |
| `npm run scan:image` | Trivy로 `code-diagram:local` 이미지 취약점 검사 (Docker) |
| `npm run docker:build` / `docker:test` / `docker:run` | prod 이미지 빌드 / test 스테이지에서 테스트 / 서버 실행 |

Android(루트에서, 현재 보류): `./gradlew testDebugUnitTest lintDebug assembleDebug`

## 작업 흐름

1. 최신 대상 브랜치에서 작업 브랜치 생성 → 코드 수정
2. `git add` → `git commit`: pre-commit 훅이 자동으로 검사합니다. 실패하면 메시지를 보고 고친 뒤 다시 커밋합니다.
3. `npm run check`로 전체 검사 → `git push` → PR 생성 (템플릿 체크리스트 작성)
4. CI가 모두 초록색이 되면 리뷰 후 병합
5. 배포할 때: `git tag v1.0.0` → `git push origin v1.0.0` → Actions의 Release 워크플로 확인

## pre-commit 훅

`.husky/pre-commit`이 `web/`에서 차례로 실행하며, 하나라도 실패하면 커밋이 막힙니다.

1. `lint-staged`: 스테이징된 `*.js`는 `eslint --fix` 후 `prettier --write`, `*.json/css/html/yml`은 `prettier --write`. 고친 내용은 자동으로 다시 스테이징됩니다.
2. `node scripts/scan.js staged`: 설치된 gitleaks가 있으면 그것으로, 없으면 Docker 이미지로 검사합니다.
3. `npm run test:unit`

- 훅을 건너뛰는 `git commit --no-verify`는 쓰지 않습니다.
- CI와 Docker 빌드에서는 `HUSKY=0`이거나 `.git`이 없어서 훅이 설치되지 않습니다. prod 이미지(`npm ci --omit=dev`)는 husky가 없으면 `prepare`가 조용히 건너뜁니다.

## CI 구성 (`.github/workflows/ci.yml`)

- 트리거: 모든 `pull_request`(대상 브랜치 무관), `master`·`feature/web-update`로의 `push`. `release.yml`이 `workflow_call`로 재사용합니다.
- 열린 PR이 있는 `feature/web-update`에 push하면 push와 PR 실행이 각각 한 번씩 돕니다(정상).
- job은 병렬로 실행되고, 같은 브랜치에 새 커밋이 오면 이전 실행은 취소됩니다.

| job | 하는 일 |
|---|---|
| `lint` | `npm ci` → lint → format:check → typecheck |
| `test` | `docker build --target test` → 컨테이너에서 `npm run test:coverage` |
| `security` | gitleaks(전체 기록, `fetch-depth: 0`) → npm audit → prod 이미지 빌드 → Trivy |
| `android` (`android.yml`) | **보류**: 앱 출시 계획이 없어 자동 실행을 껐고, Actions 탭에서 수동 실행만 됩니다. 다시 켜는 방법은 파일 맨 위 주석에 있습니다 |

보안 규칙:
- 모든 외부 액션은 전체 커밋 SHA로 고정하고 `# vX.Y.Z` 주석을 답니다.
  - SHA 조회: `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`
  - annotated 태그(`type: tag`)면 `gh api repos/<owner>/<repo>/git/tags/<sha>`로 가리키는 커밋까지 따라갑니다.
  - 나온 지 며칠 안 된 릴리스는 피하고, 충분히 지난 버전을 씁니다.
- 워크플로 최상단은 `permissions: contents: read`이고, 추가 권한은 필요한 job에만 줍니다.
- `actions/checkout`은 `persist-credentials: false`로 토큰을 작업 폴더에 남기지 않습니다.
- gitleaks·Trivy는 액션 대신 로컬과 같은 Docker 이미지(digest 고정)를 `scripts/scan.js`로 실행합니다.
- setup-gradle은 오픈소스 캐시(`cache-provider: basic`)만 씁니다.

## CD 구성 (`.github/workflows/release.yml`)

`v*` 태그 푸시 → `verify`(CI 재실행) → `image` → `release` → `deploy`

| job | 권한 | 하는 일 |
|---|---|---|
| `image` | `packages: write` | prod 이미지 빌드 → Trivy → `ghcr.io/<owner>/code-diagram:<태그>`와 `:latest` 푸시 |
| `release` | `contents: write` | GitHub Release 생성 (`--generate-notes`). Android APK 첨부는 보류 |
| `deploy` | 읽기 | `environment: production`. 배포 대상이 생기면 이 job에 명령을 넣습니다 |

- 쓰기 권한이 필요한 job(`release`)은 빌드를 하지 않습니다.

## 저장소 운영

- **Dependabot** (`.github/dependabot.yml`): npm(`web/`), github-actions, docker(`web/Dockerfile`) 모두 주 1회 (gradle은 Android 보류로 제외)(월요일 09:00 KST)입니다.
  - PR은 기본 브랜치(`master`)로 갑니다.
  - Dependabot 설정은 **기본 브랜치(`master`)에 있어야** 동작합니다. 그 전까지는 적용되지 않습니다.
  - tree-sitter 계열과 Node 이미지의 메이저 업그레이드는 직접 합니다.
- **PR 템플릿**: `.github/pull_request_template.md`
- **보호 규칙**: 무료 요금제 비공개 저장소라서 아래 두 기능이 강제되지 않습니다. 강제하려면 저장소를 공개로 바꾸거나 GitHub Pro/Team이 필요합니다.
  - "CI 통과해야 병합 가능" 같은 브랜치 보호
  - Environments 승인자(required reviewers)

## 일부러 CI를 깨뜨려 확인하는 방법

임시 브랜치에서 아래 중 하나를 하고 PR을 열면 해당 job이 실패해야 합니다. 확인 후 브랜치를 지웁니다.

| 변경 | 실패해야 하는 곳 |
|---|---|
| `server/` 파일에 `var x = 1` 추가 | 커밋 훅(ESLint `no-var`), CI `lint` |
| 테스트의 기대값을 틀리게 수정 | 커밋 훅(`test:unit`), CI `test` |
| `jest.config.js`의 커버리지 기준을 99로 | CI `test` |
| 파일에 `ghp_` + 영숫자 36자 같은 가짜 토큰 | 커밋 훅(gitleaks), CI `security` |

커밋 훅을 거치지 않고 CI만 확인하려면 GitHub 웹에서 파일을 직접 수정해 PR을 만듭니다.

## 자주 만난 문제

| 증상 | 원인과 해결 |
|---|---|
| Jest에서 `Cannot read properties of undefined (reading 'childCount')`가 무작위로 발생 | tree-sitter 0.22 JS 래퍼가 같은 프로세스에서 두 번 로드되면 `tree.rootNode`이 `undefined`가 됩니다. `test/helpers/treeSitterEnvironment.js`가 워커당 한 번만 로드하게 막습니다. 테스트 환경 설정을 바꿀 때 이 설정을 유지하세요. |
| 로컬 `npm run format:check`가 거의 모든 파일에서 실패 | Git for Windows의 `core.autocrlf=true` 때문에 작업 폴더 파일이 CRLF로 바뀐 것입니다. 저장소에는 LF로 저장되므로 CI는 통과합니다. 고치려면 `npm run format`을 실행합니다. 근본 해결은 `.gitattributes`의 `* text=auto eol=lf`입니다. |
| 커밋 훅에서 `failed to connect to the docker API` | gitleaks가 설치되어 있지 않고 Docker Desktop도 꺼진 상태입니다. gitleaks를 설치하거나 Docker를 켭니다. |
| `npm install`에서 `EBADENGINE` | Node 버전이 `engines`(`>=22.21.0 <23`)와 맞지 않습니다. 의존성의 engines도 확인합니다(예: lint-staged 17은 Node 22.22.1 이상이라 16.4.0을 사용). |
| `npm install`에서 tree-sitter peer 충돌 | `.npmrc`의 `legacy-peer-deps=true`가 필요합니다. 지우지 마세요. |
| CI `security`의 `npm audit` 실패 | 운영 의존성에 high 이상 취약점이 새로 발표된 것입니다. `npm audit`로 확인하고 `fix/` 브랜치에서 의존성을 올립니다. |
| Android CI에서 `./gradlew: Permission denied` | `gradlew`에 실행 권한이 없습니다. `git update-index --chmod=+x gradlew` 후 커밋합니다. |
| Android `checkDebugAarMetadata` 실패 | 라이브러리가 요구하는 AGP·compileSdk보다 프로젝트 설정이 낮습니다. `gradle/libs.versions.toml`의 라이브러리를 낮추거나 AGP·compileSdk를 올립니다. |
| Dependabot이 Dockerfile을 갱신하지 않음 | `FROM ${ARG}` 형식은 읽지 못합니다. 그래서 `FROM`에 이미지를 직접 씁니다(두 곳을 함께 바꿀 것). |
