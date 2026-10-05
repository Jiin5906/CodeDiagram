const fs = require('fs');
const path = require('path');
const { parseFile } = require('../server/services/parser');

const fixturesDir = path.join(__dirname, 'fixtures', 'sample_project');

describe('parser', () => {
  test('extracts top-level functions from main.py', () => {
    const code = fs.readFileSync(path.join(fixturesDir, 'main.py'), 'utf-8');
    const result = parseFile(code, 'main.py');

    const funcNames = result.functions.map((f) => f.name);
    expect(funcNames).toContain('main');
    expect(funcNames).toContain('process_data');
    expect(funcNames).toContain('clean');
  });

  test('extracts docstrings', () => {
    const code = fs.readFileSync(path.join(fixturesDir, 'main.py'), 'utf-8');
    const result = parseFile(code, 'main.py');

    const mainFunc = result.functions.find((f) => f.name === 'main');
    expect(mainFunc.docstring).toContain('Entry point');

    const cleanFunc = result.functions.find((f) => f.name === 'clean');
    expect(cleanFunc.docstring).toContain('whitespace');
  });

  test('extracts comments above functions', () => {
    const code = fs.readFileSync(path.join(fixturesDir, 'main.py'), 'utf-8');
    const result = parseFile(code, 'main.py');

    const processFunc = result.functions.find((f) => f.name === 'process_data');
    expect(processFunc.comment).toContain('Process incoming');
  });

  test('extracts function calls', () => {
    const code = fs.readFileSync(path.join(fixturesDir, 'main.py'), 'utf-8');
    const result = parseFile(code, 'main.py');

    const mainCalls = result.calls.filter((c) => c.caller === 'main');
    const calleeNames = mainCalls.map((c) => c.callee);
    expect(calleeNames).toContain('helper_func');
    expect(calleeNames).toContain('add');
    expect(calleeNames).toContain('print');
  });

  test('extracts imports', () => {
    const code = fs.readFileSync(path.join(fixturesDir, 'main.py'), 'utf-8');
    const result = parseFile(code, 'main.py');

    const importNames = result.imports.map((i) => i.name);
    expect(importNames).toContain('helper_func');
    expect(importNames).toContain('add');
    expect(importNames).toContain('multiply');
  });

  test('extracts class methods with qualified names', () => {
    const code = fs.readFileSync(path.join(fixturesDir, 'math_ops.py'), 'utf-8');
    const result = parseFile(code, 'math_ops.py');

    const qualNames = result.functions.map((f) => f.qualifiedName);
    expect(qualNames).toContain('Calculator.add');
    expect(qualNames).toContain('Calculator.multiply');
    expect(qualNames).toContain('add');
    expect(qualNames).toContain('multiply');
  });

  test('records start and end lines', () => {
    const code = fs.readFileSync(path.join(fixturesDir, 'main.py'), 'utf-8');
    const result = parseFile(code, 'main.py');

    const mainFunc = result.functions.find((f) => f.name === 'main');
    expect(mainFunc.startLine).toBeGreaterThan(0);
    expect(mainFunc.endLine).toBeGreaterThanOrEqual(mainFunc.startLine);
  });

  test('records call line numbers', () => {
    const code = fs.readFileSync(path.join(fixturesDir, 'main.py'), 'utf-8');
    const result = parseFile(code, 'main.py');

    result.calls.forEach((call) => {
      expect(call.line).toBeGreaterThan(0);
    });
  });
});
