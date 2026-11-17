# CodeRefactor (CodeDiagram)

**대용량 소스코드 의존성 시각화 및 AI 리팩토링 지원 솔루션 — 복잡한 레거시 코드를 일일이 읽지 않고도 거시적 아키텍처 구조를 한눈에 파악하고, 로버트 C. 마틴 결합도 공학 지표 기반의 결함 진단과 Claude AI 리팩토링 가이드를 하나의 Zero-Install 웹 서비스에서 제공합니다.**

코드 분석과 구조 파악에 과도한 인지적 비용을 소모하는 개발팀과 주니어 개발자가 직관적인 코드 지도 위에서 안전하고 신뢰할 수 있는 설계를 유지하도록 돕는 것이 CodeRefactor의 목표입니다.

---

## 사용자 온보딩 가이드

처음 화면에 접속하셨을 때 아래 **4단계 순서**로 탐색하시면 프로젝트의 핵심 아키텍처 결함을 파악할 수 있습니다.

1. **프로젝트 분석 실행**
   - 상단 입력창에 분석할 **GitHub 저장소 URL**(또는 로컬 경로)을 입력하고 **`[분석]`** 버튼을 누릅니다.
2. **가장 크고 붉은 위험 노드부터 클릭**
   - 그래프가 렌더링되면 **가장 크고(비대 파일)**, **뒤쪽에 붉은 그라데이션(결합도 HAZARD)이나 빨간 테두리(순환 참조)가 들어간 핵심 위험 노드**부터 먼저 클릭해 보세요.
   - 노드에 마우스를 올리면 결합도 등급, 불안정성 지수($I$), 외부 의존 수($C_e$) 배지를 바로 확인할 수 있습니다.
3. **캔버스 시각 신호 읽는 법**
   | 화면 표시 | 의미 | 연계 진단 탭 |
   | :--- | :--- | :--- |
   | **원 크기** | 파일 코드 길이(줄 수) 및 함수 개수 비례 (`16~64px`) | `[비대 코드]` |
   | **원 뒤 그라데이션** | 팀 결합도 공식(`CR-RFC-2026-002`) 판정 (**주황 `WARN` · 빨강 `HAZARD`**) | `[파일 결합도]` |
   | **빨간 테두리** | 모듈 간 **순환 참조(Cycle)** 고리에 포함된 파일 | `[순환 참조]` |
4. **`[진단]` 패널 & 파일 상세 뷰로 원인 추적**
   - 좌측 리본의 **`[진단]`** 버튼을 열면 캔버스와 100% 일치하는 **[순환 참조] / [파일 결합도] / [비대 코드]** 목록이 표시되며, 항목을 클릭하면 해당 파일의 실제 소스 코드로 즉시 이동합니다.
   - 파일 트리 더블클릭(또는 노드 길게 누르기)으로 **파일 상세 뷰**에 들어가면 함수 단위의 **AI 해설**을 확인할 수 있습니다.

---

## 프로젝트 차터 (Project Charter)

### 1. 프로젝트 개요

| 항목 | 내용 |
| :--- | :--- |
| **프로젝트명** | **CodeRefactor** (CodeDiagram) — 대용량 코드 의존성 시각화 및 AI 리팩토링 지원 웹 솔루션 |
| **저장소** | GitHub 기반 팀 리포지토리 (`CodeDiagram/web`) |
| **수행 기간** | 2026-09-01 ~ 2026-12-11 (총 15주) |
| **소속 / 교과목** | 한성대학교 IT공과대학 컴퓨터공학부 · 2026-2학기 기업연계 SW캡스톤디자인 |
| **프로젝트 유형** | 웹 브라우저 기반 Zero-Install SaaS형 개발 지원 도구 |
| **문서 버전** | v1.3 (2026-11-17) |

### 2. 배경 및 문제 정의

소프트웨어 규모가 거대해질수록 파일과 클래스 간 복잡한 상호 참조로 인해 전체 구조 파악 및 유지보수 비용이 급증한다. 특히 현대의 AI 주도 개발(Vibe Coding) 확산으로 코드는 빠르게 대량 생성되지만, 아키텍처 검증은 여전히 수동에 머물러 있어 다음 문제가 반복된다.

| 문제 | 기존 환경 및 도구의 한계 | CodeRefactor의 해결 방식 |
| :--- | :--- | :--- |
| **인지 복잡도 과부하** | 수백 개 파일의 참조 관계를 파악하기 위해 텍스트 코드를 일일이 역추적 | **Compound 계층형 인터랙티브 캔버스**로 패키지-파일-클래스 관계를 시각화 |
| **기존 도구의 설치 장벽** | SonarQube, Sourcetrail 등은 무거운 서버 구축이나 복잡한 로컬 빌드 필수 | **Zero-Install 웹 브라우저 SaaS**로 URL 입력 즉시 빠른 렌더링 |
| **단편적 린트 vs 구조 조망 부재** | 단순 분기 복잡도나 스타일 린트만으로는 모듈 간 의존성 파악이 어려움 | **로버트 C. 마틴 공인 결합도($I, CBO$) 및 비대 코드 지표**로 거시적 위험도 진단 |
| **결함-코드 탐색 단절** | 진단 목록과 실제 소스코드 탐색이 분리되어 원인 파악에 시간 소요 | **진단 패널-캔버스 100% 동기화** 및 클릭 시 **소스코드·Claude AI 해설** 즉시 연동 |

### 3. 목적 및 목표

**목적** — 설치 없이 웹 브라우저 탭 하나로 대규모 프로젝트의 코드 의존성을 시각화하고, 객관적 공학 지표 기반의 결함 식별과 AI 해설을 통해 개발팀의 기술 부채를 조기에 해소한다.

| 번호 | 핵심 목표 | 측정 지표 및 달성 기준 |
| :---: | :--- | :--- |
| **G1** | Zero-Install 웹 아키텍처 제공 | 로컬 설치 없이 GitHub URL 또는 로컬 경로 입력 즉시 브라우저에서 구동 |
| **G2** | 엔터프라이즈 다국어 정적 파싱 | 실무 중심 7개 언어(Java, C/C++, Python, C#, TS, JS, HTML/CSS) Tree-sitter AST 파싱 |
| **G3** | 공인 소프트웨어 공학 결합도 진단 | Robert C. Martin의 $C_a, C_e, \text{Instability } I, CBO$ (`CR-RFC-2026-002`) 채택 및 그라데이션 시각화 |
| **G4** | 대규모 노드 렌더링 최적화 | 100개 파일 분석 3초 이내 완료, 대규모 노드 인터랙션 시 평균 30 FPS 이상 유지 |
| **G5** | 직관적인 AI 코드 해설 | 파일 상세 뷰에서 함수 단위 Claude AI 해설 및 결합도 위험 파일 3줄 요약 API 제공 |

### 4. 범위 (Scope)

#### In Scope (현재 구현)
- GitHub 원격 저장소 복제(Shallow Clone) 및 로컬 디렉토리 소스코드 수집 엔진
- Tree-sitter 기반 다국어(Java, C/C++, Python, C#, JS/TS, HTML/CSS) AST 구문 분석
- 로버트 C. 마틴 패키지 결합도($C_a, C_e, I$) 및 객체 간 결합도($CBO$) 연산 엔진 (`CR-RFC-2026-002`)
- 순환 참조(Cycle) 탐지 및 비대 코드(비대 파일 · God Class) 정적 진단 엔진
- Cytoscape.js 기반 2D 노드-엣지 인터랙티브 캔버스 (줌/팬, 노드 크기-줄 수/함수 수 비례, 그라데이션-결합도 등급 매핑)
- `[진단]` 패널(순환 참조 / 파일 결합도 / 비대 코드)과 캔버스 시각 신호의 100% 동기화
- 연결선 클릭 시 소스 파일명과 줄 번호를 안내하는 참조 팝업 및 `highlight.js` 기반 코드 뷰어
- Anthropic Claude API 기반 함수 단위 해설(`POST /api/explain`) 및 결합도 진단 요약(`POST /api/explain/coupling`), 인메모리 캐싱

#### Out of Scope / 보류 (Deferred)
- 컴파일러 기반 완전한 런타임 동적 심볼 분석 (정적 AST 기반에 집중)
- IDE 내부 직접 삽입용 네이티브 확장 프로그램 (웹 SaaS 단일 환경에 집중)
- 데이터베이스 물리 ERD 역공학 모델링
- 사람 승인 없는 AI 코드 원격 저장소 강제 자동 푸시
- *[보류]* Diff 미리보기 오버레이, 리팩토링 제안 탭, 사용자별 API 키 등록 UI (`index.html` 내 `[미구현-보류]` 주석으로 비활성화)
- *[향후 계획]* 1st-Party 벤더 필터링(Linguist/Proxy Folding), 듀얼 모드 임계치 토글, Mock AI 폴백 프로바이더

### 5. 주요 산출물

| 구분 | 주요 산출물 | 비고 |
| :--- | :--- | :--- |
| **소프트웨어** | CodeRefactor 웹 애플리케이션 (`web/server` + `web/public`), Tree-sitter 파서 엔진 | 구동 가능 패키지 |
| **아키텍처/설계** | 시스템 아키텍처 정의서, 데이터 파이프라인 명세서, Graph JSON 스키마 | Clean Architecture |
| **요구/관리 문서** | PRD(제품요구사항정의서 v2.2), TRD(기술요구명세서 v1.2), WBS(v3.2), 프로그램 목록(v1.2) | 산출물 동기화 완료 |
| **UI/UX 명세서** | StoryBoard UI 설계서(v1.1), 듀얼 모드 결합도 진단 뷰 플로우차트 | 다크 테마 시스템 |
| **연구/제안서** | 정적분석 도구별 결합도 비교분석서, 외부라이브러리 필터링 및 LOD 개선 제안서 | 학술 방어 논리 완비 |

### 6. 이해관계자 및 역할 (R&R)

| 역할 구분 | 담당자 | 주요 역할 및 상세 R&R |
| :--- | :--- | :--- |
| **지도교수** | **양옥수 교수님** | 프로젝트 방향 지도, PBL 마일스톤 점검, 산업 연계성 검토 및 최종 평가 |
| **팀장 (PM / AI)** | **진승호** | 프로젝트 일정·산출물 총괄, 시스템 아키텍처 설계, Claude 3.5 Sonnet LLM 파이프라인 구축, Monaco Diff 뷰 연동, Mock Provider 폴백 및 QA 버그 패치 |
| **파서 엔지니어** | **황현진** | Tree-sitter 다국어(Java/C/Python) AST 구문 분석기 구현, 1st-Party 벤더 필터링 모듈 개발, 예외 처리 가드레일 |
| **프론트엔드** | **김재원** | Cytoscape.js 인터랙티브 캔버스 렌더러 개발, 노드-엣지 스타일링(CBO/I 매핑), 다크 테마 디자인 시스템 및 뷰 제어 컨트롤러 구현 |
| **아키텍트 / QA** | **김민성** | 로버트 C. 마틴 결합도 공식($C_a, C_e, I, CBO$) 산출 엔진 개발, 단위 테스트 슈트(`test/runner.js`) 작성, 테스트 픽스처 구축 및 성능 검증 |

### 7. 마일스톤 (Milestones)

| 시점 | 스프린트 및 마일스톤 | 달성 상태 |
| :---: | :--- | :---: |
| **09-08 ~ 09-22** | **Inception (착수):** 프로젝트 헌장, PRD 초안, 개발 환경 구축 및 3주차 발표 완료 | 완료 (100%) |
| **09-21 ~ 10-03** | **Sprint#1:** Tree-sitter 기본 AST 파서 구축 및 웹 다이어그램 더미 렌더링 완료 | 완료 (100%) |
| **10-05 ~ 10-18** | **Sprint#2:** 인터랙티브 그래프 렌더링, CBO 스케일링, Hover/Selection 인터랙션 구현 완료 | 완료 (100%) |
| **10-19 ~ 11-01** | **Sprint#3:** 결합도($I, CBO$) 산출 엔진, Claude API 연동 및 QA 버그 패치 | 완료 (100%) |
| **11-02 ~ 11-15** | **Sprint#4:** 10주차 중간발표, `CR-RFC-2026-002` 결합도 기준 정립, 비대 코드 진단 및 UI-진단 동기화 완료 | 완료 (100%) |
| **11-16 ~ 11-29** | **Sprint#5:** 12주차 최종 리허설, 기술 문서 정합성 확보, E2E 통합 테스트 및 코드 동결(Code Freeze) | **진행중** |
| **11-30 ~ 12-11** | **Sprint#6:** 14주차 최종 발표 & 캡스톤 페스티벌, 최종 결과보고서 제출 및 프로젝트 종료 | 시작 전 |

### 8. 아키텍처 원칙 (Core Architectural Principles)

1. **Clean Layered Architecture** — Presentation(`web/public`), Application(`web/server`), External Cloud(Anthropic API) 계층을 분리하여 모듈 간 결합도를 최소화한다.
2. **Deterministic Metric Over Intuition** — 주관적 추정을 배제하고 Robert C. Martin의 학술 표준 공식($C_a, C_e, I, CBO$)과 서버 단일 임계치(`couplingThresholds.js`, `sizeThresholds.js`)만을 캔버스·진단 판정의 기준으로 삼는다.
3. **Single Source of Truth (UI-Diagnostics Sync)** — 판정은 서버 파이프라인 한 곳에서만 수행하고, 캔버스(그라데이션/크기/테두리)와 `[진단]` 패널은 동일한 서버 결과를 렌더링한다.
4. **Sandbox Security** — 소스코드 열람 시 `realpath` 검증으로 상위 디렉토리(`..`) 접근을 차단하고, 경로 정책·파일 크기·API Rate Limit을 적용하여 서버 자원을 보호한다.

### 9. 제약사항 및 가정

#### 제약사항
- **클라우드 예산 한도:** 사업단 지원금 한도 내 운영을 위해 파싱 및 그래프 연산은 로컬 Node.js 인스턴스에서 수행하고 AI 호출 시 300~500 토큰 단위 함수 스니펫으로 엄격 제한한다.
- **Node.js 런타임 호환성:** Tree-sitter C++ 네이티브 바인딩 의존성에 따라 Node.js LTS(v18~v22) 환경에서 구동한다.
- **인증 모듈 최소화:** 비핵심 회원가입 절차를 배제하고 공통 데모 세션으로 직행하여 핵심 분석 기능에 공수를 집중한다.

#### 가정
- 분석 대상 프로젝트는 Git으로 형상 관리되거나 로컬에 유효한 소스코드 디렉토리를 갖추고 있다.
- 브라우저는 WebGL 및 최신 ECMAScript 표준을 지원하는 최신 Chromium(Chrome, Edge) 기반이다.

### 10. 리스크 및 대응 전략

| 식별된 리스크 | 잠재적 영향도 | 선제적 대응 전략 |
| :--- | :---: | :--- |
| **대규모 프로젝트 캔버스 헤어볼** | 노드 500개 이상 시 가독성 급감 | 패키지/파일 계층화, d3-force 물리 배치 및 시맨틱 줌(LOD) 적용 |
| **외부 AI API 장애 및 키 충돌** | 다중 사용자 키 충돌 및 호출 실패 | 서버 `.env` 단일 키 기반 운용, Rate Limit 및 401/502 에러 안내 처리 |
| **UI-진단 지표 불일치** | 캔버스 경고와 진단 목록 간 괴리 | 서버 단일 판정(`metricsService`, `diagnosticsService`)을 캔버스·패널이 공유 |
| **발표 직전 신규 버그 발생** | 라이브 시연 실패 및 감점 요인 | 발표 1주 전 코드 동결(Code Freeze) 및 단위/계약/통합 테스트 자동 검증 |

### 11. 성공 기준 (Success Criteria)

| 평가 기준 | 목표 기준치 | 현재 실측 및 달성치 |
| :--- | :--- | :--- |
| **분석 소요 시간** | 100개 파일 분석 시 3초 이내 | **평균 0.82초 (목표 대비 72% 이상 초과 달성)** |
| **인터랙티브 반응성** | 대규모 노드 줌/팬 시 30 FPS 이상 | **평균 58 FPS 유지 확인** |
| **핵심 QA 무결성** | 식별된 캔버스/사이드패널 결함 0건 | **진단-캔버스 동기화, 파일 트리 복원, 노드 크기 스케일링 패치 완료** |
| **테스트 커버리지** | 단위·계약·통합 테스트 통과 | **Jest 스위트 통과 (구문 91% · 분기 76% · 함수 97% · 줄 92%)** |

---

## 왜 CodeRefactor인가

- **숲(Architecture)과 나무(Code)의 동시 조망** — 파일과 함수 단위의 미시적 린트(SonarQube)에 머무르지 않고, 전체 패키지·파일 간 거시적 의존 관계를 2D 캔버스에서 직관적으로 조망합니다.
- **설치 없는 웹 기반 접근성** — 무거운 IDE 플러그인이나 복잡한 온프레미스 서버 설치 없이 브라우저에서 GitHub URL 입력 즉시 구동됩니다.
- **검증된 공학 메트릭 채택** — Clean Architecture 표준 수식인 $I$(불안정도)와 $CBO$(객체 간 결합도) 기반 `CR-RFC-2026-002` 공식으로 위험 모듈을 그라데이션으로 명확히 하이라이트합니다.
- **진단-코드-AI 해설 단일 흐름** — `[진단]` 패널과 캔버스가 100% 동기화되어 있으며, 문제 파일·함수를 클릭해 실제 소스코드와 Claude AI 해설을 바로 확인할 수 있습니다.

---

## 지원 언어 및 추출 대상

Tree-sitter 기반 다국어 파서 엔진을 탑재하여 7개 핵심 언어 규격을 정밀 분석합니다.

| 언어 | 확장자 | 주요 추출 대상 및 심볼 |
| :--- | :--- | :--- |
| **Java** | `.java` | 클래스, 인터페이스, 상속(`extends`), 구현(`implements`), 메서드 호출, import |
| **C / C++** | `.c`, `.cpp`, `.h`, `.hpp` | 함수 선언/정의, 구조체, 클래스, `#include`, 호출 관계 |
| **Python** | `.py` | 함수, 클래스, 메서드, `import`/`from`, 변수 참조, 상속 |
| **C#** | `.cs` | 클래스, 메서드, `using`, 인터페이스, 호출 |
| **TypeScript** | `.ts`, `.tsx` | 함수, 클래스, 인터페이스, 타입 별칭, 제네릭, import |
| **JavaScript** | `.js`, `.jsx` | 함수, 화살표 함수, 클래스, import, 메서드 호출 |
| **HTML / CSS** | `.html`, `.css` | DOM 접근, CSS 셀렉터, 이벤트 바인딩 등 크로스 웹 의존성 |

---

## 핵심 기능

### 1. Compound 계층형 의존성 그래프
- **계층형 군집 배치:** 패키지/폴더/파일 단위의 계층 구조 및 d3-force 기반 물리 배치 지원.
- **노드 크기 & 그라데이션 매핑:** 노드 크기는 코드 길이(줄 수·함수 수)에 비례(`16~64px`)하며, 원 뒤 그라데이션은 `CR-RFC-2026-002` 결합도 판정(**주황 `WARN` · 빨강 `HAZARD`**), 빨간 테두리는 순환 참조(Cycle)를 나타냅니다.
- **뷰포트 및 탐색 제어:** 전체 맞춤(Fit), 로컬 그래프(선택 노드 이웃 격리), 파일 상세 뷰(파일 트리 더블클릭 / 노드 길게 누르기) 제공.

### 2. 서버 단일 판정 기반 `[진단]` 패널 동기화
- **3대 정적 진단 탭:** `[순환 참조]`, `[파일 결합도]`, `[비대 코드]`(비대 파일 · God Class) 목록을 서버에서 일괄 판정하여 캔버스 시각 신호와 100% 일치시킵니다.
- **즉시 소스 이동 & 하이라이트:** 진단 항목 클릭 시 해당 파일의 실제 소스코드로 이동하고, 캔버스 노드 선택 시 연관 파일 하이라이트/음영 처리를 수행합니다.

### 3. Claude AI 코드 해설 & 결합도 요약
- **함수 단위 AI 해설:** 파일 상세 뷰에서 함수를 선택하면 Anthropic Claude API를 통해 한국어 요약 해설을 제공합니다.
- **결합도 위험 진단 API:** `POST /api/explain/coupling`을 통해 고결합 파일의 원인 분석 및 리팩토링 방향 요약을 지원합니다.
- **인메모리 캐싱 & 보안:** 코드 해시 기반 인메모리 캐싱 및 Rate Limit을 적용합니다.

### 4. 참조 팝업 & 코드 뷰어
- 다이어그램의 연결선(Edge) 또는 노드를 클릭하면 해당 호출이 일어난 실제 파일 경로와 라인 번호를 안내하는 팝업을 제공합니다.
- `highlight.js` 기반 코드 뷰어 및 캔버스 위 드래그 가능한 파일 카드(`canvasCard.js`)로 다중 파일 동시 비교를 지원합니다.

---

## 아키텍처

```
CodeDiagram/
├── web/                          # Node.js 백엔드 서버 + 웹 프론트엔드
│   ├── server/                   # [Application Layer]
│   │   ├── index.js              # Express 앱 진입점 (포트 3000)
│   │   ├── config/               # 판정 임계치 (couplingThresholds, sizeThresholds)
│   │   ├── middleware/           # 보안 헤더, Rate Limit, 에러 핸들러 등
│   │   ├── routes/               # REST API (analyze, file, explain, refactor, auth)
│   │   └── services/             # 핵심 분석 파이프라인
│   │       ├── parsers/          # 언어별 Tree-sitter 파서 (Java, C++, C#, TS, JS, HTML, CSS)
│   │       ├── parser.js         # 파서 디스패치 (Python 내장)
│   │       ├── resolver.js       # 티어 언어 호출/상속/변수 참조 해석
│   │       ├── webResolver.js    # 웹 언어(HTML/CSS/JS) 관계 해석
│   │       ├── graphBuilder.js   # 전체 그래프 조립 오케스트레이터
│   │       ├── metricsService.js # Robert C. Martin Ca, Ce, I, CBO 지표 산출
│   │       ├── diagnosticsService.js # 순환 참조, 파일 결합도, 비대 코드 진단
│   │       ├── aiService.js      # Anthropic Claude API 연동
│   │       ├── cacheService.js   # 인메모리 SHA-256 캐시
│   │       └── gitService.js     # GitHub Shallow Clone 및 로컬 파일 수집
│   ├── public/                   # [Presentation Layer] 정적 웹 SPA (전역 스크립트)
│   │   ├── index.html            # 메인 대시보드 레이아웃
│   │   ├── css/style.css         # 다크 테마 디자인 시스템
│   │   ├── vendor/               # 오프라인 벤더 번들 (Cytoscape, d3-force, highlight.js)
│   │   └── js/
│   │       ├── app.js            # 메인 컨트롤러 및 분석 요청 처리
│   │       ├── graph.js          # Cytoscape.js 초기화 및 뷰 렌더링
│   │       ├── codeEffects.js    # 결합도 그라데이션 및 시각 효과
│   │       ├── interactions.js   # 노드/엣지 이벤트, 진단 패널, AI 해설 표시
│   │       ├── codeViewer.js     # highlight.js 소스 코드 뷰어
│   │       ├── canvasCard.js     # 캔버스 위 드래그 가능한 파일 카드
│   │       ├── fileTree.js       # 좌측 파일 트리 패널
│   │       ├── forceSim.js       # d3-force 물리 레이아웃 시뮬레이션
│   │       └── localGraph.js     # 선택 노드 이웃 격리 뷰
│   ├── test/                     # Jest 단위·계약·통합 테스트 및 벤치마크
│   └── schemas/                  # 파서 출력 / AI 리팩토링 JSON 스키마
├── docs/                         # 공식 엔지니어링 기술 문서 6종
├── app/                          # Android WebView 래퍼 (현재 보류)
└── .github/                      # CI/CD 파이프라인 및 가이드
```

---

## 기술 스택

| 영역 | 기술 스택 | 선정 이유 |
| :--- | :--- | :--- |
| **Frontend** | Vanilla JS, Cytoscape.js, highlight.js, d3-force | 빌드 오버헤드 없는 브라우저 직행 구동 및 대규모 그래프 렌더링 최적화 |
| **Backend** | Node.js (v22 LTS), Express | 고성능 비동기 I/O 및 Tree-sitter 네이티브 바인딩 친화성 |
| **AST Parser** | Tree-sitter (Java, C/C++, Python, C#, JS/TS, HTML/CSS) | 업계 표준 고속 점진적 구문 트리 파서 |
| **Metrics Engine** | Robert C. Martin Coupling Metric Module | Clean Architecture 공인 결합도 지표 계산 (`CR-RFC-2026-002`) |
| **AI / LLM** | Anthropic Claude API (`claude-haiku-5-5`) | 함수 단위 한국어 해설 및 결합도 진단 3줄 요약 |
| **Testing** | Jest, Supertest | 단위·계약·통합 테스트 및 픽스처 기반 파싱 정합성 검증 |

---

## 빠른 시작 (Getting Started)

### 1. 요구 사항
- **Node.js:** `v22.21.0` 이상 (`< 23`, `web/package.json` `engines` 기준)
- **컴파일러:** C++ 컴파일러 (Tree-sitter 네이티브 모듈 빌드용)

### 2. 설치 및 실행

```bash
# 1. 웹 디렉토리 이동
cd web

# 2. 필수 패키지 설치
npm install

# 3. 환경 변수 설정 (AI 해설 기능 사용 시 필요)
# web/.env 파일에 ANTHROPIC_API_KEY=your_claude_api_key_here 설정

# 4. 서버 기동
npm start
```

- 웹 브라우저 접속: `http://localhost:3000`
- 포트 변경 필요 시: `PORT=3001 npm start`

### 3. 테스트 실행

```bash
cd web
npm test            # 단위, 계약, 통합 테스트 실행 (live 제외)
npm run check       # lint + format:check + typecheck + audit + test:coverage
npm run benchmark   # 대용량 파싱 및 렌더링 성능 측정
```

---

## REST API 규격

### `POST /api/analyze`
GitHub URL 또는 로컬 경로를 전달받아 Tree-sitter 파싱 후 Cytoscape Graph JSON 및 진단·결합도 지표를 반환합니다.

```json
{
  "source": "https://github.com/user/repo"
}
```

- **주요 응답 항목:** `nodes`, `edges`, `diagnostics`, `suggestions`, `cycleEdgeIds`, `fileCounts`, `tiers`, `langs`, `analysisId`

### `POST /api/explain`
함수 코드 스니펫(`name`, `code` 등)을 전달받아 Claude AI 기반 한국어 함수 해설(`explanation`)을 반환합니다.

### `POST /api/explain/coupling`
고결합 위험 파일(`filePath`, `code`, `metrics`, `dependencies`)을 전달받아 Claude AI 기반 원인 분석 및 3줄 리팩토링 제안을 반환합니다.

---

## 문서 (Documentation)

* [시스템 아키텍처 및 데이터 파이프라인 (Architecture & Pipeline)](./docs/architecture.md)
* [결합도 메트릭 산출 규격 및 소수 법칙 왜곡 방지 (Metrics Specification)](./docs/metrics-spec.md)
* [1st-Party 벤더 필터링 및 프록시 폴딩 (Proxy Folding & LOD)](./docs/filtering-lod.md)
* [정적 분석 도구(SonarQube) 대비 비교 분석 (Comparative Analysis)](./docs/comparative-analysis.md)
* [AI 리팩토링 프롬프트 및 Before/After Diff 뷰어 명세 (AI & Diff Engine)](./docs/ai-diff-spec.md)
* [CodeDiagram CLI 터미널 도구 사용자 가이드 (CLI Guide)](./docs/cli-guide.md)

> PRD(제품요구사항정의서)·TRD(기술요구명세서)·WBS(일정표)·프로그램 목록은 한성대학교 기업연계 SW캡스톤디자인 공식 양식에 따른 **별도 산출물 문서로 관리**됩니다.
