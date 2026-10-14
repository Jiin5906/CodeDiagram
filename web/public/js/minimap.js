//미니맵 (Phase 2)
//캔버스 기반 미니맵 — 노드 도트 + 뷰포트 사각형

let _minimapActive = false;
let _minimapCanvas = null;
let _minimapCtx = null;
let _minimapRafId = null;
let _minimapViewportHandler = null;
let _minimapDragging = false;

function initMinimap() {
  if (_minimapActive) destroyMinimap();

  const container = document.getElementById('minimap-container');
  _minimapCanvas = document.getElementById('minimap-canvas');
  if (!container || !_minimapCanvas || !cy) return;

  _minimapCtx = _minimapCanvas.getContext('2d');
  _minimapActive = true;

  container.classList.remove('hidden');

  //cy 이벤트 구독
  _minimapViewportHandler = function () {
    requestMinimapRender();
  };
  //style: 클래스 변경(디밍·로컬 그래프 숨김·접기)도 미니맵에 반영한다
  cy.on('viewport add remove position style', _minimapViewportHandler);

  //미니맵 클릭/드래그 이벤트
  _minimapCanvas.addEventListener('mousedown', onMinimapMouseDown);
  _minimapCanvas.addEventListener('mousemove', onMinimapMouseMove);
  _minimapCanvas.addEventListener('mouseup', onMinimapMouseUp);
  _minimapCanvas.addEventListener('mouseleave', onMinimapMouseUp);

  requestMinimapRender();
}

function destroyMinimap() {
  _minimapActive = false;

  if (_minimapRafId) {
    cancelAnimationFrame(_minimapRafId);
    _minimapRafId = null;
  }

  if (cy && _minimapViewportHandler) {
    cy.off('viewport add remove position style', _minimapViewportHandler);
    _minimapViewportHandler = null;
  }

  if (_minimapCanvas) {
    _minimapCanvas.removeEventListener('mousedown', onMinimapMouseDown);
    _minimapCanvas.removeEventListener('mousemove', onMinimapMouseMove);
    _minimapCanvas.removeEventListener('mouseup', onMinimapMouseUp);
    _minimapCanvas.removeEventListener('mouseleave', onMinimapMouseUp);
  }

  const container = document.getElementById('minimap-container');
  if (container) container.classList.add('hidden');

  _minimapCanvas = null;
  _minimapCtx = null;
}

function requestMinimapRender() {
  if (_minimapRafId) return;
  _minimapRafId = requestAnimationFrame(() => {
    _minimapRafId = null;
    renderMinimap();
  });
}

//캔버스 픽셀 크기를 화면에 보이는 크기(CSS px × 화면 배율)에 맞춘다.
//고정 크기(180×130)를 다른 비율의 칸에 늘려 그리면 모양이 찌그러지고 클릭 위치도 어긋난다.
function _fitMinimapCanvas() {
  const cssW = _minimapCanvas.clientWidth || 160;
  const cssH = _minimapCanvas.clientHeight || 110;
  const dpr = window.devicePixelRatio || 1;
  const pxW = Math.round(cssW * dpr);
  const pxH = Math.round(cssH * dpr);
  if (_minimapCanvas.width !== pxW || _minimapCanvas.height !== pxH) {
    _minimapCanvas.width = pxW;
    _minimapCanvas.height = pxH;
  }
  _minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: cssW, h: cssH };
}

//노드의 실제 스타일 색을 쓴다 (data('color')는 대부분 노드에 없다)
function _minimapColor(ele, prop, fallback) {
  const c = ele.style(prop);
  return c && c !== 'none' ? c : fallback;
}

function renderMinimap() {
  if (!_minimapActive || !_minimapCtx || !_minimapCanvas || !cy) return;

  const { w, h } = _fitMinimapCanvas();
  const ctx = _minimapCtx;

  ctx.clearRect(0, 0, w, h);

  //배경
  ctx.fillStyle = '#1E1F22';
  ctx.fillRect(0, 0, w, h);

  //화면에 표시되는 요소만 (로컬 그래프로 숨긴 노드, 접힌 노드 제외)
  const nodes = cy.nodes(':visible');
  if (nodes.length === 0) return;

  //라벨을 빼고 실제 노드 영역 기준으로 범위를 잡는다
  const bb = nodes.boundingBox({ includeLabels: false, includeOverlays: false });
  const padding = 20;
  const graphW = Math.max(1, bb.w + padding * 2);
  const graphH = Math.max(1, bb.h + padding * 2);

  const scale = Math.min(w / graphW, h / graphH);
  const offsetX = (w - graphW * scale) / 2;
  const offsetY = (h - graphH * scale) / 2;

  function toMinimap(gx, gy) {
    return {
      x: offsetX + (gx - bb.x1 + padding) * scale,
      y: offsetY + (gy - bb.y1 + padding) * scale,
    };
  }

  //엣지: 그래프에 보이는 선만 가늘게
  const edges = cy.edges(':visible');
  if (edges.length <= 4000) {
    ctx.lineWidth = 0.6;
    edges.forEach((edge) => {
      const alpha = Math.min(
        1,
        edge.effectiveOpacity() * (parseFloat(edge.style('line-opacity')) || 0),
      );
      if (alpha < 0.05) return;
      const s = toMinimap(edge.source().position('x'), edge.source().position('y'));
      const t = toMinimap(edge.target().position('x'), edge.target().position('y'));
      ctx.globalAlpha = Math.max(0.25, alpha * 0.8);
      ctx.strokeStyle = _minimapColor(edge, 'line-color', '#5A5D63');
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    });
  }

  //노드: 바깥 박스(compound)부터 그려야 안쪽 노드가 가려지지 않는다
  const sorted = nodes.sort((a, b) => a.ancestors().length - b.ancestors().length);
  sorted.forEach((node) => {
    const nb = node.boundingBox({ includeLabels: false, includeOverlays: false });
    const tl = toMinimap(nb.x1, nb.y1);
    const nw = Math.max(1.5, nb.w * scale);
    const nh = Math.max(1.5, nb.h * scale);
    const opacity = node.effectiveOpacity();
    const fill = _minimapColor(node, 'background-color', '#548AF7');

    if (node.isParent()) {
      //파일/티어 박스: 테두리 + 옅은 바탕
      ctx.globalAlpha = opacity * 0.25;
      ctx.fillStyle = fill;
      ctx.fillRect(tl.x, tl.y, nw, nh);
      ctx.globalAlpha = opacity * 0.8;
      ctx.strokeStyle = _minimapColor(node, 'border-color', '#4E5157');
      ctx.lineWidth = 0.75;
      ctx.strokeRect(tl.x, tl.y, nw, nh);
      return;
    }

    ctx.globalAlpha = opacity;
    ctx.fillStyle = fill;
    if (node.style('shape') === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(tl.x + nw / 2, tl.y + nh / 2, nw / 2, nh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(tl.x, tl.y, nw, nh);
    }
  });
  ctx.globalAlpha = 1;

  //뷰포트 사각형
  const extent = cy.extent();
  const topLeft = toMinimap(extent.x1, extent.y1);
  const bottomRight = toMinimap(extent.x2, extent.y2);

  ctx.strokeStyle = '#548AF7';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  ctx.fillStyle = 'rgba(96, 165, 250, 0.06)';
  ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

  //좌표 변환 함수를 캔버스에 저장 (클릭 시 사용, CSS px 기준)
  _minimapCanvas._toGraph = function (mx, my) {
    const gx = (mx - offsetX) / scale + bb.x1 - padding;
    const gy = (my - offsetY) / scale + bb.y1 - padding;
    return { x: gx, y: gy };
  };
}

function onMinimapMouseDown(evt) {
  _minimapDragging = true;
  minimapNavigate(evt);
}

function onMinimapMouseMove(evt) {
  if (!_minimapDragging) return;
  minimapNavigate(evt);
}

function onMinimapMouseUp() {
  _minimapDragging = false;
}

function minimapNavigate(evt) {
  if (!_minimapCanvas || !_minimapCanvas._toGraph || !cy) return;

  const rect = _minimapCanvas.getBoundingClientRect();
  const mx = evt.clientX - rect.left;
  const my = evt.clientY - rect.top;

  const graphPos = _minimapCanvas._toGraph(mx, my);
  cy.pan({
    x: -graphPos.x * cy.zoom() + cy.width() / 2,
    y: -graphPos.y * cy.zoom() + cy.height() / 2,
  });
}
