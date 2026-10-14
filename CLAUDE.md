# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

CodeDiagram은 소스코드(Git URL 또는 로컬 경로)를 tree-sitter로 정적 분석해 함수 호출/상속/변수 참조/웹 리소스 관계를 Cytoscape.js 그래프로 시각화하는 도구다. 코드 스멜 진단, 리팩토링 제안, Claude API 기반 함수 해설 기능을 포함한다. 실제 제품은 `web/`(Node.js 서버 + 바닐라 JS 프론트엔드)이며, `app/`의 Android 앱은 `http://10.0.2.2:3000`(에뮬레이터 → 호스트 localhost)을 띄우는 WebView 래퍼일 뿐이다.

코드 주석과 사용자 대상 메시지는 한국어로 작성되어 있으며, 새 코드도 같은 스타일(`//` 한국어 주석)을 따른다.

## 명령어

모든 웹 관련 명령은 `web/` 디렉터리에서 실행한다.

```bash
npm install                 # tree-sitter 네이티브 모듈 빌드 포함 + git pre-commit 훅 설치(prepare)
npm start                   # http://localhost:3000 (PORT 환경변수로 변경 가능)
npm test                    # Jest: 단위 + 계약 + 통합 테스트 (live 제외)
npm run test:unit           # test:contract / test:integration 도 있음
npx jest test/unit/parser.test.js -t "extracts docstrings"   # 단일 테스트 실행
npm run test:coverage       # 커버리지 측정 + jest.config.js의 최소 기준 검사
npm run check               # lint + format:check + typecheck + audit + test:coverage (PR 전에 실행)
npm run lint:fix            # ESLint 자동 수정 / npm run format 은 Prettier 일괄 포맷
npm run scan:secrets        # gitleaks 전체 기록 검사 (Docker), scan:image 는 Trivy 이미지 검사
npm run docker:test         # Docker test 스테이지에서 테스트 (CI와 같은 환경)
npm run benchmark           # 대규모 코드 자동 생성 후 파싱 시간/메모리 측정 (test/.benchmark_tmp 사용)
```

- 테스트 구조: `test/unit`, `test/contract`(파서 출력 스키마·Anthropic 클라이언트 계약), `test/integration`(supertest로 API), `test/live`(실제 API), `test/helpers`.
- `npm run test:live`는 실제 Anthropic API를 호출해 비용이 든다. 요청받았을 때만 실행한다. 기본 테스트는 `test/helpers/setupEnv.js`가 `ANTHROPIC_API_KEY`를 지운다.
- 테스트는 날짜·랜덤·네트워크에 기대지 않게 쓴다.
- Jest는 커스텀 환경(`test/helpers/treeSitterEnvironment.js`)으로 tree-sitter를 워커당 한 번만 로드한다. tree-sitter 0.22 래퍼가 다시 로드되면 `rootNode`이 `undefined`가 되기 때문이다.
- 언어별 테스트 픽스처는 `web/test/fixtures/<lang>_project/`에 있다.
- AI 해설(`/api/explain`)은 `web/.env`에 `ANTHROPIC_API_KEY`가 필요하다(`.env.example` 참고). 없으면 503을 반환하고 나머지 기능은 정상 동작한다.
- Android 앱은 루트에서 `./gradlew assembleDebug`로 빌드한다(웹 서버가 먼저 떠 있어야 의미가 있음). 현재 출시 계획이 없어 CI에서 보류 중이며, 라이브러리 버전 불일치로 빌드가 실패하는 상태다.

## 아키텍처

### 서버 파이프라인 (`web/server/`)

`POST /api/analyze { source }` → `gitService.getProjectPath` (URL이면 `web/repos/<name>-<hash>`에 shallow clone, 이미 있으면 재사용) → `graphBuilder.buildGraph(projectPath)`가 전체를 오케스트레이션한다:

1. `gitService.findFiles`가 확장자로 언어를 판별해 파일 목록 수집
2. `parser.parseFile(code, path, language)`가 언어별 파서로 디스패치 (`services/parsers/*Parser.js`, Python은 `parser.js` 내장). CHUNK_SIZE 단위로 파싱하며 청크 사이에 이벤트 루프에 양보한다.
3. **언어가 두 계열로 나뉜다** — 이 구분이 코드 전반에 걸쳐 있다:
   - **티어 언어** (`python`, `cpp`, `csharp`, `typescript`): `resolver.js`(`resolveCalls`, `resolveInheritance`, `resolveVariableRefs`)로 해석, `buildTieredNodes`로 노드 생성
   - **웹 언어** (`html`, `css`, `javascript`): `webResolver.js`(`resolveWebRelations`, `resolveJsCalls`)로 해석, `buildWebNodes`로 노드 생성. HTML의 인라인 `<script>`는 JS 파서로 다시 파싱되어 병합된다.
4. `metricsService`(파일 결합도) → `diagnosticsService`(순환 참조, 결합도, God Class/Function) → `refactoringService`(제안 생성)
5. 결과 JSON: `nodes`, `edges`, `inheritanceEdges`, `variableEdges`, `webEdges`, `packageNodes`, `tiers`, `langs`, `diagnostics`, `suggestions`, `cycleEdgeIds`, `fileCounts`, `warnings` 등. 노드는 Cytoscape `{ data: {...} }` 형식이며 compound(parent) 관계로 언어/파일/클래스 계층을 표현한다.

모든 파서는 공통 형태 `{ functions, calls, imports, classes, variables, variableRefs }`(웹 파서는 `domAccesses`, `eventBindings`, `inlineScripts` 등 추가)를 반환한다. 스키마는 `web/schemas/parser-output-schema.json`에 정의되어(`test/contract/parserOutput.test.js`가 검증) 있으니 파서 출력을 바꾸면 함께 갱신한다. 새 언어를 추가할 때는 `parser.js` 디스패치, `gitService`의 `SUPPORTED_EXTENSIONS`, `graphBuilder`의 `TIERED_LANGUAGES`/`fileCounts`, 프론트엔드 highlight.js 언어 스크립트(`index.html`)를 모두 손봐야 한다.

`GET /api/file?id=&path=`은 "코드 보기"용 파일 원본을 돌려준다. `/api/analyze` 응답의 `analysisId`를 `projectRegistry`가 프로젝트 루트에 매핑하며, 루트 밖 경로와 미지원 확장자는 거부한다.

`POST /api/explain`은 `aiService`(Anthropic SDK)를 호출하고 `cacheService`(코드 SHA-256 키의 인메모리 Map)로 결과를 캐싱한다.

### 프론트엔드 (`web/public/`)

번들러/모듈 시스템 없이 `index.html`에서 `<script>` 태그로 순서대로 로드되는 **전역 스코프 스크립트**다. 함수와 상태(`cy`, `lastAnalysisData` 등)는 전역으로 공유되므로 로드 순서(`graph.js` → `codeViewer.js` → `canvasCard.js` → `localGraph.js` → `minimap.js` → `interactions.js` → `diffPreview.js` → `fileTree.js` → `app.js`)가 중요하고, 새 파일을 추가하면 `index.html`에 태그를 넣어야 한다. 외부 라이브러리(Cytoscape, fcose, dagre, highlight.js)는 CDN에서 로드한다. 캐시 무효화를 위해 일부 스크립트에 `?v=N` 쿼리가 붙어 있다.

- `app.js`: 진입점. 분석 폼 제출 → `/api/analyze` → `renderGraph`, 파일 트리, 범례 구성
- `graph.js`: Cytoscape 초기화, 스타일, 뷰 모드별 렌더링(`renderGraph`/`renderFunctionView`/`renderPackageView`/`renderFileDetailView`), 줌 레벨에 따른 시맨틱 줌(LOD)
- `interactions.js`: 노드/엣지 이벤트, 접기/펼치기, 진단 패널, 참조 팝업, AI 해설 표시, 검색
- `canvasCard.js` / `codeViewer.js`: 캔버스 위 드래그 가능한 파일 카드와 highlight.js 코드 뷰어
- `diffPreview.js`: 리팩토링(순환 제거 등) 전/후 미리보기

## CI/CD와 작업 규칙

자세한 내용은 `.github/PIPELINE_GUIDE.md`(구성·명령·문제 해결)와 `.github/CONTRIBUTING.md`(브랜치·커밋 규칙)에 있다.

- **pre-commit** (루트 `.husky/pre-commit`, `web/`의 `npm install`이 설치): 스테이징된 파일만 ESLint 자동 수정과 Prettier 포맷(lint-staged), gitleaks로 비밀값 검사(`scripts/scan.js staged`), `test:unit`. `git commit --no-verify`는 쓰지 않는다.
- **CI** (`.github/workflows/ci.yml`): 모든 PR과 `master`·`feature/web-update` push에서 lint, test(Docker test 스테이지), security(gitleaks, npm audit, Trivy) job이 병렬로 돈다. Android CI(`android.yml`)는 앱 출시 계획이 없어 보류 중이라 수동 실행만 된다.
- **CD** (`.github/workflows/release.yml`): `v*` 태그를 푸시하면 CI를 다시 돌린 뒤, prod 이미지를 GHCR에 푸시하고 GitHub Release를 만든다.
- 외부 GitHub 액션은 전체 커밋 SHA로 고정하고 `# vX.Y.Z` 주석을 단다. 권한은 최상단 `contents: read`, 필요한 job에만 추가한다.
- 버전(npm, Docker 이미지, 액션)은 추측하지 말고 레지스트리나 릴리스에서 확인한다.
- 커밋 메시지는 Conventional Commits 형식이고, Claude 공동 작성자 표기를 넣지 않는다.
- 비밀값은 `web/.env`(Git 제외)와 GitHub Secrets에만 둔다.
- `docs/` 폴더(어느 위치든)와 `*.md`는 Git에서 제외된다. 예외는 `.github/**/*.md`와 `CLAUDE.md`다. 팀용 문서는 `.github/`에 둔다.
- Node는 22로 고정한다(`web/.nvmrc`, `engines`, `.npmrc`의 `engine-strict`). `legacy-peer-deps`는 tree-sitter-c-sharp의 peer 충돌 때문에 쓴다.

## 참고 문서

`web/docs/`(개인 문서 공간, Git 제외)의 `CodeDiagram_Project Charter_(v2.0)_20260913.md`와 `remaining_work_plan.md`에 요구사항, 성능 목표(예: 100파일/2만 라인 5초 이내 파싱+렌더링, 30fps), 주차별 계획이 정리되어 있다.
