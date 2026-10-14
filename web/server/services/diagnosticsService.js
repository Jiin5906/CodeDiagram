//진단 서비스 — 순환 참조, 파일 결합도(CR-RFC-2026-002), 안티패턴을 진단한다.
const { COUPLING_CRITERIA } = require('../config/couplingThresholds');

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

/* ── 안티패턴 탐지 ── */

//God Function(50줄 이상)과 God Class(메서드 10개 이상)를 탐지한다.
function detectAntiPatterns(functions, _classes) {
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

/* ── 웹 전용 안티패턴 탐지 ── */

//웹 파일에서 안티패턴을 탐지한다.
//TODO: 인라인 스타일 과다(요소 10개 이상)·대형 JS 파일(300줄 이상) 탐지는 아직 구현되지 않았다
const EVENT_LISTENER_THRESHOLD = 10;

function detectWebAntiPatterns(webParsedFiles) {
  if (!webParsedFiles || webParsedFiles.length === 0) return [];

  const issues = [];

  //HTML 요소 인덱스 (미사용 셀렉터/함수 탐지용)
  const htmlIds = new Set();
  const htmlClasses = new Set();
  const allHtmlElements = [];

  //JS 함수 정의/호출 인덱스
  const jsDefinedFuncs = new Set();
  const jsCalledFuncs = new Set();

  //CSS 셀렉터 인덱스
  const allSelectors = [];

  for (const pf of webParsedFiles) {
    if (pf.language === 'html') {
      //인라인 스타일 과다 탐지
      for (const elem of pf.parsed.elements || []) {
        if (elem.id) htmlIds.add(elem.id);
        for (const cls of elem.classes) htmlClasses.add(cls);
        allHtmlElements.push(elem);

        //인라인 style 속성 카운트 (dataAttrs에 포함되지 않으므로 elements에서 직접 체크 불가)
        //HTML 파서가 style 속성을 별도로 추출하지 않으므로 raw 텍스트로 체크
      }

      //인라인 스크립트/스타일 개수로 인라인 스타일 과다 판단
      if (pf.parsed.inlineStyles && pf.parsed.inlineStyles.length > 3) {
        issues.push({
          type: 'excessive_inline_style',
          nodeId: pf.filePath,
          message: `${pf.filePath}: 인라인 <style> 태그 ${pf.parsed.inlineStyles.length}개 — 외부 CSS 파일 사용을 권장합니다`,
          severity: 'info',
        });
      }
    }

    if (pf.language === 'css') {
      for (const sel of pf.parsed.selectors || []) {
        allSelectors.push({ ...sel, sourceFile: pf.filePath });
      }
    }

    if (pf.language === 'javascript') {
      //거대 JS 파일 탐지
      for (const func of pf.parsed.functions || []) {
        jsDefinedFuncs.add(func.name);
        const lineCount = func.endLine - func.startLine + 1;
        if (lineCount >= GOD_FUNCTION_LINES) {
          issues.push({
            type: 'god_function',
            nodeId: `${pf.filePath}::${func.qualifiedName}`,
            message: `${func.qualifiedName}은 ${lineCount}줄 — 함수 분리를 권장합니다`,
            severity: 'info',
          });
        }
      }

      for (const call of pf.parsed.calls || []) {
        jsCalledFuncs.add(call.callee.split('.').pop());
      }

      //이벤트 리스너 과다 탐지
      const eventBindings = pf.parsed.eventBindings || [];
      if (eventBindings.length >= EVENT_LISTENER_THRESHOLD) {
        issues.push({
          type: 'excessive_event_listeners',
          nodeId: pf.filePath,
          message: `${pf.filePath}: 이벤트 리스너 ${eventBindings.length}개 — 이벤트 위임 패턴 사용을 권장합니다`,
          severity: 'warning',
        });
      }
    }
  }

  //미사용 CSS 셀렉터 탐지
  for (const sel of allSelectors) {
    let isUsed = false;
    for (const id of sel.ids) {
      if (htmlIds.has(id)) {
        isUsed = true;
        break;
      }
    }
    if (!isUsed) {
      for (const cls of sel.classes) {
        if (htmlClasses.has(cls)) {
          isUsed = true;
          break;
        }
      }
    }
    if (!isUsed && sel.tags.length > 0) {
      isUsed = true; //태그 셀렉터는 항상 사용 가능성 있음
    }
    if (!isUsed && sel.ids.length === 0 && sel.classes.length === 0 && sel.tags.length === 0) {
      isUsed = true; //파싱 불가 셀렉터는 무시
    }

    if (!isUsed) {
      issues.push({
        type: 'unused_css_selector',
        nodeId: `${sel.sourceFile}::${sel.raw}`,
        message: `미사용 CSS 셀렉터: ${sel.raw} (${sel.sourceFile}:${sel.line})`,
        severity: 'info',
      });
    }
  }

  //미사용 JS 함수 탐지
  for (const pf of webParsedFiles) {
    if (pf.language === 'javascript') {
      for (const func of pf.parsed.functions || []) {
        if (
          !jsCalledFuncs.has(func.name) &&
          func.name !== 'anonymous' &&
          !func.name.startsWith('_') &&
          func.name !== 'constructor'
        ) {
          issues.push({
            type: 'unused_js_function',
            nodeId: `${pf.filePath}::${func.qualifiedName}`,
            message: `미사용 JS 함수: ${func.qualifiedName} (${pf.filePath}:${func.startLine})`,
            severity: 'info',
          });
        }
      }
    }
  }

  return issues;
}

//전체 진단을 실행하고 결과를 반환한다.
//fileCouplingEntries: graphBuilder가 만든 [{ node_id, file, metrics, refactor_target }]
function runDiagnostics(edges, functions, classes, webParsedFiles, fileCouplingEntries = []) {
  const funcCycles = detectCycles(edges);
  const fileCycles = detectFileCycles(edges);
  const coupling = summarizeCoupling(fileCouplingEntries);
  const antiPatterns = detectAntiPatterns(functions, classes || []);

  //웹 전용 안티패턴 추가
  const webAntiPatterns = detectWebAntiPatterns(webParsedFiles);
  antiPatterns.push(...webAntiPatterns);

  return {
    cycles: {
      functions: funcCycles,
      files: fileCycles,
    },
    coupling,
    antiPatterns,
  };
}

module.exports = {
  runDiagnostics,
  detectCycles,
  detectFileCycles,
  summarizeCoupling,
  detectAntiPatterns,
};
