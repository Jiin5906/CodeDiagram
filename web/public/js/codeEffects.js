//CodeDiagram 전용 그래프 효과 코드 (파일 뷰 전용)
//옵시디언에는 없는, 코드 분석 정보를 그래프 위에 드러내는 효과들이다.
//- 진단 글로우: 순환 참조 파일은 붉게, warning 진단이 있는 파일은 주황으로 숨 쉬듯 깜빡인다
//- 호출 방향 입자: 강조된 선 위로 점들이 호출 방향(source → target)으로 흐른다
//- 복잡도 글로우: 복잡도가 높은 파일은 원 뒤로 빛이 번지며 천천히 숨 쉬듯 밝아졌다 어두워진다 (복잡할수록 넓고 붉다)

const DIAG_PULSE_INTERVAL = 1400; //글로우가 한 번 밝아졌다 어두워지는 주기의 절반(ms)
const FLOW_SPEED = 0.6; //입자 이동 속도 (프레임당 px, 모델 좌표)

let _diagPulseTimer = null;
let _flowRafId = null;
let _flowEdges = null;

//복잡도 글로우 설정
const COMPLEX_TOP_RATIO = 0.12; //복잡도 점수 상위 12% 파일만 표시
const COMPLEX_MAX_FILES = 15; //한 번에 표시하는 최대 파일 수 (그래프가 산만해지지 않도록)
const COMPLEX_MIN_SCORE = 2; //점수가 이보다 낮으면 상위권이어도 표시하지 않음 (작은 프로젝트 대비)
const COMPLEX_LONG_FN_LINES = 50; //긴 함수 기준 (진단의 God Function 기준과 같음)
const COMPLEX_COUPLING_WEIGHT = { HAZARD: 2, WARN: 1 }; //결합도 판정(CR-RFC-2026-002)별 복잡도 가중치 — 예전 결합도 점수(0~1)×2처럼 최대 2점이다
const COMPLEX_LEVEL_SCORES = [5, 8]; //2단계, 3단계가 되는 점수 (예: 700줄·긴 함수 3개인 파일 ≈ 8.8)
const COMPLEX_LEVELS = [
  { color: '214, 165, 71', spread: 1.1, strength: 0.38 }, //1단계: 주황, 은은하게
  { color: '230, 128, 70', spread: 1.5, strength: 0.5 }, //2단계: 진한 주황
  { color: '239, 68, 68', spread: 1.9, strength: 0.62 }, //3단계: 빨강, 가장 넓고 밝게
];
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
  _startComplexityGlow(data.diagnostics, _prefersReducedMotion());

  if (_prefersReducedMotion()) return;
  //진단 깜빡임은 쓰지 않는다 — 계속 움직이는 요소가 그래프 읽기를 방해한다. 선택한 선 위 입자 흐름만 유지.
  _startEdgeFlow();
}

function stopCodeEffects() {
  clearInterval(_diagPulseTimer);
  _diagPulseTimer = null;
  _stopComplexityGlow();
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
    ids.forEach((id) => id && errorIds.add(id));
    for (let i = 0; i < ids.length - 1; i++) {
      if (ids[i] && ids[i + 1]) cycleEdgeIds.add(`agg__${ids[i]}->${ids[i + 1]}`);
    }
  }

  //warning 등급 진단 (info는 미사용 함수 등 수가 많아 그래프가 산만해지므로 제외)
  //결합도는 진단 테두리가 아니라 HAZARD 바깥 링(graph.js)으로 따로 표시한다
  const issues = diagnostics.antiPatterns || [];
  for (const issue of issues) {
    if (!issue.nodeId || (issue.severity !== 'warning' && issue.severity !== 'error')) continue;
    const id = resolve(issue.nodeId);
    if (id && !errorIds.has(id)) warningIds.add(id);
  }

  cy.batch(() => {
    errorIds.forEach((id) => cy.getElementById(id).addClass('diag-error'));
    warningIds.forEach((id) => cy.getElementById(id).addClass('diag-warning'));
    cycleEdgeIds.forEach((id) => cy.getElementById(id).addClass('diag-cycle-edge'));
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

/* ── 복잡도 글로우 ── */

//파일 복잡도 점수: 함수 줄 수 합, 긴 함수 수, 함수 개수, 결합도 판정, God Class 진단을 합친다.
//진단 목록에는 info 등급이라 테두리로 표시되지 않는 "크고 복잡한 파일"을 원 뒤의 빛으로 드러낸다.
function _fileComplexityScore(node, godClassCount) {
  const fns = (node.data('functions') || []).filter(
    (fn) => fn.type !== 'variable' && fn.type !== 'class',
  );
  let lines = 0;
  let longFns = 0;
  for (const fn of fns) {
    if (!fn.startLine || !fn.endLine) continue;
    const n = Math.max(1, fn.endLine - fn.startLine + 1);
    lines += n;
    if (n >= COMPLEX_LONG_FN_LINES) longFns++;
  }
  const coupling = COMPLEX_COUPLING_WEIGHT[couplingStatusOf(node.data())] || 0;
  return lines / 150 + longFns + fns.length / 12 + coupling + godClassCount * 1.5;
}

//복잡도 상위 파일을 골라 단계(1~3)를 매긴다
function _pickComplexFiles(diagnostics) {
  const fileNodes = cy.nodes('[type="file-node"]');
  if (fileNodes.empty()) return [];

  //God Class 진단을 파일별로 센다
  const godByFile = new Map();
  const resolve = _buildPathResolver();
  for (const issue of (diagnostics && diagnostics.antiPatterns) || []) {
    if (issue.type !== 'god_class' || !issue.nodeId) continue;
    const id = resolve(issue.nodeId);
    if (id) godByFile.set(id, (godByFile.get(id) || 0) + 1);
  }

  const scored = fileNodes
    .map((node) => ({ node, score: _fileComplexityScore(node, godByFile.get(node.id()) || 0) }))
    .filter((e) => e.score >= COMPLEX_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const limit = Math.min(
    COMPLEX_MAX_FILES,
    Math.max(1, Math.ceil(fileNodes.length * COMPLEX_TOP_RATIO)),
  );
  const picked = scored.slice(0, limit);
  if (!picked.length) return [];

  return picked.map((e, i) => {
    //단계는 상대 순위가 아닌 점수 자체로 정한다 (상위권이 모두 비슷하면 같은 단계)
    const level =
      e.score >= COMPLEX_LEVEL_SCORES[1] ? 3 : e.score >= COMPLEX_LEVEL_SCORES[0] ? 2 : 1;
    e.node.data('complexityLevel', level);
    //파일마다 숨 쉬는 박자를 조금씩 어긋나게 해 한꺼번에 깜빡이지 않게 한다
    return { node: e.node, level, phase: i * 0.9 };
  });
}

//범례에서 "복잡도 높은 파일" 항목을 보일지 판단하는 데 쓴다
function complexFileCount() {
  return _glowNodes ? _glowNodes.length : 0;
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

function _startComplexityGlow(diagnostics, still) {
  if (cy) cy.nodes('[type="file-node"]').removeData('complexityLevel');
  _glowNodes = _pickComplexFiles(diagnostics);
  if (!_glowNodes.length) return;

  _glowCanvas = _ensureGlowCanvas();
  if (!_glowCanvas) return;
  const ctx = _glowCanvas.getContext('2d');
  const start = performance.now();

  const frame = (now) => {
    if (!cy || currentViewMode !== 'file' || !_glowCanvas) {
      _stopComplexityGlow();
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
      const style = COMPLEX_LEVELS[entry.level - 1];
      //빛 반경: 원 크기에 비례하되, 많이 축소했을 때도 보이도록 최소 폭을 둔다
      const reach = Math.max(r * style.spread, 10 + entry.level * 4);
      const outer = r + reach;
      if (pos.x + outer < 0 || pos.y + outer < 0 || pos.x - outer > cssW || pos.y - outer > cssH)
        continue;

      //숨 쉬기: 밝기와 번짐 폭을 사인 곡선으로 함께 키웠다 줄인다 (옛 버전의 ease-in-out-sine 전환과 같은 느낌)
      const breath = still
        ? 0.5
        : 0.5 - 0.5 * Math.cos((elapsed / GLOW_BREATH_MS) * Math.PI * 2 + entry.phase);
      const strength = style.strength * (0.6 + 0.4 * breath) * alpha;
      const radius = r + reach * (0.8 + 0.2 * breath);

      const grad = ctx.createRadialGradient(pos.x, pos.y, r * 0.6, pos.x, pos.y, radius);
      grad.addColorStop(0, `rgba(${style.color}, ${strength.toFixed(3)})`);
      grad.addColorStop(0.35, `rgba(${style.color}, ${(strength * 0.55).toFixed(3)})`);
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

function _stopComplexityGlow() {
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
