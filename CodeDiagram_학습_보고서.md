# CodeDiagram 학습 보고서

> 개인 학습용 상세 보고서 — 각 코드의 동작 원리와 구현 세부 사항을 기록한다.

---

## 목차

1. [프로젝트 전체 아키텍처](#1-프로젝트-전체-아키텍처)
2. [Android 앱 계층](#2-android-앱-계층)
3. [서버 진입점과 라우팅](#3-서버-진입점과-라우팅)
4. [핵심 서비스: gitService](#4-핵심-서비스-gitservice)
5. [핵심 서비스: parser (tree-sitter 파싱)](#5-핵심-서비스-parser)
6. [핵심 서비스: resolver (호출 관계 해석)](#6-핵심-서비스-resolver)
7. [핵심 서비스: graphBuilder (그래프 빌드)](#7-핵심-서비스-graphbuilder)
8. [보조 서비스: metricsService, diagnosticsService, refactoringService](#8-보조-서비스)
9. [AI 연동: aiService, cacheService](#9-ai-연동)
10. [프론트엔드: graph.js (그래프 렌더링)](#10-프론트엔드-graphjs)
11. [프론트엔드: interactions.js (사용자 상호작용)](#11-프론트엔드-interactionsjs)
12. [프론트엔드: diffPreview.js, fileTree.js, app.js](#12-프론트엔드-기타)
13. [데이터 흐름 종합](#13-데이터-흐름-종합)

---

## 1. 프로젝트 전체 아키텍처

CodeDiagram은 **3계층 구조**로 되어 있다:

```
┌─────────────────────────────┐
│  Android App (Kotlin)       │  ← WebView로 웹 UI를 표시
│  MainActivity.kt            │
└────────────┬────────────────┘
             │ HTTP (WebView → localhost:3000)
┌────────────▼────────────────┐
│  Express Server (Node.js)   │  ← REST API 제공
│  index.js                   │
│  ├─ routes/analyze.js       │
│  ├─ routes/explain.js       │
│  └─ services/               │
│      ├─ gitService.js       │
│      ├─ parser.js           │
│      ├─ resolver.js         │
│      ├─ graphBuilder.js     │
│      ├─ metricsService.js   │
│      ├─ diagnosticsService.js│
│      ├─ refactoringService.js│
│      ├─ aiService.js        │
│      └─ cacheService.js     │
└────────────┬────────────────┘
             │ JSON 응답
┌────────────▼────────────────┐
│  Web Frontend (HTML/JS/CSS) │  ← Cytoscape.js 그래프 렌더링
│  ├─ index.html              │
│  ├─ css/style.css           │
│  └─ js/                     │
│      ├─ app.js              │
│      ├─ graph.js            │
│      ├─ interactions.js     │
│      ├─ diffPreview.js      │
│      └─ fileTree.js         │
└─────────────────────────────┘
```

핵심 설계 결정:
- **Android는 순수 WebView 래퍼**: 네이티브 UI를 쓰지 않고 WebView 하나로 웹 UI를 그대로 보여준다. 이렇게 하면 웹 브라우저와 안드로이드 앱 양쪽에서 동일한 UI를 사용할 수 있다.
- **서버가 모든 분석 로직 담당**: 파싱, 관계 해석, 진단 등 무거운 연산은 전부 Node.js 서버에서 처리하고, 프론트엔드는 결과 JSON을 받아 시각화만 한다.
- **tree-sitter를 선택한 이유**: 정규식 기반 파싱은 중첩 구조(함수 안 함수, 클래스 안 메서드)를 정확히 처리하기 어렵다. tree-sitter는 실제 파서 생성기로 정확한 AST(추상 구문 트리)를 만들어주기 때문에 모든 Python 문법을 정확히 파싱할 수 있다.

---

## 2. Android 앱 계층

### MainActivity.kt — 상세 분석

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()  // 시스템 바까지 확장하여 전체 화면 활용
        setContent {
            CodeDiagramTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    CodeDiagramWebView(
                        modifier = Modifier.fillMaxSize().padding(innerPadding)
                    )
                }
            }
        }
    }
}
```

**동작 방식**:
- `ComponentActivity`를 상속: Jetpack Compose를 사용하기 위한 기본 액티비티 클래스.
- `enableEdgeToEdge()`: 상태 바와 네비게이션 바 영역까지 콘텐츠가 확장되도록 설정. 이래야 전체 화면을 활용할 수 있다.
- `Scaffold`: Material3의 기본 레이아웃 컨테이너. `innerPadding`으로 시스템 바와 겹치지 않는 안전 영역을 자동 계산한다.

```kotlin
@Composable
fun CodeDiagramWebView(modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                webViewClient = WebViewClient()           // 외부 브라우저 대신 인앱에서 로드
                settings.javaScriptEnabled = true         // JS 실행 허용 (Cytoscape.js 필수)
                settings.domStorageEnabled = true         // localStorage 허용
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                loadUrl("http://10.0.2.2:3000")          // 에뮬레이터 → 호스트 머신의 localhost
            }
        }
    )
}
```

**핵심 포인트**:
- `AndroidView`: Compose에서 기존 Android View(WebView)를 사용하기 위한 컴포저블. `factory` 람다에서 View를 생성하고 초기 설정을 한다.
- `10.0.2.2`: Android 에뮬레이터에서 호스트 머신의 `localhost`에 접근할 때 사용하는 특수 IP. 에뮬레이터는 독립적인 네트워크를 가지므로 `localhost`로는 접근이 불가능하다.
- `WebViewClient()`: 빈 WebViewClient를 설정하지 않으면 링크 클릭 시 외부 브라우저가 열린다. 이걸 설정하면 모든 네비게이션이 WebView 내에서 처리된다.
- `javaScriptEnabled = true`: 보안상 기본값이 false이지만, Cytoscape.js가 JS 기반이므로 반드시 켜야 한다.

### build.gradle.kts 주요 설정

```kotlin
android {
    compileSdk { version = release(36) { minorApiLevel = 1 } }
    defaultConfig {
        minSdk = 24        // Android 7.0 이상
        targetSdk = 36     // 최신 API 타겟
    }
}
dependencies {
    implementation("androidx.webkit:webkit:1.12.1")  // WebView 확장 라이브러리
}
```

`minSdk = 24`인 이유: WebView의 주요 기능(DOM Storage, Mixed Content 등)이 API 24부터 안정적으로 지원된다.

---

## 3. 서버 진입점과 라우팅

### index.js — 서버 초기화

```javascript
require('dotenv').config({ path: __dirname + '/../.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());                                              // 모든 오리진 허용
app.use(express.json());                                      // JSON body 파싱
app.use(express.static(path.join(__dirname, '..', 'public'))); // 정적 파일 서빙

app.use('/api/analyze', analyzeRouter);
app.use('/api/explain', explainRouter);

app.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });
```

**동작 방식**:
1. `dotenv`로 `.env` 파일에서 `ANTHROPIC_API_KEY` 등 환경변수를 로드
2. Express 미들웨어 체인: CORS → JSON 파싱 → 정적 파일 서빙
3. 두 개의 API 라우터를 `/api/analyze`와 `/api/explain` 경로에 마운트
4. `express.static`이 `web/public/` 폴더를 서빙하므로, 브라우저에서 `http://localhost:3000`에 접속하면 `index.html`이 자동으로 로드된다

### routes/analyze.js — 분석 API

```javascript
router.post('/', async (req, res) => {
  const { source } = req.body;    // 클라이언트가 보낸 Git URL 또는 로컬 경로

  // 입력 검증
  if (!source || typeof source !== 'string' || !source.trim()) {
    return res.status(400).json({ error: 'source is required' });
  }

  try {
    const projectPath = await getProjectPath(source.trim());  // 1. 프로젝트 경로 확보
    const graph = await buildGraph(projectPath);                // 2. 전체 분석 파이프라인 실행
    res.json(graph);                                            // 3. 결과 JSON 응답
  } catch (err) {
    // 사용자 입력 오류(400) vs 서버 오류(500) 분리
    if (err.message.includes('does not exist') || err.message.includes('No .py files')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});
```

**에러 처리 전략**: `does not exist`나 `No .py files` 메시지가 포함되면 사용자 입력 오류(400)로 처리하고, 나머지는 서버 내부 오류(500)로 처리한다. 이렇게 하면 프론트엔드에서 에러 유형에 따라 다른 UI를 보여줄 수 있다.

### routes/explain.js — AI 설명 API

```javascript
router.post('/', async (req, res) => {
  const { name, code, docstring, comment, filePath } = req.body;

  // 캐시 우선 확인 — AI 호출 비용 절감
  const cached = cache.get(code);
  if (cached) {
    return res.json({ explanation: cached, cached: true });
  }

  // 캐시 미스 → Claude API 호출
  const explanation = await explainFunction({ name, code, docstring, comment, filePath });
  cache.set(code, explanation);     // 결과 캐싱
  res.json({ explanation, cached: false });
});
```

**캐싱 전략**: 같은 함수 코드에 대해 AI를 반복 호출하지 않기 위해 코드 문자열의 SHA-256 해시를 키로 사용한다. `cached: true/false` 플래그를 응답에 포함하여 프론트엔드에서 캐시 히트 여부를 알 수 있게 한다.

---

## 4. 핵심 서비스: gitService

### getProjectPath — 프로젝트 경로 확보

```javascript
async function getProjectPath(source) {
  // URL 패턴 감지: http://, https://, git@ 으로 시작하면 원격 저장소
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('git@')) {
    return await cloneRepo(source);
  }

  // 로컬 경로인 경우: 존재 여부와 디렉토리 여부만 확인
  const absPath = path.resolve(source);
  if (!fs.existsSync(absPath)) throw new Error(`Local path does not exist: ${absPath}`);
  if (!fs.statSync(absPath).isDirectory()) throw new Error(`Path is not a directory: ${absPath}`);
  return absPath;
}
```

### cloneRepo — Git 얕은 복제

```javascript
async function cloneRepo(url) {
  // URL의 SHA-256 해시 앞 12자리를 폴더명에 사용 → 같은 URL은 재사용
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 12);
  const repoName = url.split('/').pop().replace('.git', '') || 'repo';
  const targetDir = path.join(REPOS_DIR, `${repoName}-${hash}`);

  // 이미 클론된 저장소가 있으면 재사용
  if (fs.existsSync(targetDir)) return targetDir;

  // --depth 1: 최신 커밋만 가져옴 (전체 히스토리 불필요)
  await git.clone(url, targetDir, ['--depth', '1']);
  return targetDir;
}
```

**설계 포인트**:
- `--depth 1` (얕은 복제): 코드 구조 분석에는 최신 코드만 필요하므로 전체 히스토리를 받을 필요가 없다. 대형 저장소도 빠르게 복제할 수 있다.
- SHA-256 해시 기반 폴더명: 같은 URL을 다시 분석할 때 재클론하지 않고 기존 복제본을 재사용한다. 해시 충돌 확률은 무시할 수 있을 정도로 낮다.

### findPythonFiles — .py 파일 수집

```javascript
function findPythonFiles(dirPath) {
  const MAX_FILES = 200;       // 최대 200개 파일
  const MAX_SIZE = 100 * 1024; // 100KB 제한

  function walk(dir) {
    // 숨김 폴더, __pycache__, venv, node_modules, .git 건너뜀
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === '__pycache__' || ...) continue;
      walk(fullPath);
    } else if (entry.name.endsWith('.py')) {
      // 100KB 초과 파일은 경고 메시지와 함께 스킵
      if (stat.size > MAX_SIZE) {
        warnings.push(`Skipped ${relativePath}: file too large`);
        continue;
      }
      files.push({ path: fullPath, relativePath: ... });
    }
  }
  return { files, warnings };
}
```

**안전장치**:
- **200개 파일 제한**: 대형 프로젝트에서 메모리 폭주를 방지한다.
- **100KB 크기 제한**: 자동 생성된 대형 파일(예: 프로토콜 버퍼 생성물)을 건너뛴다.
- **디렉토리 필터링**: `__pycache__`, `venv` 등은 분석 대상이 아니므로 제외한다.
- **경로 정규화**: `replace(/\\/g, '/')` — Windows의 역슬래시를 슬래시로 통일하여 크로스 플랫폼 호환성을 확보한다.

---

## 5. 핵심 서비스: parser

parser.js는 **tree-sitter**를 사용하여 Python 파일을 AST(추상 구문 트리)로 파싱하고, 여기서 함수, 호출, import, 클래스, 변수, 변수 참조 정보를 추출한다.

### parseFile — 메인 파싱 함수

```javascript
function parseFile(code, filePath) {
  const parser = createParser();    // tree-sitter 파서 인스턴스 생성
  const tree = parser.parse(code);  // Python 코드 → AST 변환
  const root = tree.rootNode;       // 트리의 루트 노드

  const functions = [], calls = [], imports = [], classes = [];

  collectImports(root, imports);                                        // 1단계: import문 수집
  collectDefinitions(root, code, filePath, functions, calls, classes, null); // 2단계: 함수/클래스 정의 수집

  const variables = [];
  collectVariables(root, filePath, variables, null);                    // 3단계: 변수/필드 수집

  const variableRefs = [];
  for (const func of functions) {
    const funcNode = findFunctionNode(root, func.qualifiedName, func.startLine);
    if (funcNode) {
      const body = funcNode.childForFieldName('body');
      if (body) collectVariableRefs(body, func.qualifiedName, filePath, variableRefs);
    }
  }                                                                      // 4단계: 변수 참조 수집

  return { functions, calls, imports, classes, variables, variableRefs };
}
```

**파싱 4단계 파이프라인**:
1. import문 수집 → 나중에 resolver가 호출 해석에 사용
2. 함수/클래스 정의 수집 → 동시에 함수 body에서 호출도 수집
3. 모듈 최상위 & 클래스 body의 변수/필드 수집
4. 각 함수 body에서 변수 참조를 별도 수집 (함수 호출과 구분하기 위해)

### collectImports — import문 해석

```javascript
function collectImports(node, imports) {
  // 두 가지 import 형태를 처리:
  // 1. from module import name       → import_from_statement
  // 2. import module                 → import_statement

  if (child.type === 'import_from_statement') {
    const moduleName = child.childForFieldName('module_name')?.text;
    // aliased_import도 처리: from module import name as alias
    for (각 이름 노드) {
      imports.push({ module: moduleName, name: nameNode.text });
      // 또는: imports.push({ module, name: origName, alias });
    }
  }
}
```

**tree-sitter의 노드 탐색 방식**:
- `child.type`: 노드의 문법 유형 (예: `import_from_statement`, `function_definition`)
- `child.childForFieldName('name')`: 문법 규칙에서 `name`이라고 명명된 자식 노드를 가져옴
- `child.text`: 해당 노드에 해당하는 원본 소스 코드 텍스트

### collectDefinitions — 함수/클래스 정의 수집

```javascript
function collectDefinitions(node, code, filePath, functions, calls, classes, className) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === 'class_definition') {
      // 클래스 이름, 상속 부모, 시작/끝 줄 추출
      const clsName = child.childForFieldName('name')?.text;

      // 상속 부모 클래스 목록 추출
      const superclasses = [];
      const argList = child.childForFieldName('superclasses');
      if (argList) {
        for (각 인자) superclasses.push(arg.text);
      }

      classes.push({ name: clsName, filePath, superclasses, startLine, endLine });

      // 클래스 body를 재귀 탐색 → className을 전달하여 메서드의 qualifiedName 생성
      collectDefinitions(body, code, filePath, functions, calls, classes, clsName);

    } else if (child.type === 'function_definition') {
      const funcInfo = extractFunction(child, code, filePath, className);
      functions.push(funcInfo);

      // 함수 body에서 호출 수집
      collectCalls(body, funcInfo.qualifiedName, filePath, calls);
    }
  }
}
```

**재귀 구조가 핵심**:
- 최상위 함수: `className`이 `null` → `qualifiedName = "funcName"`
- 클래스 메서드: `className`이 `"MyClass"` → `qualifiedName = "MyClass.method"`
- 클래스 정의를 만나면 `className`을 채워서 재귀 호출 → 메서드와 일반 함수를 구분

### extractFunction — 함수 정보 추출

```javascript
function extractFunction(node, code, filePath, className) {
  const name = node.childForFieldName('name')?.text || 'anonymous';
  const qualifiedName = className ? `${className}.${name}` : name;

  // docstring 추출: body의 첫 번째 문이 문자열이면 docstring
  const firstStmt = body.child(0);
  if (firstStmt.type === 'expression_statement') {
    const expr = firstStmt.child(0);
    if (expr.type === 'string') docstring = expr.text;
  }

  // 함수 바로 위의 주석 추출
  let prev = node.previousSibling;
  while (prev && prev.type !== 'comment' && !prev.isNamed) {
    prev = prev.previousSibling;
  }
  if (prev?.type === 'comment') comment = prev.text;

  return { name, qualifiedName, className, filePath, startLine, endLine, code: node.text, docstring, comment };
}
```

**세부 사항**:
- `qualifiedName`: 클래스 내 메서드면 `ClassName.method`, 아니면 `functionName`. 이 값이 노드 ID의 일부가 되어 전체 시스템에서 함수를 고유하게 식별한다.
- docstring 추출: Python 관례상 함수 body의 첫 번째 문이 문자열이면 docstring이다. tree-sitter AST에서 이를 정확히 식별한다.
- 주석 추출: `previousSibling`을 따라가며 함수 바로 위의 `# comment`를 찾는다.

### collectCalls — 함수 호출 수집

```javascript
function collectCalls(node, callerName, filePath, calls) {
  if (node.type === 'call') {
    const funcNode = node.child(0);

    if (funcNode.type === 'identifier') {
      calleeName = funcNode.text;           // funcName()
    } else if (funcNode.type === 'attribute') {
      calleeName = funcNode.text;           // obj.method()
    }

    calls.push({ caller: callerName, callee: calleeName, filePath, line: ... });
  }

  // 모든 자식 노드를 재귀 탐색
  for (let i = 0; i < node.childCount; i++) {
    collectCalls(node.child(i), callerName, filePath, calls);
  }
}
```

**중요한 점**: 여기서 수집하는 `callee`는 아직 **어떤 파일의 어떤 함수인지 확정되지 않은 이름**이다. `helper_func`, `obj.method` 같은 텍스트만 기록하고, 실제 매칭은 resolver가 담당한다.

### collectVariables — 변수/필드 수집

```javascript
const VARIABLE_BLACKLIST = new Set([
  'self', 'cls', 'True', 'False', 'None', 'print', 'len', 'range',
  'int', 'str', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
  // ... Python 내장 함수/상수/예외
]);

function collectVariables(node, filePath, variables, className) {
  // 모듈 최상위 assignment와 클래스 body 내 assignment에서 변수명 추출
  if (child.type === 'expression_statement') {
    const expr = child.child(0);
    if (expr?.type === 'assignment') {
      const varName = extractVarName(left, className);
      if (varName && !VARIABLE_BLACKLIST.has(varName.split('.').pop())) {
        variables.push({ name: varName, className, filePath, line });
      }
    }
  }
}
```

**블랙리스트의 역할**: `self`, `True`, `print`, `len` 같은 Python 내장 식별자를 변수로 오인하지 않도록 필터링한다. `self.x = value`에서 `self`는 변수가 아니고 `x`가 변수이므로, `extractVarName`에서 `self.x`를 `ClassName.x`로 변환한다.

### collectVariableRefs — 변수 참조 수집

```javascript
function collectVariableRefs(node, callerName, filePath, refs) {
  if (node.type === 'call') {
    // 함수 호출의 인자만 탐색 — 함수명 자체는 건너뜀 (이미 collectCalls에서 처리됨)
    const args = node.childForFieldName('arguments');
    if (args) collectVariableRefs(args, callerName, filePath, refs);
    return;  // ← 핵심: call 노드의 함수명은 탐색하지 않음
  }

  if (node.type === 'identifier') {
    refs.push({ caller: callerName, variable: name, filePath, line });
  }

  if (node.type === 'attribute' && obj.text === 'self') {
    refs.push({ caller, variable: `self.${attr.text}`, filePath, line });
  }
}
```

**함수 호출과 변수 참조를 구분하는 로직**: `call` 노드를 만나면 함수명(첫 번째 자식)은 건너뛰고 인자(`arguments`)만 탐색한다. 예를 들어 `process(data, config)`에서 `process`는 함수 호출(collectCalls에서 이미 수집), `data`와 `config`는 변수 참조로 기록된다.

---

## 6. 핵심 서비스: resolver

resolver.js는 parser가 추출한 "함수 A가 `funcB`를 호출한다"라는 원시 데이터를 **실제 어떤 파일의 어떤 함수인지** 매칭하는 역할을 한다.

### resolveCalls — 호출 관계 해석

```javascript
function resolveCalls(allFunctions, allCalls, allImports) {
  // 1. 조회 맵 구축 (O(1) 탐색을 위해)
  const funcByQName = new Map();  // 함수 이름 → [함수 정보들]
  const funcByFile = new Map();   // 파일 경로 → [함수 정보들]

  for (const func of allFunctions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    // 이름(name)과 정규화된 이름(qualifiedName) 양쪽으로 등록
    funcByQName.get(func.name).push(entry);
    if (func.qualifiedName !== func.name) {
      funcByQName.get(func.qualifiedName).push(entry);
    }
    funcByFile.get(func.filePath).push(entry);
  }

  // 2. import 조회 맵: 파일 경로 → { 이름 → 모듈 경로 }
  const importMap = buildImportMap(allImports);

  // 3. 각 호출을 해석하여 엣지 생성
  const edgeMap = new Map();  // "출발→도착" → { source, target, references[] }

  for (const call of allCalls) {
    const target = resolveCallee(call, funcByQName, funcByFile, importMap);
    if (!target) continue;  // 매칭 실패 → 무시 (내장 함수 등)

    // 같은 출발-도착 쌍은 하나의 엣지에 참조를 누적
    edgeMap.get(edgeKey).references.push({ file, line, caller });
  }

  return Array.from(edgeMap.values());
}
```

### resolveCallee — 3단계 우선순위 해석

```javascript
function resolveCallee(call, funcByQName, funcByFile, importMap) {
  const calleeName = call.callee;

  // obj.method() → "method" 부분만 추출
  const parts = calleeName.split('.');
  const simpleCallee = parts[parts.length - 1];

  // 우선순위 1: 같은 파일 내 함수
  const fileFuncs = funcByFile.get(call.filePath) || [];
  const sameFile = fileFuncs.find(f =>
    f.qualifiedName === calleeName || f.name === calleeName || f.name === simpleCallee
  );
  if (sameFile) return sameFile;

  // 우선순위 2: import 기반 해석
  const fileImports = importMap.get(call.filePath) || {};
  const importModule = fileImports[calleeName] || fileImports[simpleCallee];
  if (importModule) {
    // 해당 모듈 파일에서 함수를 찾음
    // 모듈명과 파일 경로를 비교: "utils" ↔ "utils.py" 또는 "pkg/utils.py"
    const fromModule = candidates.find(f => {
      const fileBase = f.filePath.replace(/\.py$/, '').replace(/\//g, '.');
      return fileBase === importModule || fileBase.endsWith('.' + importModule);
    });
    if (fromModule) return fromModule;
  }

  // 우선순위 3: 전역 탐색 (이름으로 전체 프로젝트 검색)
  const globals = funcByQName.get(simpleCallee) || [];
  if (globals.length > 0) {
    // 외부 파일의 함수를 우선 반환 (같은 파일은 이미 1단계에서 처리됨)
    return globals.find(f => f.filePath !== call.filePath) || globals[0];
  }

  return null;  // 매칭 실패 (Python 내장 함수, 서드파티 라이브러리 등)
}
```

**3단계 우선순위의 이유**:
1. **같은 파일 우선**: Python에서 같은 모듈 내 함수 호출이 가장 일반적. `from . import func` 없이도 접근 가능.
2. **import 기반**: `from utils import helper_func` → `utils.py`의 `helper_func`로 매칭. 모듈 경로를 파일 경로로 변환하여 비교.
3. **전역 탐색**: import가 없어도 이름이 같은 함수를 찾음. 마지막 수단으로 사용하되, 동명 함수가 여러 개면 외부 파일 것을 우선 선택.

### resolveInheritance — 상속 관계 해석

```javascript
function resolveInheritance(allClasses) {
  const classByName = new Map();  // 클래스 이름 → [클래스 정보]

  for (const cls of allClasses) {
    for (const parentName of cls.superclasses) {
      const simpleName = parentName.split('.').pop();
      const candidates = classByName.get(simpleName) || classByName.get(parentName);
      if (candidates.length > 0) {
        // 다른 파일의 클래스를 우선 선택
        const target = candidates.find(c => c.filePath !== cls.filePath) || candidates[0];
        edges.push({
          source: `${cls.filePath}::${cls.name}`,   // 자식 클래스
          target: `${target.filePath}::${target.name}`, // 부모 클래스
          type: 'inheritance',
        });
      }
    }
  }
}
```

**source → target 방향**: 자식 → 부모 방향으로 엣지를 생성한다. `class Dog(Animal)`이면 `Dog → Animal` 엣지가 만들어진다.

### resolveVariableRefs — 변수 참조 해석

변수 참조도 호출 해석과 동일한 3단계 우선순위를 따른다:
1. 같은 파일에서 찾기 (`self.x` → `ClassName.x`로 변환)
2. import 기반으로 찾기
3. 전역 탐색

특이 사항: `self.x` 참조를 처리할 때 `callerNodeId === target.nodeId`인 경우(자기 자신 참조)를 방지한다.

---

## 7. 핵심 서비스: graphBuilder

graphBuilder.js는 parser와 resolver의 결과를 조합하여 **Cytoscape.js가 이해할 수 있는 노드/엣지 JSON**을 생성한다.

### buildGraph — 전체 파이프라인 오케스트레이터

```javascript
async function buildGraph(projectPath) {
  // 1. .py 파일 수집
  const { files, warnings } = findPythonFiles(projectPath);

  // 2. 청크 단위 파싱 (20개씩)
  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const chunk = files.slice(i, i + CHUNK_SIZE);
    for (const file of chunk) {
      const result = parseFile(code, file.relativePath);
      allFunctions.push(...result.functions);
      allCalls.push(...result.calls);
      // ...
    }
    // 청크 사이에 이벤트 루프 양보 → 서버가 다른 요청도 처리 가능
    if (i + CHUNK_SIZE < files.length) await yieldToEventLoop();
  }

  // 3. 관계 해석
  const callEdges = resolveCalls(allFunctions, allCalls, allImports);
  const inheritanceEdges = resolveInheritance(allClasses);
  const variableEdges = resolveVariableRefs(allVariables, allVariableRefs, allImports);

  // 4. 메트릭 & 진단
  const { fileCounts } = computeFileCoupling(callEdges);
  const couplingScores = normalizeCoupling(fileCounts);
  const diagnostics = runDiagnostics(callEdges, allFunctions, allClasses);
  const suggestions = generateSuggestions(diagnostics);

  // 5. 노드 생성
  const { nodes, tiers } = buildTieredNodes(allFunctions, files, inboundCountMap, couplingScores, allVariables);
  const packageNodes = buildPackageNodes(files);
  const cycleEdgeIds = buildCycleEdgeIds(diagnostics.cycles.functions, callEdges);

  return { nodes, edges: callEdges, inheritanceEdges, variableEdges, packageNodes, tiers, ... };
}
```

**청크 단위 파싱의 이유**: `setImmediate`를 사용한 `yieldToEventLoop()`는 Node.js의 이벤트 루프에 제어권을 양보한다. 200개 파일을 한 번에 파싱하면 서버가 수 초간 블로킹되어 다른 HTTP 요청을 처리할 수 없다. 20개씩 끊어서 파싱하면 청크 사이사이에 다른 요청을 처리할 수 있다.

### buildTieredNodes — 3단계 중첩 노드 생성

이 함수가 만드는 노드 구조:

```
tier__3 (3회 참조 그룹)
  └─ utils.py__tier3 (파일 노드)
      ├─ utils.py::helper_func (함수 노드)
      └─ utils.py::process (함수 노드)

tier__0 (0회 참조 그룹)
  └─ main.py__tier0
      ├─ main.py::main (함수 노드)
      └─ main.py::config (변수 노드)
```

```javascript
function buildTieredNodes(functions, files, inboundCountMap, couplingScores, allVariables) {
  // 1. 각 함수의 참조 횟수(inbound count) 결정
  for (const func of functions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    funcTierMap[nodeId] = inboundCountMap[nodeId] || 0;
  }

  // 2. 고유 티어 값 수집 (참조 횟수별 그룹)
  const tierSet = new Set(Object.values(funcTierMap));
  tierSet.add(0);  // 참조되지 않는 함수를 위한 0회 그룹
  const tiers = Array.from(tierSet).sort((a, b) => b - a);  // 내림차순

  // 3. 티어 노드 생성
  for (const tierValue of tiers) {
    nodes.push({ data: { id: `tier__${tierValue}`, type: 'tier', label: `${tierValue}회 참조` } });
  }

  // 4. 티어별·파일별 함수 그룹핑
  // 핵심: 같은 파일이라도 함수의 참조 횟수가 다르면 별도 파일 노드로 분할
  const tierFileGroups = {};  // key: "tierValue::filePath"
  for (const func of functions) {
    const tierValue = funcTierMap[nodeId];
    const groupKey = `${tierValue}::${func.filePath}`;
    tierFileGroups[groupKey].push(func);
  }

  // 5. 파일 노드 + 함수 노드 생성
  for (const [groupKey, funcs] of Object.entries(tierFileGroups)) {
    const fileNodeId = `${filePath}__tier${tierValue}`;
    nodes.push({
      data: {
        id: fileNodeId,
        type: 'file',
        parent: `tier__${tierValue}`,  // ← Cytoscape compound 노드 부모 지정
        couplingScore: couplingScores[filePath] || 0,
      },
    });

    for (const func of funcs) {
      nodes.push({
        data: {
          id: `${func.filePath}::${func.qualifiedName}`,
          type: 'function',
          parent: fileNodeId,  // ← 파일 노드의 자식
          code: func.code,
          // ...
        },
      });
    }
  }
}
```

**Cytoscape compound 노드**: `parent` 필드를 설정하면 Cytoscape.js가 자동으로 부모-자식 관계를 인식하여 자식 노드를 부모 노드 "안에" 배치한다. 이것이 tier → file → function 중첩 시각화의 핵심이다.

**파일 노드 분할의 이유**: 같은 `utils.py` 파일에 3회 참조되는 `helper()`와 0회 참조되는 `unused()`가 있으면, `utils.py__tier3`와 `utils.py__tier0`로 분할한다. 이렇게 해야 참조 횟수 그룹(tier) 안에 올바르게 배치된다.

### buildPackageNodes — 패키지 뷰용 노드 생성

```javascript
function buildPackageNodes(files) {
  const packages = new Map();  // 디렉토리 경로 → 파일 목록

  for (const file of files) {
    const dir = file.relativePath.split('/').slice(0, -1).join('/') || '.';
    packages.get(dir).push(file.relativePath);
  }

  // 디렉토리별 패키지 노드 생성
  return packages.entries().map(([dir, filePaths]) => ({
    data: { id: `pkg__${dir}`, label: dir === '.' ? '(루트)' : dir, type: 'package' },
  }));
}
```

패키지 뷰에서는 디렉토리를 초록색 컨테이너로, 파일을 파란색 노드로 표시한다.

### buildCycleEdgeIds — 순환 참조 엣지 식별

```javascript
function buildCycleEdgeIds(funcCycles, edges) {
  // 순환 경로의 각 연속 쌍에 대해 실제 엣지가 존재하는지 확인
  for (const cycle of funcCycles) {
    for (let i = 0; i < cycle.length - 1; i++) {
      const edgeId = `${cycle[i]}->${cycle[i+1]}`;
      if (edges.some(e => e.source === cycle[i] && e.target === cycle[i+1])) {
        cycleEdgeIds.add(edgeId);
      }
    }
  }
}
```

이 ID 목록은 프론트엔드에서 해당 엣지에 `cycle-edge` CSS 클래스를 추가하여 빨간색으로 강조하는 데 사용된다.

---

## 8. 보조 서비스

### metricsService — 결합도 계산

```javascript
function computeFileCoupling(edges) {
  for (const edge of edges) {
    const sourceFile = edge.source.split('::')[0];
    const targetFile = edge.target.split('::')[0];
    if (sourceFile === targetFile) continue;  // 같은 파일 내 호출은 제외

    // 파일 쌍별 호출 횟수 집계
    couplingMap[pairKey] += refCount;
    // 파일별 외부 연결 총 수 집계
    fileCounts[sourceFile] += refCount;
    fileCounts[targetFile] += refCount;
  }
}

function normalizeCoupling(fileCounts) {
  const maxCount = Math.max(...values);
  // 최대값 대비 비율로 0~1 정규화
  scores[file] = count / maxCount;
}
```

결합도 점수(0~1)는 프론트엔드에서 파일 노드의 **테두리 두께**로 시각화된다. `mapData(couplingScore, 0, 1, 2, 7)` — 0이면 2px, 1이면 7px.

### diagnosticsService — 코드 진단

**순환 참조 탐지 (DFS)**:
```javascript
function detectCycles(edges) {
  // 인접 리스트 구성
  const adj = {};
  for (const edge of edges) adj[edge.source].push(edge.target);

  // DFS with back-edge detection
  function dfs(node, path) {
    if (inStack.has(node)) {
      // 현재 DFS 스택에 이미 있음 = 순환 발견!
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    // 표준 DFS: visited + inStack 관리
    visited.add(node); inStack.add(node); path.push(node);
    for (const next of adj[node]) dfs(next, path);
    path.pop(); inStack.delete(node);
  }
}
```

**DFS 순환 탐지 알고리즘**:
- `visited`: 이미 완전히 탐색이 끝난 노드
- `inStack`: 현재 DFS 경로에 있는 노드
- 탐색 중 `inStack`에 이미 있는 노드를 다시 만나면 = **순환 참조**
- `path`에서 순환 시작 지점부터 현재까지를 추출하면 순환 경로가 된다

**결합도 과다 진단**:
- 인바운드 8회 이상: "너무 많은 곳에서 의존합니다"
- 아웃바운드 6회 이상: "너무 많은 외부 함수에 의존합니다"

**안티패턴 탐지**:
- God Function: 50줄 이상 함수 → 분리 권장
- God Class: 메서드 10개 이상 클래스 → 분리 권장

### refactoringService — 리팩토링 제안

진단 결과를 **사람이 읽을 수 있는 제안 텍스트**로 변환한다:
- 순환 참조 → "마지막 의존 관계를 제거하거나 공통 인터페이스 모듈로 분리하세요"
- 높은 인바운드 → "파사드(Facade) 패턴을 도입하세요"
- 높은 아웃바운드 → "단일 책임 함수로 분리하세요"
- God Function → "논리적 단위별로 헬퍼 함수를 추출하세요"
- God Class → "SRP에 따라 별도 클래스로 분리하세요"

---

## 9. AI 연동

### aiService — Claude API 호출

```javascript
async function explainFunction({ name, code, docstring, comment, filePath }) {
  const prompt = `다음 Python 함수의 역할을 간결하게 설명해주세요 (한국어, 3-5문장).
함수 이름: ${name}
파일: ${filePath}
${docstring ? `Docstring: ${docstring}` : ''}

코드:
\`\`\`python
${code}
\`\`\`

이 함수가 무엇을 하는지, 입력과 출력이 무엇인지, 프로젝트에서 어떤 역할을 하는지 설명해주세요.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}
```

**프롬프트 설계**:
- 한국어, 3~5문장으로 제한하여 간결한 설명 유도
- docstring과 comment가 있으면 컨텍스트로 제공하여 더 정확한 설명 생성
- `max_tokens: 500`으로 응답 길이 제한

### cacheService — SHA-256 인메모리 캐시

```javascript
const cache = new Map();

function getCacheKey(code) { return sha256(code); }
function get(code) { return cache.get(getCacheKey(code)) || null; }
function set(code, explanation) { cache.set(getCacheKey(code), explanation); }
```

코드 문자열 자체를 키로 쓰면 메모리 낭비가 크므로, SHA-256 해시(64자 고정)를 키로 사용한다. 서버가 재시작되면 캐시는 초기화된다 (인메모리이므로).

---

## 10. 프론트엔드: graph.js

### initGraph — Cytoscape 인스턴스 생성 및 스타일 정의

```javascript
function initGraph(container) {
  cy = cytoscape({
    container: container,
    style: [
      // 티어 노드: 둥근 직사각형, 주황 점선 테두리, 반투명 배경
      { selector: 'node[type="tier"]', style: { 'border-color': '#f59e0b', 'border-style': 'dashed' } },

      // 패키지 노드: 초록 테두리
      { selector: 'node[type="package"]', style: { 'border-color': '#22c55e' } },

      // 파일 노드: 파란 테두리 + 결합도에 따른 두께 변화
      { selector: 'node[type="file"]', style: { 'border-color': '#3b82f6' } },
      { selector: 'node[type="file"][couplingScore > 0.3]', style: {
        'border-width': 'mapData(couplingScore, 0, 1, 2, 7)',  // 0~1 → 2px~7px
        'border-color': 'mapData(couplingScore, 0, 1, #3b82f6, #f59e0b)',  // 파랑→주황 그라데이션
      }},

      // 함수 노드: 둥근 직사각형, 모노스페이스 폰트
      { selector: 'node[type="function"]', style: { 'font-family': 'Cascadia Code, monospace' } },

      // 변수 노드: 다이아몬드 모양, 청록색
      { selector: 'node[type="variable"]', style: { 'shape': 'diamond', 'border-color': '#14b8a6' } },

      // 클래스 메서드: 보라색 강조
      { selector: 'node[type="function"][className]', style: { 'border-color': '#7c3aed' } },

      // 엣지: 기본 숨김 (display: none), 클릭 시 관련 엣지만 표시
      { selector: 'edge', style: { 'display': 'none', 'line-color': '#60a5fa' } },

      // 상속 엣지: 보라 점선
      { selector: 'edge[edgeType="inheritance"]', style: { 'line-color': '#a78bfa', 'line-style': 'dashed' } },

      // 순환 참조 엣지: 빨간색
      { selector: 'edge.cycle-edge', style: { 'line-color': '#ef4444' } },
    ],
    wheelSensitivity: 0.3,  // 마우스 휠 줌 민감도
    minZoom: 0.1, maxZoom: 5,
  });
}
```

**Cytoscape.js 스타일 시스템**:
- `selector`: CSS 셀렉터와 유사. `node[type="function"]`은 `type` 데이터가 `function`인 노드에 적용.
- `mapData(field, inMin, inMax, outMin, outMax)`: 데이터 값을 선형 매핑. `couplingScore` 0~1을 테두리 두께 2~7px로 변환.
- `display: 'none'`: 엣지를 기본으로 숨기고, 노드 클릭 시 관련 엣지만 `display: 'element'`로 표시.

### renderGraph — 함수 뷰 렌더링

```javascript
function renderGraph(data) {
  graphData = data;
  cy.elements().remove();

  // 1. 엣지에 연결된 노드 ID 수집 (고립 노드 필터링)
  const connectedIds = new Set();
  for (const edge of data.edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  // 2. 연결된 함수만 유지, 빈 파일/티어 제거
  const keptFiles = new Set();
  for (const node of data.nodes) {
    if ((node.data.type === 'function' || node.data.type === 'variable') && connectedIds.has(node.data.id)) {
      keptFiles.add(node.data.parent);
    }
  }

  // 3. 엣지 생성 (호출 + 상속 + 변수 참조)
  for (const edge of data.edges) {
    elements.push({
      data: {
        id: `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        refCount: edge.references.length,
        references: edge.references,
        edgeType: 'call',
      },
    });
  }

  cy.add(elements);

  // 4. 순환 엣지에 CSS 클래스 추가
  for (const edgeId of data.cycleEdgeIds) {
    cy.getElementById(edgeId).addClass('cycle-edge');
  }

  // 5. fcose 레이아웃 실행 → 완료 후 티어 재배치
  cy.layout({
    name: 'fcose',
    stop: function() { arrangeTiers(sortedTiers); }
  }).run();
}
```

**고립 노드 필터링**: 어떤 엣지에도 연결되지 않은 함수는 그래프에 표시하지 않는다. 이렇게 하면 호출 관계가 없는 단독 함수(예: 테스트 함수)가 화면을 어지럽히지 않는다.

### arrangeTiers — 결정적 3단계 레이아웃 알고리즘

이 함수는 fcose 자동 레이아웃 후 실행되어 **겹치지 않는 정렬된 배치**를 만든다.

```javascript
function arrangeTiers(sortedTiers) {
  // 1단계: 파일 내부 — 함수들을 행 기반 컴팩트 배치
  //   가로로 나열하다 너비 초과 시 줄바꿈 (엑셀 셀 느낌)
  const targetCols = Math.ceil(Math.sqrt(funcs.length));  // √N 열
  for (const item of funcs) {
    if (rowX + item.w > maxRowW) { rowX = 0; rowY += rowMaxH + gap; }
    item.node.position({ x: rowX + w/2, y: rowY + h/2 });
    rowX += item.w + gap;
  }

  // 2단계: 티어 내부 — 파일들을 그리드 배치
  const cols = Math.ceil(Math.cbrt(files.length));  // ∛N 열
  for (const file of files) {
    // 그리드 좌표 계산, 줄바꿈 처리
  }

  // 3단계: 티어 간 — 좌→우 자동 줄바꿈 배치
  const tierRows = [[]];
  for (const info of tierInfo) {
    if (rowW + info.bb.w > targetWidth) tierRows.push([]);
    tierRows.last().push(info);
  }
  // 각 행 내에서 좌→우, 행 간에는 위→아래
  for (const row of tierRows) {
    for (const info of row) {
      leafNodes.forEach(node => {
        node.position({ x: pos.x + offsetX, y: pos.y + offsetY });
      });
      x += info.bb.w + tierGap;
    }
    rowY += rowH + tierGap;
  }
}
```

**왜 fcose만으로 부족한가**: fcose는 compound 노드(부모-자식)를 인식하지만, 티어 박스의 좌→우 정렬, 파일 박스의 그리드 배치 같은 **비즈니스 로직적 레이아웃**은 알지 못한다. 그래서 fcose로 내부 배치를 한 뒤, 직접 작성한 알고리즘으로 티어/파일을 재배치한다.

**compound 노드의 stale bbox 문제**: Cytoscape.js에서 compound 노드(파일, 티어)의 boundingBox는 자식이 이동해도 즉시 갱신되지 않을 수 있다. 그래서 `leafNodes.boundingBox()`처럼 리프 노드(함수)만으로 bbox를 계산한다.

**초기 줌 동적 조정**:
```javascript
const zoomLevel = nodeCount <= 10 ? 1.2
  : nodeCount <= 30 ? 0.9
  : nodeCount <= 80 ? 0.7
  : 0.5;
```

노드 수에 따라 줌 레벨을 조정하여 적은 노드면 크게, 많은 노드면 전체가 보이도록 한다.

### highlightNode — 노드 하이라이트

```javascript
function highlightNode(nodeId) {
  cy.nodes().removeClass('highlighted dimmed');

  const node = cy.getElementById(nodeId);
  node.addClass('highlighted');

  // 연결된 엣지만 표시
  const connectedEdges = node.connectedEdges();
  connectedEdges.style('display', 'element');
  connectedEdges.addClass('highlighted');

  // 부모(파일, 티어)와 이웃 노드의 부모까지 흐려지지 않게 보호
  const keepVisible = node.union(neighborNodes).union(parentFile).union(parentTier);
  let neighborAncestors = cy.collection();
  neighborNodes.forEach(n => {
    neighborAncestors = neighborAncestors.union(n.parent()).union(n.parent().parent());
  });

  // 나머지는 전부 흐리게
  cy.nodes().not(keepVisible).not(neighborAncestors).addClass('dimmed');
}
```

**dimmed 처리의 핵심**: 선택한 노드와 연결된 노드만 명확하게 보이고, 나머지는 `opacity: 0.3`으로 흐리게 처리한다. 이때 부모 노드(파일, 티어)와 이웃 노드의 부모까지 보호해야 시각적으로 자연스럽다.

---

## 11. 프론트엔드: interactions.js

### setupInteractions — 이벤트 리스너 등록

```javascript
function setupInteractions() {
  cy.removeAllListeners();  // 중복 방지

  // 엣지 클릭 → 참조 위치 팝업
  cy.on('tap', 'edge', function(evt) {
    const refs = evt.target.data('references');
    showRefPopup(evt.renderedPosition, refs, source, target);
  });

  // 함수 노드 클릭 → 하이라이트 + AI 설명
  cy.on('tap', 'node[type="function"]', function(evt) {
    highlightNode(nodeId);
    showExplanation(node.data());
  });

  // 파일/티어 더블클릭 → 접기/펼치기
  cy.on('dbltap', 'node[type="file"], node[type="tier"]', function(evt) {
    toggleCollapse(node);
  });

  // 패키지 뷰에서 파일 클릭 → 파일 상세 뷰
  cy.on('tap', 'node[type="file"]', function(evt) {
    if (currentViewMode !== 'package') return;
    renderFileDetailView(graphData, filePath);
  });

  // 빈 배경 클릭 → 모든 팝업 닫기
  cy.on('tap', function(evt) {
    if (evt.target === cy) { hideRefPopup(); hideExplanation(); clearHighlights(); }
  });
}
```

**이벤트 구분**: Cytoscape.js에서 `tap`은 일반 클릭, `dbltap`은 더블클릭이다. `evt.target === cy`이면 빈 배경을 클릭한 것이다. `evt.stopPropagation()`으로 이벤트 버블링을 차단하여 함수 클릭이 배경 클릭으로 전파되지 않게 한다.

**DOM 이벤트 중복 방지**: `domListenersBound` 플래그로 DOM 이벤트 리스너(버튼 클릭 등)를 한 번만 등록한다. Cytoscape 이벤트는 `removeAllListeners()`로 매번 초기화하지만, DOM 이벤트는 제거하기 어려우므로 플래그로 관리한다.

### toggleCollapse — 접기/펼치기 (드릴다운)

```javascript
function collapseNode(node) {
  collapsedNodes.add(nodeId);
  node.children().forEach(child => {
    child.style('display', 'none');          // 자식 숨기기
    child.connectedEdges().style('display', 'none');  // 연결 엣지도 숨기기
  });
  node.addClass('collapsed');  // 점선 테두리로 변경
}

function expandNode(node) {
  collapsedNodes.delete(nodeId);
  node.children().forEach(child => {
    child.style('display', 'element');
    // 연결 엣지는 상대 노드가 보이는 경우만 표시
    child.connectedEdges().forEach(edge => {
      const other = edge.source().id() === child.id() ? edge.target() : edge.source();
      if (other.style('display') !== 'none') edge.style('display', 'element');
    });
  });
  node.removeClass('collapsed');
}
```

**엣지 복원 시 주의점**: 자식을 펼칠 때 연결된 엣지를 무조건 표시하면 안 된다. 상대방 노드가 접혀서 숨겨진 상태일 수 있으므로, `other.style('display') !== 'none'` 체크가 필요하다.

### showExplanation — AI 설명 표시

```javascript
async function showExplanation(funcData) {
  // 캐시 확인 (프론트엔드 캐시)
  if (explainCache[nodeId]) {
    content.appendChild(explainCache[nodeId].cloneNode(true));
    return;
  }

  // 로딩 표시
  loadingDiv.textContent = 'AI 설명을 생성하고 있습니다...';

  // 서버에 설명 요청
  const response = await fetch('/api/explain', {
    method: 'POST',
    body: JSON.stringify({ name, code, docstring, comment, filePath }),
  });

  const data = await response.json();
  const fragment = formatExplanation(data.explanation);
  explainCache[nodeId] = fragment;  // DocumentFragment 캐시
  content.appendChild(fragment.cloneNode(true));
}
```

**이중 캐시**: 프론트엔드(`explainCache` 객체)와 서버(`cacheService`)에 각각 캐시가 있다. 프론트엔드 캐시는 DOM Fragment를 저장하여 서버 호출 자체를 방지하고, 서버 캐시는 AI API 호출을 방지한다.

**`cloneNode(true)`의 이유**: DocumentFragment는 DOM에 추가되면 사라진다(move semantics). 캐시에 보관하려면 `cloneNode`으로 복사본을 만들어 DOM에 추가해야 한다.

### 검색 기능 — setupSearch

```javascript
input.addEventListener('input', () => {
  const matched = cy.nodes('[type="function"], [type="file"]').filter(node => {
    return node.data('label').toLowerCase().includes(query);
  });

  // 매칭 노드와 그 부모 계층(파일, 티어)을 보존
  let keepVisible = matched;
  matched.forEach(n => { keepVisible = keepVisible.union(n.ancestors()); });

  matched.addClass('highlighted');
  cy.nodes().not(keepVisible).addClass('dimmed');
});

// Enter 키 → 첫 번째 매칭 노드로 카메라 이동
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    cy.animate({ center: { eles: matched[0] }, zoom: 2 }, { duration: 400 });
  }
});
```

`ancestors()`는 부모, 조부모 등 상위 노드를 모두 반환한다. 이를 keepVisible에 포함시켜야 하위 노드가 dimmed되지 않는다.

---

## 12. 프론트엔드 기타

### diffPreview.js — Diff 비교 및 순환 제거 시뮬레이션

**순환 제거 미리보기**:
```javascript
function previewCycleRemoval(cyclePath) {
  // 순환의 마지막 엣지를 찾아 시각적으로 "제거" 표시
  const lastNode = cyclePath[cyclePath.length - 2];
  const firstNode = cyclePath[cyclePath.length - 1];
  const edge = cy.getElementById(`${lastNode}->${firstNode}`);

  // 현재 상태 백업 → 복원 가능
  previewBackup = { edgeId, wasVisible: ... };

  // 엣지에 점선 스타일 적용 (실제 삭제가 아닌 시각적 표시)
  edge.addClass('preview-removed');

  // 미리보기 배너 표시
  banner.classList.remove('hidden');
}
```

**Diff 뷰 생성**: `showDiffView(suggestion)`는 제안 유형(cycle/coupling/antipattern)별로 변경 전/후 텍스트를 생성하고, `diff-removed`(빨강) / `diff-added`(초록) CSS 클래스를 적용한다.

### fileTree.js — 파일 탐색기

```javascript
function buildFileTree(data) {
  // 1. 파일 경로에서 트리 구조 구축
  const tree = {};
  for (const fp of filePaths) {
    const parts = fp.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) {
        current._files.push({ name: part, fullPath: fp });  // 리프: 파일
      } else {
        if (!current[part]) current[part] = {};               // 브랜치: 디렉토리
        current = current[part];
      }
    }
  }

  // 2. 재귀적 DOM 생성
  function renderTree(obj, container, depth) {
    // 디렉토리: 클릭 시 토글
    dirHeader.addEventListener('click', () => dirEl.classList.toggle('collapsed'));
    // 파일: 클릭 시 해당 노드로 카메라 이동
    fileEl.addEventListener('click', () => focusFileNode(file.fullPath));
  }
}
```

**`focusFileNode`**: 파일 경로로 Cytoscape 노드를 찾아 하이라이트하고, `cy.animate({ center, zoom: 2 })`로 부드럽게 카메라를 이동시킨다.

**패널 토글**: `file-tree-panel`의 `collapsed` CSS 클래스를 토글하면 `width: 0 + opacity: 0`으로 트랜지션된다. 패널 크기 변경 후 `setTimeout(() => cy.resize(), 310)`으로 그래프 컨테이너 크기를 재계산한다 (CSS 트랜지션 시간 300ms + 여유 10ms).

### app.js — 메인 진입점

```javascript
document.addEventListener('DOMContentLoaded', () => {
  initGraph(container);  // 1. Cytoscape 초기화

  form.addEventListener('submit', async (e) => {
    // 2. 서버에 분석 요청
    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ source }),
    });
    const data = await response.json();
    lastAnalysisData = data;

    // 3. 그래프 렌더링 + 인터랙션 설정 + 파일 트리 구축
    renderGraph(data);
    setupInteractions();
    buildFileTree(data);
    setupFileTree();

    // 4. 툴바 버튼 표시
    document.getElementById('search-input').classList.remove('hidden');
    // ...
  });

  // 5. 진단 버튼 → 마지막 분석 결과로 진단 패널 표시
  document.getElementById('diagnostics-btn').addEventListener('click', () => {
    showDiagnosticsPanel(lastAnalysisData.diagnostics, lastAnalysisData.suggestions);
  });
});
```

`lastAnalysisData`를 전역으로 보관하여 진단 버튼 클릭 시 서버를 다시 호출하지 않고 기존 데이터를 사용한다.

---

## 13. 데이터 흐름 종합

### 분석 요청 전체 흐름

```
사용자 입력: "https://github.com/user/project.git"
    │
    ▼
[app.js] fetch('/api/analyze', { source })
    │
    ▼
[routes/analyze.js] getProjectPath(source) → buildGraph(projectPath)
    │
    ├─ [gitService.js] cloneRepo(url) → repos/project-abc123/ 에 --depth 1 클론
    │      └─ findPythonFiles() → .py 파일 목록 (최대 200개, 100KB 이하)
    │
    ├─ [parser.js] parseFile(code, filePath) × N개 파일 (20개씩 청크)
    │      ├─ tree-sitter → AST
    │      ├─ collectImports() → import 목록
    │      ├─ collectDefinitions() → 함수/클래스 목록 + 호출 목록
    │      ├─ collectVariables() → 변수/필드 목록
    │      └─ collectVariableRefs() → 변수 참조 목록
    │
    ├─ [resolver.js]
    │      ├─ resolveCalls() → 호출 엣지 (3단계 우선순위)
    │      ├─ resolveInheritance() → 상속 엣지
    │      └─ resolveVariableRefs() → 변수 참조 엣지
    │
    ├─ [metricsService.js] computeFileCoupling() → 결합도 점수 (0~1)
    │
    ├─ [diagnosticsService.js] runDiagnostics()
    │      ├─ detectCycles() → 순환 참조 경로
    │      ├─ detectCouplingIssues() → 결합도 과다 경고
    │      └─ detectAntiPatterns() → God Function/Class
    │
    ├─ [refactoringService.js] generateSuggestions() → 리팩토링 제안 텍스트
    │
    └─ [graphBuilder.js]
           ├─ buildTieredNodes() → tier → file → function 3단계 노드
           ├─ buildPackageNodes() → 패키지 뷰용 노드
           └─ buildCycleEdgeIds() → 순환 엣지 ID 목록
    │
    ▼
JSON 응답:
{
  nodes: [...],           // Cytoscape 노드 (tier/file/function/variable)
  edges: [...],           // 호출 엣지 + references
  inheritanceEdges: [...],// 상속 엣지
  variableEdges: [...],   // 변수 참조 엣지
  packageNodes: [...],    // 패키지 뷰용 노드
  tiers: [0, 1, 3, ...], // 활성 티어 값
  diagnostics: {...},     // 진단 결과
  suggestions: [...],     // 리팩토링 제안
  cycleEdgeIds: [...],    // 순환 엣지 ID
  couplingScores: {...},  // 결합도 점수
  warnings: [...],        // 경고 메시지
}
    │
    ▼
[graph.js] renderGraph(data)
    ├─ 고립 노드 필터링
    ├─ elements 배열 구성
    ├─ cy.add(elements)
    ├─ cycle-edge 클래스 적용
    ├─ fcose 레이아웃 실행
    └─ arrangeTiers() — 결정적 3단계 재배치
    │
    ▼
[interactions.js] setupInteractions()
    ├─ 노드/엣지 클릭 이벤트
    ├─ 검색, 토글, 뷰 전환
    └─ 진단 패널, AI 설명
    │
    ▼
화면에 인터랙티브 그래프 표시
```

### AI 설명 요청 흐름

```
사용자: 함수 노드 클릭
    │
    ▼
[interactions.js] showExplanation(funcData)
    ├─ 프론트엔드 캐시 확인 (explainCache[nodeId])
    │   └─ 있으면: 즉시 DOM에 표시 (서버 호출 없음)
    │
    ├─ 없으면: fetch('/api/explain', { name, code, ... })
    │
    ▼
[routes/explain.js]
    ├─ 서버 캐시 확인 (cacheService.get(code))
    │   └─ 있으면: { explanation, cached: true } 응답
    │
    ├─ 없으면: [aiService.js] explainFunction()
    │   └─ Claude API 호출 → 한국어 3~5문장 설명 생성
    │   └─ cacheService.set(code, explanation)
    │
    ▼
프론트엔드: formatExplanation() → DOM 렌더링 + 캐시 저장
```

---

## 부록: 주요 노드 ID 체계

| 노드 유형 | ID 형식 | 예시 |
|-----------|---------|------|
| 티어 | `tier__{참조횟수}` | `tier__3` |
| 파일 | `{파일경로}__tier{참조횟수}` | `utils.py__tier3` |
| 함수 | `{파일경로}::{정규화이름}` | `utils.py::Calculator.add` |
| 변수 | `{파일경로}::{변수명}` | `config.py::DB_HOST` |
| 패키지 | `pkg__{디렉토리}` | `pkg__src/utils` |
| 호출 엣지 | `{출발ID}->{도착ID}` | `main.py::main->utils.py::helper` |
| 상속 엣지 | `inherit__{출발}->{도착}` | `inherit__Dog->Animal` |
| 변수 참조 엣지 | `varref__{출발}->{도착}` | `varref__main::func->config::DB_HOST` |

이 ID 체계가 전체 시스템의 통일된 식별자 역할을 한다. parser → resolver → graphBuilder → frontend까지 동일한 ID를 사용하여 노드를 참조한다.
