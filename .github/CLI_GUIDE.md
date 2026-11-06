# CodeDiagram CLI 가이드

> 팀 리뷰용 문서입니다. CLI는 아직 npm에 배포하지 않았고, 팀 전원 승인 후 배포합니다.
> 써 보고 의견은 PR 코멘트나 이슈로 남겨 주세요.

## 1. CLI가 하는 일

웹 버전(`npm start` → 브라우저)과 **같은 분석 엔진**(`web/server/services/graphBuilder.js`)을 터미널에서 바로 호출합니다.
서버를 띄우지 않고도 지금 작업 중인 폴더의 결합도(Ca/Ce/I/CBO)와 순환 의존성을 확인하고,
파일을 저장할 때마다 바뀐 지표를 바로 볼 수 있습니다. 전체 그래프가 필요하면 `/all`로 웹 화면을 엽니다.

시작하면 픽셀 마스코트와 `CodeDiagram v1.0` 타이틀이 나오고 `>` 프롬프트에서 `/`로 시작하는 명령어를 입력합니다.

```
> /check dep1
  ✓ SAFE  dep1.py

  참조됨  ↓ 2
  참조함  ↑ 0
  불안정  ░░░░░░░░░░  0.00
```

## 2. 준비물

| 항목 | 내용 |
| :--- | :--- |
| Node.js | 22 (저장소 `web/.nvmrc`와 동일) |
| 의존성 | `web/`에서 `npm install` (tree-sitter 네이티브 모듈 빌드 포함) |
| 터미널 | 24비트 색상·OSC 8 하이퍼링크를 지원하면 가장 보기 좋음 (Windows Terminal, VS Code 터미널, iTerm2). macOS 기본 터미널은 256색으로 자동 대체 |
| (선택) Anthropic API 키 | `/refactor`에만 필요. `sk-ant-`로 시작하는 키 |

> **현재 브랜치 기준 주의**: `/analyze`가 쓰는 `chokidar`가 아직 `package.json`에 없습니다.
> 리뷰하는 동안에는 `web/`에서 `npm install --no-save chokidar`로 임시 설치해 주세요. (아래 7장 "배포 전 해결할 것" 참고)

## 3. 실행 방법

CLI는 **실행한 위치(`process.cwd()`)를 분석 대상 프로젝트로 사용**합니다. 그래서 분석할 프로젝트 폴더로 이동한 뒤 실행합니다.

### 배포 전 (지금)

```bash
# 분석할 프로젝트 폴더에서
cd ~/my-project
node <CodeDiagram 경로>/web/cli/index.js
```

예시로 저장소의 테스트 픽스처를 분석해 볼 수 있습니다.

```bash
cd web/test/fixtures/hazard_project
node ../../../cli/index.js
```

### 배포 후 (예정)

`package.json`에 `bin` 항목을 추가하고 배포하면 아래처럼 쓰게 됩니다. 패키지 이름이 확정되면 이 절을 갱신합니다.

```bash
npx <패키지명>            # 설치 없이 실행, codediagram으로 생각 중입니다. 중복이 안 되는 패키지명이라면 아무거나 상관 없을 듯 합니다.
npm i -g <패키지명>       # 전역 설치 후 아무 폴더에서 실행
```

## 4. 처음 실행하면 (온보딩)

클로드에게 부탁해서 임의로 마스코트 캐릭터를 만들었습니다.
콘셉은 행성입니다. 클로드 코드의 마스코트 캐릭터를 따라해봤습니다.

홈 디렉터리에 `~/.codediagram_seen`이 없으면 첫 실행으로 보고 3단계 설정을 진행합니다.

1. **에디터 선택** — ↑/↓로 이동, Enter로 선택. VS Code(`code`), Cursor, Android Studio(`studio`), IntelliJ(`idea`), WebStorm, Sublime(`subl`), Vim, Neovim, 직접 입력, 건너뜀 중에서 고릅니다. `/open`에서 사용합니다.
2. **API 키 입력** — Enter로 건너뛸 수 있습니다. 입력하면 형식(`sk-ant-...`)을 검사한 뒤 Anthropic 모델 목록 API로 실제로 유효한지 확인합니다. 이 확인은 토큰을 쓰지 않아 요금이 들지 않습니다.
3. **명령어 안내** — 사용할 수 있는 명령어를 보여 줍니다.

설정은 언제든 `/edit`으로 다시 할 수 있습니다.

## 5. 명령어

| 명령어 | 하는 일 |
| :--- | :--- |
| `/analyze` | 현재 폴더 전체 분석 → 요약 출력 → **파일 저장 감시 시작** |
| `/check <파일명>` | 파일 하나의 결합도와 참조 관계 조회 |
| `/refactor <파일명>` | Claude에게 결합도 리팩토링 제안 3줄 요청 (API 키 필요) |
| `/open <파일명>` | 설정한 에디터로 파일 열기 |
| `/all` | 로컬 웹 서버를 띄우고 브라우저에서 전체 그래프 열기 |
| `/edit` | 에디터·API 키 다시 설정 |
| `/help` | 명령어 목록 |
| `/exit`, `/quit` | 종료 (Ctrl+C, Ctrl+D도 종료) |

`<파일명>`은 **경로의 일부만** 적어도 됩니다(대소문자 무시). 여러 파일이 걸리면 후보 목록을 보여 주니, 더 길게 적어서 하나로 좁히면 됩니다.

```
> /check service
  여러 파일이 일치합니다. 더 구체적으로 입력하세요.
  · server/services/aiService.js
  · server/services/cacheService.js
> /check aiService
```

### `/analyze`

`web/test/fixtures/hazard_project`에서 실행한 실제 출력입니다.

```
  파일 12개 분석 완료

  파일 python 12

  ── 주의가 필요한 파일 ──────────────────────

  ✗ HAZARD  main.py  CBO 10
  ⚠ WARN    warn_sample.py  CBO 5

  /all 을 입력하면 브라우저에서 전체 그래프를 볼 수 있습니다.

  파일 저장 시 자동으로 복잡도를 보여줍니다. (Ctrl+C 로 종료)
```

순환 의존성이 있으면 `── 순환 의존성 ──` 아래에 `a.py → b.py → a.py` 형태로 추가로 나옵니다.

- 요약 뒤에는 `.py .ts .tsx .js .jsx .java .cpp .h .cs .html .css` 파일 변경을 감시합니다. `node_modules`, `.git`, `build`, `dist`는 제외합니다.
- 파일을 저장하면 `[저장 감지] 파일명`과 함께 그 파일의 새 지표를 출력합니다.
- 감시가 켜진 상태에서도 다른 명령어를 계속 입력할 수 있습니다. 안내 문구의 "Ctrl+C 로 종료"는 감시만 끄는 게 아니라 **CLI 전체를 종료**합니다.

### `/check <파일명>`

| 출력 | 의미 |
| :--- | :--- |
| `✓ SAFE` / `⚠ WARN` / `✗ HAZARD` | 웹 버전과 같은 결합도 판정 (`server/config/couplingThresholds.js` 기준) |
| 참조됨 ↓ (Ca) | 이 파일에 의존하는 파일 수 |
| 참조함 ↑ (Ce) | 이 파일이 의존하는 파일 수 |
| 불안정 (I) | `Ce / (Ca + Ce)`. 0에 가까울수록 안정, 1에 가까울수록 불안정. 막대 색: 0.4 이하 초록, 0.7 이하 노랑, 그 위 빨강 |

그 아래에 참조됨·참조함 파일 목록이 나오며, 지원 터미널에서는 Ctrl(Cmd)+클릭으로 바로 열 수 있습니다.

### `/refactor <파일명>`

파일 코드(앞 6000자), 결합도 지표, 참조 파일 목록을 묶어 Claude에 보내고 다음 3항목을 받아 출력합니다.

1. 결합도 진단 2. 분리 대상 3. 리팩토링 방향

- 웹의 결합도 AI 제안과 같은 함수(`aiService.explainCoupling`)를 씁니다. 모델은 `ANTHROPIC_MODEL` 환경변수, 없으면 `claude-haiku-5-5`.
- **호출할 때마다 본인 API 키로 요금이 발생합니다.** 웹 버전과 달리 CLI에는 결과 캐시가 없습니다.
- 파일 코드가 Anthropic API로 전송됩니다. 외부로 보내면 안 되는 코드에는 쓰지 마세요.

### `/all`

`web/server/index.js`를 자식 프로세스로 `127.0.0.1:3000`(`PORT`로 변경 가능)에 띄우고, 브라우저를 `/?source=<현재 폴더>`로 엽니다. 웹 화면이 이 파라미터를 읽어 자동으로 분석을 시작합니다.
이미 3000번 포트에 서버가 떠 있으면 그 서버를 그대로 씁니다. CLI를 종료하면 CLI가 띄운 서버도 함께 종료됩니다.

## 6. 설정 파일

| 파일 | 내용 |
| :--- | :--- |
| `~/.codediagram_seen` | 첫 실행 여부 플래그. 지우면 다음 실행 때 온보딩이 다시 나옵니다 |
| `~/.codediagram_config.json` | `{ "editor": "code", "apiKey": "sk-ant-..." }` |

> **API 키는 위 파일에 평문으로 저장됩니다.** 웹 버전은 키를 서버 메모리에만 두지만 CLI는 재실행해도 키를 기억하기 위해 파일에 둡니다.
> 공용 PC에서는 키를 넣지 말고, 키를 지우려면 이 파일에서 `apiKey` 줄을 삭제하세요.

## 7. 배포 전 해결할 것 (리뷰 체크리스트)

현재 `feat-cli` 브랜치를 확인하면서 발견한 항목입니다. 배포 승인 전에 정리합니다.

- [ ] **`chokidar` 의존성 누락** — `package.json`에 없어 `/analyze` 입력 시 `Cannot find module 'chokidar'`로 CLI 전체가 종료됩니다.
- [ ] **`bin` 항목 없음** — `npx`/전역 설치로 실행하려면 `package.json`에 `"bin"`이 필요합니다. 배포할 파일 범위(`files`)와 패키지 이름도 정해야 합니다.
- [ ] **lint/format 미통과** — `eslint.config.js`에 `cli/`용 Node 전역 설정이 없어 `npx eslint cli`에서 197개 오류(`console`/`process` 미정의 등), `prettier --check cli`에서 10개 파일 경고. CI lint job이 실패합니다.
- [ ] **Windows에서 `/all`, `/open`** — `start`는 cmd 내장 명령이고 `code`는 `code.cmd`라서 `spawn`을 셸 없이 호출하면 `ENOENT`가 납니다. 자식 프로세스 `error` 이벤트를 처리하지 않아 CLI가 종료될 수 있습니다.
- [ ] **하이퍼링크 URL** — Windows에서 `file://C:\...` 형태로 만들어집니다. `url.pathToFileURL()`을 쓰면 `file:///C:/...`로 올바르게 만들어집니다.
- [ ] **`/analyze` 반복 실행** — 실행할 때마다 감시자가 하나씩 추가되어, 두 번 실행하면 저장 시 출력이 두 번 나옵니다.
- [ ] **`status: 'N/A'`** (참조 관계가 전혀 없는 파일)가 `✓ SAFE`로 표시됩니다.
- [ ] **CLI 테스트 없음** — `test/unit`에 CLI 테스트가 없습니다.
- [ ] `/all`이 넘기는 `DEFAULT_PROJECT_PATH` 환경변수는 서버에서 쓰지 않습니다(브라우저 `?source=`로 동작하므로 기능엔 영향 없음).

## 8. 문제 해결

| 증상 | 해결 |
| :--- | :--- |
| `지원하는 파일이 없습니다.` | 분석할 프로젝트 폴더에서 실행했는지 확인 (`pwd`) |
| `Cannot find module 'chokidar'` | `web/`에서 `npm install --no-save chokidar` (7장 첫 항목) |
| 온보딩을 다시 보고 싶음 | `~/.codediagram_seen` 삭제 후 재실행, 또는 `/edit` |
| `/refactor`가 `API 키가 설정되지 않았습니다` | `/edit`으로 키 입력 |
| `/refactor`가 `API 키가 거부되었습니다` | 키가 폐기됐거나 권한이 없음. 콘솔에서 새 키 발급 후 `/edit` |
| `/all`이 `서버 시작 타임아웃` | 5초 안에 서버가 안 뜸. `web/`에서 `npm start`가 단독으로 되는지 먼저 확인 |
| 색이 깨져 보임 | 24비트 색상을 지원하는 터미널 사용 |

## 9. 코드 위치

```
web/cli/
├── index.js            # 진입점: REPL, 온보딩, 명령어 분기
├── config.js           # ~/.codediagram_config.json 읽기/쓰기
├── commands/
│   ├── analyze.js      # 전체 분석 + chokidar 저장 감시
│   ├── check.js        # 파일 1개 지표 + 참조 목록
│   ├── refactor.js     # aiService.explainCoupling 호출
│   ├── open.js         # 에디터로 파일 열기
│   └── all.js          # 웹 서버 실행 + 브라우저 열기
└── display/
    ├── mascot.js       # 시작 화면 픽셀 아트
    ├── summary.js      # /analyze 요약 출력
    └── metrics.js      # 지표·참조 목록 출력, 터미널 하이퍼링크
```

웹과 공유하는 서버 모듈: `services/graphBuilder.js`(분석), `services/parser.js`, `services/aiService.js`, `utils/fileEncoding.js`.
분석 로직을 고치면 웹과 CLI 결과가 함께 바뀝니다.
