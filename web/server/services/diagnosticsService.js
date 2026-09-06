//진단 서비스 — 순환 참조, 결합도 과다, 안티패턴을 탐지한다.

//결합도 과다 기준값
const INBOUND_THRESHOLD = 8;
const OUTBOUND_THRESHOLD = 6;
//안티패턴 기준값
const GOD_FUNCTION_LINES = 50;
const GOD_CLASS_METHODS = 10;

/* ── 순환 참조 탐지 (DFS 기반) ── */

//함수·파일 수준에서 순환 경로를 찾는다.
function detectCycles(edges) {
  //인접 리스트 구성
  const adj = {};
  for (const edge of edges) {
    if (!adj[edge.source]) adj[edge.source] = [];
    adj[edge.source].push(edge.target);
  }

  const visited = new Set();
  const inStack = new Set();
  const cycles = [];

  function dfs(node, path) {
    if (inStack.has(node)) {
      //순환 발견 — 순환 시작 지점부터 현재까지 경로 추출
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart).concat(node));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    const neighbors = adj[node] || [];
    for (const next of neighbors) {
      dfs(next, path);
    }

    path.pop();
    inStack.delete(node);
  }

  const allNodes = new Set([...Object.keys(adj), ...Object.values(adj).flat()]);
  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}

//파일 수준 순환 참조를 탐지한다.
function detectFileCycles(edges) {
  //파일 단위 엣지 축약
  const fileEdges = [];
  const seen = new Set();
  for (const edge of edges) {
    const sf = edge.source.split('::')[0];
    const tf = edge.target.split('::')[0];
    if (sf === tf) continue;
    const key = `${sf}->${tf}`;
    if (!seen.has(key)) {
      seen.add(key);
      fileEdges.push({ source: sf, target: tf });
    }
  }
  return detectCycles(fileEdges);
}

/* ── 결합도 과다 진단 ── */

//함수별 inbound/outbound 호출 수를 분석하여 경고를 생성한다.
function detectCouplingIssues(edges) {
  const inbound = {};
  const outbound = {};

  for (const edge of edges) {
    const refCount = edge.references ? edge.references.length : 1;
    if (!inbound[edge.target]) inbound[edge.target] = 0;
    if (!outbound[edge.source]) outbound[edge.source] = 0;
    inbound[edge.target] += refCount;
    outbound[edge.source] += refCount;
  }

  const issues = [];
  const allFuncs = new Set([...Object.keys(inbound), ...Object.keys(outbound)]);
  for (const func of allFuncs) {
    const inCount = inbound[func] || 0;
    const outCount = outbound[func] || 0;
    if (inCount >= INBOUND_THRESHOLD) {
      issues.push({
        type: 'high_inbound',
        nodeId: func,
        message: `인바운드 호출 ${inCount}회 — 너무 많은 곳에서 의존합니다`,
        severity: 'warning',
      });
    }
    if (outCount >= OUTBOUND_THRESHOLD) {
      issues.push({
        type: 'high_outbound',
        nodeId: func,
        message: `아웃바운드 호출 ${outCount}회 — 너무 많은 외부 함수에 의존합니다`,
        severity: 'warning',
      });
    }
  }
  return issues;
}

/* ── 안티패턴 탐지 ── */

//God Function(50줄 이상)과 God Class(메서드 10개 이상)를 탐지한다.
function detectAntiPatterns(functions, classes) {
  const issues = [];

  //God Function 탐지
  for (const func of functions) {
    const lineCount = func.endLine - func.startLine + 1;
    if (lineCount >= GOD_FUNCTION_LINES) {
      issues.push({
        type: 'god_function',
        nodeId: `${func.filePath}::${func.qualifiedName}`,
        message: `${func.qualifiedName}은 ${lineCount}줄 — 함수 분리를 권장합니다`,
        severity: 'info',
      });
    }
  }

  //God Class 탐지
  const classMethodCount = {};
  for (const func of functions) {
    if (func.className) {
      const key = `${func.filePath}::${func.className}`;
      if (!classMethodCount[key]) classMethodCount[key] = 0;
      classMethodCount[key]++;
    }
  }
  for (const [classKey, count] of Object.entries(classMethodCount)) {
    if (count >= GOD_CLASS_METHODS) {
      const className = classKey.split('::').pop();
      issues.push({
        type: 'god_class',
        nodeId: classKey,
        message: `${className} 클래스에 메서드 ${count}개 — 클래스 분리를 권장합니다`,
        severity: 'info',
      });
    }
  }

  return issues;
}

//전체 진단을 실행하고 결과를 반환한다.
function runDiagnostics(edges, functions, classes) {
  const funcCycles = detectCycles(edges);
  const fileCycles = detectFileCycles(edges);
  const couplingIssues = detectCouplingIssues(edges);
  const antiPatterns = detectAntiPatterns(functions, classes || []);

  return {
    cycles: {
      functions: funcCycles,
      files: fileCycles,
    },
    couplingIssues,
    antiPatterns,
  };
}

module.exports = { runDiagnostics, detectCycles, detectFileCycles, detectCouplingIssues, detectAntiPatterns };
