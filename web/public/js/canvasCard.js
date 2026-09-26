//캔버스 카드 시스템 — 파일 노드 더블클릭 시 그래프 위에 DOM 오버레이 카드로 소스코드를 표시한다.

const _openCards = new Map(); // fileId -> cardElement
let _cardZCounter = 200;
const MAX_CARDS = 5;

/* ── 카드 열기 ── */
function openCanvasCard(fileId, nodeData) {
  //이미 열려 있으면 포커스만
  if (_openCards.has(fileId)) {
    focusCard(fileId);
    return;
  }

  //최대 카드 수 초과 시 가장 오래된 카드 닫기
  if (_openCards.size >= MAX_CARDS) {
    const oldest = _openCards.keys().next().value;
    closeCanvasCard(oldest);
  }

  const layer = document.getElementById('canvas-cards-layer');
  if (!layer) return;

  const card = document.createElement('div');
  card.className = 'canvas-card';
  card.dataset.fileId = fileId;
  card.style.zIndex = ++_cardZCounter;

  //초기 크기/위치: 그래프 영역 크기에 맞춰 줄이고, 노드의 화면 좌표 기반으로 배치
  const size = _getCardInitialSize();
  const pos = _getCardInitialPosition(fileId, size);
  card.style.left = pos.x + 'px';
  card.style.top = pos.y + 'px';
  card.style.width = size.w + 'px';
  card.style.height = size.h + 'px';

  //포커스: 카드 클릭 시 최상위로
  card.addEventListener('mousedown', () => focusCard(fileId));

  //── 헤더 ──
  const header = document.createElement('div');
  header.className = 'canvas-card-header';

  const title = document.createElement('span');
  title.className = 'canvas-card-title';
  title.textContent = nodeData.label || fileId.replace('file__', '');

  const functions = nodeData.functions || [];
  const badge = document.createElement('span');
  badge.className = 'canvas-card-badge';
  badge.textContent = functions.length;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'canvas-card-close';
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCanvasCard(fileId);
  });

  //코드 보기: 파일 전체 코드 ↔ 선택한 함수 코드 전환
  const fullBtn = document.createElement('button');
  fullBtn.className = 'canvas-card-full-btn';
  fullBtn.textContent = '코드 보기';
  fullBtn.title = '이 파일의 전체 코드를 봅니다';
  fullBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  fullBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _toggleCardFullCode(card, nodeData, fullBtn);
  });

  header.appendChild(title);
  header.appendChild(badge);
  header.appendChild(fullBtn);
  header.appendChild(closeBtn);

  //── 바디 ──
  const body = document.createElement('div');
  body.className = 'canvas-card-body';

  //함수 사이드바
  const sidebar = document.createElement('div');
  sidebar.className = 'canvas-card-fn-sidebar';

  //코드 영역
  const codeArea = document.createElement('div');
  codeArea.className = 'canvas-card-code';

  const lineNumbers = document.createElement('div');
  lineNumbers.className = 'code-line-numbers';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  pre.appendChild(code);

  codeArea.appendChild(lineNumbers);
  codeArea.appendChild(pre);

  body.appendChild(sidebar);
  body.appendChild(codeArea);

  //── 리사이즈 핸들 ──
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'canvas-card-resize-handle';

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(resizeHandle);

  layer.appendChild(card);
  _openCards.set(fileId, card);

  //드래그 설정
  _setupCardDrag(card, header);
  //리사이즈 설정
  _setupCardResize(card, resizeHandle);

  //함수 사이드바 렌더링
  _renderFnSidebar(card, nodeData);

  //첫 번째 함수 코드 표시
  if (functions.length > 0) {
    const firstItem = card.querySelector('.canvas-card-fn-item');
    _selectFunction(card, nodeData, functions[0], firstItem);
  } else if (nodeData.code) {
    //함수가 없으면 파일 전체 코드 표시
    showCodeInCard(card, nodeData);
  } else {
    //함수도 코드도 없으면 서버에서 전체 코드를 받아 보여준다
    _toggleCardFullCode(card, nodeData, fullBtn);
  }
}

/* ── 카드 닫기 ── */
function closeCanvasCard(fileId) {
  const card = _openCards.get(fileId);
  if (!card) return;
  card.remove();
  _openCards.delete(fileId);
}

/* ── 모든 카드 닫기 ── */
function closeAllCards() {
  for (const [fileId] of _openCards) {
    closeCanvasCard(fileId);
  }
}

/* ── 카드 포커스 ── */
function focusCard(fileId) {
  const card = _openCards.get(fileId);
  if (!card) return;
  card.style.zIndex = ++_cardZCounter;
}

/* ── 최상위 카드 닫기 (Escape용) ── */
function closeTopCard() {
  if (_openCards.size === 0) return false;
  let topCard = null;
  let topZ = -1;
  let topFileId = null;
  for (const [fid, card] of _openCards) {
    const z = parseInt(card.style.zIndex, 10) || 0;
    if (z > topZ) {
      topZ = z;
      topCard = card;
      topFileId = fid;
    }
  }
  if (topFileId) {
    closeCanvasCard(topFileId);
    return true;
  }
  return false;
}

/* ── 열린 카드 존재 여부 ── */
function hasOpenCards() {
  return _openCards.size > 0;
}

/* ══════════════════════════════════════════════════
   내부 헬퍼 함수들
   ══════════════════════════════════════════════════ */

function _getGraphRect() {
  const container = document.getElementById('graph-container');
  return container ? container.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
}

/* 카드 초기 크기: 기본 500x400, 그래프 영역이 작으면 그에 맞춰 줄인다 */
function _getCardInitialSize() {
  const rect = _getGraphRect();
  return {
    w: Math.max(280, Math.min(500, rect.width - 20)),
    h: Math.max(220, Math.min(400, rect.height - 20)),
  };
}

/* 카드 초기 위치 계산 */
function _getCardInitialPosition(fileId, size) {
  const rect = _getGraphRect();

  if (typeof cy !== 'undefined' && cy) {
    const node = cy.getElementById(fileId);
    if (node && node.length > 0) {
      const rPos = node.renderedPosition();
      //그래프 컨테이너 기준 좌표 → canvas-cards-layer 기준 좌표 (카드 중심을 노드에 맞춤)
      let x = rPos.x - size.w / 2;
      let y = rPos.y - size.h / 2;

      //화면 밖으로 나가지 않도록 클램프
      x = Math.max(10, Math.min(x, rect.width - size.w - 10));
      y = Math.max(10, Math.min(y, rect.height - size.h - 10));
      return { x, y };
    }
  }

  //노드를 못 찾으면 중앙에 약간 오프셋
  const offset = _openCards.size * 30;
  return {
    x: Math.max(10, (rect.width - size.w) / 2 + offset),
    y: Math.max(10, (rect.height - size.h) / 2 + offset),
  };
}

/* 창 크기가 바뀌면 열린 카드를 그래프 영역 안으로 다시 넣는다 */
function _clampCardsToView() {
  const rect = _getGraphRect();
  for (const [, card] of _openCards) {
    const w = Math.min(card.offsetWidth, rect.width - 16);
    const h = Math.min(card.offsetHeight, rect.height - 16);
    const left = parseInt(card.style.left, 10) || 0;
    const top = parseInt(card.style.top, 10) || 0;
    card.style.left = Math.max(8, Math.min(left, rect.width - w - 8)) + 'px';
    card.style.top = Math.max(8, Math.min(top, rect.height - h - 8)) + 'px';
  }
}

let _cardResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_cardResizeTimer);
  _cardResizeTimer = setTimeout(_clampCardsToView, 120);
});

/* 드래그 이동 설정 */
function _setupCardDrag(card, handle) {
  let startX, startY, origLeft, origTop;

  const onMouseMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    card.style.left = (origLeft + dx) + 'px';
    card.style.top = (origTop + dy) + 'px';
  };

  const onMouseUp = () => {
    card.style.transition = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  handle.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('canvas-card-close')) return;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = parseInt(card.style.left, 10) || 0;
    origTop = parseInt(card.style.top, 10) || 0;
    card.style.transition = 'none';
    e.preventDefault();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

/* 리사이즈 설정 */
function _setupCardResize(card, handle) {
  let startX, startY, origW, origH;

  const onMouseMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    card.style.width = Math.max(350, origW + dx) + 'px';
    card.style.height = Math.max(250, origH + dy) + 'px';
  };

  const onMouseUp = () => {
    card.style.transition = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    origW = card.offsetWidth;
    origH = card.offsetHeight;
    card.style.transition = 'none';
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

/* 함수 사이드바 렌더링 */
function _renderFnSidebar(card, nodeData) {
  const sidebar = card.querySelector('.canvas-card-fn-sidebar');
  if (!sidebar) return;

  const functions = nodeData.functions || [];
  sidebar.textContent = '';

  if (functions.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 10px 8px; color: #6F737A; font-size: 12px; font-style: italic;';
    empty.textContent = '\uD568\uC218 \uC5C6\uC74C';
    sidebar.appendChild(empty);
    return;
  }

  for (const fn of functions) {
    const item = document.createElement('div');
    item.className = 'canvas-card-fn-item';

    const icon = fn.type === 'variable' ? '\u25C6' : '\u0192';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'canvas-card-fn-icon';
    iconSpan.textContent = icon;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'canvas-card-fn-name';
    nameSpan.textContent = fnDisplayName(fn);
    nameSpan.title = fnDisplayName(fn);

    item.appendChild(iconSpan);
    item.appendChild(nameSpan);

    appendRefBadges(item, fn, 'canvas-card-fn-refs');

    item.addEventListener('click', () => {
      _selectFunction(card, nodeData, fn, item);
    });

    sidebar.appendChild(item);
  }
}

/* 함수 선택 → 코드 표시 + 하이라이트 */
function _selectFunction(card, nodeData, fn, itemEl) {
  //활성 상태 토글
  const sidebar = card.querySelector('.canvas-card-fn-sidebar');
  if (sidebar) {
    sidebar.querySelectorAll('.canvas-card-fn-item').forEach(el => el.classList.remove('active'));
  }
  if (itemEl) itemEl.classList.add('active');
  card._activeFn = fn;

  //"코드 보기"로 전체 코드를 보고 있으면 전체 코드에서 해당 함수 위치로 이동
  if (card._fullCode && fn.startLine) {
    _scrollCardToLine(card, fn.startLine);
    return;
  }

  //전체 파일 코드가 있으면 그것을 표시하고 해당 함수 범위 하이라이트
  const fileCode = nodeData.code || '';
  const fnCode = fn.code || '';

  if (fileCode && fn.startLine && fn.endLine) {
    //파일 전체 코드 표시 + 함수 범위 하이라이트
    showCodeInCard(card, { ...nodeData, code: fileCode, startLine: 1 });
    highlightLines(card, fn.startLine, fn.endLine);
  } else if (fnCode) {
    //함수 코드만 표시
    showCodeInCard(card, {
      ...fn,
      filePath: nodeData.fullPath || nodeData.filePath,
      label: fn.name,
    });
  }

  //다른 파일 참조 점프 처리: fn.references에 외부 파일 참조가 있으면 카드 자동 열기
  if (fn.references && Array.isArray(fn.references)) {
    for (const ref of fn.references) {
      if (ref.targetFile && ref.targetFile !== nodeData.fullPath) {
        _jumpToExternalFunction(ref);
        break; // 첫 번째 외부 참조만
      }
    }
  }
}

/* "코드 보기" 버튼: 전체 코드를 받아와 표시하거나, 선택한 함수 코드로 되돌린다 */
async function _toggleCardFullCode(card, nodeData, btn) {
  if (card._fullCode) {
    card._fullCode = null;
    btn.textContent = '코드 보기';
    btn.classList.remove('active');
    btn.title = '이 파일의 전체 코드를 봅니다';
    const fn = card._activeFn;
    if (fn) {
      const items = card.querySelectorAll('.canvas-card-fn-item');
      const idx = (nodeData.functions || []).indexOf(fn);
      _selectFunction(card, nodeData, fn, items[idx] || null);
    }
    return;
  }

  const filePath = nodeData.fullPath || nodeData.filePath;
  btn.disabled = true;
  btn.textContent = '불러오는 중...';
  try {
    const code = await fetchFileCode(filePath);
    card._fullCode = code;
    showCodeInCard(card, { code: code || ' ', filePath, startLine: 1 });
    btn.textContent = '함수만 보기';
    btn.classList.add('active');
    btn.title = '선택한 함수 코드로 돌아갑니다';
    if (card._activeFn && card._activeFn.startLine) _scrollCardToLine(card, card._activeFn.startLine);
  } catch (err) {
    btn.textContent = '코드 보기';
    btn.title = err.message || '파일을 불러오지 못했습니다';
    btn.classList.add('error');
    setTimeout(() => btn.classList.remove('error'), 1500);
  } finally {
    btn.disabled = false;
  }
}

/* 전체 코드에서 특정 줄이 보이도록 스크롤 (hljs가 줄 span을 다시 그리므로 줄 높이로 계산) */
function _scrollCardToLine(card, line) {
  const codeArea = card.querySelector('.canvas-card-code');
  const codeEl = codeArea && codeArea.querySelector('code');
  if (!codeEl) return;
  const style = getComputedStyle(codeEl);
  const lineHeight = parseFloat(style.lineHeight) || 18;
  const padTop = parseFloat(style.paddingTop) || 0;
  codeArea.scrollTo({ top: Math.max(0, padTop + (line - 1) * lineHeight - lineHeight * 2), behavior: 'smooth' });
}

/* 외부 파일 함수 점프 */
function _jumpToExternalFunction(ref) {
  if (typeof cy === 'undefined' || !cy || typeof graphData === 'undefined' || !graphData) return;

  const targetFileId = 'file__' + ref.targetFile;
  const targetNode = cy.getElementById(targetFileId);
  if (!targetNode || targetNode.length === 0) return;

  const targetData = targetNode.data();
  openCanvasCard(targetFileId, targetData);

  //타겟 함수 라인으로 하이라이트
  if (ref.targetLine) {
    const targetCard = _openCards.get(targetFileId);
    if (targetCard) {
      setTimeout(() => {
        highlightLines(targetCard, ref.targetLine, ref.targetLine + 5);
      }, 100);
    }
  }
}
