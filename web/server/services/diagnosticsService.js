//진단 서비스 — 순환 참조와 파일 결합도(CR-RFC-2026-002)를 진단한다.
const { COUPLING_CRITERIA } = require('../config/couplingThresholds');
const { SIZE_CRITERIA } = require('../config/sizeThresholds');

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

/* ── 비대 코드 (파일·클래스 크기) ── */

//측정값 목록을 기준과 비교해 가장 높은 등급과 그 사유를 돌려준다. 기준 미만이면 null.
//measures: [{ key: 'lines', value: 1200, warn: 500, hazard: 1000 }, ...]
function judgeSize(measures) {
  const hazard = measures.filter((m) => m.value >= m.hazard).map((m) => m.key);
  if (hazard.length) return { status: 'HAZARD', reasons: hazard };
  const warn = measures.filter((m) => m.value >= m.warn).map((m) => m.key);
  if (warn.length) return { status: 'WARN', reasons: warn };
  return null;
}

//HAZARD 먼저, 같은 등급이면 줄 수가 많은 순, 마지막은 경로순 (실행 환경과 관계없이 같은 순서)
function compareSize(a, b) {
  if (a.status !== b.status) return a.status === 'HAZARD' ? -1 : 1;
  if (a.lines !== b.lines) return b.lines - a.lines;
  const ka = a.file + (a.className || '');
  const kb = b.file + (b.className || '');
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

//비대 파일 — fileStats: [{ file, lines, funcCount }]
function detectLargeFiles(fileStats) {
  const c = SIZE_CRITERIA.file;
  const result = [];
  for (const { file, lines, funcCount } of fileStats) {
    const judged = judgeSize([
      { key: 'lines', value: lines, warn: c.warnLines, hazard: c.hazardLines },
      { key: 'funcs', value: funcCount, warn: c.warnFuncs, hazard: c.hazardFuncs },
    ]);
    if (judged) result.push({ file, lines, funcCount, ...judged });
  }
  return result.sort(compareSize);
}

//C++ 헤더·소스 확장자 (gitService의 SUPPORTED_EXTENSIONS 중 cpp)
const CPP_UNIT_EXT = /\.(h|hpp|cpp|cc|cxx)$/i;

//메서드를 클래스에 묶는 단위.
//C++은 클래스를 .h에 선언하고 메서드를 .cpp에 정의하므로 확장자를 뗀 파일 이름(calculator.h ↔ calculator.cpp)으로 묶는다.
//include/와 src/처럼 폴더가 갈리는 경우가 흔해 폴더는 보지 않는다. 같은 이름 파일에 같은 이름 클래스가 있어야 섞이므로 겹칠 일은 드물다.
//다른 언어는 클래스와 메서드가 같은 파일에 있으므로 파일 경로 그대로 쓴다.
function classUnitOf(filePath) {
  if (!CPP_UNIT_EXT.test(filePath)) return filePath;
  return 'cpp:' + filePath.split('/').pop().replace(CPP_UNIT_EXT, '');
}

//비대 클래스(God Class) — 클래스 줄 수와, 같은 단위(classUnitOf)·같은 클래스 이름을 가진 메서드 수로 판정한다
function detectGodClasses(classes, functions) {
  const c = SIZE_CRITERIA.klass;

  //"단위::클래스" 별 메서드 수
  const methodCount = new Map();
  for (const fn of functions) {
    if (!fn.className) continue;
    const key = `${classUnitOf(fn.filePath)}::${fn.className}`;
    methodCount.set(key, (methodCount.get(key) || 0) + 1);
  }

  const seen = new Set();
  const result = [];
  for (const cls of classes) {
    const key = `${cls.filePath}::${cls.name}`;
    //같은 파일에 같은 이름이 두 번 잡히면(C# partial 등) 한 번만 본다
    if (seen.has(key)) continue;
    seen.add(key);

    const lines = Math.max(1, cls.endLine - cls.startLine + 1);
    const methods = methodCount.get(`${classUnitOf(cls.filePath)}::${cls.name}`) || 0;
    const judged = judgeSize([
      { key: 'lines', value: lines, warn: c.warnLines, hazard: c.hazardLines },
      { key: 'methods', value: methods, warn: c.warnMethods, hazard: c.hazardMethods },
    ]);
    if (judged) {
      result.push({
        file: cls.filePath,
        className: cls.name,
        startLine: cls.startLine,
        lines,
        methods,
        ...judged,
      });
    }
  }
  return result.sort(compareSize);
}

//진단 탭용으로 기준과 함께 묶는다
function summarizeSize({ fileStats = [], classes = [], functions = [] } = {}) {
  return {
    criteria: SIZE_CRITERIA,
    files: detectLargeFiles(fileStats),
    classes: detectGodClasses(classes, functions),
  };
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
//sizeInput: graphBuilder가 만든 { fileStats, classes, functions }
function runDiagnostics(edges, fileCouplingEntries = [], sizeInput = {}) {
  return {
    cycles: {
      functions: detectCycles(edges),
      files: detectFileCycles(edges),
    },
    coupling: summarizeCoupling(fileCouplingEntries),
    size: summarizeSize(sizeInput),
  };
}

module.exports = {
  runDiagnostics,
  detectCycles,
  detectFileCycles,
  summarizeCoupling,
  detectLargeFiles,
  detectGodClasses,
};
