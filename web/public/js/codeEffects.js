//CodeDiagram 전용 그래프 효과 코드 (파일 뷰 전용)
//옵시디언에는 없는, 코드 분석 정보를 그래프 위에 드러내는 효과들이다.
//- 진단 글로우: 순환 참조 파일은 붉게, warning 진단이 있는 파일은 주황으로 숨 쉬듯 깜빡인다
//- 호출 방향 입자: 강조된 선 위로 점들이 호출 방향(source → target)으로 흐른다

const DIAG_PULSE_INTERVAL = 1400;  //글로우가 한 번 밝아졌다 어두워지는 주기의 절반(ms)
const FLOW_SPEED = 0.6;            //입자 이동 속도 (프레임당 px, 모델 좌표)

let _diagPulseTimer = null;
let _flowRafId = null;
let _flowEdges = null;

function _prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

//renderGraph에서 레이아웃 직후 호출
function applyCodeEffects(data) {
  stopCodeEffects();
  if (!cy || !data) return;

  _applyDiagnosticGlow(data.diagnostics);

  if (_prefersReducedMotion()) return;
  //진단 깜빡임은 쓰지 않는다 — 계속 움직이는 요소가 그래프 읽기를 방해한다. 선택한 선 위 입자 흐름만 유지.
  _startEdgeFlow();
}

function stopCodeEffects() {
  clearInterval(_diagPulseTimer);
  _diagPulseTimer = null;
  if (_flowRafId) cancelAnimationFrame(_flowRafId);
  _flowRafId = null;
  if (_flowEdges && cy) {
    _flowEdges.forEach(edge => {
      if (!edge.removed()) edge.removeClass('edge-flow').removeStyle('line-dash-offset');
    });
  }
  _flowEdges = null;
}

/* ── 진단 글로우 ── */

//진단의 파일 경로('app.js' 또는 'app.js::func')를 파일 노드 ID로 변환
function _buildPathResolver() {
  const byPath = new Map();
  cy.nodes('[type="file-node"]').forEach(node => {
    const p = node.data('fullPath') || node.data('label');
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(node);
  });
  return (id) => {
    const p = String(id).split('::')[0];
    const candidates = byPath.get(p);
    if (!candidates) return null;
    const lang = EXT_TO_LANG[p.split('.').pop().toLowerCase()];
    return (candidates.find(n => n.data('language') === lang) || candidates[0]).id();
  };
}

function _applyDiagnosticGlow(diagnostics) {
  cy.elements().removeClass('diag-error diag-warning diag-cycle-edge diag-pulse');
  if (!diagnostics) return;

  const resolve = _buildPathResolver();
  const errorIds = new Set();
  const warningIds = new Set();
  const cycleEdgeIds = new Set();

  //파일 간 순환 참조 → 경로의 파일과 순환을 이루는 집약 엣지
  const fileCycles = (diagnostics.cycles && diagnostics.cycles.files) || [];
  for (const cycle of fileCycles) {
    const ids = cycle.map(resolve);
    ids.forEach(id => id && errorIds.add(id));
    for (let i = 0; i < ids.length - 1; i++) {
      if (ids[i] && ids[i + 1]) cycleEdgeIds.add(`agg__${ids[i]}->${ids[i + 1]}`);
    }
  }

  //warning 등급 진단 (info는 미사용 함수 등 수가 많아 그래프가 산만해지므로 제외)
  const issues = [...(diagnostics.couplingIssues || []), ...(diagnostics.antiPatterns || [])];
  for (const issue of issues) {
    if (!issue.nodeId || (issue.severity !== 'warning' && issue.severity !== 'error')) continue;
    const id = resolve(issue.nodeId);
    if (id && !errorIds.has(id)) warningIds.add(id);
  }

  cy.batch(() => {
    errorIds.forEach(id => cy.getElementById(id).addClass('diag-error'));
    warningIds.forEach(id => cy.getElementById(id).addClass('diag-warning'));
    cycleEdgeIds.forEach(id => cy.getElementById(id).addClass('diag-cycle-edge'));
  });
}

//diag-pulse 클래스를 주기적으로 토글하면 스타일 transition이 숨 쉬는 듯한 글로우를 만든다
function _startDiagPulse() {
  if (cy.nodes('.diag-error, .diag-warning').empty()) return;
  _diagPulseTimer = setInterval(() => {
    if (!cy || currentViewMode !== 'file') {
      stopCodeEffects();
      return;
    }
    cy.nodes('.diag-error, .diag-warning').toggleClass('diag-pulse');
  }, DIAG_PULSE_INTERVAL);
}

/* ── 호출 방향 입자 ── */

//강조(highlighted)된 집약 엣지에만 점선 흐름을 적용한다
function _startEdgeFlow() {
  _flowEdges = cy.collection();
  let offset = 0;

  const frame = () => {
    if (!cy || currentViewMode !== 'file') {
      stopCodeEffects();
      return;
    }

    const active = cy.edges('[type="aggregated"].highlighted');
    //강조가 풀린 엣지는 원래 실선으로 복구
    const released = _flowEdges.difference(active);
    if (released.nonempty()) released.removeClass('edge-flow').removeStyle('line-dash-offset');

    if (active.nonempty()) {
      //오프셋을 줄이면 대시 패턴이 source → target 방향으로 이동한다
      offset = (offset - FLOW_SPEED) % 1200;
      cy.batch(() => {
        active.addClass('edge-flow');
        active.style('line-dash-offset', offset);
      });
    }
    _flowEdges = active;
    _flowRafId = requestAnimationFrame(frame);
  };

  _flowRafId = requestAnimationFrame(frame);
}
