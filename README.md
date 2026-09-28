# CodeDiagram

소스코드를 읽지 않고도 프로젝트의 구조를 한눈에 파악할 수 있게 해주는 코드 구조 시각화 도구입니다.

GitHub 저장소 URL이나 로컬 폴더 경로를 넣으면 코드를 파싱해서 **파일과 함수의 관계를 인터랙티브 그래프**로 그려줍니다. 어떤 파일이 어떤 파일을 참조하는지, 어떤 함수가 많이 불리는지, 순환 참조가 어디에 있는지를 그래프 위에서 바로 확인할 수 있습니다.

## 지원 언어

7개 언어를 tree-sitter로 파싱합니다.

| 언어 | 확장자 | 추출 대상 |
|---|---|---|
| Python | `.py` | 함수, 클래스, 메서드, import, 호출, 변수, 상속 |
| C++ | `.cpp` `.cc` `.cxx` `.h` `.hpp` | 함수, 클래스, `#include`, 호출 |
| C# | `.cs` | 클래스, 메서드, `using`, 호출 |
| TypeScript | `.ts` `.tsx` | 함수, 클래스, 인터페이스, 타입 별칭, 제네릭, import |
| JavaScript | `.js` | 함수, 화살표 함수, 클래스, import, 호출 |
| HTML | `.html` `.htm` | 요소(id/class/tag), 인라인 스크립트·스타일, 링크 |
| CSS | `.css` | 셀렉터, CSS 변수, `@import` |

Python·C++·C#·TypeScript는 **참조 횟수(티어) 기반**으로 묶어서 보여주고, HTML·CSS·JS는 **언어를 가로지르는 관계**를 따로 해석합니다.

## 주요 기능

### 관계 그래프

- **티어 구조** — 참조 횟수 → 파일 → 함수/변수의 3단계 중첩. 많이 참조되는 파일일수록 안쪽 티어에 놓입니다.
- **웹 크로스 언어 관계** — HTML/CSS/JS 사이의 7종 관계를 자동으로 연결합니다.
  - `dom-access` — JS가 접근하는 DOM 요소
  - `css-target` — CSS 셀렉터가 겨냥하는 HTML 요소
  - `event-binding` — 이벤트 핸들러와 요소의 연결
  - `style-modify` — JS가 직접 바꾸는 스타일
  - `css-import` / `js-import` / `css-var`
- **실시간 물리 레이아웃** — d3-force 기반. 노드를 끌면 이웃이 고무줄처럼 따라옵니다. (600노드 초과 시 최종 배치만 적용)
- **파일 뷰 / 함수 뷰** 전환, **로컬 그래프**(선택한 노드의 이웃만 확대), **미니맵**

### 코드 보기

- 노드를 클릭하면 사이드 패널에 소스코드가 신택스 하이라이팅되어 뜹니다.
- 파일 노드를 더블클릭하면 그래프 위에 **코드 카드**가 오버레이로 열립니다. (최대 5장 동시)

### 코드 진단

분석과 동시에 안티패턴을 탐지합니다.

- **순환 참조** — 서로를 참조하는 파일·함수 묶음
- **결합도** — 호출 엣지 기반 파일 간 결합도 점수. 그래프에서 테두리 두께로 표현됩니다.
- **안티패턴 8종** — `god_class`, `god_function`, `high_inbound`, `high_outbound`, `unused_css_selector`, `unused_js_function`, `excessive_inline_style`, `excessive_event_listeners`
- 진단 결과를 바탕으로 **리팩토링 제안** 텍스트를 함께 생성합니다.

진단 상태는 그래프에도 반영됩니다. 순환 참조 파일은 붉게, warning이 있는 파일은 주황으로 숨 쉬듯 깜빡이고, 복잡도가 높은 파일일수록 원 뒤로 넓고 붉은 빛이 번집니다.

### AI 설명 (선택)

함수를 선택하면 Claude API로 코드 설명을 생성합니다. API 키가 없으면 이 기능만 비활성화되고 나머지는 정상 동작합니다.

## 시작하기

### 요구 사항

- **Node.js 18 이상** (개발·검증은 v20.20.2에서 진행)
- tree-sitter가 네이티브 모듈을 빌드하므로 C++ 컴파일러가 필요합니다. macOS는 Xcode Command Line Tools, Windows는 Visual Studio Build Tools.

### 설치

```bash
cd web
npm install --legacy-peer-deps
```

> `--legacy-peer-deps`가 필요합니다. `tree-sitter-c-sharp@0.21.3`이 peer로 `tree-sitter@^0.21.0`을 요구하는데 이 프로젝트는 `^0.22.4`를 쓰기 때문에, 플래그 없이 설치하면 `ERESOLVE` 오류가 납니다.

### 실행

```bash
cd web
npm start
```

http://localhost:3000 에서 열립니다. 다른 포트를 쓰려면 `PORT=3001 npm start`.

포트가 이미 사용 중이면 안내 메시지와 함께 종료됩니다.

### 사용법

상단 입력창에 둘 중 하나를 넣고 분석 버튼을 누릅니다.

- GitHub 저장소 URL — `https://github.com/user/repo` (`web/repos/`에 얕은 복제됩니다)
- 로컬 폴더의 절대 경로

분석 한도는 **200개 파일 / 파일당 100KB**입니다. `node_modules`, `venv`, `dist`, `build`, `bin`, `obj`, `.git` 등은 자동으로 제외됩니다.

### 단축키

| 키 | 동작 |
|---|---|
| `Ctrl` + `F` | 검색 (진단 창이 열려 있으면 진단 검색) |
| `F` | 그래프 전체를 화면에 맞추기 |
| `Esc` | 열린 창 닫기 · 확대 보기에서 전체 보기로 |
| `?` | 단축키 도움말 |

클릭은 파일이면 연결된 파일로 확대, 함수면 코드와 연결선 보기, 선이면 참조 위치 목록입니다. 빈 곳을 클릭하면 강조가 풀립니다.

### AI 설명 활성화

`web/` 폴더 안에 `.env` 파일을 만듭니다. (`web/.env.example`을 복사해서 쓰면 됩니다)

```
ANTHROPIC_API_KEY=your-key-here
```

키가 없으면 `/api/explain`만 503을 반환하고 나머지 기능은 그대로 동작합니다.

## 테스트

```bash
cd web
npm test        # 파서·resolver·graphBuilder 테스트 (242개)
npm run benchmark   # 파싱 성능 측정
```

`test/fixtures/`에 언어별 샘플 프로젝트가 들어 있습니다 — `sample_project`(Python), `cpp_project`, `csharp_project`, `ts_project`, `js_project`, `web_project`, `inline_script_project`.

레이아웃·렌더링 성능은 `test/layout-benchmark.js`와 브라우저에서 여는 `test/render-benchmark.html`로 측정합니다.

## API

### `POST /api/analyze`

프로젝트를 분석해 그래프 JSON을 반환합니다.

```json
{ "source": "https://github.com/user/repo" }
```

응답에는 `nodes`, `edges`, `inheritanceEdges`, `variableEdges`, `webEdges`, `packageNodes`, `tiers`, `langs`, `couplingScores`, `diagnostics`, `suggestions`, `cycleEdgeIds`, `fileCounts`, `warnings`, 그리고 파일 원본 조회에 쓰는 `analysisId`가 담깁니다.

출력 스키마는 [`web/docs/parser-output-schema.json`](web/docs/parser-output-schema.json)에 정리되어 있습니다.

### `GET /api/file?id={analysisId}&path={상대경로}`

분석한 프로젝트의 파일 원본을 돌려줍니다. 프론트엔드가 서버의 절대 경로를 알 필요 없도록 `analysisId`(경로의 SHA-256 앞 16자)로 참조합니다.

경로는 `realpath`로 심볼릭 링크까지 풀어서 프로젝트 루트 밖으로 나가는 요청을 차단하고, 지원 확장자만 허용하며, 512KB를 넘는 파일은 거부합니다.

### `POST /api/explain`

함수 코드를 받아 AI 설명을 생성합니다. 같은 코드는 해시 기반 인메모리 캐시로 재사용합니다.

## 프로젝트 구조

```
CodeDiagram/
├── web/                          # Node.js 서버 + 그래프 UI
│   ├── server/
│   │   ├── index.js              # Express 앱 진입점
│   │   ├── routes/               # analyze · file · explain
│   │   └── services/
│   │       ├── gitService.js         # clone / 파일 탐색
│   │       ├── parser.js             # 언어별 파서 분기
│   │       ├── parsers/              # 언어별 tree-sitter 파서 6종
│   │       ├── resolver.js           # 티어 언어 호출 관계 해석
│   │       ├── webResolver.js        # HTML/CSS/JS 크로스 언어 해석
│   │       ├── graphBuilder.js       # 최종 그래프 JSON 조립
│   │       ├── diagnosticsService.js # 순환 참조 · 안티패턴
│   │       ├── metricsService.js     # 결합도 점수
│   │       ├── refactoringService.js # 리팩토링 제안
│   │       ├── projectRegistry.js    # analysisId ↔ 경로
│   │       ├── aiService.js          # Claude API
│   │       └── cacheService.js       # AI 응답 캐시
│   ├── public/
│   │   ├── index.html
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── app.js            # 분석 요청 · 범례 · 패널 상태
│   │       ├── graph.js          # Cytoscape 그래프 렌더링
│   │       ├── interactions.js   # 클릭 · 검색 · 단축키
│   │       ├── forceSim.js       # d3-force 물리 레이아웃
│   │       ├── codeViewer.js     # 사이드 패널 코드 뷰어
│   │       ├── canvasCard.js     # 그래프 위 코드 카드
│   │       ├── codeEffects.js    # 진단 글로우 · 호출 입자
│   │       ├── localGraph.js     # 이웃만 보는 로컬 뷰
│   │       ├── minimap.js        # 미니맵
│   │       ├── fileTree.js       # 파일 트리 패널
│   │       └── diffPreview.js    # 리팩토링 diff 미리보기
│   ├── test/                     # 테스트 · 벤치마크 · 픽스처
│   └── docs/                     # 파서 출력 스키마
│
└── app/                          # Android 앱 (WebView 래퍼)
    └── src/main/java/.../MainActivity.kt
```

## Android 앱

`app/`은 위 웹앱을 WebView로 띄우는 Jetpack Compose 앱입니다. 에뮬레이터에서 호스트의 `localhost:3000`을 가리키는 `http://10.0.2.2:3000`을 로드하므로, **웹 서버를 먼저 실행해 둬야** 합니다.

```bash
./gradlew assembleDebug
```

## 기술 스택

**백엔드** — Node.js, Express, tree-sitter(7개 언어 문법), simple-git, Anthropic SDK

**프론트엔드** — Cytoscape.js + dagre 레이아웃, d3-force, highlight.js, D2Coding. 빌드 도구 없이 정적 파일을 그대로 서빙합니다. 외부 라이브러리는 CDN에서 직접 불러오므로 오프라인 환경에서는 그래프 렌더링이 제한됩니다.
