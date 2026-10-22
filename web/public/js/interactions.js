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
      clearHighlights();
      //빈 곳을 누르면 주변 파일만 보던 로컬 그래프에서 전체 보기로 돌아간다
      if (typeof isLocalGraphActive === 'function' && isLocalGraphActive()) exitLocalGraph();
    }
  });

  //다시 렌더링하면 노드가 새로 만들어지므로 이전 하이라이트 상태를 버리고, 남아 있는 검색어는 다시 적용한다
  resetHighlightState();
  const searchInput = document.getElementById('search-input');
  if (searchInput && searchInput.value.trim()) applySearch();

  //DOM 이벤트 리스너는 한 번만 등록
  if (!domListenersBound) {
    domListenersBound = true;
    setupDomListeners();
  }

  //계층형은 파일 뷰 전용 — 함수 뷰는 박스가 겹겹이라 계층형으로 펼치면 읽을 수 없다.
  //켜 둔 상태는 기억했다가 파일 뷰로 돌아오면 다시 적용한다.
  const hierarchyBox = document.getElementById('graph-settings');
  if (hierarchyBox && graphData)
    hierarchyBox.classList.toggle('hidden', currentViewMode !== 'file');
  if (hierarchicalLayout && currentViewMode === 'file') applyHierarchicalLayout();
  syncViewButtons();
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

    setHovered(node.id());

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
      setHovered(null);
    }, 150);
  });

  //파일 노드 클릭 → 로컬 그래프 진입 + 함수 목록/코드 뷰어
  cy.on('tap', 'node[type="file-node"]', function (evt) {
    const node = evt.target;
    clearTimeout(dimTimeout);
    //클릭 후 레이아웃이 움직이면 mouseout이 오지 않아 미리보기가 남으므로 여기서 닫는다
    hideFunctionPreview();

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

  //화면 이동/확대로 노드가 커서 밑에서 벗어나면 미리보기를 닫는다
  cy.on('viewport', hideFunctionPreview);

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

    showRefsInViewer(refs, edge.data('source'), edge.data('target'));
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
    showRefsInViewer(refs, edge.data('source'), edge.data('target'));
    evt.stopPropagation();
  });

  //함수 노드 클릭 → 코드 뷰어에 코드 + AI 해설 표시
  cy.on('tap', 'node[type="function"]', function (evt) {
    const node = evt.target;
    highlightNode(node.id());
    showFunctionDetail(node.data());
    evt.stopPropagation();
  });

  //웹/TS/C++/C# 노드 클릭
  cy.on(
    'tap',
    'node[type="js-function"], node[type="ts-function"], node[type="cpp-function"], node[type="csharp-function"], node[type="html-element"], node[type="css-selector"], node[type="css-variable"]',
    function (evt) {
      const node = evt.target;
      highlightNode(node.id());
      const funcTypes = ['js-function', 'ts-function', 'cpp-function', 'csharp-function'];
      if (funcTypes.includes(node.data('type')) && node.data('code')) {
        showFunctionDetail(node.data());
      } else if (node.data('code') && typeof showCodeViewer === 'function') {
        showCodeViewer(node.data());
      }
      evt.stopPropagation();
    },
  );

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
  setupLongPress();
}

/* ══════════════════════════════════════════════════════════════════
   DOM 이벤트 리스너 (한 번만 등록)
   ══════════════════════════════════════════════════════════════════ */

//리본 버튼 라벨/설명 갱신. textContent를 통째로 바꾸면 아이콘이 사라지므로 라벨 span만 바꾼다.
const RIBBON_TIPS = {
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

//보기 단위 선택 버튼의 선택 표시를 현재 뷰에 맞춘다 (파일 상세 뷰는 파일 쪽으로 표시)
function syncViewButtons() {
  const isFunction = currentViewMode === 'function';
  const fileBtn = document.getElementById('view-file-btn');
  const funcBtn = document.getElementById('view-function-btn');
  if (fileBtn) {
    fileBtn.classList.toggle('active', !isFunction);
    fileBtn.setAttribute('aria-pressed', String(!isFunction));
  }
  if (funcBtn) {
    funcBtn.classList.toggle('active', isFunction);
    funcBtn.setAttribute('aria-pressed', String(isFunction));
  }
}

//파일 뷰 ↔ 함수 뷰 전환 + 뷰 전용 버튼/범례 표시
function setViewMode(mode) {
  if (!graphData) return;
  if (typeof isLocalGraphActive === 'function' && isLocalGraphActive()) exitLocalGraph();

  const isFunction = mode === 'function';
  if (isFunction) {
    renderFunctionView(graphData);
  } else {
    renderGraph(graphData);
  }
  setupInteractions();

  const edgesBtn = document.getElementById('toggle-edges-btn');
  const collapseBtn = document.getElementById('collapse-all-btn');
  const legendFileView = document.getElementById('legend-file-view');
  const legendFuncView = document.getElementById('legend-function-view');
  if (edgesBtn) edgesBtn.classList.toggle('hidden', !isFunction);
  if (collapseBtn) collapseBtn.classList.toggle('hidden', !isFunction);
  if (legendFileView) legendFileView.classList.toggle('hidden', isFunction);
  if (legendFuncView) legendFuncView.classList.toggle('hidden', !isFunction);
  document.getElementById('back-to-package-btn').classList.add('hidden');
  syncViewButtons();
}

function setupDomListeners() {
  //뒤로가기 버튼 핸들러
  document.getElementById('back-to-package-btn').addEventListener('click', () => {
    if (!graphData) return;
    if (currentViewMode === 'file-detail') {
      //파일 뷰로 복귀
      setViewMode('file');
    }
  });

  //진단 패널 닫기
  document.getElementById('diagnostics-close').addEventListener('click', () => {
    document.getElementById('diagnostics-panel').classList.add('hidden');
  });

  //보기 단위 선택 (파일 | 함수)
  document.getElementById('view-file-btn').addEventListener('click', () => {
    if (currentViewMode !== 'file') setViewMode('file');
  });
  document.getElementById('view-function-btn').addEventListener('click', () => {
    if (currentViewMode !== 'function') setViewMode('function');
  });

  //전체 접기/펼치기 버튼
  document.getElementById('collapse-all-btn').addEventListener('click', () => {
    if (!cy) return;
    const fileNodes = cy.nodes('[type="file"]');
    if (allCollapsed) {
      fileNodes.forEach((node) => expandNode(node));
      allCollapsed = false;
      setRibbonLabel('collapse-all-btn', '전체 접기', RIBBON_TIPS.collapse);
    } else {
      fileNodes.forEach((node) => collapseNode(node));
      allCollapsed = true;
      setRibbonLabel('collapse-all-btn', '전체 펼치기', RIBBON_TIPS.expand);
    }
  });

  setupHierarchyToggle();

  //검색과 키보드 단축키는 DOM 리스너이므로 한 번만 등록
  setupSearch();
  setupKeyboardShortcuts();
  setupShortcutsHelp();
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
  children.forEach((child) => {
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
  children.forEach((child) => {
    child.style('display', 'element');
    child.connectedEdges().forEach((edge) => {
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
  return String(nodeId || '')
    .replace(/^file__/, '')
    .split('::')[0];
}

//진단 항목 클릭 → 그래프에서 해당 노드(파일 뷰면 파일 노드)로 이동
function _focusDiagTarget(nodeId) {
  if (!cy || !nodeId) return;
  let target = cy.getElementById(nodeId);
  if (!target.length) {
    //노드가 없으면(파일 뷰 등) 같은 경로의 파일 노드로 이동
    const filePath = _diagFilePath(nodeId);
    target = cy
      .nodes()
      .filter((n) => n.data('fullPath') === filePath)
      .first();
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

  const node = nodes.find((n) => n.data.id === nodeId);
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
    const methods = nodes.filter(
      (n) => n.data.filePath === filePath && n.data.className === memberName && n.data.startLine,
    );
    if (methods.length) {
      return {
        filePath,
        startLine: Math.min(...methods.map((n) => n.data.startLine)),
        endLine: Math.max(...methods.map((n) => n.data.endLine || n.data.startLine)),
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
    showCodeAtLocation(loc.filePath, loc.startLine, loc.endLine, loc.name);
  }
  //코드 뷰어가 새로 열리면 그래프가 다시 맞춰지므로(0.31초 뒤) 그 다음에 대상 노드로 이동한다
  if (wasClosed) {
    setTimeout(() => _focusDiagTarget(nodeId), 360);
  } else {
    _focusDiagTarget(nodeId);
  }
  //어떤 항목을 보고 있는지 표시
  document
    .querySelectorAll('#diagnostics-panel .diag-item.active')
    .forEach((el) => el.classList.remove('active'));
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
  for (const id of nodeIds || []) {
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

/* ── 파일 결합도 표 (CR-RFC-2026-002) ── */

//판정별 진단 항목 등급 — 왼쪽 띠 색(error 빨강, warning 노랑, info 파랑)을 기존 진단 항목과 맞춘다
const COUPLING_SEVERITY = { HAZARD: 'error', WARN: 'warning', SAFE: 'info', 'N/A': 'info' };

//HAZARD 사유를 기준 숫자와 함께 문장으로 만든다 (숫자는 서버 criteria에서 읽는다)
function _couplingReasonText(reasons, criteria) {
  const labels = {
    instability: `I > ${criteria.warnMax}`,
    efferent: `Ce ≥ ${criteria.ceHazard}`,
  };
  if (reasons.length === 2) return `둘 다 (${labels.instability}, ${labels.efferent})`;
  return reasons.map((r) => labels[r]).join(', ');
}

//표의 한 칸
function _couplingCell(text, className) {
  const cell = document.createElement('span');
  cell.className = 'coupling-cell' + (className ? ' ' + className : '');
  cell.textContent = text;
  return cell;
}

//표 머리줄 — 검색·개수 대상이 아니므로 diag-item이 아니다
function _makeCouplingHeader() {
  const header = document.createElement('div');
  header.className = 'coupling-row coupling-header';
  for (const title of ['판정', '파일', 'I', 'Ca', 'Ce', 'CBO']) {
    header.appendChild(_couplingCell(title));
  }
  return header;
}

//파일 한 줄. diag-item으로 만들어 기존 검색 필터·클릭 이동·키보드 조작을 그대로 쓴다.
function _makeCouplingRow(entry, criteria) {
  const { status, instability, ca, ce, cbo, hazard_reasons: reasons } = entry.metrics;
  const item = document.createElement('div');
  item.className = `diag-item coupling-row severity-${COUPLING_SEVERITY[status]}`;
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
  item.title = `${entry.file} — 클릭하면 코드로 이동합니다`;

  const statusClass = 'status-' + (status === 'N/A' ? 'na' : status.toLowerCase());
  item.appendChild(_couplingCell(status, 'coupling-status ' + statusClass));
  item.appendChild(_couplingCell(entry.file.split('/').pop(), 'coupling-file'));
  item.appendChild(_couplingCell(instability === null ? '—' : String(instability), 'coupling-num'));
  item.appendChild(_couplingCell(String(ca), 'coupling-num'));
  item.appendChild(_couplingCell(String(ce), 'coupling-num'));
  item.appendChild(_couplingCell(String(cbo), 'coupling-num'));

  //HAZARD 사유는 아래 줄에 따로 — I 때문인지, Ce 때문인지, 둘 다인지 구분한다
  let reason = '';
  if (status === 'HAZARD') {
    reason = _couplingReasonText(reasons, criteria);
    item.appendChild(_couplingCell('사유: ' + reason, 'coupling-reason'));
  }

  item.dataset.search = [status, entry.file, reason].join(' ').toLowerCase();
  const open = () => _openDiagLocation(entry.file, '', item);
  item.addEventListener('click', open);
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  return item;
}

//진단 패널에 보여줄 결합도 판정 (SAFE·N/A는 손볼 필요가 없으므로 뺀다)
const COUPLING_SHOWN_STATUSES = ['HAZARD', 'WARN'];

//파일 결합도 섹션 — 서버가 HAZARD → WARN → SAFE → N/A 순으로 정렬해 보낸 목록에서 WARN 이상만 표로 그린다
function _makeCouplingSection(coupling) {
  const files = ((coupling && coupling.files) || []).filter((e) =>
    COUPLING_SHOWN_STATUSES.includes(e.metrics.status),
  );
  const criteria = coupling && coupling.criteria;
  const hazardCount = files.filter((e) => e.metrics.status === 'HAZARD').length;
  const warnCount = files.length - hazardCount;
  const rows = files.map((entry) => _makeCouplingRow(entry, criteria));
  const section = _makeDiagSection(
    `파일 결합도 (HAZARD ${hazardCount} · WARN ${warnCount})`,
    rows,
    '결합도가 높은 파일이 없습니다',
  );
  if (rows.length) {
    //판정 기준 한 줄과 머리줄을 첫 행 앞에 끼워 넣는다
    const note = document.createElement('div');
    note.className = 'coupling-criteria';
    note.textContent =
      `판정 기준 ${criteria.name} · I = Ce/(Ca+Ce) · ` +
      `SAFE ≤ ${criteria.safeMax} < WARN ≤ ${criteria.warnMax} < HAZARD, ` +
      `또는 Ce ≥ ${criteria.ceHazard}이면 HAZARD`;
    section.insertBefore(note, rows[0]);
    section.insertBefore(_makeCouplingHeader(), rows[0]);
  }
  return section;
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
    items.forEach((item) => section.appendChild(item));
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
  const terms = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  let shown = 0;
  let total = 0;

  panel.querySelectorAll('.diag-item, .suggestion-item').forEach((item) => {
    const text = item.dataset.search || item.textContent.toLowerCase();
    const match = terms.every((t) => text.includes(t));
    item.classList.toggle('hidden', !match);
    total++;
    if (match) shown++;
  });

  panel.querySelectorAll('.diag-section').forEach((section) => {
    const items = section.querySelectorAll('.diag-item');
    const visible = section.querySelectorAll('.diag-item:not(.hidden)').length;
    const count = section.querySelector('.diag-section-count');
    const total = count ? Number(count.dataset.total) : 0;
    if (count)
      count.textContent = terms.length && total > 0 ? `${visible}/${total}` : String(total);
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
    ...fileCycles.map((cycle) =>
      _makeDiagItem(
        'error',
        `파일 순환: ${cycle.map((f) => f.split('/').pop()).join(' → ')}`,
        cycle,
      ),
    ),
    ...funcCycles.map((cycle) =>
      _makeDiagItem(
        'warning',
        `함수 순환: ${cycle.map((n) => n.split('::').pop()).join(' → ')}`,
        cycle,
      ),
    ),
  ];
  content.appendChild(_makeDiagSection('순환 참조', cycleItems, '순환 참조가 없습니다'));

  //파일 결합도 섹션 (CR-RFC-2026-002) — WARN 이상 파일의 판정과 원값 표
  content.appendChild(_makeCouplingSection(diagnostics.coupling));

  //리팩토링 제안 표시
  if (suggestions && suggestions.length > 0) {
    for (const sug of suggestions) {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.dataset.search = [
        sug.title,
        sug.description,
        sug.suggestion,
        ...(sug.relatedNodes || []),
      ]
        .join(' ')
        .toLowerCase();

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

//엣지 클릭 → 참조 위치 목록을 코드 뷰어 위쪽에 띄운다 (별도 팝업 대신 코드 창 하나로 통합)
//항목을 누르면 그 줄로 이동해 강조한다. 처음에는 첫 번째 참조 위치를 바로 보여준다.
function showRefsInViewer(references, sourceId, targetId) {
  const listEl = document.getElementById('code-viewer-fnlist');
  if (!listEl || !references.length) return;

  const shortName = (id) => String(id).split('::').pop().replace('file__', '');

  listEl.textContent = '';
  listEl.classList.remove('hidden');

  const head = document.createElement('div');
  head.className = 'fn-list-head';
  const title = document.createElement('span');
  title.className = 'ref-list-title';
  title.textContent = shortName(sourceId) + ' → ' + shortName(targetId);
  title.title = sourceId + ' → ' + targetId;
  const count = document.createElement('span');
  count.className = 'fn-list-hint';
  count.textContent = '참조 ' + references.length + '곳';
  head.appendChild(title);
  head.appendChild(count);
  listEl.appendChild(head);

  const list = document.createElement('div');
  list.className = 'fn-list';

  const openRef = (ref, item) => {
    list.querySelectorAll('.fn-list-item.active').forEach((el) => el.classList.remove('active'));
    item.classList.add('active');
    if (ref.file && typeof showCodeAtLocation === 'function') {
      showCodeAtLocation(ref.file, ref.line || 0, ref.line || 0, ref.caller, { keepList: true });
    }
    //함수 뷰: 호출한 함수 노드를 강조하고 화면 가운데로
    if (!cy || currentViewMode === 'file') return;
    const callerNode = cy
      .nodes()
      .filter((n) => n.data('qualifiedName') === ref.caller || n.data('label') === ref.caller);
    if (callerNode.length > 0) {
      highlightNode(callerNode[0].id());
      cy.animate({ center: { eles: callerNode[0] } }, { duration: 400, easing: 'ease-out-cubic' });
    }
  };

  references.forEach((ref, i) => {
    const item = document.createElement('div');
    item.className = 'fn-list-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'fn-list-name';
    const fileName = String(ref.file || '')
      .split('/')
      .pop();
    nameSpan.textContent = fileName + (ref.line ? ':' + ref.line : '');
    nameSpan.title = (ref.file || '') + (ref.line ? ':' + ref.line : '');
    item.appendChild(nameSpan);

    if (ref.caller) {
      const caller = document.createElement('span');
      caller.className = 'ref-list-caller';
      caller.textContent = ref.caller + ' 안에서';
      item.appendChild(caller);
    }

    item.addEventListener('click', () => openRef(ref, item));
    list.appendChild(item);
    if (i === 0) setTimeout(() => openRef(ref, item), 0);
  });

  listEl.appendChild(list);
}

/* ── AI 해설 (코드 뷰어 안에 표시) ── */

//API 키가 없다는 응답을 한 번 받으면 이후에는 요청하지 않는다
let explainUnavailableMsg = null;
//빠르게 여러 함수를 클릭했을 때 늦게 온 이전 응답이 덮어쓰지 않도록 요청 순번을 둔다
let explainSeq = 0;

//함수 코드와 AI 해설을 코드 뷰어 한 곳에 띄운다
function showFunctionDetail(funcData) {
  if (!funcData || !funcData.code) return;
  if (typeof showCodeViewer === 'function') showCodeViewer(funcData);
  showExplanation(funcData);
}

function _explainNote(body, text) {
  body.textContent = '';
  const note = document.createElement('div');
  note.className = 'cv-explain-note';
  note.textContent = text;
  body.appendChild(note);
}

async function showExplanation(funcData) {
  if (typeof showViewerExplain !== 'function') return;
  const body = showViewerExplain();
  if (!body) return;

  const seq = ++explainSeq;
  const nodeId = `${funcData.filePath}::${funcData.qualifiedName}`;

  if (explainCache[nodeId]) {
    body.appendChild(explainCache[nodeId].cloneNode(true));
    return;
  }
  //API 키가 없다는 안내는 처음 한 번만 보여주고, 이후에는 해설 칸을 숨겨 코드 공간을 넓게 쓴다
  if (explainUnavailableMsg) {
    if (typeof hideViewerExplain === 'function') hideViewerExplain();
    return;
  }

  _explainNote(body, 'AI 해설을 생성하고 있습니다...');

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
    if (seq !== explainSeq) return;

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (seq !== explainSeq) return;
      if (response.status === 503) {
        explainUnavailableMsg =
          'API 키가 설정되지 않아 AI 해설을 쓸 수 없습니다. (web/.env의 ANTHROPIC_API_KEY)';
        _explainNote(body, explainUnavailableMsg);
      } else {
        _explainNote(body, `해설을 가져올 수 없습니다: ${err.error || '서버 오류'}`);
      }
      return;
    }

    const data = await response.json();
    if (seq !== explainSeq) return;
    const fragment = formatExplanation(data.explanation);
    explainCache[nodeId] = fragment;
    body.textContent = '';
    body.appendChild(fragment.cloneNode(true));
  } catch (err) {
    if (seq !== explainSeq) return;
    _explainNote(body, `네트워크 오류: ${err.message}`);
  }
}

function formatExplanation(text) {
  const fragment = document.createDocumentFragment();
  const paragraphs = text.split('\n\n');
  paragraphs.forEach((para) => {
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

/* ── 검색/필터 기능 ── */

//검색어에 매칭되는 노드를 찾는다 (입력·Enter·다시 렌더링에서 함께 쓴다)
function findSearchMatches(query) {
  //파일 뷰에서는 file-node도 검색 대상
  const searchSelector =
    currentViewMode === 'file'
      ? 'node[type="file-node"]'
      : 'node[type="function"], node[type="file"], node[type="js-function"], node[type="ts-function"], node[type="cpp-function"], node[type="csharp-function"]';
  return cy
    .nodes(searchSelector)
    .filter((node) => (node.data('label') || '').toLowerCase().includes(query));
}

//검색창의 현재 값으로 검색 하이라이트를 적용한다
function applySearch() {
  const input = document.getElementById('search-input');
  const query = input ? input.value.trim().toLowerCase() : '';
  if (!cy || !query) {
    clearSearch();
    return;
  }
  setSearchMatches(findSearchMatches(query).map((n) => n.id()));
}

function setupSearch() {
  const input = document.getElementById('search-input');

  input.addEventListener('input', applySearch);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = input.value.trim().toLowerCase();
      if (!cy || !query) return;

      const matched = findSearchMatches(query);
      if (matched.length > 0) {
        cy.animate(
          {
            center: { eles: matched[0] },
            zoom: currentViewMode === 'file' ? 1.5 : 2,
          },
          { duration: 400, easing: 'ease-out-cubic' },
        );
      }
    }

    if (e.key === 'Escape') {
      input.value = '';
      clearSearch();
      input.blur();
    }
  });
}

//검색 하이라이트만 해제한다 (선택·hover는 유지)
function clearSearch() {
  setSearchMatches(null);
}

/* ── 키보드 단축키 ── */

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement?.tagName;
    const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

    if (e.key === 'Escape') {
      //단축키 도움말이 열려 있으면 그것만 닫는다
      if (isShortcutsHelpOpen()) {
        toggleShortcutsHelp(false);
        return;
      }

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

    if (e.key === '?') {
      e.preventDefault();
      toggleShortcutsHelp();
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

/* ── 단축키 도움말 ── */

function isShortcutsHelpOpen() {
  const el = document.getElementById('shortcuts-overlay');
  return !!el && !el.classList.contains('hidden');
}

//force를 주지 않으면 열림/닫힘을 뒤집는다
function toggleShortcutsHelp(force) {
  const el = document.getElementById('shortcuts-overlay');
  if (!el) return;
  const open = force === undefined ? el.classList.contains('hidden') : force;
  el.classList.toggle('hidden', !open);
  if (open) {
    const closeBtn = document.getElementById('shortcuts-close');
    if (closeBtn) closeBtn.focus();
  }
}

function setupShortcutsHelp() {
  const el = document.getElementById('shortcuts-overlay');
  const closeBtn = document.getElementById('shortcuts-close');
  const legendBtn = document.getElementById('legend-shortcuts');
  if (closeBtn) closeBtn.addEventListener('click', () => toggleShortcutsHelp(false));
  if (legendBtn) legendBtn.addEventListener('click', () => toggleShortcutsHelp(true));
  //바깥 어두운 영역을 누르면 닫는다
  if (el)
    el.addEventListener('click', (e) => {
      if (e.target === el) toggleShortcutsHelp(false);
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
      const funcTypes = [
        'function',
        'js-function',
        'ts-function',
        'cpp-function',
        'csharp-function',
      ];

      if (funcTypes.includes(nodeType)) {
        highlightNode(node.id());
        if (node.data('code')) showFunctionDetail(node.data());
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

/* ── 계층형 배치 토글 ── */

//true면 계층형(dagre) 배치
let hierarchicalLayout = false;

//같은 층에 노드가 많으면 위→아래(TB) 배치가 옆으로 아주 넓어진다.
//TB와 왼→오(LR)를 모두 계산해 화면에 더 크게 들어오는(맞춤 배율이 큰) 쪽을 쓴다.
const HIERARCHY_COMPARE_LIMIT = 1500; // 이보다 크면 두 번 계산하지 않고 모양으로만 판단

function _runDagre(eles, rankDir) {
  eles
    .layout({
      name: 'dagre',
      animate: false,
      fit: false,
      padding: 40,
      nodeDimensionsIncludeLabels: true,
      rankDir,
      rankSep: 80,
      nodeSep: 40,
      edgeSep: 20,
    })
    .run();
  const bb = eles.boundingBox({ includeLabels: true });
  return Math.min(cy.width() / Math.max(1, bb.w), cy.height() / Math.max(1, bb.h));
}

function applyHierarchicalLayout() {
  if (!cy || currentViewMode !== 'file') return;
  //파일 뷰의 실시간 물리 배치가 계층형 위치를 다시 흩뜨리지 않도록 멈춘다
  if (typeof stopForceSim === 'function') stopForceSim();
  //접힌 노드 등 화면에 없는 요소는 빼고 배치한다
  const eles = cy.elements(':visible');
  if (eles.empty()) return;

  const tbFit = _runDagre(eles, 'TB');
  if (eles.nodes().length <= HIERARCHY_COMPARE_LIMIT) {
    const lrFit = _runDagre(eles, 'LR');
    //LR이 확실히 나을 때만 바꾼다 (비슷하면 익숙한 위→아래 유지)
    if (lrFit <= tbFit * 1.15) _runDagre(eles, 'TB');
  } else {
    //노드가 아주 많으면 TB 결과가 화면보다 3배 이상 가로로 길 때만 LR로 다시 배치
    const bb = eles.boundingBox();
    if (bb.w / Math.max(1, bb.h) > (cy.width() / Math.max(1, cy.height())) * 3)
      _runDagre(eles, 'LR');
  }
  cy.fit(eles, 40);
}

//끄면 파일 뷰를 원래 방식(물리 배치)으로 다시 그린다
function restoreDefaultLayout() {
  if (!cy || !graphData) return;
  renderGraph(graphData);
  setupInteractions();
}

function setupHierarchyToggle() {
  const btn = document.getElementById('hierarchy-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!cy || !graphData || currentViewMode !== 'file') return;
    //로컬 그래프(일부만 표시) 상태에서 배치를 바꾸면 숨겨진 노드와 겹치므로 먼저 전체 보기로 돌아간다
    if (typeof isLocalGraphActive === 'function' && isLocalGraphActive()) exitLocalGraph();
    hierarchicalLayout = !hierarchicalLayout;
    btn.classList.toggle('active', hierarchicalLayout);
    btn.setAttribute('aria-pressed', String(hierarchicalLayout));
    btn.title = hierarchicalLayout
      ? '원래 배치로 되돌립니다'
      : '호출 순서대로 층을 나눠 배치합니다 (화면에 맞게 위→아래 또는 왼→오른쪽)';
    if (hierarchicalLayout) {
      applyHierarchicalLayout();
    } else {
      restoreDefaultLayout();
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
  countSpan.textContent = '함수 ' + funcCount + '개';
  headerDiv.appendChild(countSpan);
  //복잡도 글로우가 있는 파일이면 이유를 함께 알려준다
  const complexity = node.data('complexityLevel');
  if (complexity) {
    const badge = document.createElement('span');
    badge.className = 'fn-preview-complex level-' + complexity;
    badge.textContent = ['', '복잡도 주의', '복잡도 높음', '복잡도 매우 높음'][complexity];
    headerDiv.appendChild(badge);
  }
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
    more.textContent = '외 ' + (funcCount - 3) + '개';
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
  if (typeof hideViewerExplain === 'function') hideViewerExplain();
  fnListEl.textContent = '';
  fnListEl.classList.remove('hidden');

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
      showCodeViewer(
        {
          ...fn,
          filePath: filePath,
          label: fn.name,
        },
        { keepFnList: true, fnIndex: index },
      );
    }
  };

  functions.forEach((fn, index) => {
    const item = document.createElement('div');
    item.className = 'fn-list-item';

    const icon = fn.type === 'variable' ? '◆' : (fn.type || '').includes('function') ? 'ƒ' : '○';
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
  const firstIndex = functions.findIndex((fn) => fn.code);
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
  countDiv.textContent = '참조 ' + refCount + '곳';
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
      typeSpan.textContent = (EDGE_TYPE_LABELS[type] || type) + ' ' + count;
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
      more.textContent = '외 ' + (functionEdges.length - 5) + '개';
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
      cy.edges().style({ display: 'element', 'line-opacity': 0.3 });
      setRibbonLabel('toggle-edges-btn', '선 숨기기', RIBBON_TIPS.edgesShown);
      btn.classList.add('active');
    } else {
      cy.edges().style({ display: 'none' });
      setRibbonLabel('toggle-edges-btn', '선 보기', RIBBON_TIPS.edgesHidden);
      btn.classList.remove('active');
    }
  });
}
