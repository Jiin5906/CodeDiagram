//test/runner.js(자체 assert 러너)에서 옮겨 온 언어별 파서·그래프 회귀 테스트다.
//섹션 하나가 test 하나이며, 섹션 안의 실패 메시지를 모두 모아 한 번에 보여준다.
const fs = require('fs');
const path = require('path');
const { parseFile } = require('../../server/services/parser');
const { resolveCalls } = require('../../server/services/resolver');
const { buildGraph } = require('../../server/services/graphBuilder');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const fixturesDir = path.join(FIXTURES, 'sample_project');
const cppFixturesDir = path.join(FIXTURES, 'cpp_project');
const csFixturesDir = path.join(FIXTURES, 'csharp_project');
const jsFixturesDir = path.join(FIXTURES, 'js_project');
const webFixturesDir = path.join(FIXTURES, 'web_project');
const tsFixturesDir = path.join(FIXTURES, 'ts_project');
const javaFixturesDir = path.join(FIXTURES, 'java_project');

/** @type {string[]} */
let failures = [];
function assert(condition, msg) {
  if (!condition) failures.push(msg);
}
function assertContains(arr, val, msg) {
  assert(arr.includes(val), msg);
}
function assertDefined(val, msg) {
  assert(val !== undefined && val !== null, msg);
}

beforeEach(() => {
  failures = [];
});

test('Python Parser/Resolver/GraphBuilder', async () => {
  const mainCode = fs.readFileSync(path.join(fixturesDir, 'main.py'), 'utf-8');
  const mainResult = parseFile(mainCode, 'main.py');

  assertContains(
    mainResult.functions.map((f) => f.name),
    'main',
    'extracts main function',
  );
  assertContains(
    mainResult.functions.map((f) => f.name),
    'process_data',
    'extracts process_data function',
  );
  assertContains(
    mainResult.functions.map((f) => f.name),
    'clean',
    'extracts clean function',
  );

  const mainFunc = mainResult.functions.find((f) => f.name === 'main');
  assert(mainFunc.docstring.includes('Entry point'), 'extracts main docstring');

  const cleanFunc = mainResult.functions.find((f) => f.name === 'clean');
  assert(cleanFunc.docstring.includes('whitespace'), 'extracts clean docstring');

  const mainCalls = mainResult.calls.filter((c) => c.caller === 'main');
  assertContains(
    mainCalls.map((c) => c.callee),
    'helper_func',
    'main calls helper_func',
  );
  assertContains(
    mainCalls.map((c) => c.callee),
    'add',
    'main calls add',
  );

  assertContains(
    mainResult.imports.map((i) => i.name),
    'helper_func',
    'imports helper_func',
  );
  assertContains(
    mainResult.imports.map((i) => i.name),
    'add',
    'imports add',
  );

  const mathCode = fs.readFileSync(path.join(fixturesDir, 'math_ops.py'), 'utf-8');
  const mathResult = parseFile(mathCode, 'math_ops.py');
  assertContains(
    mathResult.functions.map((f) => f.qualifiedName),
    'Calculator.add',
    'extracts Calculator.add',
  );
  assertContains(
    mathResult.functions.map((f) => f.qualifiedName),
    'Calculator.multiply',
    'extracts Calculator.multiply',
  );

  assert(mainFunc.startLine > 0, 'start line > 0');
  assert(mainFunc.endLine >= mainFunc.startLine, 'end line >= start line');

  // --- Resolver Tests ---

  const utilsCode = fs.readFileSync(path.join(fixturesDir, 'utils.py'), 'utf-8');
  const utilsResult = parseFile(utilsCode, 'utils.py');

  const allFunctions = [...mainResult.functions, ...utilsResult.functions, ...mathResult.functions];
  const allCalls = [...mainResult.calls, ...utilsResult.calls, ...mathResult.calls];
  const allImports = [
    { filePath: 'main.py', imports: mainResult.imports },
    { filePath: 'utils.py', imports: utilsResult.imports },
    { filePath: 'math_ops.py', imports: mathResult.imports },
  ];

  const edges = resolveCalls(allFunctions, allCalls, allImports);

  const cleanEdge = edges.find(
    (e) => e.source === 'main.py::process_data' && e.target === 'main.py::clean',
  );
  assertDefined(cleanEdge, 'resolves same-file call process_data->clean');

  const helperEdge = edges.find(
    (e) => e.source === 'main.py::main' && e.target === 'utils.py::helper_func',
  );
  assertDefined(helperEdge, 'resolves cross-file call main->helper_func');

  const addEdge = edges.find((e) => e.source === 'main.py::main' && e.target.includes('add'));
  assertDefined(addEdge, 'resolves cross-file call main->add');

  const printEdge = edges.find((e) => e.target && e.target.includes('print'));
  assert(!printEdge, 'no edge for built-in print');

  for (const edge of edges) {
    assert(edge.references.length > 0, `edge ${edge.source}->${edge.target} has references`);
  }

  // --- GraphBuilder Tests ---

  const graph = await buildGraph(fixturesDir);

  assert(Array.isArray(graph.nodes), 'graph has nodes array');
  assert(Array.isArray(graph.edges), 'graph has edges array');

  const fileNodes = graph.nodes.filter((n) => n.data.type === 'file');
  assert(fileNodes.length >= 3, 'at least 3 file nodes');

  const funcNodes = graph.nodes.filter((n) => n.data.type === 'function');
  assert(funcNodes.length > 0, 'has function nodes');

  for (const node of funcNodes) {
    assertDefined(node.data.parent, `function ${node.data.id} has parent`);
    assertDefined(node.data.code, `function ${node.data.id} has code`);
  }

  assert(graph.edges.length > 0, 'has edges');

  //다중 언어 지원 확인
  assertDefined(graph.fileCounts, 'graph has fileCounts');
  assertDefined(graph.webEdges, 'graph has webEdges');

  // --- C++ Parser Tests ---
  expect(failures).toEqual([]);
});

test('C++ Parser', async () => {
  const cppMainCode = fs.readFileSync(path.join(cppFixturesDir, 'main.cpp'), 'utf-8');
  const cppMainResult = parseFile(cppMainCode, 'main.cpp', 'cpp');

  assertContains(
    cppMainResult.functions.map((f) => f.name),
    'main',
    '[C++] extracts main function',
  );
  assert(cppMainResult.imports.length >= 2, '[C++] extracts #include directives');
  assertContains(
    cppMainResult.imports.map((i) => i.name),
    'calculator.h',
    '[C++] includes calculator.h',
  );
  assertContains(
    cppMainResult.imports.map((i) => i.name),
    'utils.h',
    '[C++] includes utils.h',
  );

  const cppMainCalls = cppMainResult.calls.filter((c) => c.caller === 'main');
  assert(cppMainCalls.length > 0, '[C++] main has function calls');
  assert(
    cppMainCalls.some((c) => c.callee.includes('add')),
    '[C++] main calls add',
  );
  assert(
    cppMainCalls.some((c) => c.callee === 'parse_number'),
    '[C++] main calls parse_number',
  );

  const cppCalcCode = fs.readFileSync(path.join(cppFixturesDir, 'calculator.cpp'), 'utf-8');
  const cppCalcResult = parseFile(cppCalcCode, 'calculator.cpp', 'cpp');

  //클래스 메서드 추출 확인 (Calculator::add → Calculator.add)
  assertContains(
    cppCalcResult.functions.map((f) => f.qualifiedName),
    'Calculator.add',
    '[C++] extracts Calculator.add',
  );
  assertContains(
    cppCalcResult.functions.map((f) => f.qualifiedName),
    'Calculator.multiply',
    '[C++] extracts Calculator.multiply',
  );
  assertContains(
    cppCalcResult.functions.map((f) => f.qualifiedName),
    'ScientificCalculator.power',
    '[C++] extracts ScientificCalculator.power',
  );

  //클래스 및 상속
  const cppCalcHCode = fs.readFileSync(path.join(cppFixturesDir, 'calculator.h'), 'utf-8');
  const cppCalcHResult = parseFile(cppCalcHCode, 'calculator.h', 'cpp');

  assert(cppCalcHResult.classes.length >= 2, '[C++] extracts classes from header');
  const cppSciClass = cppCalcHResult.classes.find((c) => c.name === 'ScientificCalculator');
  assertDefined(cppSciClass, '[C++] extracts ScientificCalculator class');
  assert(
    cppSciClass && cppSciClass.superclasses.includes('Calculator'),
    '[C++] ScientificCalculator inherits Calculator',
  );

  //변수 추출
  const cppCalcClass = cppCalcHResult.classes.find((c) => c.name === 'Calculator');
  assertDefined(cppCalcClass, '[C++] extracts Calculator class');
  assert(
    cppCalcHResult.variables.some((v) => v.name === 'Calculator.value'),
    '[C++] extracts Calculator.value field',
  );

  //utils.cpp 함수-호출 관계
  const cppUtilsCode = fs.readFileSync(path.join(cppFixturesDir, 'utils.cpp'), 'utf-8');
  const cppUtilsResult = parseFile(cppUtilsCode, 'utils.cpp', 'cpp');

  assertContains(
    cppUtilsResult.functions.map((f) => f.name),
    'trim',
    '[C++] extracts trim function',
  );
  assertContains(
    cppUtilsResult.functions.map((f) => f.name),
    'parse_number',
    '[C++] extracts parse_number function',
  );
  const cppParseNumCalls = cppUtilsResult.calls.filter((c) => c.caller === 'parse_number');
  assert(
    cppParseNumCalls.some((c) => c.callee === 'trim'),
    '[C++] parse_number calls trim',
  );

  // --- C++ GraphBuilder Test ---
  expect(failures).toEqual([]);
});

test('C++ GraphBuilder', async () => {
  const cppGraph = await buildGraph(cppFixturesDir);
  assert(Array.isArray(cppGraph.nodes), '[C++] graph has nodes');
  assert(
    cppGraph.nodes.filter((n) => n.data.type === 'function').length > 0,
    '[C++] graph has function nodes',
  );
  assert(cppGraph.fileCounts.cpp > 0, '[C++] fileCounts has cpp');

  // --- C# Parser Tests ---
  expect(failures).toEqual([]);
});

test('C# Parser', async () => {
  const csProgramCode = fs.readFileSync(path.join(csFixturesDir, 'Program.cs'), 'utf-8');
  const csProgramResult = parseFile(csProgramCode, 'Program.cs', 'csharp');

  assertContains(
    csProgramResult.functions.map((f) => f.name),
    'Main',
    '[C#] extracts Main method',
  );
  assert(csProgramResult.imports.length >= 1, '[C#] extracts using directives');

  const csMainCalls = csProgramResult.calls.filter((c) => c.caller === 'Program.Main');
  assert(csMainCalls.length > 0, '[C#] Main has method calls');

  const csCalcCode = fs.readFileSync(path.join(csFixturesDir, 'Calculator.cs'), 'utf-8');
  const csCalcResult = parseFile(csCalcCode, 'Calculator.cs', 'csharp');

  //클래스 메서드 추출
  assertContains(
    csCalcResult.functions.map((f) => f.qualifiedName),
    'Calculator.Add',
    '[C#] extracts Calculator.Add',
  );
  assertContains(
    csCalcResult.functions.map((f) => f.qualifiedName),
    'Calculator.Multiply',
    '[C#] extracts Calculator.Multiply',
  );
  assertContains(
    csCalcResult.functions.map((f) => f.qualifiedName),
    'ScientificCalculator.Power',
    '[C#] extracts ScientificCalculator.Power',
  );

  //클래스 및 상속
  assert(csCalcResult.classes.length >= 2, '[C#] extracts classes');
  const csSciClass = csCalcResult.classes.find((c) => c.name === 'ScientificCalculator');
  assertDefined(csSciClass, '[C#] extracts ScientificCalculator class');
  assert(
    csSciClass && csSciClass.superclasses.includes('Calculator'),
    '[C#] ScientificCalculator inherits Calculator',
  );

  //프로퍼티를 변수로 추출
  assert(
    csCalcResult.variables.some((v) => v.name === 'Calculator.Value'),
    '[C#] extracts Calculator.Value property',
  );

  //생성자 추출
  assertContains(
    csCalcResult.functions.map((f) => f.qualifiedName),
    'Calculator.Calculator',
    '[C#] extracts Calculator constructor',
  );

  //Utils.cs
  const csUtilsCode = fs.readFileSync(path.join(csFixturesDir, 'Utils.cs'), 'utf-8');
  const csUtilsResult = parseFile(csUtilsCode, 'Utils.cs', 'csharp');

  assertContains(
    csUtilsResult.functions.map((f) => f.name),
    'Trim',
    '[C#] extracts Trim method',
  );
  assertContains(
    csUtilsResult.functions.map((f) => f.name),
    'ParseNumber',
    '[C#] extracts ParseNumber method',
  );
  const csParseNumCalls = csUtilsResult.calls.filter((c) => c.caller === 'Utils.ParseNumber');
  assert(
    csParseNumCalls.some((c) => c.callee === 'Trim'),
    '[C#] ParseNumber calls Trim',
  );

  // --- C# GraphBuilder Test ---
  expect(failures).toEqual([]);
});

test('C# GraphBuilder', async () => {
  const csGraph = await buildGraph(csFixturesDir);
  assert(Array.isArray(csGraph.nodes), '[C#] graph has nodes');
  assert(
    csGraph.nodes.filter((n) => n.data.type === 'function').length > 0,
    '[C#] graph has function nodes',
  );
  assert(csGraph.fileCounts.csharp > 0, '[C#] fileCounts has csharp');

  // --- JavaScript Parser Tests ---
  expect(failures).toEqual([]);
});

test('Java Parser', async () => {
  const parseJavaFixture = (relPath) =>
    parseFile(fs.readFileSync(path.join(javaFixturesDir, relPath), 'utf-8'), relPath, 'java');

  //Calculator.java - implements, 필드, 생성자, Javadoc, this.필드
  const calc = parseJavaFixture('com/example/math/Calculator.java');
  const calcClass = calc.classes.find((c) => c.name === 'Calculator');
  assertDefined(calcClass, '[Java] extracts Calculator class');
  assert(
    calcClass && calcClass.superclasses.includes('Operation'),
    '[Java] implements is recorded as superclass',
  );
  const calcNames = calc.functions.map((f) => f.qualifiedName);
  assertContains(calcNames, 'Calculator.Calculator', '[Java] extracts constructor');
  assertContains(calcNames, 'Calculator.add', '[Java] extracts Calculator.add');
  assertContains(calcNames, 'Calculator.clamp', '[Java] extracts private method');
  const add = calc.functions.find((f) => f.qualifiedName === 'Calculator.add');
  assert(add && add.docstring.startsWith('/**'), '[Java] Javadoc goes to docstring');
  const clamp = calc.functions.find((f) => f.qualifiedName === 'Calculator.clamp');
  assert(
    clamp && clamp.comment.startsWith('//') && clamp.docstring === '',
    '[Java] line comment goes to comment',
  );
  const calcVars = calc.variables.map((v) => v.name);
  assertContains(calcVars, 'Calculator.value', '[Java] extracts instance field');
  assertContains(calcVars, 'Calculator.MAX', '[Java] extracts static final field');
  assert(
    calc.variableRefs.some(
      (r) => r.caller === 'Calculator.multiply' && r.variable === 'Calculator.value',
    ),
    '[Java] this.value is recorded as Calculator.value',
  );

  //Operation.java - body 없는 인터페이스 메서드
  const op = parseJavaFixture('com/example/math/Operation.java');
  assertContains(
    op.functions.map((f) => f.qualifiedName),
    'Operation.name',
    '[Java] extracts abstract interface method',
  );
  assert(op.calls.length === 0, '[Java] interface method without body has no calls');

  //ScientificCalculator.java - extends, super 호출, 중첩 enum
  const sci = parseJavaFixture('com/example/math/ScientificCalculator.java');
  const sciClass = sci.classes.find((c) => c.name === 'ScientificCalculator');
  assert(
    sciClass && sciClass.superclasses.includes('Calculator'),
    '[Java] extends is recorded as superclass',
  );
  assertContains(
    sci.classes.map((c) => c.name),
    'Mode',
    '[Java] extracts nested enum',
  );
  assert(
    sci.calls.some((c) => c.caller === 'ScientificCalculator.add' && c.callee === 'Calculator.add'),
    '[Java] super.add() is recorded as Calculator.add',
  );
  assertContains(
    sci.variables.map((v) => v.name),
    'ScientificCalculator.history',
    '[Java] extracts generic field',
  );

  //StringUtils.java - private 생성자, 같은 클래스 static 호출
  const utils = parseJavaFixture('com/example/util/StringUtils.java');
  assertContains(
    utils.functions.map((f) => f.qualifiedName),
    'StringUtils.StringUtils',
    '[Java] extracts private constructor with empty body',
  );
  assert(
    utils.calls.some((c) => c.caller === 'StringUtils.parseNumber' && c.callee === 'trim'),
    '[Java] parseNumber calls trim',
  );

  //Main.java - import 3종, new, 람다 안 호출
  const main = parseJavaFixture('com/example/app/Main.java');
  assert(main.imports.length === 5, '[Java] extracts 5 imports');
  assert(
    main.imports.some(
      (i) => i.module === 'com.example.util.StringUtils' && i.name === 'StringUtils',
    ),
    '[Java] regular import keeps full module',
  );
  assert(
    main.imports.some((i) => i.module === 'com.example.util.StringUtils' && i.name === 'trim'),
    '[Java] static import splits class and member',
  );
  assert(
    main.imports.some((i) => i.module === 'java.util' && i.name === '*'),
    '[Java] wildcard import',
  );
  const mainCallees = main.calls.filter((c) => c.caller === 'Main.main').map((c) => c.callee);
  assertContains(mainCallees, 'Calculator', '[Java] new Calculator() is a call');
  assertContains(mainCallees, 'calc.add', '[Java] object method call');
  assertContains(mainCallees, 'StringUtils.parseNumber', '[Java] static method call');
  assertContains(mainCallees, 'trim', '[Java] statically imported call');
  assertContains(mainCallees, 'greet', '[Java] call inside lambda belongs to enclosing method');

  expect(failures).toEqual([]);
});

test('Java GraphBuilder', async () => {
  const javaGraph = await buildGraph(javaFixturesDir);
  assert(javaGraph.fileCounts.java === 5, '[Java] fileCounts has 5 java files');
  assert(
    javaGraph.nodes.filter((n) => n.data.type === 'function').length > 0,
    '[Java] graph has function nodes',
  );

  //"파일경로::이름" 형태의 노드 ID에서 이름만 꺼내 비교한다
  const short = (e) => `${e.source.split('::')[1]} -> ${e.target.split('::')[1]}`;
  const callEdges = javaGraph.edges.map(short);
  assertContains(
    callEdges,
    'Main.main -> StringUtils.parseNumber',
    '[Java] cross-package call resolved via import',
  );
  assertContains(callEdges, 'Main.main -> StringUtils.trim', '[Java] static import call resolved');
  assertContains(
    callEdges,
    'ScientificCalculator.add -> Calculator.add',
    '[Java] super call resolved to parent method',
  );
  assertContains(callEdges, 'Main.main -> Main.greet', '[Java] lambda call resolved');

  const inheritEdges = javaGraph.inheritanceEdges.map(short);
  assertContains(
    inheritEdges,
    'ScientificCalculator -> Calculator',
    '[Java] extends inheritance edge',
  );
  assertContains(inheritEdges, 'Calculator -> Operation', '[Java] implements inheritance edge');

  assertContains(
    javaGraph.variableEdges.map(short),
    'Calculator.multiply -> Calculator.value',
    '[Java] this.field variable edge',
  );

  expect(failures).toEqual([]);
});

test('JavaScript Parser', async () => {
  // app.js - ES6 imports, classes, arrow functions, async, DOM
  const jsAppCode = fs.readFileSync(path.join(jsFixturesDir, 'app.js'), 'utf-8');
  const jsAppResult = parseFile(jsAppCode, 'app.js', 'javascript');

  // Function extraction
  assertContains(
    jsAppResult.functions.map((f) => f.name),
    'initApp',
    '[JS] extracts arrow function initApp',
  );
  assertContains(
    jsAppResult.functions.map((f) => f.name),
    'loadConfig',
    '[JS] extracts async arrow function loadConfig',
  );
  assertContains(
    jsAppResult.functions.map((f) => f.name),
    'setupEvents',
    '[JS] extracts regular function setupEvents',
  );
  assertContains(
    jsAppResult.functions.map((f) => f.name),
    'handleSubmit',
    '[JS] extracts handleSubmit function',
  );
  assertContains(
    jsAppResult.functions.map((f) => f.name),
    'handleSearch',
    '[JS] extracts handleSearch function',
  );
  assertContains(
    jsAppResult.functions.map((f) => f.name),
    'filterResults',
    '[JS] extracts filterResults function',
  );

  // Class extraction
  assert(
    jsAppResult.classes.some((c) => c.name === 'App'),
    '[JS] extracts App class',
  );

  // Class method extraction
  assertContains(
    jsAppResult.functions.map((f) => f.qualifiedName),
    'App.constructor',
    '[JS] extracts App.constructor',
  );
  assertContains(
    jsAppResult.functions.map((f) => f.qualifiedName),
    'App.fetchUsers',
    '[JS] extracts App.fetchUsers',
  );
  assertContains(
    jsAppResult.functions.map((f) => f.qualifiedName),
    'App.render',
    '[JS] extracts App.render',
  );

  // ES6 import parsing
  assert(
    jsAppResult.imports.some((i) => i.type === 'es6-import' && i.module === './utils.js'),
    '[JS] parses ES6 import from utils.js',
  );
  assert(
    jsAppResult.imports.some((i) => i.type === 'es6-import' && i.module === './components.js'),
    '[JS] parses ES6 import from components.js',
  );

  // Function calls
  const jsSetupCalls = jsAppResult.calls.filter((c) => c.caller === 'setupEvents');
  assert(jsSetupCalls.length > 0, '[JS] setupEvents has function calls');

  // DOM access tracking
  assert(jsAppResult.domAccesses.length > 0, '[JS] detects DOM accesses');
  assert(
    jsAppResult.domAccesses.some((d) => d.method === 'getElementById' && d.query === 'app'),
    '[JS] detects getElementById("app")',
  );
  assert(
    jsAppResult.domAccesses.some((d) => d.method === 'querySelector' && d.query === '.header'),
    '[JS] detects querySelector(".header")',
  );
  assert(
    jsAppResult.domAccesses.some((d) => d.method === 'getElementById' && d.query === 'submit-btn'),
    '[JS] detects getElementById("submit-btn")',
  );

  // Event binding tracking
  assert(jsAppResult.eventBindings.length > 0, '[JS] detects event bindings');
  assert(
    jsAppResult.eventBindings.some((e) => e.eventType === 'click'),
    '[JS] detects click event binding',
  );
  assert(
    jsAppResult.eventBindings.some((e) => e.eventType === 'input'),
    '[JS] detects input event binding',
  );

  // classList tracking
  assert(
    jsAppResult.domAccesses.some((d) => d.method === 'classList.add' && d.query === 'active'),
    '[JS] detects classList.add("active")',
  );

  // utils.js - CommonJS require
  const jsUtilsCode = fs.readFileSync(path.join(jsFixturesDir, 'utils.js'), 'utf-8');
  const jsUtilsResult = parseFile(jsUtilsCode, 'utils.js', 'javascript');

  assertContains(
    jsUtilsResult.functions.map((f) => f.name),
    'formatDate',
    '[JS] extracts formatDate function',
  );
  assertContains(
    jsUtilsResult.functions.map((f) => f.name),
    'debounce',
    '[JS] extracts debounce function',
  );
  assertContains(
    jsUtilsResult.functions.map((f) => f.name),
    'deepClone',
    '[JS] extracts deepClone function',
  );
  assertContains(
    jsUtilsResult.functions.map((f) => f.name),
    'validateEmail',
    '[JS] extracts validateEmail function',
  );

  // CommonJS require parsing
  assert(
    jsUtilsResult.imports.some((i) => i.type === 'commonjs-require' && i.module === 'events'),
    '[JS] parses CommonJS require("events")',
  );

  // components.js - class inheritance
  const jsCompCode = fs.readFileSync(path.join(jsFixturesDir, 'components.js'), 'utf-8');
  const jsCompResult = parseFile(jsCompCode, 'components.js', 'javascript');

  assert(
    jsCompResult.classes.some((c) => c.name === 'Component'),
    '[JS] extracts Component class',
  );
  assert(
    jsCompResult.classes.some((c) => c.name === 'UserCard'),
    '[JS] extracts UserCard class',
  );
  assert(
    jsCompResult.classes.some((c) => c.name === 'AdminCard'),
    '[JS] extracts AdminCard class',
  );

  // Class inheritance
  const jsAdminClass = jsCompResult.classes.find((c) => c.name === 'AdminCard');
  assert(
    jsAdminClass && jsAdminClass.superclasses.includes('UserCard'),
    '[JS] AdminCard extends UserCard',
  );

  const jsUserCardClass = jsCompResult.classes.find((c) => c.name === 'UserCard');
  assert(
    jsUserCardClass && jsUserCardClass.superclasses.includes('Component'),
    '[JS] UserCard extends Component',
  );

  // Class methods
  assertContains(
    jsCompResult.functions.map((f) => f.qualifiedName),
    'Component.mount',
    '[JS] extracts Component.mount',
  );
  assertContains(
    jsCompResult.functions.map((f) => f.qualifiedName),
    'Component.destroy',
    '[JS] extracts Component.destroy',
  );
  assertContains(
    jsCompResult.functions.map((f) => f.qualifiedName),
    'UserCard.render',
    '[JS] extracts UserCard.render',
  );
  assertContains(
    jsCompResult.functions.map((f) => f.qualifiedName),
    'UserCard.bindEvents',
    '[JS] extracts UserCard.bindEvents',
  );

  // Arrow function as class field
  assertContains(
    jsCompResult.functions.map((f) => f.qualifiedName),
    'UserCard.handleDelete',
    '[JS] extracts arrow function field UserCard.handleDelete',
  );

  // --- HTML Parser Tests ---
  expect(failures).toEqual([]);
});

test('HTML Parser', async () => {
  const htmlCode = fs.readFileSync(path.join(webFixturesDir, 'index.html'), 'utf-8');
  const htmlResult = parseFile(htmlCode, 'index.html', 'html');

  // Element extraction
  assert(htmlResult.elements.length > 0, '[HTML] extracts elements');

  // ID-based elements
  assert(
    htmlResult.elements.some((e) => e.id === 'main-header'),
    '[HTML] extracts element with id="main-header"',
  );
  assert(
    htmlResult.elements.some((e) => e.id === 'content'),
    '[HTML] extracts element with id="content"',
  );
  assert(
    htmlResult.elements.some((e) => e.id === 'search-input'),
    '[HTML] extracts element with id="search-input"',
  );
  assert(
    htmlResult.elements.some((e) => e.id === 'search-btn'),
    '[HTML] extracts element with id="search-btn"',
  );
  assert(
    htmlResult.elements.some((e) => e.id === 'results'),
    '[HTML] extracts element with id="results"',
  );
  assert(
    htmlResult.elements.some((e) => e.id === 'contact-form'),
    '[HTML] extracts element with id="contact-form"',
  );
  assert(
    htmlResult.elements.some((e) => e.id === 'footer'),
    '[HTML] extracts element with id="footer"',
  );

  // Class-based elements
  assert(
    htmlResult.elements.some((e) => e.classes.includes('header')),
    '[HTML] extracts element with class="header"',
  );
  assert(
    htmlResult.elements.some((e) => e.classes.includes('nav-bar')),
    '[HTML] extracts element with class="nav-bar"',
  );
  assert(
    htmlResult.elements.some((e) => e.classes.includes('nav-item')),
    '[HTML] extracts element with class="nav-item"',
  );
  assert(
    htmlResult.elements.some((e) => e.classes.includes('btn')),
    '[HTML] extracts element with class="btn"',
  );

  // data-* attributes
  const navBarElem = htmlResult.elements.find((e) => e.classes.includes('nav-bar'));
  assert(
    navBarElem && navBarElem.dataAttrs && navBarElem.dataAttrs['data-role'] === 'navigation',
    '[HTML] extracts data-role attribute',
  );

  const searchInputElem = htmlResult.elements.find((e) => e.id === 'search-input');
  assert(
    searchInputElem &&
      searchInputElem.dataAttrs &&
      searchInputElem.dataAttrs['data-validate'] === 'required',
    '[HTML] extracts data-validate attribute',
  );

  // Script/style references
  assert(
    htmlResult.imports.some((i) => i.type === 'script-ref' && i.href === 'app.js'),
    '[HTML] extracts script src reference',
  );
  assert(
    htmlResult.imports.some((i) => i.type === 'style-ref' && i.href === 'style.css'),
    '[HTML] extracts stylesheet link reference',
  );

  // Inline event handlers
  assert(htmlResult.eventBindings.length > 0, '[HTML] extracts inline event handlers');
  assert(
    htmlResult.eventBindings.some(
      (e) => e.eventType === 'click' && e.handler.includes('handleSearch'),
    ),
    '[HTML] extracts onclick="handleSearch()"',
  );
  assert(
    htmlResult.eventBindings.some(
      (e) => e.eventType === 'submit' && e.handler.includes('handleFormSubmit'),
    ),
    '[HTML] extracts onsubmit handler',
  );

  // Inline scripts
  assert(
    htmlResult.inlineScripts && htmlResult.inlineScripts.length > 0,
    '[HTML] extracts inline scripts',
  );
  assert(
    htmlResult.inlineScripts.some((s) => s.code.includes('handleSearch')),
    '[HTML] inline script contains handleSearch',
  );

  // Inline styles
  assert(
    htmlResult.inlineStyles && htmlResult.inlineStyles.length > 0,
    '[HTML] extracts inline styles',
  );
  assert(
    htmlResult.inlineStyles.some((s) => s.code.includes('inline-highlight')),
    '[HTML] inline style contains .inline-highlight',
  );

  // --- CSS Parser Tests ---
  expect(failures).toEqual([]);
});

test('CSS Parser', async () => {
  const cssCode = fs.readFileSync(path.join(webFixturesDir, 'style.css'), 'utf-8');
  const cssResult = parseFile(cssCode, 'style.css', 'css');

  // Selector parsing
  assert(cssResult.selectors.length > 0, '[CSS] extracts selectors');

  // ID selectors
  assert(
    cssResult.selectors.some((s) => s.ids.includes('main-header')),
    '[CSS] extracts #main-header selector',
  );
  assert(
    cssResult.selectors.some((s) => s.ids.includes('search-input')),
    '[CSS] extracts #search-input selector',
  );
  assert(
    cssResult.selectors.some((s) => s.ids.includes('contact-form')),
    '[CSS] extracts #contact-form selector',
  );

  // Class selectors
  assert(
    cssResult.selectors.some((s) => s.classes.includes('header')),
    '[CSS] extracts .header selector',
  );
  assert(
    cssResult.selectors.some((s) => s.classes.includes('nav-bar')),
    '[CSS] extracts .nav-bar selector',
  );
  assert(
    cssResult.selectors.some((s) => s.classes.includes('nav-item')),
    '[CSS] extracts .nav-item selector',
  );
  assert(
    cssResult.selectors.some((s) => s.classes.includes('btn')),
    '[CSS] extracts .btn selector',
  );

  // Tag selectors
  assert(
    cssResult.selectors.some((s) => s.tags.includes('body')),
    '[CSS] extracts body tag selector',
  );

  // Attribute selectors
  assert(
    cssResult.selectors.some((s) => s.attributes.includes('data-validate')),
    '[CSS] extracts [data-validate] attribute selector',
  );

  // CSS variable definitions
  assert(cssResult.variables.length > 0, '[CSS] extracts CSS variables');
  assert(
    cssResult.variables.some((v) => v.name === '--primary-color'),
    '[CSS] extracts --primary-color variable',
  );
  assert(
    cssResult.variables.some((v) => v.name === '--secondary-color'),
    '[CSS] extracts --secondary-color variable',
  );
  assert(
    cssResult.variables.some((v) => v.name === '--font-size-base'),
    '[CSS] extracts --font-size-base variable',
  );
  assert(
    cssResult.variables.some((v) => v.name === '--spacing-unit'),
    '[CSS] extracts --spacing-unit variable',
  );

  // CSS variable references
  assert(cssResult.variableRefs.length > 0, '[CSS] extracts CSS variable references');
  assert(
    cssResult.variableRefs.some((r) => r.variable === '--primary-color'),
    '[CSS] references --primary-color',
  );
  assert(
    cssResult.variableRefs.some((r) => r.variable === '--font-size-base'),
    '[CSS] references --font-size-base',
  );
  assert(
    cssResult.variableRefs.some((r) => r.variable === '--spacing-unit'),
    '[CSS] references --spacing-unit',
  );

  // @keyframes extraction
  assert(cssResult.functions.length > 0, '[CSS] extracts @keyframes');
  assert(
    cssResult.functions.some((f) => f.name === 'fadeIn'),
    '[CSS] extracts @keyframes fadeIn',
  );
  assert(
    cssResult.functions.some((f) => f.name === 'slideUp'),
    '[CSS] extracts @keyframes slideUp',
  );
  assert(
    cssResult.functions.some((f) => f.type === 'css-keyframes'),
    '[CSS] keyframes have type css-keyframes',
  );

  // @import extraction
  assert(cssResult.imports.length > 0, '[CSS] extracts @import');
  assert(
    cssResult.imports.some((i) => i.href.includes('fonts.googleapis.com')),
    '[CSS] extracts Google Fonts @import',
  );
  assert(
    cssResult.imports.some((i) => i.href === 'reset.css'),
    '[CSS] extracts reset.css @import',
  );

  // --- Web Project GraphBuilder Test ---
  expect(failures).toEqual([]);
});

test('Web Project GraphBuilder', async () => {
  const webGraph = await buildGraph(webFixturesDir);
  assert(Array.isArray(webGraph.nodes), '[Web] graph has nodes');
  assert(webGraph.fileCounts.html > 0, '[Web] fileCounts has html');
  assert(webGraph.fileCounts.css > 0, '[Web] fileCounts has css');
  assert(webGraph.fileCounts.javascript > 0, '[Web] fileCounts has javascript');

  // JS functions should be in graph
  const jsWebFuncNodes = webGraph.nodes.filter((n) => n.data.type === 'js-function');
  assert(jsWebFuncNodes.length > 0, '[Web] graph has js-function nodes');

  // JS inheritance edges should be generated
  assert(webGraph.inheritanceEdges.length >= 0, '[Web] graph has inheritanceEdges array');

  // --- JS Project GraphBuilder Test (cross-file resolution) ---
  expect(failures).toEqual([]);
});

test('JS Project GraphBuilder', async () => {
  const jsGraph = await buildGraph(jsFixturesDir);
  assert(jsGraph.fileCounts.javascript > 0, '[JS Graph] fileCounts has javascript');

  // JS class inheritance edges
  assert(jsGraph.inheritanceEdges.length > 0, '[JS Graph] has inheritance edges');
  assert(
    jsGraph.inheritanceEdges.some(
      (e) => e.source.includes('AdminCard') && e.target.includes('UserCard'),
    ),
    '[JS Graph] AdminCard → UserCard inheritance edge',
  );
  assert(
    jsGraph.inheritanceEdges.some(
      (e) => e.source.includes('UserCard') && e.target.includes('Component'),
    ),
    '[JS Graph] UserCard → Component inheritance edge',
  );

  // --- Edge Case Tests ---
  expect(failures).toEqual([]);
});

test('Edge Case', async () => {
  // Empty file parsing
  const emptyPyResult = parseFile('', 'empty.py');
  assert(emptyPyResult.functions.length === 0, '[Edge] empty Python file has no functions');
  assert(emptyPyResult.calls.length === 0, '[Edge] empty Python file has no calls');
  assert(emptyPyResult.imports.length === 0, '[Edge] empty Python file has no imports');

  const emptyJsResult = parseFile('', 'empty.js', 'javascript');
  assert(emptyJsResult.functions.length === 0, '[Edge] empty JS file has no functions');

  const emptyHtmlResult = parseFile('', 'empty.html', 'html');
  assert(emptyHtmlResult.elements.length === 0, '[Edge] empty HTML file has no elements');

  const emptyCssResult = parseFile('', 'empty.css', 'css');
  assert(emptyCssResult.selectors.length === 0, '[Edge] empty CSS file has no selectors');

  const emptyCppResult = parseFile('', 'empty.cpp', 'cpp');
  assert(emptyCppResult.functions.length === 0, '[Edge] empty C++ file has no functions');

  const emptyCsResult = parseFile('', 'empty.cs', 'csharp');
  assert(emptyCsResult.functions.length === 0, '[Edge] empty C# file has no functions');

  const emptyJavaResult = parseFile('', 'empty.java', 'java');
  assert(emptyJavaResult.functions.length === 0, '[Edge] empty Java file has no functions');

  const badJavaResult = parseFile(
    'class A {\n  void ok() { run(); }\n  void bad( {\n  void ok2() {}\n}',
    'Bad.java',
    'java',
  );
  assert(
    badJavaResult.functions.some((f) => f.qualifiedName === 'A.ok'),
    '[Edge] Java parser extracts methods from partially invalid code',
  );

  // Syntax error resilience (tree-sitter is partial-parsing capable)
  const badPyCode = `
def good_func():
    return 42

def bad_func(:
    ???

def another_good():
    return 99
`;
  const badPyResult = parseFile(badPyCode, 'bad.py');
  assert(
    badPyResult.functions.length >= 2,
    '[Edge] Python parser extracts functions from partially invalid code',
  );

  const badJsCode = `
function goodFunc() { return 1; }
function badFunc( { ??? }
function anotherGood() { return 2; }
`;
  const badJsResult = parseFile(badJsCode, 'bad.js', 'javascript');
  assert(
    badJsResult.functions.length >= 1,
    '[Edge] JS parser extracts functions from partially invalid code',
  );

  // Nested classes (Python)
  const nestedPyCode = `
class Outer:
    class Inner:
        def inner_method(self):
            pass

    def outer_method(self):
        pass
`;
  const nestedPyResult = parseFile(nestedPyCode, 'nested.py');
  assert(
    nestedPyResult.classes.some((c) => c.name === 'Outer'),
    '[Edge] Python extracts outer class',
  );
  assert(
    nestedPyResult.classes.some((c) => c.name === 'Inner'),
    '[Edge] Python extracts inner class',
  );
  assert(
    nestedPyResult.functions.some((f) => f.qualifiedName === 'Inner.inner_method'),
    '[Edge] Python extracts inner class method',
  );
  assert(
    nestedPyResult.functions.some((f) => f.qualifiedName === 'Outer.outer_method'),
    '[Edge] Python extracts outer class method',
  );

  // Decorated function (Python)
  const decoratedPyCode = `
def my_decorator(func):
    def wrapper(*args):
        return func(*args)
    return wrapper

@my_decorator
def decorated_func():
    return 42
`;
  const decoratedPyResult = parseFile(decoratedPyCode, 'decorated.py');
  assertContains(
    decoratedPyResult.functions.map((f) => f.name),
    'decorated_func',
    '[Edge] Python extracts decorated function',
  );
  assertContains(
    decoratedPyResult.functions.map((f) => f.name),
    'my_decorator',
    '[Edge] Python extracts decorator function',
  );

  // Multiple inheritance (Python)
  const multiInheritPyCode = `
class Base1:
    def method1(self):
        pass

class Base2:
    def method2(self):
        pass

class Child(Base1, Base2):
    def child_method(self):
        pass
`;
  const multiInheritResult = parseFile(multiInheritPyCode, 'multi_inherit.py');
  const childClass = multiInheritResult.classes.find((c) => c.name === 'Child');
  assertDefined(childClass, '[Edge] Python extracts Child class with multiple inheritance');
  assert(childClass && childClass.superclasses.includes('Base1'), '[Edge] Child inherits Base1');
  assert(childClass && childClass.superclasses.includes('Base2'), '[Edge] Child inherits Base2');

  // Comment-only file
  const commentOnlyPy = `# This is a comment-only file\n# Nothing to see here\n`;
  const commentOnlyResult = parseFile(commentOnlyPy, 'comments.py');
  assert(
    commentOnlyResult.functions.length === 0,
    '[Edge] comment-only Python file has no functions',
  );

  // --- TypeScript Parser Tests ---
  expect(failures).toEqual([]);
});

test('TypeScript Parser', async () => {
  // models.ts - interfaces, type aliases, enums
  const tsModelsCode = fs.readFileSync(path.join(tsFixturesDir, 'models.ts'), 'utf-8');
  const tsModelsResult = parseFile(tsModelsCode, 'models.ts', 'typescript');

  // Interface extraction (interfaces are also added to classes for graph compatibility)
  assert(
    tsModelsResult.classes.some((c) => c.name === 'User'),
    '[TS] extracts User interface as class',
  );
  assert(
    tsModelsResult.classes.some((c) => c.name === 'Admin'),
    '[TS] extracts Admin interface as class',
  );

  // Interface inheritance
  const tsAdminClass = tsModelsResult.classes.find((c) => c.name === 'Admin');
  assert(tsAdminClass && tsAdminClass.superclasses.includes('User'), '[TS] Admin extends User');

  // Interface objects
  assert(
    tsModelsResult.interfaces && tsModelsResult.interfaces.some((i) => i.name === 'User'),
    '[TS] extracts User interface object',
  );
  assert(
    tsModelsResult.interfaces && tsModelsResult.interfaces.some((i) => i.name === 'Admin'),
    '[TS] extracts Admin interface object',
  );

  // Type alias extraction
  assert(
    tsModelsResult.typeAliases && tsModelsResult.typeAliases.some((t) => t.name === 'UserRole'),
    '[TS] extracts UserRole type alias',
  );
  assert(
    tsModelsResult.typeAliases && tsModelsResult.typeAliases.some((t) => t.name === 'ApiResponse'),
    '[TS] extracts ApiResponse type alias',
  );

  // Enum extraction
  assert(
    tsModelsResult.enums && tsModelsResult.enums.some((e) => e.name === 'Status'),
    '[TS] extracts Status enum',
  );
  assert(
    tsModelsResult.enums && tsModelsResult.enums.some((e) => e.name === 'HttpMethod'),
    '[TS] extracts HttpMethod enum',
  );

  // Enums as classes
  assert(
    tsModelsResult.classes.some((c) => c.name === 'Status'),
    '[TS] Status enum in classes list',
  );
  assert(
    tsModelsResult.classes.some((c) => c.name === 'HttpMethod'),
    '[TS] HttpMethod enum in classes list',
  );

  // service.ts - classes, generics, implements, extends, async
  const tsServiceCode = fs.readFileSync(path.join(tsFixturesDir, 'service.ts'), 'utf-8');
  const tsServiceResult = parseFile(tsServiceCode, 'service.ts', 'typescript');

  // ES6 import parsing
  assert(
    tsServiceResult.imports.some((i) => i.type === 'es6-import' && i.module === './models'),
    '[TS] parses ES6 import from ./models',
  );

  // Class extraction
  assert(
    tsServiceResult.classes.some((c) => c.name === 'BaseService'),
    '[TS] extracts BaseService class',
  );
  assert(
    tsServiceResult.classes.some((c) => c.name === 'UserService'),
    '[TS] extracts UserService class',
  );

  // Class inheritance (extends + implements)
  const tsUserServiceClass = tsServiceResult.classes.find((c) => c.name === 'UserService');
  assert(
    tsUserServiceClass && tsUserServiceClass.superclasses.includes('BaseService'),
    '[TS] UserService extends BaseService',
  );

  // Method extraction
  assertContains(
    tsServiceResult.functions.map((f) => f.qualifiedName),
    'BaseService.constructor',
    '[TS] extracts BaseService.constructor',
  );
  assertContains(
    tsServiceResult.functions.map((f) => f.qualifiedName),
    'BaseService.request',
    '[TS] extracts BaseService.request',
  );
  assertContains(
    tsServiceResult.functions.map((f) => f.qualifiedName),
    'UserService.constructor',
    '[TS] extracts UserService.constructor',
  );
  assertContains(
    tsServiceResult.functions.map((f) => f.qualifiedName),
    'UserService.findById',
    '[TS] extracts UserService.findById',
  );
  assertContains(
    tsServiceResult.functions.map((f) => f.qualifiedName),
    'UserService.findAll',
    '[TS] extracts UserService.findAll',
  );
  assertContains(
    tsServiceResult.functions.map((f) => f.qualifiedName),
    'UserService.save',
    '[TS] extracts UserService.save',
  );
  assertContains(
    tsServiceResult.functions.map((f) => f.qualifiedName),
    'UserService.delete',
    '[TS] extracts UserService.delete',
  );
  assertContains(
    tsServiceResult.functions.map((f) => f.qualifiedName),
    'UserService.isActive',
    '[TS] extracts UserService.isActive',
  );

  // Top-level functions
  assertContains(
    tsServiceResult.functions.map((f) => f.name),
    'isAdmin',
    '[TS] extracts isAdmin type guard function',
  );
  assertContains(
    tsServiceResult.functions.map((f) => f.name),
    'createUser',
    '[TS] extracts createUser function',
  );
  assertContains(
    tsServiceResult.functions.map((f) => f.name),
    'formatUser',
    '[TS] extracts formatUser arrow function',
  );

  // Interface in service
  assert(
    tsServiceResult.interfaces && tsServiceResult.interfaces.some((i) => i.name === 'Repository'),
    '[TS] extracts Repository interface',
  );

  // Function calls
  const tsFindByIdCalls = tsServiceResult.calls.filter((c) => c.caller === 'UserService.findById');
  assert(
    tsFindByIdCalls.some((c) => c.callee.includes('request')),
    '[TS] UserService.findById calls request',
  );

  // utils.ts - generics, arrow functions
  const tsUtilsCode = fs.readFileSync(path.join(tsFixturesDir, 'utils.ts'), 'utf-8');
  const tsUtilsResult = parseFile(tsUtilsCode, 'utils.ts', 'typescript');

  assertContains(
    tsUtilsResult.functions.map((f) => f.name),
    'filterItems',
    '[TS] extracts filterItems generic function',
  );
  assertContains(
    tsUtilsResult.functions.map((f) => f.name),
    'groupBy',
    '[TS] extracts groupBy generic function',
  );
  assertContains(
    tsUtilsResult.functions.map((f) => f.name),
    'retry',
    '[TS] extracts retry async generic function',
  );
  assertContains(
    tsUtilsResult.functions.map((f) => f.name),
    'debounce',
    '[TS] extracts debounce arrow function',
  );

  // Type alias
  assert(
    tsUtilsResult.typeAliases && tsUtilsResult.typeAliases.some((t) => t.name === 'Predicate'),
    '[TS] extracts Predicate type alias',
  );

  // Empty TS file
  const emptyTsResult = parseFile('', 'empty.ts', 'typescript');
  assert(emptyTsResult.functions.length === 0, '[TS] empty TS file has no functions');
  assert(emptyTsResult.classes.length === 0, '[TS] empty TS file has no classes');

  // --- TypeScript GraphBuilder Test ---
  expect(failures).toEqual([]);
});

test('TypeScript GraphBuilder', async () => {
  const tsGraph = await buildGraph(tsFixturesDir);
  assert(Array.isArray(tsGraph.nodes), '[TS] graph has nodes');
  assert(
    tsGraph.nodes.filter((n) => n.data.type === 'function').length > 0,
    '[TS] graph has function nodes',
  );
  assert(tsGraph.fileCounts.typescript > 0, '[TS] fileCounts has typescript');

  // --- Inline Script Event Binding Test (익명 핸들러 null 회귀) ---
  expect(failures).toEqual([]);
});

test('Inline Script Event Binding', async () => {
  let inlineGraph = null;
  try {
    inlineGraph = await buildGraph(path.join(FIXTURES, 'inline_script_project'));
  } catch (err) {
    console.error('  ERROR:', err.message);
  }
  assert(
    inlineGraph !== null,
    '[Inline] anonymous addEventListener handler does not crash buildGraph',
  );
  if (inlineGraph) {
    const onclickEdge = inlineGraph.webEdges.find(
      (e) => e.type === 'event-binding' && e.target.endsWith('::handleSave'),
    );
    assert(onclickEdge !== undefined, '[Inline] onclick attribute still links to handleSave');
  }

  expect(failures).toEqual([]);
});
