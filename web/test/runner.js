const fs = require('fs');
const path = require('path');
const { parseFile } = require('../server/services/parser');
const { resolveCalls } = require('../server/services/resolver');
const { buildGraph } = require('../server/services/graphBuilder');

const fixturesDir = path.join(__dirname, 'fixtures', 'sample_project');
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) {
    failed++;
    console.error(`  FAIL: ${msg}`);
  } else {
    passed++;
    console.log(`  PASS: ${msg}`);
  }
}

function assertContains(arr, val, msg) {
  assert(arr.includes(val), msg);
}

function assertDefined(val, msg) {
  assert(val !== undefined && val !== null, msg);
}

// --- Parser Tests ---
console.log('\n=== Parser Tests ===');

const mainCode = fs.readFileSync(path.join(fixturesDir, 'main.py'), 'utf-8');
const mainResult = parseFile(mainCode, 'main.py');

assertContains(mainResult.functions.map(f => f.name), 'main', 'extracts main function');
assertContains(mainResult.functions.map(f => f.name), 'process_data', 'extracts process_data function');
assertContains(mainResult.functions.map(f => f.name), 'clean', 'extracts clean function');

const mainFunc = mainResult.functions.find(f => f.name === 'main');
assert(mainFunc.docstring.includes('Entry point'), 'extracts main docstring');

const cleanFunc = mainResult.functions.find(f => f.name === 'clean');
assert(cleanFunc.docstring.includes('whitespace'), 'extracts clean docstring');

const mainCalls = mainResult.calls.filter(c => c.caller === 'main');
assertContains(mainCalls.map(c => c.callee), 'helper_func', 'main calls helper_func');
assertContains(mainCalls.map(c => c.callee), 'add', 'main calls add');

assertContains(mainResult.imports.map(i => i.name), 'helper_func', 'imports helper_func');
assertContains(mainResult.imports.map(i => i.name), 'add', 'imports add');

const mathCode = fs.readFileSync(path.join(fixturesDir, 'math_ops.py'), 'utf-8');
const mathResult = parseFile(mathCode, 'math_ops.py');
assertContains(mathResult.functions.map(f => f.qualifiedName), 'Calculator.add', 'extracts Calculator.add');
assertContains(mathResult.functions.map(f => f.qualifiedName), 'Calculator.multiply', 'extracts Calculator.multiply');

assert(mainFunc.startLine > 0, 'start line > 0');
assert(mainFunc.endLine >= mainFunc.startLine, 'end line >= start line');

// --- Resolver Tests ---
console.log('\n=== Resolver Tests ===');

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

const cleanEdge = edges.find(e => e.source === 'main.py::process_data' && e.target === 'main.py::clean');
assertDefined(cleanEdge, 'resolves same-file call process_data->clean');

const helperEdge = edges.find(e => e.source === 'main.py::main' && e.target === 'utils.py::helper_func');
assertDefined(helperEdge, 'resolves cross-file call main->helper_func');

const addEdge = edges.find(e => e.source === 'main.py::main' && e.target.includes('add'));
assertDefined(addEdge, 'resolves cross-file call main->add');

const printEdge = edges.find(e => e.target && e.target.includes('print'));
assert(!printEdge, 'no edge for built-in print');

for (const edge of edges) {
  assert(edge.references.length > 0, `edge ${edge.source}->${edge.target} has references`);
}

// --- GraphBuilder Tests ---
console.log('\n=== GraphBuilder Tests ===');

(async () => {
  const graph = await buildGraph(fixturesDir);

  assert(Array.isArray(graph.nodes), 'graph has nodes array');
  assert(Array.isArray(graph.edges), 'graph has edges array');

  const fileNodes = graph.nodes.filter(n => n.data.type === 'file');
  assert(fileNodes.length >= 3, 'at least 3 file nodes');

  const funcNodes = graph.nodes.filter(n => n.data.type === 'function');
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
  console.log('\n=== C++ Parser Tests ===');

  const cppFixturesDir = path.join(__dirname, 'fixtures', 'cpp_project');

  const cppMainCode = fs.readFileSync(path.join(cppFixturesDir, 'main.cpp'), 'utf-8');
  const cppMainResult = parseFile(cppMainCode, 'main.cpp', 'cpp');

  assertContains(cppMainResult.functions.map(f => f.name), 'main', '[C++] extracts main function');
  assert(cppMainResult.imports.length >= 2, '[C++] extracts #include directives');
  assertContains(cppMainResult.imports.map(i => i.name), 'calculator.h', '[C++] includes calculator.h');
  assertContains(cppMainResult.imports.map(i => i.name), 'utils.h', '[C++] includes utils.h');

  const cppMainCalls = cppMainResult.calls.filter(c => c.caller === 'main');
  assert(cppMainCalls.length > 0, '[C++] main has function calls');
  assert(cppMainCalls.some(c => c.callee.includes('add')), '[C++] main calls add');
  assert(cppMainCalls.some(c => c.callee === 'parse_number'), '[C++] main calls parse_number');

  const cppCalcCode = fs.readFileSync(path.join(cppFixturesDir, 'calculator.cpp'), 'utf-8');
  const cppCalcResult = parseFile(cppCalcCode, 'calculator.cpp', 'cpp');

  //클래스 메서드 추출 확인 (Calculator::add → Calculator.add)
  assertContains(cppCalcResult.functions.map(f => f.qualifiedName), 'Calculator.add', '[C++] extracts Calculator.add');
  assertContains(cppCalcResult.functions.map(f => f.qualifiedName), 'Calculator.multiply', '[C++] extracts Calculator.multiply');
  assertContains(cppCalcResult.functions.map(f => f.qualifiedName), 'ScientificCalculator.power', '[C++] extracts ScientificCalculator.power');

  //클래스 및 상속
  const cppCalcHCode = fs.readFileSync(path.join(cppFixturesDir, 'calculator.h'), 'utf-8');
  const cppCalcHResult = parseFile(cppCalcHCode, 'calculator.h', 'cpp');

  assert(cppCalcHResult.classes.length >= 2, '[C++] extracts classes from header');
  const cppSciClass = cppCalcHResult.classes.find(c => c.name === 'ScientificCalculator');
  assertDefined(cppSciClass, '[C++] extracts ScientificCalculator class');
  assert(cppSciClass && cppSciClass.superclasses.includes('Calculator'), '[C++] ScientificCalculator inherits Calculator');

  //변수 추출
  const cppCalcClass = cppCalcHResult.classes.find(c => c.name === 'Calculator');
  assertDefined(cppCalcClass, '[C++] extracts Calculator class');
  assert(cppCalcHResult.variables.some(v => v.name === 'Calculator.value'), '[C++] extracts Calculator.value field');

  //utils.cpp 함수-호출 관계
  const cppUtilsCode = fs.readFileSync(path.join(cppFixturesDir, 'utils.cpp'), 'utf-8');
  const cppUtilsResult = parseFile(cppUtilsCode, 'utils.cpp', 'cpp');

  assertContains(cppUtilsResult.functions.map(f => f.name), 'trim', '[C++] extracts trim function');
  assertContains(cppUtilsResult.functions.map(f => f.name), 'parse_number', '[C++] extracts parse_number function');
  const cppParseNumCalls = cppUtilsResult.calls.filter(c => c.caller === 'parse_number');
  assert(cppParseNumCalls.some(c => c.callee === 'trim'), '[C++] parse_number calls trim');

  // --- C++ GraphBuilder Test ---
  console.log('\n=== C++ GraphBuilder Tests ===');

  const cppGraph = await buildGraph(cppFixturesDir);
  assert(Array.isArray(cppGraph.nodes), '[C++] graph has nodes');
  assert(cppGraph.nodes.filter(n => n.data.type === 'function').length > 0, '[C++] graph has function nodes');
  assert(cppGraph.fileCounts.cpp > 0, '[C++] fileCounts has cpp');

  // --- C# Parser Tests ---
  console.log('\n=== C# Parser Tests ===');

  const csFixturesDir = path.join(__dirname, 'fixtures', 'csharp_project');

  const csProgramCode = fs.readFileSync(path.join(csFixturesDir, 'Program.cs'), 'utf-8');
  const csProgramResult = parseFile(csProgramCode, 'Program.cs', 'csharp');

  assertContains(csProgramResult.functions.map(f => f.name), 'Main', '[C#] extracts Main method');
  assert(csProgramResult.imports.length >= 1, '[C#] extracts using directives');

  const csMainCalls = csProgramResult.calls.filter(c => c.caller === 'Program.Main');
  assert(csMainCalls.length > 0, '[C#] Main has method calls');

  const csCalcCode = fs.readFileSync(path.join(csFixturesDir, 'Calculator.cs'), 'utf-8');
  const csCalcResult = parseFile(csCalcCode, 'Calculator.cs', 'csharp');

  //클래스 메서드 추출
  assertContains(csCalcResult.functions.map(f => f.qualifiedName), 'Calculator.Add', '[C#] extracts Calculator.Add');
  assertContains(csCalcResult.functions.map(f => f.qualifiedName), 'Calculator.Multiply', '[C#] extracts Calculator.Multiply');
  assertContains(csCalcResult.functions.map(f => f.qualifiedName), 'ScientificCalculator.Power', '[C#] extracts ScientificCalculator.Power');

  //클래스 및 상속
  assert(csCalcResult.classes.length >= 2, '[C#] extracts classes');
  const csSciClass = csCalcResult.classes.find(c => c.name === 'ScientificCalculator');
  assertDefined(csSciClass, '[C#] extracts ScientificCalculator class');
  assert(csSciClass && csSciClass.superclasses.includes('Calculator'), '[C#] ScientificCalculator inherits Calculator');

  //프로퍼티를 변수로 추출
  assert(csCalcResult.variables.some(v => v.name === 'Calculator.Value'), '[C#] extracts Calculator.Value property');

  //생성자 추출
  assertContains(csCalcResult.functions.map(f => f.qualifiedName), 'Calculator.Calculator', '[C#] extracts Calculator constructor');

  //Utils.cs
  const csUtilsCode = fs.readFileSync(path.join(csFixturesDir, 'Utils.cs'), 'utf-8');
  const csUtilsResult = parseFile(csUtilsCode, 'Utils.cs', 'csharp');

  assertContains(csUtilsResult.functions.map(f => f.name), 'Trim', '[C#] extracts Trim method');
  assertContains(csUtilsResult.functions.map(f => f.name), 'ParseNumber', '[C#] extracts ParseNumber method');
  const csParseNumCalls = csUtilsResult.calls.filter(c => c.caller === 'Utils.ParseNumber');
  assert(csParseNumCalls.some(c => c.callee === 'Trim'), '[C#] ParseNumber calls Trim');

  // --- C# GraphBuilder Test ---
  console.log('\n=== C# GraphBuilder Tests ===');

  const csGraph = await buildGraph(csFixturesDir);
  assert(Array.isArray(csGraph.nodes), '[C#] graph has nodes');
  assert(csGraph.nodes.filter(n => n.data.type === 'function').length > 0, '[C#] graph has function nodes');
  assert(csGraph.fileCounts.csharp > 0, '[C#] fileCounts has csharp');

  // --- Summary ---
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})();
