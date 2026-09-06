const fs = require('fs');
const path = require('path');
const { parseFile } = require('../server/services/parser');
const { resolveCalls } = require('../server/services/resolver');

const fixturesDir = path.join(__dirname, 'fixtures', 'sample_project');

function parseFixture(filename) {
  const code = fs.readFileSync(path.join(fixturesDir, filename), 'utf-8');
  return parseFile(code, filename);
}

describe('resolver', () => {
  let allFunctions, allCalls, allImports;

  beforeAll(() => {
    allFunctions = [];
    allCalls = [];
    allImports = [];

    for (const file of ['main.py', 'utils.py', 'math_ops.py']) {
      const result = parseFixture(file);
      allFunctions.push(...result.functions);
      allCalls.push(...result.calls);
      allImports.push({ filePath: file, imports: result.imports });
    }
  });

  test('resolves same-file calls', () => {
    const edges = resolveCalls(allFunctions, allCalls, allImports);
    const cleanEdge = edges.find(e =>
      e.source === 'main.py::process_data' && e.target === 'main.py::clean'
    );
    expect(cleanEdge).toBeDefined();
  });

  test('resolves cross-file calls via imports', () => {
    const edges = resolveCalls(allFunctions, allCalls, allImports);
    const helperEdge = edges.find(e =>
      e.source === 'main.py::main' && e.target === 'utils.py::helper_func'
    );
    expect(helperEdge).toBeDefined();
  });

  test('resolves cross-file call to add function', () => {
    const edges = resolveCalls(allFunctions, allCalls, allImports);
    const addEdge = edges.find(e =>
      e.source === 'main.py::main' && e.target === 'math_ops.py::add'
    );
    expect(addEdge).toBeDefined();
  });

  test('aggregates references for same caller-callee pair', () => {
    const edges = resolveCalls(allFunctions, allCalls, allImports);
    for (const edge of edges) {
      expect(edge.references.length).toBeGreaterThan(0);
      expect(edge.references[0]).toHaveProperty('file');
      expect(edge.references[0]).toHaveProperty('line');
    }
  });

  test('does not create edges for built-in calls', () => {
    const edges = resolveCalls(allFunctions, allCalls, allImports);
    const printEdge = edges.find(e => e.target && e.target.includes('print'));
    expect(printEdge).toBeUndefined();
  });
});
