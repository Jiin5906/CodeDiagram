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
  cy.on('viewport add remove position', _minimapViewportHandler);

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
    cy.off('viewport add remove position', _minimapViewportHandler);
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

function renderMinimap() {
  if (!_minimapActive || !_minimapCtx || !_minimapCanvas || !cy) return;

  const w = _minimapCanvas.width;
  const h = _minimapCanvas.height;
  const ctx = _minimapCtx;

  ctx.clearRect(0, 0, w, h);

  //배경
  ctx.fillStyle = '#1E1F22';
  ctx.fillRect(0, 0, w, h);

  //그래프 바운딩 박스
  const nodes = cy.nodes(':visible');
  if (nodes.length === 0) return;

  const bb = nodes.boundingBox();
  const padding = 20;
  const graphW = bb.w + padding * 2;
  const graphH = bb.h + padding * 2;

  const scale = Math.min(w / graphW, h / graphH);
  const offsetX = (w - graphW * scale) / 2;
  const offsetY = (h - graphH * scale) / 2;

  function toMinimap(gx, gy) {
    return {
      x: offsetX + (gx - bb.x1 + padding) * scale,
      y: offsetY + (gy - bb.y1 + padding) * scale,
    };
  }

  //노드 도트 그리기
  nodes.forEach(node => {
    const pos = node.position();
    const mp = toMinimap(pos.x, pos.y);
    const color = node.data('color') || '#548AF7';
    const r = Math.max(1.5, (node.data('size') || 30) * scale * 0.3);

    ctx.beginPath();
    ctx.arc(mp.x, mp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  //뷰포트 사각형
  const extent = cy.extent();
  const topLeft = toMinimap(extent.x1, extent.y1);
  const bottomRight = toMinimap(extent.x2, extent.y2);

  ctx.strokeStyle = '#548AF7';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    topLeft.x,
    topLeft.y,
    bottomRight.x - topLeft.x,
    bottomRight.y - topLeft.y,
  );
  ctx.fillStyle = 'rgba(96, 165, 250, 0.06)';
  ctx.fillRect(
    topLeft.x,
    topLeft.y,
    bottomRight.x - topLeft.x,
    bottomRight.y - topLeft.y,
  );

  //좌표 변환 함수를 캔버스에 저장 (클릭 시 사용)
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
