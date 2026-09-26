//사용자 인터렉션 처리를 한다.

const explainCache = {};
//접힌 노드 추적
const collapsedNodes = new Set();
//전체 접기 상태
let allCollapsed = false;
//엣지 토글 상태 (true = 모든 엣지 표시 중)
let edgesVisible = false;
//DOM 이벤트 리스너 중복 등록 방지 플래그
let domListenersBound = false;
//포커스 디밍 타이머
let dimTimeout = null;

function setupInteractions() {
  if (!cy) return;

  //기존 cytoscape 이벤트 리스너를 모두 제거하여 중복 방지
  cy.removeAllListeners();

  if (currentViewMode === 'file') {
    setupFileViewInteractions();
  } else {
    setupFunctionViewInteractions();
  }

  //빈 배경 클릭 → 팝업 닫기
  cy.on('tap', function (evt) {
    if (evt.target === cy) {
      clearTimeout(dimTimeout);
      hideRefPopup();
      hideExplanation();
      clearHighlights();
    }
  });

  //DOM 이벤트 리스너는 한 번만 등록
  if (!domListenersBound) {
    domListenersBound = true;
    setupDomListeners();
  }
}

/* ══════════════════════════════════════════════════════════════════
   파일 뷰 인터랙션 (Phase 1 리뉴얼)
   ══════════════════════════════════════════════════════════════════ */

function setupFileViewInteractions() {
  //포커스 디밍: 노드 호버 시 이웃만 강조, 나머지 페이드아웃 + 함수 프리뷰 툴팁
  cy.on('mouseover', 'node[type="file-node"]', function (evt) {
    const node = evt.target;
    clearTimeout(dimTimeout);

    //로컬 그래프가 활성화된 경우 디밍 스킵
    if (typeof isLocalGraphActive === 'function' && isLocalGraphActive()) {
      //함수 프리뷰 툴팁만 표시
      const functions = node.data('functions') || [];
      const top3 = functions.slice(0, 3);
      if (top3.length > 0) {
        showFunctionPreview(node, top3, evt.renderedPosition);
      }
      return;
    }

    const neighborhood = node.closedNeighborhood();
    const connectedEdges = node.connectedEdges();

    cy.batch(() => {
      cy.elements().not(neighborhood).addClass('dimmed');
      cy.elements().not(neighborhood).removeClass('neighbor-highlight hover-focus');

      neighborhood.removeClass('dimmed');
      neighborhood.addClass('neighbor-highlight');
      connectedEdges.addClass('highlighted');
      connectedEdges.removeClass('dimmed');

      node.addClass('hover-focus');
    });

    //함수 프리뷰 툴팁 표시
    const functions = node.data('functions') || [];
    const top3 = functions.slice(0, 3);
    if (top3.length > 0) {
      showFunctionPreview(node, top3, evt.renderedPosition);
    }
  });

  cy.on('mouseout', 'node[type="file-node"]', function () {
    hideFunctionPreview();
    dimTimeout = setTimeout(() => {
      if (typeof isLocalGraphActive === 'function' && isLocalGraphActive()) return;
      cy.batch(() => {
        cy.elements().removeClass('dimmed neighbor-highlight highlighted hover-focus');
      });
    }, 150);
  });

  //파일 노드 클릭 → 로컬 그래프 진입 + 함수 목록/코드 뷰어
  cy.on('tap', 'node[type="file-node"]', function (evt) {
    const node = evt.target;
    clearTimeout(dimTimeout);

    //로컬 그래프 진입
    if (typeof enterLocalGraph === 'function') {
      enterLocalGraph(node.id());
    } else {
      highlightNode(node.id());
    }

    //함수 프리뷰: 클릭 시 코드 뷰어에 함수 목록 표시
    if (typeof showFunctionList === 'function') {
      showFunctionList(node);
    } else {
      //함수 목록 중 코드가 있는 첫 번째 함수의 코드 뷰어 열기
      const functions = node.data('functions') || [];
      if (functions.length > 0 && functions[0].code && typeof showCodeViewer === 'function') {
        showCodeViewer({
          ...functions[0],
          filePath: node.data('fullPath'),
          label: functions[0].name,
        });
      }
    }

    evt.stopPropagation();
  });

  //파일 노드 더블클릭 → 캔버스 카드 오버레이 (Phase 3)
  cy.on('dbltap', 'node[type="file-node"]', function (evt) {
    const node = evt.target;
    if (typeof openCanvasCard === 'function') {
      openCanvasCard(node.id(), node.data());
    }
    evt.stopPropagation();
  });

  //엣지 호버 → 상세 참조 정보 표시 (집약 엣지) + 엣지 프리뷰 툴팁
  cy.on('mouseover', 'edge[type="aggregated"]', function (evt) {
    const edge = evt.target;
    edge.addClass('highlighted');
    showEdgePreview(edge, evt.renderedPosition);
  });

  cy.on('mouseout', 'edge[type="aggregated"]', function (evt) {
    const edge = evt.target;
    if (!cy.elements('.hover-focus').length) {
      edge.removeClass('highlighted');
    }
    hideEdgePreview();
  });

  //엣지 클릭 → 함수 레벨 참조 팝업
  cy.on('tap', 'edge[type="aggregated"]', function (evt) {
    const edge = evt.target;
    const functionEdges = edge.data('functionEdges') || [];
    const typeBreakdown = edge.data('typeBreakdown') || {};

    if (functionEdges.length === 0) return;

    //참조 목록 생성
    const refs = [];
    for (const fe of functionEdges) {
      if (fe.references) {
        for (const ref of fe.references) {
          refs.push(ref);
        }
      } else {
        refs.push({
          file: fe.source.split('::')[0] || fe.source,
          line: 0,
          caller: fe.source.split('::').pop() || fe.source,
        });
      }
    }

    showRefPopup(evt.renderedPosition, refs, edge.data('source'), edge.data('target'));
    evt.stopPropagation();
  });
}

/* ══════════════════════════════════════════════════════════════════
   함수 뷰 인터랙션 (기존 유지)
   ══════════════════════════════════════════════════════════════════ */

function setupFunctionViewInteractions() {
  //엣지 클릭 → 참조 위치 팝업 표시
  cy.on('tap', 'edge', function (evt) {
    const edge = evt.target;
    const refs = edge.data('references');
    if (!refs || refs.length === 0) return;
    showRefPopup(evt.renderedPosition, refs, edge.data('source'), edge.data('target'));
    evt.stopPropagation();
  });

  //함수 노드 클릭 → AI 설명 + 코드 뷰어 표시
  cy.on('tap', 'node[type="function"]', function (evt) {
    const node = evt.target;
    highlightNode(node.id());
    showExplanation(node.data());
    if (node.data('code') && typeof showCodeViewer === 'function') showCodeViewer(node.data());
    evt.stopPropagation();
  });

  //웹/TS/C++/C# 노드 클릭
  cy.on('tap', 'node[type="js-function"], node[type="ts-function"], node[type="cpp-function"], node[type="csharp-function"], node[type="html-element"], node[type="css-selector"], node[type="css-variable"]', function (evt) {
    const node = evt.target;
    highlightNode(node.id());
    const funcTypes = ['js-function', 'ts-function', 'cpp-function', 'csharp-function'];
    if (funcTypes.includes(node.data('type')) && node.data('code')) {
      showExplanation(node.data());
      if (typeof showCodeViewer === 'function') showCodeViewer(node.data());
    } else if (node.data('code') && typeof showCodeViewer === 'function') {
      showCodeViewer(node.data());
    }
    evt.stopPropagation();
  });

  //파일/티어 노드 더블클릭 → 접기/펼치기
  cy.on('dbltap', 'node[type="file"], node[type="tier"]', function (evt) {
    toggleCollapse(evt.target);
    evt.stopPropagation();
  });

  //패키지 뷰에서 파일 노드 클릭 → 파일 상세 뷰
  cy.on('tap', 'node[type="file"]', function (evt) {
    if (currentViewMode !== 'package') return;
    const node = evt.target;
    const filePath = node.data('fullPath');
    if (filePath && graphData) {
      renderFileDetailView(graphData, filePath);
      setupInteractions();
    }
    evt.stopPropagation();
  });

  setupEdgeToggle();
  setupLayoutSelect();
  setupLongPress();
}

/* ══════════════════════════════════════════════════════════════════
   DOM 이벤트 리스너 (한 번만 등록)
   ══════════════════════════════════════════════════════════════════ */

//리본 버튼 라벨/설명 갱신. textContent를 통째로 바꾸면 아이콘이 사라지므로 라벨 span만 바꾼다.
const RIBBON_TIPS = {
  fileView: '지금은 파일 단위로 보고 있습니다. 누르면 함수 단위로 바뀝니다',
  functionView: '지금은 함수 단위로 보고 있습니다. 누르면 파일 단위로 돌아갑니다',
  edgesHidden: '함수끼리 호출하는 선을 보여줍니다',
  edgesShown: '함수끼리 호출하는 선을 감춥니다',
  collapse: '모든 파일 그룹을 접습니다',
  expand: '접힌 파일 그룹을 모두 펼칩니다',
};

function setRibbonLabel(id, label, tip) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const labelEl = btn.querySelector('.ribbon-label');
  if (labelEl) labelEl.textContent = label;
  btn.setAttribute('aria-label', label);
  if (tip) btn.dataset.tip = tip;
}

function setupDomListeners() {
  //뒤로가기 버튼 핸들러
  document.getElementById('back-to-package-btn').addEventListener('click', () => {
    if (!graphData) return;
    if (currentViewMode === 'file-detail') {
      //파일 뷰로 복귀
      renderGraph(graphData);
      setupInteractions();
      document.getElementById('back-to-package-btn').classList.add('hidden');
      setRibbonLabel('view-toggle-btn', '파일 뷰', RIBBON_TIPS.fileView);
      document.getElementById('view-toggle-btn').classList.remove('active');
    }
  });

  //닫기 버튼
  document.getElementById('ref-popup-close').addEventListener('click', hideRefPopup);
  document.getElementById('explain-close').addEventListener('click', () => {
    hideExplanation();
    clearHighlights();
  });

  //코드 보기/숨기기 토글
  document.getElementById('toggle-code-btn').addEventListener('click', () => {
    const codeEl = document.getElementById('explain-code');
    codeEl.classList.toggle('visible');
    document.getElementById('toggle-code-btn').textContent =
      codeEl.classList.contains('visible') ? '코드 숨기기' : '전체 코드 보기';
  });

  //진단 패널 닫기
  document.getElementById('diagnostics-close').addEventListener('click', () => {
    document.getElementById('diagnostics-panel').classList.add('hidden');
  });

  //뷰 모드 토글 버튼 (파일 뷰 ↔ 함수 뷰)
  document.getElementById('view-toggle-btn').addEventListener('click', () => {
    if (!graphData) return;

    const viewBtn = document.getElementById('view-toggle-btn');
    const edgesBtn = document.getElementById('toggle-edges-btn');
    const collapseBtn = document.getElementById('collapse-all-btn');
    const legendFileView = document.getElementById('legend-file-view');
    const legendFuncView = document.getElementById('legend-function-view');

    function switchToFileView() {
      renderGraph(graphData);
      setupInteractions();
      viewBtn.classList.remove('active');
      setRibbonLabel('view-toggle-btn', '파일 뷰', RIBBON_TIPS.fileView);
      if (edgesBtn) edgesBtn.classList.add('hidden');
      if (collapseBtn) collapseBtn.classList.add('hidden');
      if (legendFileView) legendFileView.classList.remove('hidden');
      if (legendFuncView) legendFuncView.classList.add('hidden');
      document.getElementById('back-to-package-btn').classList.add('hidden');
    }

    if (currentViewMode === 'file') {
      //함수 뷰로 전환
      renderFunctionView(graphData);
      setupInteractions();
      viewBtn.classList.add('active');
      setRibbonLabel('view-toggle-btn', '함수 뷰', RIBBON_TIPS.functionView);
      if (edgesBtn) edgesBtn.classList.remove('hidden');
      if (collapseBtn) collapseBtn.classList.remove('hidden');
      if (legendFileView) legendFileView.classList.add('hidden');
      if (legendFuncView) legendFuncView.classList.remove('hidden');
    } else {
      switchToFileView();
    }
  });

  //전체 접기/펼치기 버튼
  document.getElementById('collapse-all-btn').addEventListener('click', () => {
    if (!cy) return;
    const fileNodes = cy.nodes('[type="file"]');
    if (allCollapsed) {
      fileNodes.forEach(node => expandNode(node));
      allCollapsed = false;
      setRibbonLabel('collapse-all-btn', '전체 접기', RIBBON_TIPS.collapse);
    } else {
      fileNodes.forEach(node => collapseNode(node));
      allCollapsed = true;
      setRibbonLabel('collapse-all-btn', '전체 펼치기', RIBBON_TIPS.expand);
    }
  });

  //로컬 그래프 컨트롤 (그래프 설정 패널 내 Depth 슬라이더)
  const localGraphDepthSlider = document.getElementById('local-graph-depth');
  if (localGraphDepthSlider) {
    localGraphDepthSlider.addEventListener('input', (e) => {
      const depth = parseInt(e.target.value, 10);
      const label = document.getElementById('local-graph-depth-label');
      if (label) label.textContent = depth;
      const display = document.getElementById('local-graph-depth-display');
      if (display) display.textContent = depth;
      if (typeof setLocalGraphDepth === 'function') setLocalGraphDepth(depth);
    });
  }
  const localGraphExitBtn = document.getElementById('local-graph-exit');
  if (localGraphExitBtn) {
    localGraphExitBtn.addEventListener('click', () => {
      if (typeof exitLocalGraph === 'function') exitLocalGraph();
    });
  }

  //검색과 키보드 단축키는 DOM 리스너이므로 한 번만 등록
  setupSearch();
  setupKeyboardShortcuts();
}

/* ── 접기/펼치기 (드릴다운) ── */

function toggleCollapse(node) {
  const nodeId = node.id();
  if (collapsedNodes.has(nodeId)) {
    expandNode(node);
  } else {
    collapseNode(node);
  }
}

function collapseNode(node) {
  const nodeId = node.id();
  if (collapsedNodes.has(nodeId)) return;
  collapsedNodes.add(nodeId);

  const children = node.children();
  children.forEach(child => {
    child.style('display', 'none');
    child.connectedEdges().style('display', 'none');
  });
  node.addClass('collapsed');
}

function expandNode(node) {
  const nodeId = node.id();
  if (!collapsedNodes.has(nodeId)) return;
  collapsedNodes.delete(nodeId);

  const children = node.children();
  children.forEach(child => {
    child.style('display', 'element');
    child.connectedEdges().forEach(edge => {
      const other = edge.source().id() === child.id() ? edge.target() : edge.source();
      if (other.style('display') !== 'none') {
        edge.style('display', 'element');
      }
    });
  });
  node.removeClass('collapsed');
}

/* ── 진단 패널 표시 ── */

//nodeId('경로::함수명' 또는 '경로')에서 파일 경로만 뽑는다
function _diagFilePath(nodeId) {
  return String(nodeId || '').replace(/^file__/, '').split('::')[0];
}

//진단 항목 클릭 → 그래프에서 해당 노드(파일 뷰면 파일 노드)로 이동
function _focusDiagTarget(nodeId) {
  if (!cy || !nodeId) return;
  let target = cy.getElementById(nodeId);
  if (!target.length) {
    //노드가 없으면(파일 뷰 등) 같은 경로의 파일 노드로 이동
    const filePath = _diagFilePath(nodeId);
    target = cy.nodes().filter(n => n.data('fullPath') === filePath).first();
  }
  if (!target.length) return;
  highlightNode(target.id());
  cy.animate({ center: { eles: target } }, { duration: 350, easing: 'ease-out-cubic' });
}

//진단 대상의 코드 위치를 찾는다 → { filePath, startLine, endLine, name }
//  1) 함수 노드(id가 '경로::함수명')의 시작~끝 줄
//  2) '경로::클래스명'이면 그 클래스 메서드들의 첫 줄~마지막 줄
//  3) 메시지 끝의 '(파일:줄)' (예: 미사용 CSS 셀렉터)
//  4) 못 찾으면 파일 첫 줄
function _diagLocation(nodeId, message) {
  const filePath = _diagFilePath(nodeId);
  const data = (typeof lastAnalysisData !== 'undefined' && lastAnalysisData) || graphData;
  const nodes = (data && data.nodes) || [];

  const node = nodes.find(n => n.data.id === nodeId);
  if (node && node.data.startLine) {
    return {
      filePath,
      startLine: node.data.startLine,
      endLine: node.data.endLine || node.data.startLine,
      name: node.data.qualifiedName || node.data.name,
      fnData: node.data,
    };
  }

  const memberName = String(nodeId || '').split('::')[1];
  if (memberName) {
    const methods = nodes.filter(n => n.data.filePath === filePath && n.data.className === memberName && n.data.startLine);
    if (methods.length) {
      return {
        filePath,
        startLine: Math.min(...methods.map(n => n.data.startLine)),
        endLine: Math.max(...methods.map(n => n.data.endLine || n.data.startLine)),
        name: memberName,
      };
    }
  }

  const m = /\(([^()]+):(\d+)\)\s*$/.exec(message || '');
  if (m && (m[1] === filePath || m[1].endsWith('/' + filePath) || filePath.endsWith(m[1]))) {
    const line = parseInt(m[2], 10);
    return { filePath, startLine: line, endLine: line, name: memberName || '' };
  }

  return { filePath, startLine: 0, endLine: 0, name: memberName || '' };
}

//진단 항목 클릭 → 그래프에서 위치를 보여주고, 코드 뷰어에서 해당 줄로 이동
function _openDiagLocation(nodeId, message, itemEl) {
  const panel = document.getElementById('code-viewer-panel');
  const wasClosed = panel && panel.classList.contains('collapsed');
  const loc = _diagLocation(nodeId, message);
  if (loc.filePath && typeof showCodeAtLocation === 'function') {
    showCodeAtLocation(loc.filePath, loc.startLine, loc.endLine, loc.name, loc.fnData);
  }
  //코드 뷰어가 새로 열리면 그래프가 다시 맞춰지므로(0.31초 뒤) 그 다음에 대상 노드로 이동한다
  if (wasClosed) {
    setTimeout(() => _focusDiagTarget(nodeId), 360);
  } else {
    _focusDiagTarget(nodeId);
  }
  //어떤 항목을 보고 있는지 표시
  document.querySelectorAll('#diagnostics-panel .diag-item.active').forEach(el => el.classList.remove('active'));
  if (itemEl) itemEl.classList.add('active');
}

//진단 항목 한 줄: 메시지 + 위치 칩(파일:줄). data-search에 검색용 텍스트를 담는다.
function _makeDiagItem(severity, message, nodeIds) {
  const item = document.createElement('div');
  item.className = 'diag-item severity-' + severity;
  item.tabIndex = 0;
  item.setAttribute('role', 'button');

  const msg = document.createElement('div');
  msg.className = 'diag-item-msg';
  msg.textContent = message;
  item.appendChild(msg);

  //파일마다 칩 하나 — 순환처럼 여러 파일이 얽힌 경우 칩을 눌러 각 파일로 갈 수 있다
  const firstIdByFile = new Map();
  for (const id of (nodeIds || [])) {
    const f = _diagFilePath(id);
    if (f && !firstIdByFile.has(f)) firstIdByFile.set(f, id);
  }
  if (firstIdByFile.size) {
    const fileRow = document.createElement('div');
    fileRow.className = 'diag-item-files';
    for (const [f, id] of firstIdByFile) {
      const loc = _diagLocation(id, message);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'diag-file-chip';
      chip.textContent = f.split('/').pop() + (loc.startLine ? ':' + loc.startLine : '');
      chip.title = f + (loc.startLine ? ` ${loc.startLine}번째 줄로 이동` : ' 열기');
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        _openDiagLocation(id, message, item);
      });
      fileRow.appendChild(chip);
    }
    item.appendChild(fileRow);
  }

  item.dataset.search = (message + ' ' + (nodeIds || []).join(' ')).toLowerCase();
  if (nodeIds && nodeIds.length) {
    item.title = '클릭하면 해당 코드로 이동합니다';
    item.addEventListener('click', () => _openDiagLocation(nodeIds[0], message, item));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _openDiagLocation(nodeIds[0], message, item);
      }
    });
  }
  return item;
}

function _makeDiagSection(title, items, emptyText) {
  const section = document.createElement('div');
  section.className = 'diag-section';
  const heading = document.createElement('div');
  heading.className = 'diag-section-title';
  const label = document.createElement('span');
  label.textContent = title;
  const count = document.createElement('span');
  count.className = 'diag-section-count';
  count.dataset.total = String(items.length);
  count.textContent = items.length;
  heading.appendChild(label);
  heading.appendChild(count);
  section.appendChild(heading);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'diag-empty';
    empty.textContent = emptyText;
    section.appendChild(empty);
  } else {
    items.forEach(item => section.appendChild(item));
    //검색 결과가 없을 때 보여줄 안내
    const noMatch = document.createElement('div');
    noMatch.className = 'diag-empty diag-no-match hidden';
    noMatch.textContent = '일치하는 항목이 없습니다';
    section.appendChild(noMatch);
  }
  return section;
}

//검색어로 진단 항목·리팩토링 제안을 거른다 (공백으로 나눈 단어가 모두 들어있어야 일치)
function filterDiagnostics(query) {
  const panel = document.getElementById('diagnostics-panel');
  if (!panel) return;
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  let total = 0;

  panel.querySelectorAll('.diag-item, .suggestion-item').forEach(item => {
    const text = item.dataset.search || item.textContent.toLowerCase();
    const match = terms.every(t => text.includes(t));
    item.classList.toggle('hidden', !match);
    total++;
    if (match) shown++;
  });

  panel.querySelectorAll('.diag-section').forEach(section => {
    const items = section.querySelectorAll('.diag-item');
    const visible = section.querySelectorAll('.diag-item:not(.hidden)').length;
    const count = section.querySelector('.diag-section-count');
    const total = count ? Number(count.dataset.total) : 0;
    if (count) count.textContent = terms.length && total > 0 ? `${visible}/${total}` : String(total);
    const noMatch = section.querySelector('.diag-no-match');
    if (noMatch) noMatch.classList.toggle('hidden', !(items.length && visible === 0));
  });

  //리팩토링 제안이 모두 걸러졌을 때 안내
  const sugContent = document.getElementById('suggestions-content');
  if (sugContent) {
    let sugNoMatch = sugContent.querySelector('.diag-no-match');
    const sugItems = sugContent.querySelectorAll('.suggestion-item');
    const sugVisible = sugContent.querySelectorAll('.suggestion-item:not(.hidden)').length;
    if (!sugNoMatch && sugItems.length) {
      sugNoMatch = document.createElement('div');
      sugNoMatch.className = 'diag-empty diag-no-match';
      sugNoMatch.textContent = '일치하는 제안이 없습니다';
      sugContent.appendChild(sugNoMatch);
    }
    if (sugNoMatch) sugNoMatch.classList.toggle('hidden', !(sugItems.length && sugVisible === 0));
  }

  const countEl = document.getElementById('diag-search-count');
  if (countEl) countEl.textContent = terms.length ? `${shown}/${total}` : '';
}

function showDiagnosticsPanel(diagnostics, suggestions) {
  const panel = document.getElementById('diagnostics-panel');
  const content = document.getElementById('diagnostics-content');
  const suggestionsContent = document.getElementById('suggestions-content');

  content.textContent = '';
  suggestionsContent.textContent = '';

  //순환 참조 섹션
  const fileCycles = diagnostics.cycles.files || [];
  const funcCycles = diagnostics.cycles.functions || [];
  const cycleItems = [
    ...fileCycles.map(cycle => _makeDiagItem('error',
      `파일 순환: ${cycle.map(f => f.split('/').pop()).join(' → ')}`, cycle)),
    ...funcCycles.map(cycle => _makeDiagItem('warning',
      `함수 순환: ${cycle.map(n => n.split('::').pop()).join(' → ')}`, cycle)),
  ];
  content.appendChild(_makeDiagSection('순환 참조', cycleItems, '순환 참조가 없습니다'));

  //결합도 과다 섹션
  const couplingItems = (diagnostics.couplingIssues || []).map(issue =>
    _makeDiagItem('warning', `${issue.nodeId.split('::').pop()}: ${issue.message}`, [issue.nodeId]));
  content.appendChild(_makeDiagSection('결합도 과다', couplingItems, '결합도 문제가 없습니다'));

  //안티패턴 섹션
  const antiItems = (diagnostics.antiPatterns || []).map(issue =>
    _makeDiagItem('info', issue.message, [issue.nodeId]));
  content.appendChild(_makeDiagSection('안티패턴', antiItems, '안티패턴이 없습니다'));

  //리팩토링 제안 표시
  if (suggestions && suggestions.length > 0) {
    for (const sug of suggestions) {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.dataset.search = [sug.title, sug.description, sug.suggestion, ...(sug.relatedNodes || [])]
        .join(' ').toLowerCase();

      const title = document.createElement('div');
      title.className = 'suggestion-title';
      title.textContent = sug.title;
      item.appendChild(title);

      const desc = document.createElement('div');
      desc.className = 'suggestion-desc';
      desc.textContent = sug.description;
      item.appendChild(desc);

      const text = document.createElement('div');
      text.className = 'suggestion-text';
      text.textContent = sug.suggestion;
      item.appendChild(text);

      const actions = document.createElement('div');
      actions.className = 'suggestion-actions';

      if (sug.type === 'cycle' && sug.relatedNodes && sug.relatedNodes.length > 1) {
        const previewBtn = document.createElement('button');
        previewBtn.className = 'suggestion-preview-btn';
        previewBtn.textContent = '미리보기';
        previewBtn.addEventListener('click', () => {
          if (typeof previewCycleRemoval === 'function') previewCycleRemoval(sug.relatedNodes);
        });
        actions.appendChild(previewBtn);
      }

      const diffBtn = document.createElement('button');
      diffBtn.className = 'suggestion-preview-btn';
      diffBtn.textContent = 'Diff 보기';
      diffBtn.addEventListener('click', () => {
        if (typeof showDiffView === 'function') showDiffView(sug);
      });
      actions.appendChild(diffBtn);
      item.appendChild(actions);

      suggestionsContent.appendChild(item);
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'diag-empty';
    empty.textContent = '리팩토링 제안이 없습니다';
    suggestionsContent.appendChild(empty);
  }

  //다시 열어도 이전 검색어를 유지한다
  const searchInput = document.getElementById('diag-search-input');
  if (searchInput) {
    if (!searchInput.dataset.bound) {
      searchInput.dataset.bound = '1';
      searchInput.addEventListener('input', () => filterDiagnostics(searchInput.value));
      searchInput.addEventListener('keydown', (e) => {
        //Esc: 검색어가 있으면 지우기만 하고 패널은 닫지 않는다
        if (e.key === 'Escape' && searchInput.value) {
          e.stopPropagation();
          searchInput.value = '';
          filterDiagnostics('');
        }
      });
    }
    filterDiagnostics(searchInput.value);
  }

  panel.classList.remove('hidden');
}

/* ── 참조 팝업 ── */

function showRefPopup(position, references, sourceId, targetId) {
  const popup = document.getElementById('ref-popup');
  const content = document.getElementById('ref-popup-content');

  const sourceName = sourceId.split('::').pop().replace('file__', '');
  const targetName = targetId.split('::').pop().replace('file__', '');
  document.getElementById('ref-popup-title').textContent = `${sourceName} → ${targetName}`;

  content.textContent = '';
  references.forEach(ref => {
    const item = document.createElement('div');
    item.className = 'ref-item';

    const fileSpan = document.createElement('span');
    fileSpan.className = 'ref-file';
    fileSpan.textContent = ref.file;

    const lineText = document.createTextNode(`:${ref.line} `);

    const callerSpan = document.createElement('span');
    callerSpan.className = 'ref-caller';
    callerSpan.textContent = `(in ${ref.caller})`;

    item.appendChild(fileSpan);
    item.appendChild(lineText);
    item.appendChild(callerSpan);

    item.addEventListener('click', () => {
      if (!cy) return;
      const callerName = ref.caller;
      const callerNode = cy.nodes().filter(n => {
        return n.data('qualifiedName') === callerName || n.data('label') === callerName;
      });
      if (callerNode.length > 0) {
        const target = callerNode[0];
        highlightNode(target.id());
        cy.animate({
          center: { eles: target },
          zoom: 2,
        }, { duration: 400, easing: 'ease-out-cubic' });
        hideRefPopup();
      }
    });

    content.appendChild(item);
  });

  popup.style.left = `${Math.min(position.x + 10, window.innerWidth - 440)}px`;
  popup.style.top = `${Math.min(position.y + 10, window.innerHeight - 320)}px`;
  popup.classList.remove('hidden');
}

function hideRefPopup() {
  document.getElementById('ref-popup').classList.add('hidden');
}

/* ── AI 설명 오버레이 ── */

async function showExplanation(funcData) {
  const overlay = document.getElementById('explain-overlay');
  const title = document.getElementById('explain-title');
  const content = document.getElementById('explain-content');
  const codeSection = document.getElementById('explain-code-section');
  const codeEl = document.getElementById('explain-code');
  const toggleBtn = document.getElementById('toggle-code-btn');

  const nodeId = `${funcData.filePath}::${funcData.qualifiedName}`;

  title.textContent = funcData.qualifiedName;

  codeEl.textContent = funcData.code || '';
  codeEl.classList.remove('visible');
  toggleBtn.textContent = '전체 코드 보기';
  codeSection.classList.remove('hidden');

  overlay.classList.remove('hidden');

  if (explainCache[nodeId]) {
    content.textContent = '';
    content.appendChild(explainCache[nodeId].cloneNode(true));
    return;
  }

  content.textContent = '';
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading';
  loadingDiv.textContent = 'AI 설명을 생성하고 있습니다...';
  content.appendChild(loadingDiv);

  try {
    const response = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: funcData.qualifiedName,
        code: funcData.code,
        docstring: funcData.docstring || '',
        comment: funcData.comment || '',
        filePath: funcData.filePath,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      content.textContent = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'loading';
      errDiv.textContent = `설명을 가져올 수 없습니다: ${err.error || '서버 오류'}`;
      content.appendChild(errDiv);
      return;
    }

    const data = await response.json();
    const fragment = formatExplanation(data.explanation);
    explainCache[nodeId] = fragment;
    content.textContent = '';
    content.appendChild(fragment.cloneNode(true));
  } catch (err) {
    content.textContent = '';
    const errDiv = document.createElement('div');
    errDiv.className = 'loading';
    errDiv.textContent = `네트워크 오류: ${err.message}`;
    content.appendChild(errDiv);
  }
}

function formatExplanation(text) {
  const fragment = document.createDocumentFragment();
  const paragraphs = text.split('\n\n');
  paragraphs.forEach(para => {
    const p = document.createElement('p');
    const lines = para.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) p.appendChild(document.createElement('br'));
      p.appendChild(document.createTextNode(line));
    });
    fragment.appendChild(p);
  });
  return fragment;
}

function hideExplanation() {
  document.getElementById('explain-overlay').classList.add('hidden');
}

/* ── 검색/필터 기능 ── */

function setupSearch() {
  const input = document.getElementById('search-input');

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (!cy || !query) {
      clearSearch();
      return;
    }

    //파일 뷰에서는 file-node도 검색 대상
    const searchSelector = currentViewMode === 'file'
      ? 'node[type="file-node"]'
      : 'node[type="function"], node[type="file"], node[type="js-function"], node[type="ts-function"], node[type="cpp-function"], node[type="csharp-function"]';

    const matched = cy.nodes(searchSelector).filter(node => {
      const label = (node.data('label') || '').toLowerCase();
      return label.includes(query);
    });

    if (matched.length === 0) {
      clearSearch();
      return;
    }

    let keepVisible = matched;
    if (currentViewMode !== 'file') {
      matched.forEach(n => { keepVisible = keepVisible.union(n.ancestors()); });
    }

    cy.nodes().removeClass('highlighted dimmed');
    matched.addClass('highlighted');
    cy.nodes().not(keepVisible).addClass('dimmed');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = input.value.trim().toLowerCase();
      if (!cy || !query) return;

      const searchSelector = currentViewMode === 'file'
        ? 'node[type="file-node"]'
        : 'node[type="function"], node[type="file"]';

      const matched = cy.nodes(searchSelector).filter(node => {
        const label = (node.data('label') || '').toLowerCase();
        return label.includes(query);
      });

      if (matched.length > 0) {
        const first = matched[0];
        cy.animate({
          center: { eles: first },
          zoom: currentViewMode === 'file' ? 1.5 : 2,
        }, { duration: 400, easing: 'ease-out-cubic' });
      }
    }

    if (e.key === 'Escape') {
      input.value = '';
      clearSearch();
      input.blur();
    }
  });
}

function clearSearch() {
  if (!cy) return;
  cy.nodes().removeClass('highlighted dimmed');
  cy.edges().removeClass('highlighted dimmed');
}

/* ── 키보드 단축키 ── */

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement?.tagName;
    const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

    if (e.key === 'Escape') {
      //캔버스 카드가 열려있으면 최상위 카드 닫기
      if (typeof hasOpenCards === 'function' && hasOpenCards()) {
        closeTopCard();
        return;
      }

      //로컬 그래프가 활성화된 경우 먼저 빠져나옴
      if (typeof isLocalGraphActive === 'function' && isLocalGraphActive()) {
        exitLocalGraph();
        return;
      }

      hideRefPopup();
      hideExplanation();
      clearHighlights();
      hideFunctionPreview();
      hideEdgePreview();
      if (typeof hideCodeViewer === 'function') hideCodeViewer();
      document.getElementById('diagnostics-panel').classList.add('hidden');
      const diffOverlay = document.getElementById('diff-overlay');
      if (diffOverlay) diffOverlay.classList.add('hidden');
      if (isInput) document.activeElement.blur();
      return;
    }

    if (isInput) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      //진단 패널이 열려 있으면 진단 검색창으로
      const diagPanel = document.getElementById('diagnostics-panel');
      const diagSearch = document.getElementById('diag-search-input');
      if (diagPanel && diagSearch && !diagPanel.classList.contains('hidden')) {
        diagSearch.focus();
        diagSearch.select();
        return;
      }
      const searchInput = document.getElementById('search-input');
      if (searchInput && !searchInput.classList.contains('hidden')) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    if (e.key === 'f' || e.key === 'F') {
      if (cy) {
        cy.animate({ fit: { padding: 30 } }, { duration: 300, easing: 'ease-out-cubic' });
      }
      return;
    }
  });
}

/* ── 롱 프레스 (모바일 우클릭 대체) ── */

function setupLongPress() {
  if (!cy) return;
  let longPressTimer = null;
  let longPressTarget = null;

  cy.on('tapstart', 'node', function (evt) {
    longPressTarget = evt.target;
    longPressTimer = setTimeout(() => {
      if (!longPressTarget) return;
      const node = longPressTarget;
      const nodeType = node.data('type');
      const funcTypes = ['function', 'js-function', 'ts-function', 'cpp-function', 'csharp-function'];

      if (funcTypes.includes(nodeType)) {
        highlightNode(node.id());
        if (node.data('code')) {
          showExplanation(node.data());
          if (typeof showCodeViewer === 'function') showCodeViewer(node.data());
        }
      } else if (nodeType === 'file' || nodeType === 'file-node') {
        const filePath = node.data('fullPath');
        if (filePath && graphData && typeof renderFileDetailView === 'function') {
          renderFileDetailView(graphData, filePath);
          setupInteractions();
        }
      }
      longPressTarget = null;
    }, 600);
  });

  cy.on('tapend tapdrag', function () {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressTarget = null;
  });
}

/* ── 레이아웃 선택 ── */

function setupLayoutSelect() {
  const select = document.getElementById('layout-select');
  if (!select) return;

  select.addEventListener('change', () => {
    if (!cy || !graphData) return;
    const layout = select.value;

    if (layout === 'dagre') {
      if (typeof stopForceSim === 'function') stopForceSim();
      cy.layout({
        name: 'dagre', animate: false, fit: true, padding: 40,
        nodeDimensionsIncludeLabels: true, rankDir: 'TB',
        rankSep: 80, nodeSep: 40, edgeSep: 20,
      }).run();
    } else {
      if (currentViewMode === 'function') {
        renderFunctionView(graphData);
      } else {
        renderGraph(graphData);
      }
      setupInteractions();
    }
  });
}

/* ── 함수 프리뷰 (Phase 2) ── */

function showFunctionPreview(node, top3, position) {
  let tooltip = document.getElementById('function-preview');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'function-preview';
    tooltip.className = 'function-preview';
    document.body.appendChild(tooltip);
  }

  tooltip.textContent = '';

  const fileName = node.data('label') || '';
  const funcCount = node.data('funcCount') || 0;

  //헤더
  const headerDiv = document.createElement('div');
  headerDiv.className = 'fn-preview-header';
  headerDiv.textContent = fileName + ' ';
  const countSpan = document.createElement('span');
  countSpan.className = 'fn-preview-count';
  countSpan.textContent = funcCount + ' functions';
  headerDiv.appendChild(countSpan);
  tooltip.appendChild(headerDiv);

  //함수 목록
  const listDiv = document.createElement('div');
  listDiv.className = 'fn-preview-list';
  for (const fn of top3) {
    const icon = fn.type === 'variable' ? '\u25C6' : '\u0192';
    const item = document.createElement('div');
    item.className = 'fn-preview-item';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'fn-preview-icon';
    iconSpan.textContent = icon;
    item.appendChild(iconSpan);
    item.appendChild(document.createTextNode(fnDisplayName(fn)));
    appendRefBadges(item, fn, 'fn-preview-refs');
    listDiv.appendChild(item);
  }
  if (funcCount > 3) {
    const more = document.createElement('div');
    more.className = 'fn-preview-more';
    more.textContent = '+' + (funcCount - 3) + ' more...';
    listDiv.appendChild(more);
  }
  tooltip.appendChild(listDiv);

  tooltip.classList.remove('hidden');

  const container = document.getElementById('graph-container');
  const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
  const x = Math.min(rect.left + position.x + 15, window.innerWidth - 240);
  const y = Math.min(rect.top + position.y + 15, window.innerHeight - 200);
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideFunctionPreview() {
  const tooltip = document.getElementById('function-preview');
  if (tooltip) tooltip.classList.add('hidden');
}

function showFunctionList(node) {
  const panel = document.getElementById('code-viewer-panel');
  const header = document.getElementById('code-viewer-filename');
  const fnListEl = document.getElementById('code-viewer-fnlist');
  if (!panel || !header || !fnListEl) return;

  const fileName = node.data('label') || '';
  const filePath = node.data('fullPath') || '';
  const functions = node.data('functions') || [];

  header.textContent = fileName;
  header.title = filePath || fileName;
  fnListEl.textContent = '';
  fnListEl.classList.remove('hidden');
  if (typeof setCodeViewerFile === 'function') setCodeViewerFile(filePath);

  //목록 머리: 개수 + 숫자↑ 설명 (범례와 같은 내용)
  const head = document.createElement('div');
  head.className = 'fn-list-head';
  const count = document.createElement('span');
  count.textContent = '함수 ' + functions.length + '개';
  const hint = document.createElement('span');
  hint.className = 'fn-list-hint';
  hint.textContent = '↓ 불린 횟수   ↑ 부른 횟수';
  head.appendChild(count);
  head.appendChild(hint);
  fnListEl.appendChild(head);

  if (functions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fn-list-empty';
    empty.textContent = '함수가 없는 파일입니다. 아래에 전체 코드를 보여줍니다.';
    fnListEl.appendChild(empty);
    //함수가 없으면 전체 코드를 바로 보여준다
    if (typeof showFullFileCode === 'function') showFullFileCode(filePath);
    return;
  }

  const list = document.createElement('div');
  list.className = 'fn-list';

  const openFn = (fn, index) => {
    if (fn.code && typeof showCodeViewer === 'function') {
      showCodeViewer({
        ...fn,
        filePath: filePath,
        label: fn.name,
      }, { keepFnList: true, fnIndex: index });
    }
  };

  functions.forEach((fn, index) => {
    const item = document.createElement('div');
    item.className = 'fn-list-item';

    const icon = fn.type === 'variable' ? '◆' : ((fn.type || '').includes('function') ? 'ƒ' : '○');
    const iconSpan = document.createElement('span');
    iconSpan.className = 'fn-list-icon';
    iconSpan.textContent = icon;
    item.appendChild(iconSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'fn-list-name';
    nameSpan.textContent = fnDisplayName(fn);
    nameSpan.title = fnDisplayName(fn);
    item.appendChild(nameSpan);

    appendRefBadges(item, fn, 'fn-list-refs');

    item.addEventListener('click', () => openFn(fn, index));
    list.appendChild(item);
  });

  fnListEl.appendChild(list);

  //첫 번째 함수(참조가 가장 많은 함수) 코드를 먼저 보여준다
  const firstIndex = functions.findIndex(fn => fn.code);
  if (firstIndex >= 0) {
    openFn(functions[firstIndex], firstIndex);
  } else {
    panel.classList.remove('collapsed');
  }
}

/* ── 엣지 프리뷰 (Phase 2) ── */

function showEdgePreview(edge, position) {
  let tooltip = document.getElementById('edge-preview');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'edge-preview';
    tooltip.className = 'edge-preview';
    document.body.appendChild(tooltip);
  }

  tooltip.textContent = '';

  const sourceFile = (edge.data('source') || '').replace('file__', '');
  const targetFile = (edge.data('target') || '').replace('file__', '');
  const refCount = edge.data('refCount') || 0;
  const typeBreakdown = edge.data('typeBreakdown') || {};
  const functionEdges = edge.data('functionEdges') || [];

  //헤더
  const headerDiv = document.createElement('div');
  headerDiv.className = 'edge-preview-header';
  headerDiv.textContent = sourceFile + ' \u2192 ' + targetFile;
  tooltip.appendChild(headerDiv);

  //참조 수
  const countDiv = document.createElement('div');
  countDiv.className = 'edge-preview-count';
  countDiv.textContent = refCount + ' references';
  tooltip.appendChild(countDiv);

  //타입별 카운트
  const types = Object.entries(typeBreakdown);
  if (types.length > 0) {
    const typesDiv = document.createElement('div');
    typesDiv.className = 'edge-preview-types';
    for (const [type, count] of types) {
      const color = EDGE_TYPE_COLORS[type] || '#548AF7';
      const typeSpan = document.createElement('span');
      typeSpan.className = 'edge-preview-type';
      typeSpan.style.borderLeft = '3px solid ' + color;
      typeSpan.textContent = type + ': ' + count;
      typesDiv.appendChild(typeSpan);
    }
    tooltip.appendChild(typesDiv);
  }

  //함수 관계 (최대 5개)
  const shown = functionEdges.slice(0, 5);
  if (shown.length > 0) {
    const funcsDiv = document.createElement('div');
    funcsDiv.className = 'edge-preview-funcs';
    for (const fe of shown) {
      const src = (fe.source || '').split('::').pop();
      const tgt = (fe.target || '').split('::').pop();
      const funcDiv = document.createElement('div');
      funcDiv.className = 'edge-preview-func';
      funcDiv.textContent = src + ' \u2192 ' + tgt;
      funcsDiv.appendChild(funcDiv);
    }
    if (functionEdges.length > 5) {
      const more = document.createElement('div');
      more.className = 'edge-preview-more';
      more.textContent = '+' + (functionEdges.length - 5) + ' more...';
      funcsDiv.appendChild(more);
    }
    tooltip.appendChild(funcsDiv);
  }

  tooltip.classList.remove('hidden');

  const container = document.getElementById('graph-container');
  const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
  const x = Math.min(rect.left + position.x + 15, window.innerWidth - 280);
  const y = Math.min(rect.top + position.y + 15, window.innerHeight - 250);
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideEdgePreview() {
  const tooltip = document.getElementById('edge-preview');
  if (tooltip) tooltip.classList.add('hidden');
}

/* ── 엣지 보기 토글 ── */

function setupEdgeToggle() {
  const btn = document.getElementById('toggle-edges-btn');

  btn.addEventListener('click', () => {
    if (!cy) return;

    edgesVisible = !edgesVisible;

    if (edgesVisible) {
      cy.edges().style({ 'display': 'element', 'line-opacity': 0.3 });
      setRibbonLabel('toggle-edges-btn', '선 숨기기', RIBBON_TIPS.edgesShown);
      btn.classList.add('active');
    } else {
      cy.edges().style({ 'display': 'none' });
      setRibbonLabel('toggle-edges-btn', '선 보기', RIBBON_TIPS.edgesHidden);
      btn.classList.remove('active');
    }
  });
}
