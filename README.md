# CodeRefactor (CodeDiagram)

**대용량 소스코드 의존성 시각화 및 AI 리팩토링 지원 솔루션 — 복잡한 레거시 코드를 일일이 읽지 않고도 거시적 아키텍처 구조를 한눈에 파악하고, 로버트 C. 마틴 결합도 공학 지표 기반의 결함 진단과 Claude AI 리팩토링 가이드를 하나의 Zero-Install 웹 서비스에서 제공합니다.**

코드 분석과 구조 파악에 과도한 인지적 비용을 소모하는 개발팀과 주니어 개발자가 직관적인 코드 지도 위에서 안전하고 신뢰할 수 있는 설계를 유지하도록 돕는 것이 CodeRefactor의 목표입니다.

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
| **문서 버전** | v1.2 (2026-10-24) |

### 2. 배경 및 문제 정의

소프트웨어 규모가 거대해질수록 파일과 클래스 간 복잡한 상호 참조로 인해 전체 구조 파악 및 유지보수 비용이 급증한다. 특히 현대의 AI 주도 개발(Vibe Coding) 확산으로 코드는 빠르게 대량 생성되지만, 아키텍처 검증은 여전히 수동에 머물러 있어 다음 문제가 반복된다.

| 문제 | 기존 환경 및 도구의 한계 | CodeRefactor의 해결 방식 |
| :--- | :--- | :--- |
| **인지 복잡도 과부하** | 수백 개 파일의 참조 관계를 파악하기 위해 텍스트 코드를 일일이 역추적 | **Compound 계층형 인터랙티브 캔버스**로 파일-클래스-함수 관계를 시각화 |
| **기존 도구의 설치 장벽** | SonarQube, Sourcetrail 등은 무거운 서버 구축이나 복잡한 로컬 빌드 필수 | **Zero-Install 웹 브라우저 SaaS**로 URL 입력 즉시 3초 내 렌더링 |
| **서드파티 결합도 독점 (LOD 왜곡)** | 외부 플러그인(TMP 등)이 결합도를 독점하여 핵심 도메인 코드가 가려짐 | **1st-Party 벤더 필터링 및 프록시 폴딩(직접선 축약)**으로 도메인 코드 격리 |
| **단편적 린트 vs 구조 조망 부재** | SonarQube는 결합도 수식을 영구 폐기하고 단순 함수 분기 복잡도에만 치중 | **로버트 C. 마틴 공인 결합도($I, CBO$) 메트릭**으로 거시적 아키텍처 위험도 진단 |
| **진단 후 후속 조치 단절** | 문제 수치만 나열할 뿐 구체적인 리팩토링 구현 대안 제시 부재 | **Claude AI 3줄 결함 원인 분석 및 Before/After Diff 코드** 즉시 생성 |

### 3. 목적 및 목표

**목적** — 설치 없이 웹 브라우저 탭 하나로 대규모 프로젝트의 코드 의존성을 시각화하고, 객관적 공학 지표 기반의 결함 식별과 AI 리팩토링 가이드를 통해 개발팀의 기술 부채를 조기에 해소한다.

| 번호 | 핵심 목표 | 측정 지표 및 달성 기준 |
| :---: | :--- | :--- |
| **G1** | Zero-Install 웹 아키텍처 제공 | 로컬 설치 없이 GitHub URL 또는 로컬 경로 입력 즉시 브라우저에서 구동 |
| **G2** | 엔터프라이즈 다국어 정적 파싱 | 국내 실무 중심 언어(Java/Spring, C/C++, Python) 및 C#, TS/JS Tree-sitter AST 파싱 |
| **G3** | 공인 소프트웨어 공학 결합도 진단 | Robert C. Martin의 $C_a, C_e, \text{Instability } I, CBO$ 공식 채택 및 신호등 시각화 |
| **G4** | 대규모 노드 렌더링 최적화 | 100개 파일 분석 3초 이내 완료, 500개 이상 노드 인터랙션 시 평균 30 FPS 이상 유지 |
| **G5** | 안전하고 직관적인 AI 리팩토링 | 위험 노드 대상 3줄 원인 요약 및 Monaco Editor Before/After Diff 렌더링 (Mock 폴백 완비) |

### 4. 범위 (Scope)

#### In Scope
- GitHub 원격 저장소 복제(Shallow Clone) 및 로컬 디렉토리 소스코드 수집 엔진
- Tree-sitter 기반 다국어(Java, C/C++, Python, C#, JS/TS) AST 구문 분석
- 1st-Party 벤더 필터링(Linguist 룰셋) 및 서드파티 토글 시 직접선 축약(Proxy Folding)
- 로버트 C. 마틴 패키지 결합도($C_a, C_e, I$) 및 객체 간 결합도($CBO$) 연산 엔진
- Cytoscape.js 기반 2D 노드-엣지 인터랙티브 캔버스 (줌/팬, 노드 크기-CBO, 색상-I 매핑)
- 듀얼 모드 임계치 토글 (기본 조망 모드 $I>0.8$ vs 정밀 결합도 진단 모드 $I>0.7$)
- 연결선 클릭 시 소스 파일명과 줄 번호를 안내하는 CodeLens 팝업
- Anthropic Claude API (Claude 3.5 Sonnet) 기반 3줄 요약 및 Monaco Diff 패널
- 외부 장애 대비 0.05초 즉시 반환 Mock Provider 폴백 및 인메모리 캐싱
- 간이 인증 및 데모 프로젝트 프리셋 제공

#### Out of Scope
- 컴파일러 기반 완전한 런타임 동적 심볼 분석 (정적 AST 기반에 집중)
- IDE 내부 직접 삽입용 네이티브 확장 프로그램 (웹 SaaS 단일 환경에 집중)
- 데이터베이스 물리 ERD 역공학 모델링
- 사람 승인 없는 AI 코드 원격 저장소 강제 자동 푸시 (개발자 검토 중심 Diff 제공)

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
| **10-19 ~ 11-01** | **Sprint#3:** 결합도($I, CBO$) 산출 엔진, 듀얼 모드 UI, Claude API 연동 및 QA 버그 패치 | **88% 달성 (진행중)** |
| **11-02 ~ 11-15** | **Sprint#4:** 10주차 중간발표, 대형 프로젝트 결합도 튜닝, 인메모리 캐싱 레이어 최적화 | 시작 전 |
| **11-16 ~ 11-29** | **Sprint#5:** 12주차 최종 리허설, 100개 파일 E2E 통합 테스트, 발표 1주 전 코드 동결(Code Freeze) | 시작 전 |
| **11-30 ~ 12-11** | **Sprint#6:** 14주차 최종 발표 & 캡스톤 페스티벌, 최종 결과보고서 제출 및 프로젝트 종료 | 시작 전 |

### 8. 아키텍처 원칙 (Core Architectural Principles)

1. **Clean Layered Architecture** — Presentation, Application, Data Access, External Cloud 계층을 엄격히 분리하여 모듈 간 결합도를 최소화한다.
2. **Deterministic Metric Over Intuition** — 주관적 추정을 배제하고 Robert C. Martin의 학술 표준 공식($C_a, C_e, I, CBO$)으로 산출된 수치만을 신호등 시각화의 기준으로 삼는다.
3. **1st-Party Boundary Isolation** — 외부 라이브러리 및 벤더 코드는 자동 격리 및 축약(Proxy Folding)하여 사용자 비즈니스 도메인 코드가 가려지는 화면 왜곡(LOD 왜곡)을 원천 방지한다.
4. **Resilient AI Failover (Zero-Interruption)** — Anthropic Claude API 장애나 할당량 소진 시 0.05초 내에 사전 정의된 정적 Mock Provider로 즉시 전환하여 100% 무중단 시연을 보장한다.
5. **Sandbox Security** — 소스코드 열람 시 `realpath` 검증으로 상위 디렉토리(..) 접근을 차단하고 512KB 초과 요청을 제한하여 서버 자원을 보호한다.

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
| **대규모 프로젝트 캔버스 헤어볼** | 노드 500개 이상 시 가독성 급감 | In-degree 기반 Compound 계층화, 분리형 LOD 축약 알고리즘 적용 |
| **외부 AI API 장애 및 지연** | 발표 시연 중 백화(White-out) 발생 | Mock Provider 폴백 구축으로 장애 시 0.05초 내 정적 샘플 자동 반환 |
| **외부 라이브러리의 지표 왜곡** | 플러그인 결합도가 도메인 코드를 은폐 | Linguist 규칙 기반 1st-Party 태깅 및 원클릭 Plugin ON/OFF 토글 제공 |
| **발표 직전 신규 버그 발생** | 라이브 시연 실패 및 감점 요인 | 발표 1주 전 코드 동결(Code Freeze) 및 80:20 방어 프레임워크 수립 |

### 11. 성공 기준 (Success Criteria)

| 평가 기준 | 목표 기준치 | 현재 실측 및 달성치 |
| :--- | :--- | :--- |
| **분석 소요 시간** | 100개 파일 분석 시 3초 이내 | **평균 0.82초 (목표 대비 72% 이상 초과 달성)** |
| **인터랙티브 반응성** | 대규모 노드 줌/팬 시 30 FPS 이상 | **평균 58 FPS 유지 확인** |
| **AI 장애 대응력** | API 단절 시 시스템 백화 0% | **Mock Provider 0.05초 즉시 전환 확인** |
| **핵심 QA 무결성** | 식별된 캔버스/사이드패널 결함 0건 | **진단 토글 및 하이라이트 동기화 버그 2건 패치** |

---

## 왜 CodeRefactor인가

- **숲(Architecture)과 나무(Code)의 동시 조망** — 파일과 함수 단위의 미시적 린트(SonarQube)에 머무르지 않고, 전체 패키지 간 거시적 의존 관계를 2D 캔버스에서 직관적으로 조망합니다.
- **설치 없는 웹 기반 접근성** — 무거운 IDE 플러그인이나 복잡한 온프레미스 서버 설치 없이 브라우저에서 GitHub URL 입력 즉시 구동됩니다.
- **검증된 공학 메트릭 채택** — Clean Architecture 표준 수식인 $I$(불안정도)와 $CBO$(객체 간 결합도)를 기반으로 위험 모듈을 적색 신호등으로 명확히 하이라이트합니다.
- **진단에서 리팩토링까지 AI 단일 파이프라인** — 결함 모듈 선택 시 Claude AI가 3줄로 핵심 원인을 요약하고 Before/After Diff 코드를 즉각 제공하여 초보 개발자도 쉽게 코드를 수정할 수 있습니다.

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
- **티어(Tier) 기반 군집 배치:** 참조 집중도에 따라 외곽에서 중심부로 계층형 배치 지원.
- **노드 크기 & 색상 매핑:** 노드 크기는 총 결합도($CBO$)에 비례하며, 색상은 불안정성 지수($I$)에 따라 초록(Safe), 노랑(Warning), 빨강(Hazard)으로 실시간 렌더링.
- **물리 레이아웃 및 뷰포트 제어:** d3-force 기반의 노드 드래그 반발력 지원, 전체 맞춤(Fit), 로컬 그래프(선택 노드 이웃 격리) 제공.

### 2. 뷰 제어 및 듀얼 결합도 진단 모드
- **원클릭 Plugin ON/OFF 토글:** 외부 라이브러리(Assets/Plugins, TextMeshPro, node_modules)를 화면에서 숨기고 사용자 도메인 클래스 간 직접선으로 축약(Proxy Folding).
- **온디맨드 듀얼 모드 임계치:** 기본 조망 모드($I > 0.8$ 완화)와 결합도 진단 모드($I > 0.7$ 엄격)를 버튼 하나로 전환하여 대형 프로젝트의 과도한 붉은색 노이즈 방지.
- **완벽한 UI 인터랙션:** 진단 사이드 패널 토글 지원 및 캔버스 노드 선택 시 연관 파일 하이라이트/음영 처리.

### 3. Claude AI 리팩토링 & Monaco Diff 뷰
- **3줄 결함 원인 분석:** 고결합 위험 노드 클릭 시 Anthropic Claude API와 연동하여 주니어 눈높이의 간결한 원인 요약 제공.
- **Before/After Monaco Diff:** 결합도를 낮추기 위한 인터페이스 분리 및 DIP 패턴 적용 수정 코드를 Monaco Editor 스플릿 뷰로 즉시 렌더링.
- **무중단 Mock Provider:** 외부 API 오류 시 0.05초 내 정적 샘플로 자동 폴백.

### 4. CodeLens 소스 점프 & 코드 뷰어
- 다이어그램의 연결선(Edge) 또는 노드를 클릭하면 해당 호출이 일어난 실제 파일 경로와 라인 번호를 안내하는 팝업 제공.
- 노드 더블클릭 시 캔버스 위에 코드 카드를 오버레이로 띄워 다중 파일 동시 비교 지원.

---

## 아키텍처

```
CodeDiagram/
├── web/                          # Node.js 백엔드 서버 + 웹 프론트엔드
│   ├── server/                   # [Application Layer]
│   │   ├── index.js              # Express 앱 진입점 (포트 3000)
│   │   ├── routes/               # REST API 라우팅 (analyze, file, ai)
│   │   └── services/             # 핵심 분석 파이프라인
│   │       ├── parser.js         # 언어별 Tree-sitter 파서 분기
│   │       ├── metricsService.js # Robert C. Martin Ca, Ce, I, CBO 지표 산출
│   │       ├── filter.js         # 1st-Party 벤더 필터링 및 프록시 폴딩
│   │       ├── aiService.js      # Anthropic Claude API 및 Mock Provider
│   │       └── cacheService.js   # 인메모리 LRU 분석 캐시
│   ├── public/                   # [Presentation Layer] 정적 웹 SPA
│   │   ├── index.html            # 메인 대시보드 레이아웃
│   │   ├── css/style.css         # 다크 테마 디자인 시스템
│   │   └── js/
│   │       ├── app.js            # 메인 컨트롤러 및 이벤트 버스
│   │       ├── cytoscape-view.js # Cytoscape.js 그래프 렌더러
│   │       ├── controls.js       # 상단 툴바 (토글 스위치, 진단 모드)
│   │       └── diff-panel.js     # Monaco Editor Before/After Diff 패널
│   ├── test/                     # 단위, 통합 테스트 및 성능 벤치마크
│   └── schemas/                  # Graph JSON 규격 정의 스키마
└── .github/                      # CI/CD 파이프라인 워크플로우
```

---

## 기술 스택

| 영역 | 기술 스택 | 선정 이유 |
| :--- | :--- | :--- |
| **Frontend** | Vanilla JS, Cytoscape.js, Monaco Editor, d3-force | 빌드 오버헤드 없는 브라우저 직행 구동 및 대규모 그래프 렌더링 최적화 |
| **Backend** | Node.js (LTS), Express | 고성능 비동기 I/O 및 Tree-sitter 네이티브 바인딩 친화성 |
| **AST Parser** | Tree-sitter (Java, C/C++, Python, C#, JS/TS) | 업계 표준 고속 점진적 구문 트리 파서 |
| **Metrics Engine** | Robert C. Martin Coupling Metric Module | Clean Architecture 공인 결합도 지표 계산 |
| **AI / LLM** | Anthropic Claude 3.5 Sonnet API, Mock Provider | 초급 개발자 맞춤 3줄 요약 및 Before/After Diff 코드 생성 |
| **Testing** | Jest, Supertest | 단위 테스트 및 픽스처 기반 파싱 정합성 검증 |

---

## 빠른 시작 (Getting Started)

### 1. 요구 사항
- **Node.js:** v18.0.0 이상 (v22 LTS 권장)
- **컴파일러:** C++ 컴파일러 (Tree-sitter 네이티브 모듈 빌드용)

### 2. 설치 및 실행

```bash
# 1. 웹 디렉토리 이동
cd web

# 2. 필수 패키지 설치
npm install

# 3. 환경 변수 설정 (선택 사항, 미설정 시 Mock AI로 자동 구동)
# ANTHROPIC_API_KEY=your_claude_api_key_here

# 4. 서버 기동
npm start
```

- 웹 브라우저 접속: `http://localhost:3000`
- 포트 변경 필요 시: `PORT=3001 npm start`

### 3. 테스트 실행

```bash
cd web
npm test            # 단위 및 계약 테스트 실행
npm run benchmark   # 대용량 파싱 및 렌더링 성능 측정
```

---

## REST API 규격

### `POST /api/analyze`
GitHub URL 또는 로컬 경로를 전달받아 Tree-sitter 파싱 후 Cytoscape Graph JSON 및 결합도 지표를 반환합니다.

```json
{
  "source": "https://github.com/user/repo"
}
```

- **응답 항목:** `nodes`, `edges`, `metrics`($C_a, C_e, I, CBO$), `hazardNodes`, `analysisId`

### `POST /api/explain`
결함 노드의 함수 AST 스니펫을 전달받아 Claude AI 기반 3줄 원인 분석 및 리팩토링 Before/After Diff를 반환합니다.

---

## 관련 산출물 문서 목록

- [제품요구사항정의서 (PRD v2.2)](../PPT&PDF&DOCX/Project/PRD/CodeRefactor_PRD_(v2.2)_20261012.pdf)
- [기술요구명세서 (TRD v1.2)](../캡스톤노트/캡스톤_프로젝트문서/CodeRefactor_TRD_(v1.0)_20261012.md)
- [프로그램 개발 명세서](../캡스톤노트/캡스톤_프로젝트문서/CodeRefactor_프로그램개발_(v1.0)_20261012.md)
- [프로그램 목록 (v1.2)](../PPT&PDF&DOCX/Project/프로그램목록/CodeRefactor_프로그램목록_(v1.2)_20261024.xlsx)
- [WBS 갠트 차트 (v3.2)](../PPT&PDF&DOCX/Project/WBS/CodeRefactor_WBS_(v3.2)_20261024.xlsx)
- [프로그램 목록 & WBS 최신 동기화 명세서](../캡스톤노트/캡스톤_프로젝트문서/CodeRefactor_프로그램목록_WBS_동기화_(v1.2)_20261024.md)
