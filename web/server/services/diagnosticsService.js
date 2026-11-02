//진단 서비스 — 순환 참조와 파일 결합도(CR-RFC-2026-002)를 진단한다.
const { COUPLING_CRITERIA } = require('../config/couplingThresholds');

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

/* ── 파일 결합도 (CR-RFC-2026-002) ── */

//진단 탭 정렬 순서: 위험한 등급이 먼저 온다
const STATUS_ORDER = { HAZARD: 0, WARN: 1, SAFE: 2, 'N/A': 3 };

//파일별 결합도 항목을 진단 탭용으로 정렬하고 판정 기준을 함께 묶는다.
//판정은 metricsService에서 끝났으므로 여기서는 다시 판단하지 않는다.
function summarizeCoupling(fileEntries) {
  const files = [...fileEntries].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.metrics.status] - STATUS_ORDER[b.metrics.status];
    if (byStatus !== 0) return byStatus;
    //같은 등급이라면? I가 더 큰(더 불안정한) 파일이 먼저 온다.
    const byInstability = (b.metrics.instability ?? -1) - (a.metrics.instability ?? -1);
    if (byInstability !== 0) return byInstability;
    const byCbo = b.metrics.cbo - a.metrics.cbo;
    if (byCbo !== 0) return byCbo;
    //마지막은 경로순 - 실행 환경과 관계없이 항상 같은 순서가 나오게 한다.
    if (a.file < b.file) return -1;
    if (a.file > b.file) return 1;
    return 0;
  });
  return { criteria: COUPLING_CRITERIA, files };
}

//전체 진단을 실행하고 결과를 반환한다.
//fileCouplingEntries: graphBuilder가 만든 [{ node_id, file, metrics, refactor_target }]
function runDiagnostics(edges, fileCouplingEntries = []) {
  return {
    cycles: {
      functions: detectCycles(edges),
      files: detectFileCycles(edges),
    },
    coupling: summarizeCoupling(fileCouplingEntries),
  };
}

module.exports = {
  runDiagnostics,
  detectCycles,
  detectFileCycles,
  summarizeCoupling,
};
