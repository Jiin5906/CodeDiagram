//대규모 코드베이스 성능 벤치마크
//각 언어별 대규모 파일을 자동 생성하고 파싱 시간 및 메모리 사용량을 측정한다.

const fs = require('fs');
const path = require('path');
const { parseFile } = require('../server/services/parser');
const { buildGraph } = require('../server/services/graphBuilder');

const BENCHMARK_DIR = path.join(__dirname, '.benchmark_tmp');

/* ── 코드 생성기 ── */

function generatePythonCode(numFunctions, numClasses) {
  let code = '# Auto-generated benchmark file\nimport os\nimport sys\n\n';
  for (let c = 0; c < numClasses; c++) {
    code += `class BenchClass${c}:\n`;
    code += `    def __init__(self):\n        self.value${c} = ${c}\n\n`;
    for (let m = 0; m < 3; m++) {
      code += `    def method_${c}_${m}(self, x):\n`;
      code += `        result = x + self.value${c}\n`;
      code += `        return result\n\n`;
    }
  }
  for (let f = 0; f < numFunctions; f++) {
    code += `def func_${f}(a, b):\n`;
    code += `    """Benchmark function ${f}"""\n`;
    code += `    result = a + b\n`;
    if (f > 0) code += `    func_${f - 1}(a, b)\n`;
    code += `    return result\n\n`;
  }
  return code;
}

function generateJsCode(numFunctions, numClasses) {
  let code = '// Auto-generated benchmark file\n';
  code += "const utils = require('./utils');\n\n";
  for (let c = 0; c < numClasses; c++) {
    const parent = c > 0 ? ` extends BenchClass${c - 1}` : '';
    code += `class BenchClass${c}${parent} {\n`;
    code += `  constructor() {\n    ${c > 0 ? 'super();\n    ' : ''}this.value${c} = ${c};\n  }\n\n`;
    for (let m = 0; m < 3; m++) {
      code += `  method_${c}_${m}(x) {\n`;
      code += `    const result = x + this.value${c};\n`;
      code += `    return result;\n  }\n\n`;
    }
    code += '}\n\n';
  }
  for (let f = 0; f < numFunctions; f++) {
    code += `function func_${f}(a, b) {\n`;
    code += `  const result = a + b;\n`;
    if (f > 0) code += `  func_${f - 1}(a, b);\n`;
    code += `  return result;\n}\n\n`;
  }
  return code;
}

function generateTsCode(numFunctions, numClasses) {
  let code = '// Auto-generated TypeScript benchmark file\n\n';
  code += 'interface BenchItem {\n  id: number;\n  name: string;\n}\n\n';
  code += 'type BenchResult<T> = { data: T; ok: boolean };\n\n';
  for (let c = 0; c < numClasses; c++) {
    const parent = c > 0 ? ` extends BenchClass${c - 1}` : '';
    code += `class BenchClass${c}${parent} {\n`;
    code += `  private value${c}: number;\n`;
    code += `  constructor() {\n    ${c > 0 ? 'super();\n    ' : ''}this.value${c} = ${c};\n  }\n\n`;
    for (let m = 0; m < 3; m++) {
      code += `  method_${c}_${m}(x: number): number {\n`;
      code += `    const result: number = x + this.value${c};\n`;
      code += `    return result;\n  }\n\n`;
    }
    code += '}\n\n';
  }
  for (let f = 0; f < numFunctions; f++) {
    code += `function func_${f}(a: number, b: number): number {\n`;
    code += `  const result: number = a + b;\n`;
    if (f > 0) code += `  func_${f - 1}(a, b);\n`;
    code += `  return result;\n}\n\n`;
  }
  return code;
}

function generateHtmlCode(numElements) {
  let code =
    '<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n';
  for (let i = 0; i < numElements; i++) {
    code += `  <div id="elem-${i}" class="item item-${i % 10}" data-index="${i}">\n`;
    code += `    <span class="label">Item ${i}</span>\n`;
    code += `    <button class="btn" onclick="handleClick(${i})">Click</button>\n`;
    code += `  </div>\n`;
  }
  code += '  <script src="app.js"></script>\n</body>\n</html>\n';
  return code;
}

function generateCssCode(numSelectors) {
  let code = '/* Auto-generated benchmark CSS */\n';
  code += ':root {\n';
  for (let v = 0; v < 20; v++) {
    code += `  --bench-var-${v}: ${v * 10}px;\n`;
  }
  code += '}\n\n';
  for (let s = 0; s < numSelectors; s++) {
    code += `.item-${s} {\n`;
    code += `  padding: var(--bench-var-${s % 20});\n`;
    code += `  margin: ${s}px;\n`;
    code += `  color: #${String(s % 16).padStart(2, '0')}${String(s % 16).padStart(2, '0')}ff;\n`;
    code += '}\n\n';
  }
  code += '@keyframes benchAnimation {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n';
  return code;
}

function generateCppCode(numFunctions, numClasses) {
  let code = '// Auto-generated benchmark C++ file\n';
  code += '#include <iostream>\n#include <string>\n#include <vector>\n\n';
  for (let c = 0; c < numClasses; c++) {
    const parent = c > 0 ? ` : public BenchClass${c - 1}` : '';
    code += `class BenchClass${c}${parent} {\npublic:\n`;
    code += `    int value${c};\n`;
    code += `    BenchClass${c}() : value${c}(${c}) {}\n`;
    for (let m = 0; m < 3; m++) {
      code += `    int method_${c}_${m}(int x) {\n`;
      code += `        int result = x + value${c};\n`;
      code += `        return result;\n    }\n`;
    }
    code += '};\n\n';
  }
  for (let f = 0; f < numFunctions; f++) {
    code += `int func_${f}(int a, int b) {\n`;
    code += `    int result = a + b;\n`;
    if (f > 0) code += `    func_${f - 1}(a, b);\n`;
    code += `    return result;\n}\n\n`;
  }
  return code;
}

function generateCsharpCode(numFunctions, numClasses) {
  let code = '// Auto-generated benchmark C# file\nusing System;\n\n';
  code += 'namespace Benchmark {\n\n';
  for (let c = 0; c < numClasses; c++) {
    const parent = c > 0 ? ` : BenchClass${c - 1}` : '';
    code += `public class BenchClass${c}${parent} {\n`;
    code += `    public int Value${c} { get; set; }\n`;
    code += `    public BenchClass${c}() { Value${c} = ${c}; }\n`;
    for (let m = 0; m < 3; m++) {
      code += `    public int Method_${c}_${m}(int x) {\n`;
      code += `        int result = x + Value${c};\n`;
      code += `        return result;\n    }\n`;
    }
    code += '}\n\n';
  }
  for (let f = 0; f < numFunctions; f++) {
    code += `public static class Funcs${f} {\n`;
    code += `    public static int Func_${f}(int a, int b) {\n`;
    code += `        int result = a + b;\n`;
    if (f > 0) code += `        Funcs${f - 1}.Func_${f - 1}(a, b);\n`;
    code += `        return result;\n    }\n}\n\n`;
  }
  code += '}\n';
  return code;
}

/* ── 벤치마크 실행 ── */

function countLines(code) {
  return code.split('\n').length;
}

function cleanup() {
  if (fs.existsSync(BENCHMARK_DIR)) {
    fs.rmSync(BENCHMARK_DIR, { recursive: true, force: true });
  }
}

function setup() {
  cleanup();
  fs.mkdirSync(BENCHMARK_DIR, { recursive: true });
}

async function runParserBenchmark(label, code, filePath, language) {
  const lines = countLines(code);
  const memBefore = process.memoryUsage();
  const start = process.hrtime.bigint();

  const result = parseFile(code, filePath, language);

  const end = process.hrtime.bigint();
  const memAfter = process.memoryUsage();
  const durationMs = Number(end - start) / 1e6;
  const heapDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

  const funcCount = result.functions ? result.functions.length : 0;
  const classCount = result.classes ? result.classes.length : 0;
  const callCount = result.calls ? result.calls.length : 0;

  console.log(
    `  ${label}: ${lines} lines → ${durationMs.toFixed(1)}ms | ` +
      `heap Δ${heapDelta.toFixed(1)}MB | ${funcCount} funcs, ${classCount} classes, ${callCount} calls`,
  );

  return { durationMs, lines, funcCount, classCount, callCount };
}

async function runGraphBuildBenchmark(label, projectDir) {
  const memBefore = process.memoryUsage();
  const start = process.hrtime.bigint();

  const graph = await buildGraph(projectDir);

  const end = process.hrtime.bigint();
  const memAfter = process.memoryUsage();
  const durationMs = Number(end - start) / 1e6;
  const heapDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

  console.log(
    `  ${label}: ${durationMs.toFixed(1)}ms | ` +
      `heap Δ${heapDelta.toFixed(1)}MB | ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
  );

  return { durationMs, nodes: graph.nodes.length, edges: graph.edges.length };
}

async function main() {
  console.log('=== CodeDiagram Performance Benchmark ===\n');

  /* ── 스케일 1: 단일 파일 파싱 (약 1000줄) ── */
  console.log('--- Scale 1: Single file parsing (~1000 lines) ---');

  const pyCode = generatePythonCode(80, 10);
  const jsCode = generateJsCode(80, 10);
  const tsCode = generateTsCode(80, 10);
  const htmlCode = generateHtmlCode(100);
  const cssCode = generateCssCode(100);
  const cppCode = generateCppCode(80, 10);
  const csCode = generateCsharpCode(80, 10);

  await runParserBenchmark('Python', pyCode, 'bench.py', undefined);
  await runParserBenchmark('JavaScript', jsCode, 'bench.js', 'javascript');
  await runParserBenchmark('TypeScript', tsCode, 'bench.ts', 'typescript');
  await runParserBenchmark('HTML', htmlCode, 'bench.html', 'html');
  await runParserBenchmark('CSS', cssCode, 'bench.css', 'css');
  await runParserBenchmark('C++', cppCode, 'bench.cpp', 'cpp');
  await runParserBenchmark('C#', csCode, 'bench.cs', 'csharp');

  /* ── 스케일 2: 다중 파일 프로젝트 (약 10,000줄) ── */
  console.log('\n--- Scale 2: Multi-file project (~10,000 lines) ---');

  setup();
  const scale2Dir = path.join(BENCHMARK_DIR, 'scale2');
  fs.mkdirSync(scale2Dir, { recursive: true });

  // 10개 파일 × ~1000줄 = ~10,000줄
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(scale2Dir, `module_${i}.py`), generatePythonCode(80, 10));
  }
  for (let i = 0; i < 2; i++) {
    fs.writeFileSync(path.join(scale2Dir, `script_${i}.js`), generateJsCode(80, 10));
  }
  fs.writeFileSync(path.join(scale2Dir, 'types.ts'), generateTsCode(80, 10));
  fs.writeFileSync(path.join(scale2Dir, 'index.html'), generateHtmlCode(50));
  fs.writeFileSync(path.join(scale2Dir, 'style.css'), generateCssCode(50));

  await runGraphBuildBenchmark('10 files / ~10K lines', scale2Dir);

  /* ── 스케일 3: 100파일 / 20,000줄 (목표: 5초 이내) ── */
  console.log('\n--- Scale 3: Large project (100 files / ~20,000 lines) ---');

  const scale3Dir = path.join(BENCHMARK_DIR, 'scale3');
  fs.mkdirSync(scale3Dir, { recursive: true });

  // Python 30 files
  for (let i = 0; i < 30; i++) {
    fs.writeFileSync(path.join(scale3Dir, `py_mod_${i}.py`), generatePythonCode(15, 3));
  }
  // JS 20 files
  for (let i = 0; i < 20; i++) {
    fs.writeFileSync(path.join(scale3Dir, `js_mod_${i}.js`), generateJsCode(15, 3));
  }
  // TS 15 files
  for (let i = 0; i < 15; i++) {
    fs.writeFileSync(path.join(scale3Dir, `ts_mod_${i}.ts`), generateTsCode(15, 3));
  }
  // C++ 15 files (10 .cpp + 5 .h)
  for (let i = 0; i < 10; i++) {
    fs.writeFileSync(path.join(scale3Dir, `cpp_mod_${i}.cpp`), generateCppCode(15, 3));
  }
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(scale3Dir, `cpp_hdr_${i}.h`), generateCppCode(5, 2));
  }
  // C# 5 files
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(scale3Dir, `cs_mod_${i}.cs`), generateCsharpCode(15, 3));
  }
  // HTML 3 files
  for (let i = 0; i < 3; i++) {
    fs.writeFileSync(path.join(scale3Dir, `page_${i}.html`), generateHtmlCode(30));
  }
  // CSS 2 files
  for (let i = 0; i < 2; i++) {
    fs.writeFileSync(path.join(scale3Dir, `style_${i}.css`), generateCssCode(30));
  }

  // Count total lines
  let totalLines = 0;
  let totalFiles = 0;
  const files = fs.readdirSync(scale3Dir);
  for (const f of files) {
    const content = fs.readFileSync(path.join(scale3Dir, f), 'utf-8');
    totalLines += countLines(content);
    totalFiles++;
  }
  console.log(`  Generated: ${totalFiles} files, ${totalLines} total lines`);

  const scale3Result = await runGraphBuildBenchmark('100 files / ~20K lines', scale3Dir);

  //5초 이내 목표 검증
  const TARGET_MS = 5000;
  if (scale3Result.durationMs <= TARGET_MS) {
    console.log(`  ✓ PASS: ${scale3Result.durationMs.toFixed(0)}ms <= ${TARGET_MS}ms target`);
  } else {
    console.log(`  ✗ SLOW: ${scale3Result.durationMs.toFixed(0)}ms > ${TARGET_MS}ms target`);
  }

  /* ── 정리 ── */
  cleanup();

  console.log('\n=== Benchmark Complete ===');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  cleanup();
  process.exit(1);
});
