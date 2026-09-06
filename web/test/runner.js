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

const graph = buildGraph(fixturesDir);

assert(Array.isArray(graph.nodes), 'graph has nodes array');
assert(Array.isArray(graph.edges), 'graph has edges array');

const fileNodes = graph.nodes.filter(n => n.data.type === 'file');
assert(fileNodes.length >= 3, 'at least 3 file nodes');
assertContains(fileNodes.map(n => n.data.id), 'main.py', 'has main.py file node');

const funcNodes = graph.nodes.filter(n => n.data.type === 'function');
assert(funcNodes.length > 0, 'has function nodes');

for (const node of funcNodes) {
  assertDefined(node.data.parent, `function ${node.data.id} has parent`);
  assertDefined(node.data.code, `function ${node.data.id} has code`);
}

assert(graph.edges.length > 0, 'has edges');

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
