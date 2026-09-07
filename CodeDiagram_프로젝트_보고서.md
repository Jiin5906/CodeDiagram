# CodeDiagram 프로젝트 보고서

## 1. 기술 스택

### 1.1 개발 환경

| 구분 | 기술 | 비고 |
|------|------|------|
| **IDE** | Android Studio (Ladybug 이상) | Kotlin, Gradle 빌드 환경 |
| **언어 (앱)** | Kotlin | Jetpack Compose 기반 UI |
| **언어 (서버)** | JavaScript (Node.js) | Express 서버 |
| **패키지 관리** | npm | 서버 의존성 관리 |
| **빌드 시스템** | Gradle (Kotlin DSL) | Android 앱 빌드 |
| **버전 관리** | Git | GitHub 연동 |

### 1.2 실기기/에뮬레이터

| 구분 | 사양 |
|------|------|
| **테스트 단말** | Galaxy S24 Ultra (Android 15, One UI 7) |
| **에뮬레이터** | Pixel 9 API 35 (Android 15) |
| **최소 SDK** | API 24 (Android 7.0) |
| **타겟 SDK** | API 36 |

### 1.3 서버 통신

| 구분 | 기술 | 설명 |
|------|------|------|
| **프레임워크** | Express.js v4.21 | REST API 서버 |
| **프로토콜** | HTTP (Fetch API) | 클라이언트-서버 통신 |
| **API 엔드포인트** | `POST /api/analyze` | Python 코드 분석 요청 |
| | `POST /api/explain` | AI 함수 설명 요청 |
| **CORS** | cors 미들웨어 | 크로스 오리진 허용 |
| **Android ↔ 서버** | WebView (`10.0.2.2:3000`) | 에뮬레이터에서 호스트 로컬서버 접근 |

### 1.4 그래프 렌더링

| 구분 | 기술 | 버전 |
|------|------|------|
| **그래프 라이브러리** | Cytoscape.js | v3.30.4 |
| **레이아웃 엔진** | cytoscape-fcose | v2.2.0 |
| **레이아웃 의존** | layout-base / cose-base | v2.0.1 / v2.2.0 |

### 1.5 코드 파싱

| 구분 | 기술 | 설명 |
|------|------|------|
| **파서** | tree-sitter v0.22.4 | 증분 파싱 라이브러리 |
| **언어 문법** | tree-sitter-python v0.23.6 | Python AST 생성 |

### 1.6 AI 연동

| 구분 | 기술 | 설명 |
|------|------|------|
| **SDK** | @anthropic-ai/sdk v0.39.0 | Node.js용 Anthropic SDK |
| **모델** | claude-sonnet-4-20250514 | 한국어 3~5문장 설명 생성 |

### 1.7 기타

| 구분 | 기술 | 설명 |
|------|------|------|
| **Git 클론** | simple-git v3.27.0 | 원격 저장소 얕은 복제 |
| **환경변수** | dotenv v16.4.7 | `.env` 파일에서 API 키 로드 |
| **테스트** | Jest v29.7.0 | 단위 테스트 |
| **캐싱** | 인메모리 Map (SHA-256 키) | AI 응답 캐시 |

---

## 2. 요구사항 정의서

> 출처: [HiClub]요구사항정의서_260906.pdf

### 2.1 시스템 개요

CodeDiagram은 Python 프로젝트의 코드 구조를 시각적 그래프로 변환하여 보여주는 도구이다. 함수 간 호출 관계, 클래스 상속, 변수 참조, 순환 참조, 결합도 등을 자동 분석하고 인터랙티브 다이어그램으로 표현한다.

### 2.2 기능 요구사항

| ID | 기능명 | 설명 | 우선순위 |
|----|--------|------|----------|
| FR-01 | 코드 입력 | Git URL 또는 로컬 경로를 입력받아 Python 프로젝트를 분석 | 필수 |
| FR-02 | 구조 분석 | 함수, 클래스, import, 변수를 파싱하여 호출 관계 추출 | 필수 |
| FR-03 | 그래프 시각화 | 참조 횟수 그룹(tier) → 파일 → 함수의 3단계 중첩 그래프 렌더링 | 필수 |
| FR-04 | 노드 상호작용 | 함수 클릭 시 하이라이트 + AI 설명, 파일/티어 더블클릭 시 접기/펼치기 | 필수 |
| FR-05 | 엣지 토글 | 호출 관계 엣지 전체 표시/숨김 토글 | 필수 |
| FR-06 | 검색 기능 | 함수/파일명 실시간 검색 및 매칭 노드 하이라이트 | 필수 |
| FR-07 | 뷰 전환 | 함수 뷰 ↔ 패키지 뷰 전환 | 필수 |
| FR-08 | 파일 트리 | 좌측 패널에 디렉토리 기반 파일 탐색기 표시 | 필수 |
| FR-09 | 코드 진단 | 순환 참조, 결합도 과다, 안티패턴(God Function/Class) 탐지 | 필수 |
| FR-10 | 리팩토링 제안 | 진단 결과 기반 구체적 리팩토링 제안 텍스트 생성 | 필수 |
| FR-11 | Diff 미리보기 | 리팩토링 적용 전후 구조 변경을 Diff 뷰로 비교 | 보통 |
| FR-12 | 순환 제거 시뮬레이션 | 순환 참조 엣지 제거를 시각적으로 미리보기 | 보통 |
| FR-13 | AI 함수 설명 | Claude API로 함수 코드의 한국어 설명 자동 생성 | 보통 |
| FR-14 | 결합도 시각화 | 파일 노드 테두리 두께로 결합도 수준 표현 | 필수 |
| FR-15 | 상속 관계 표시 | 클래스 간 상속 엣지를 보라색 점선으로 표현 | 필수 |
| FR-16 | 변수 참조 표시 | 함수 → 변수 참조 엣지를 청록색 점선으로 표현 | 필수 |
| FR-17 | 참조 위치 팝업 | 엣지 클릭 시 참조가 발생한 파일:줄번호 목록 표시 | 필수 |
| FR-18 | 파일 상세 뷰 | 패키지 뷰에서 파일 클릭 시 해당 파일의 함수만 표시 | 보통 |

### 2.3 비기능 요구사항

| ID | 항목 | 요구사항 |
|----|------|----------|
| NFR-01 | 성능 | 200개 이하 Python 파일을 청크 단위(20개)로 파싱, 이벤트 루프 블로킹 방지 |
| NFR-02 | 안정성 | 100KB 초과 파일 스킵, 파싱 실패 시 경고 메시지로 계속 처리 |
| NFR-03 | 보안 | DOM 조작은 안전한 방식(textContent, createElement) 사용, innerHTML 미사용 |
| NFR-04 | 캐싱 | AI 설명은 SHA-256 해시 기반 인메모리 캐시로 중복 호출 방지 |

---

## 3. 수행계획서

> 출처: 코드 다이어그램 수행계획서.pdf

### 3.1 프로젝트 목표

Python 프로젝트의 코드 구조를 자동 분석하여 함수/클래스/변수 간의 관계를 인터랙티브 그래프로 시각화하고, 코드 품질 진단 및 리팩토링 제안까지 제공하는 통합 코드 분석 도구를 개발한다.

### 3.2 시스템 아키텍처

```
[Android App (Kotlin)]
    └─ WebView ──HTTP──→ [Express Server (Node.js)]
                              ├─ /api/analyze
                              │    ├─ gitService (Git clone / 로컬 경로)
                              │    ├─ parser (tree-sitter Python AST)
                              │    ├─ resolver (호출/상속/변수 참조 해석)
                              │    ├─ graphBuilder (Cytoscape 노드 생성)
                              │    ├─ metricsService (결합도 계산)
                              │    ├─ diagnosticsService (순환/결합도/안티패턴)
                              │    └─ refactoringService (리팩토링 제안)
                              └─ /api/explain
                                   ├─ aiService (Claude API)
                                   └─ cacheService (SHA-256 캐시)
```

### 3.3 개발 단계

| 단계 | 내용 |
|------|------|
| **1단계** | 프로젝트 설정, Express 서버 구축, tree-sitter 파서 구현 |
| **2단계** | 호출 관계 해석(resolver), 그래프 데이터 빌드(graphBuilder) |
| **3단계** | Cytoscape.js 프론트엔드 그래프 렌더링, 레이아웃 알고리즘 |
| **4단계** | 사용자 인터랙션(검색, 토글, 접기/펼치기, 뷰 전환) |
| **5단계** | 진단 서비스(순환 참조, 결합도, 안티패턴), 리팩토링 제안 |
| **6단계** | AI 설명 연동, Diff 미리보기, 파일 트리 |
| **7단계** | Android WebView 앱 래핑, 테스트 및 최적화 |

### 3.4 데이터 처리 파이프라인

```
Git URL/경로 입력
    → gitService: 프로젝트 확보 (.py 파일 수집)
    → parser: tree-sitter로 AST 파싱 (함수, 호출, import, 클래스, 변수 추출)
    → resolver: 호출/상속/변수 참조를 실제 노드 ID로 매칭
    → graphBuilder: tier → file → function 3단계 노드 + 엣지 생성
    → metricsService: 파일 간 결합도 점수 계산
    → diagnosticsService: 순환 참조/결합도 과다/안티패턴 진단
    → refactoringService: 진단 기반 리팩토링 제안 생성
    → JSON 응답 → 프론트엔드 그래프 렌더링
```

---

## 4. 코드별 역할 설명

### 4.1 Android (Kotlin)

| 파일 | 역할 |
|------|------|
| `MainActivity.kt` | 앱 진입점. WebView를 전체 화면으로 띄워 로컬 서버(http://10.0.2.2:3000)에 접속한다. |
| `Theme.kt / Color.kt / Type.kt` | Jetpack Compose 테마, 색상, 타이포그래피 정의. |

### 4.2 서버 - 진입점 & 라우터

| 파일 | 역할 |
|------|------|
| `server/index.js` | Express 서버를 생성하고 미들웨어(CORS, JSON, 정적파일)를 설정한 뒤 3000번 포트에서 시작한다. |
| `server/routes/analyze.js` | `POST /api/analyze` 엔드포인트. 클라이언트에서 source를 받아 gitService로 경로 확보 후 buildGraph로 그래프를 생성하여 JSON 응답한다. |
| `server/routes/explain.js` | `POST /api/explain` 엔드포인트. 함수 코드를 받아 캐시 확인 후 없으면 Claude API로 설명을 생성하여 응답한다. |

### 4.3 서버 - 서비스

| 파일 | 역할 |
|------|------|
| `services/gitService.js` | Git URL이면 repos/ 폴더에 얕은 복제하고, 로컬 경로면 존재 여부를 확인한다. 디렉토리를 재귀 탐색하여 .py 파일을 최대 200개까지 수집한다. |
| `services/parser.js` | tree-sitter로 Python 파일을 파싱하여 함수, 호출, import, 클래스, 변수, 변수 참조 정보를 추출한다. |
| `services/resolver.js` | parser가 추출한 원시 호출 데이터를 3단계 우선순위(같은 파일 → import 기반 → 전역 탐색)로 실제 함수 노드에 매칭한다. 상속 관계와 변수 참조도 동일 방식으로 해석한다. |
| `services/graphBuilder.js` | parser와 resolver 결과를 조합하여 Cytoscape.js 호환 노드/엣지 JSON을 생성한다. 참조 횟수 기반 tier → file → function 3단계 중첩 구조를 만들고, 결합도·진단·제안까지 포함한다. |
| `services/metricsService.js` | 호출 엣지를 기반으로 파일 간 결합도 점수를 0~1로 정규화하여 산출한다. |
| `services/diagnosticsService.js` | DFS 기반 순환 참조 탐지, inbound/outbound 기준 결합도 과다 경고, God Function(50줄+)/God Class(10메서드+) 안티패턴을 감지한다. |
| `services/refactoringService.js` | 진단 결과를 받아 순환 참조 제거, 결합도 분리, 함수/클래스 분할 등 구체적 리팩토링 제안 텍스트를 생성한다. |
| `services/aiService.js` | Anthropic Claude API를 호출하여 함수 코드의 한국어 설명(3~5문장)을 생성한다. |
| `services/cacheService.js` | 함수 코드의 SHA-256 해시를 키로 사용하는 인메모리 캐시. AI 중복 호출을 방지한다. |

### 4.4 서버 - 유틸리티

| 파일 | 역할 |
|------|------|
| `utils/hash.js` | 문자열을 SHA-256 해시로 변환하는 유틸리티 함수를 제공한다. |

### 4.5 프론트엔드 (JavaScript)

| 파일 | 역할 |
|------|------|
| `js/app.js` | 페이지 로드 시 그래프를 초기화하고, 분석 버튼 클릭 시 서버에 POST 요청을 보내 응답 데이터로 그래프를 렌더링하는 메인 진입점이다. |
| `js/graph.js` | Cytoscape.js 인스턴스를 생성하고 노드/엣지 스타일을 정의한다. 함수 뷰(tier 기반), 패키지 뷰, 파일 상세 뷰 3가지 렌더링 모드와 fcose 레이아웃 + 결정적 tier 재배치 알고리즘을 담당한다. |
| `js/interactions.js` | 노드/엣지 클릭, 접기/펼치기, 검색, 엣지 토글, 뷰 전환, AI 설명 패널, 진단 패널, 참조 팝업 등 모든 사용자 상호작용 이벤트를 처리한다. |
| `js/diffPreview.js` | 리팩토링 제안의 Diff 비교 뷰(변경 전/후)를 렌더링하고, 순환 참조 엣지 제거 시뮬레이션(미리보기/복원)을 처리한다. |
| `js/fileTree.js` | 분석된 파일 목록에서 디렉토리 트리를 구축하여 좌측 패널에 파일 탐색기를 표시하고, 파일 클릭 시 해당 노드로 카메라를 이동시킨다. |

### 4.6 프론트엔드 (HTML/CSS)

| 파일 | 역할 |
|------|------|
| `index.html` | 메인 HTML 페이지. 상단 바(입력/툴바), 범례, 그래프 영역, 파일 트리 패널, 참조 팝업, AI 설명 오버레이, 진단 패널, Diff 오버레이를 정의한다. |
| `css/style.css` | 다크 테마 기반 전체 UI 스타일. 상단 바, 그래프 영역(점 격자 배경), 팝업/오버레이, 파일 트리, Diff 뷰, 범례 등의 스타일을 담당한다. |

### 4.7 테스트

| 파일 | 역할 |
|------|------|
| `test/parser.test.js` | parser.js의 단위 테스트. 함수 추출, docstring, 주석, 호출 관계, import, 클래스 메서드, 줄 번호 기록을 검증한다. |

---

## 5. 시스템 작동 원리

### 전체 흐름 (간단 요약)

1. **입력**: 사용자가 Git URL 또는 로컬 경로를 입력하고 "분석" 버튼 클릭
2. **프로젝트 확보**: `gitService`가 URL이면 얕은 복제, 로컬이면 경로 검증 후 `.py` 파일 수집
3. **코드 파싱**: `parser`가 tree-sitter로 각 Python 파일의 AST를 분석하여 함수/호출/import/클래스/변수 정보 추출
4. **관계 해석**: `resolver`가 원시 호출 데이터를 3단계 우선순위로 실제 함수에 매칭하여 엣지 생성
5. **그래프 빌드**: `graphBuilder`가 참조 횟수 기반 3단계 중첩 노드(tier → file → function) + 엣지 JSON 생성
6. **진단/제안**: `diagnosticsService`로 문제 탐지, `refactoringService`로 개선 제안 생성
7. **렌더링**: 프론트엔드가 JSON을 받아 Cytoscape.js로 인터랙티브 그래프를 화면에 표시
8. **상호작용**: 노드 클릭(하이라이트/설명), 엣지 클릭(참조 위치), 검색, 뷰 전환, 진단 패널 등
