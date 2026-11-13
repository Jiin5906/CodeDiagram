//CodeDiagram 전용 그래프 효과 코드 (파일 뷰 전용)
//옵시디언에는 없는, 코드 분석 정보를 그래프 위에 드러내는 효과들이다.
//- 진단 글로우: 순환 참조 파일은 붉게 숨 쉬듯 깜빡인다
//- 호출 방향 입자: 강조된 선 위로 점들이 호출 방향(source → target)으로 흐른다
//- 결합도 글로우: 결합도 판정(CR-RFC-2026-002, metricsService)이 WARN·HAZARD인 파일만 원 뒤로 빛이 번진다 (WARN 주황, HAZARD 빨강)

const DIAG_PULSE_INTERVAL = 1400; //글로우가 한 번 밝아졌다 어두워지는 주기의 절반(ms)
const FLOW_SPEED = 0.6; //입자 이동 속도 (프레임당 px, 모델 좌표)

let _diagPulseTimer = null;
let _flowRafId = null;
let _flowEdges = null;

//결합도 글로우 — 진단 탭 "파일 결합도"와 같은 판정(파일 노드의 couplingStatus)만 그린다. 빨강은 HAZARD일 때만 쓴다.
//color는 밝은 배경에서도 또렷하도록 채도 높은 색, strength는 가장 진한 지점의 불투명도(0~1)다.
const COUPLING_GLOW_LEVELS = {
  WARN: { level: 1, color: '234, 88, 12', spread: 1.4, strength: 0.72 }, //진한 주황 (#EA580C)
  HAZARD: { level: 2, color: '220, 38, 38', spread: 1.9, strength: 0.9 }, //진한 빨강 (#DC2626)
};
const GLOW_MID_RATIO = 0.75; //빛 반경의 35% 지점 진하기 (가장 진한 지점 대비). 높을수록 원 둘레가 진하다
const GLOW_BREATH_MIN = 0.75; //숨 쉬기에서 가장 옅어질 때의 진하기 (1이면 깜빡이지 않음)
const GLOW_BREATH_MS = 2800; //한 번 밝아졌다 어두워지는 주기 (옛 버전의 1.4초 전환 × 2)

let _glowRafId = null;
let _glowCanvas = null;
let _glowNodes = null; //[{ node, level, phase }]

function _prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

//renderGraph에서 레이아웃 직후 호출
function applyCodeEffects(data) {
  stopCodeEffects();
  if (!cy || !data) return;

  _applyDiagnosticGlow(data.diagnostics);
  //움직임 줄이기 설정이면 숨 쉬는 효과 없이 일정한 밝기로 그린다
  _startCouplingGlow(_prefersReducedMotion());

  if (_prefersReducedMotion()) return;
  //진단 깜빡임은 쓰지 않는다 — 계속 움직이는 요소가 그래프 읽기를 방해한다. 선택한 선 위 입자 흐름만 유지.
  _startEdgeFlow();
}

function stopCodeEffects() {
  clearInterval(_diagPulseTimer);
  _diagPulseTimer = null;
  _stopCouplingGlow();
  if (_flowRafId) cancelAnimationFrame(_flowRafId);
  _flowRafId = null;
  if (_flowEdges && cy) {
    _flowEdges.forEach((edge) => {
      if (!edge.removed()) edge.removeClass('edge-flow').removeStyle('line-dash-offset');
    });
  }
  _flowEdges = null;
}

/* ── 진단 글로우 ── */

//진단의 파일 경로('app.js' 또는 'app.js::func')를 파일 노드 ID로 변환
function _buildPathResolver() {
  const byPath = new Map();
  cy.nodes('[type="file-node"]').forEach((node) => {
    const p = node.data('fullPath') || node.data('label');
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(node);
  });
  return (id) => {
    const p = String(id).split('::')[0];
    const candidates = byPath.get(p);
    if (!candidates) return null;
    const lang = EXT_TO_LANG[p.split('.').pop().toLowerCase()];
    return (candidates.find((n) => n.data('language') === lang) || candidates[0]).id();
  };
}

function _applyDiagnosticGlow(diagnostics) {
  cy.elements().removeClass('diag-error diag-cycle-edge diag-pulse');
  if (!diagnostics) return;

  const resolve = _buildPathResolver();
  const errorIds = new Set();
  const cycleEdgeIds = new Set();

  //파일 간 순환 참조 → 경로의 파일과 순환을 이루는 집약 엣지
  const fileCycles = (diagnostics.cycles && diagnostics.cycles.files) || [];
  for (const cycle of fileCycles) {
    const ids = cycle.map(resolve);
    ids.forEach((id) => id && errorIds.add(id));
    for (let i = 0; i < ids.length - 1; i++) {
      if (ids[i] && ids[i + 1]) cycleEdgeIds.add(`agg__${ids[i]}->${ids[i + 1]}`);
    }
  }

  //결합도는 진단 테두리가 아니라 HAZARD 바깥 링(graph.js)으로 따로 표시한다

  cy.batch(() => {
    errorIds.forEach((id) => cy.getElementById(id).addClass('diag-error'));
    cycleEdgeIds.forEach((id) => cy.getElementById(id).addClass('diag-cycle-edge'));
  });
}

//diag-pulse 클래스를 주기적으로 토글하면 스타일 transition이 숨 쉬는 듯한 글로우를 만든다
function _startDiagPulse() {
  if (cy.nodes('.diag-error').empty()) return;
  _diagPulseTimer = setInterval(() => {
    if (!cy || currentViewMode !== 'file') {
      stopCodeEffects();
      return;
    }
    cy.nodes('.diag-error').toggleClass('diag-pulse');
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

/* ── 결합도 글로우 ── */

//결합도 WARN·HAZARD 파일 노드를 고른다.
//couplingStatus는 서버 metricsService의 판정을 graph.js가 그대로 옮겨 붙인 값이라 진단 탭과 같다.
function _pickCoupledFiles() {
  const picked = [];
  cy.nodes('[type="file-node"]').forEach((node) => {
    const style = COUPLING_GLOW_LEVELS[node.data('couplingStatus')];
    //파일마다 숨 쉬는 박자를 조금씩 어긋나게 해 한꺼번에 깜빡이지 않게 한다
    if (style) picked.push({ node, style, phase: picked.length * 0.9 });
  });
  return picked;
}

//빛 레이어는 그래프(#cy) 뒤에 둔다. Cytoscape 캔버스는 배경이 투명해서
//원 뒤로 빛이 번져 나오는 것처럼 보이고, 원 자체의 색은 가리지 않는다.
function _ensureGlowCanvas() {
  const container = document.getElementById('graph-container');
  if (!container) return null;
  let canvas = document.getElementById('complexity-glow-layer');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'complexity-glow-layer';
    canvas.setAttribute('aria-hidden', 'true');
    container.insertBefore(canvas, document.getElementById('cy'));
  }
  canvas.classList.remove('hidden');
  return canvas;
}

function _startCouplingGlow(still) {
  _glowNodes = _pickCoupledFiles();
  if (!_glowNodes.length) return;

  _glowCanvas = _ensureGlowCanvas();
  if (!_glowCanvas) return;
  const ctx = _glowCanvas.getContext('2d');
  const start = performance.now();

  const frame = (now) => {
    if (!cy || currentViewMode !== 'file' || !_glowCanvas) {
      _stopCouplingGlow();
      return;
    }

    //캔버스 픽셀 크기를 그래프 영역(CSS px × 화면 배율)에 맞춘다
    const cssW = _glowCanvas.clientWidth;
    const cssH = _glowCanvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (
      _glowCanvas.width !== Math.round(cssW * dpr) ||
      _glowCanvas.height !== Math.round(cssH * dpr)
    ) {
      _glowCanvas.width = Math.round(cssW * dpr);
      _glowCanvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    //가까운 파일의 빛이 겹치면 더해져 더 밝게 보이도록
    ctx.globalCompositeOperation = 'lighter';

    const elapsed = still ? 0 : now - start;
    for (const entry of _glowNodes) {
      const node = entry.node;
      //로컬 그래프로 숨겨진 파일은 생략, 흐려진 파일은 흐려진 정도만큼 옅게
      if (node.removed() || !node.visible()) continue;
      const alpha = node.effectiveOpacity();
      if (alpha < 0.1) continue;

      const pos = node.renderedPosition();
      const r = Math.max(3, Math.max(node.renderedOuterWidth(), node.renderedOuterHeight()) / 2);
      const style = entry.style;
      //빛 반경: 원 크기에 비례하되, 많이 축소했을 때도 보이도록 최소 폭을 둔다
      const reach = Math.max(r * style.spread, 10 + style.level * 4);
      const outer = r + reach;
      if (pos.x + outer < 0 || pos.y + outer < 0 || pos.x - outer > cssW || pos.y - outer > cssH)
        continue;

      //숨 쉬기: 밝기와 번짐 폭을 사인 곡선으로 함께 키웠다 줄인다 (옛 버전의 ease-in-out-sine 전환과 같은 느낌)
      const breath = still
        ? 0.5
        : 0.5 - 0.5 * Math.cos((elapsed / GLOW_BREATH_MS) * Math.PI * 2 + entry.phase);
      const strength = style.strength * (GLOW_BREATH_MIN + (1 - GLOW_BREATH_MIN) * breath) * alpha;
      const radius = r + reach * (0.8 + 0.2 * breath);

      const grad = ctx.createRadialGradient(pos.x, pos.y, r * 0.6, pos.x, pos.y, radius);
      grad.addColorStop(0, `rgba(${style.color}, ${strength.toFixed(3)})`);
      grad.addColorStop(0.35, `rgba(${style.color}, ${(strength * GLOW_MID_RATIO).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${style.color}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    _glowRafId = requestAnimationFrame(frame);
  };

  _glowRafId = requestAnimationFrame(frame);
}

function _stopCouplingGlow() {
  if (_glowRafId) cancelAnimationFrame(_glowRafId);
  _glowRafId = null;
  if (_glowCanvas) {
    const ctx = _glowCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, _glowCanvas.width, _glowCanvas.height);
    _glowCanvas.classList.add('hidden');
  }
  _glowCanvas = null;
}
