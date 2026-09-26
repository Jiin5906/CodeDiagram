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
  fileView: '뷰 전환 — 지금은 파일 뷰입니다. 누르면 함수 단위로 자세히 봅니다',
  functionView: '뷰 전환 — 지금은 함수 뷰입니다. 누르면 파일 단위 그래프로 돌아갑니다',
  edgesHidden: '연결선 보기 — 함수 사이의 호출 관계 선을 표시합니다',
  edgesShown: '연결선 숨기기 — 함수 사이의 호출 관계 선을 감춥니다',
  collapse: '전체 접기 — 모든 파일 그룹을 접습니다',
  expand: '전체 펼치기 — 접힌 파일 그룹을 모두 펼칩니다',
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

function showDiagnosticsPanel(diagnostics, suggestions) {
  const panel = document.getElementById('diagnostics-panel');
  const content = document.getElementById('diagnostics-content');
  const suggestionsContent = document.getElementById('suggestions-content');

  content.textContent = '';
  suggestionsContent.textContent = '';

  //순환 참조 섹션
  const cycleSection = document.createElement('div');
  cycleSection.className = 'diag-section';
  const cycleTitle = document.createElement('div');
  cycleTitle.className = 'diag-section-title';
  cycleTitle.textContent = '순환 참조';
  cycleSection.appendChild(cycleTitle);

  const fileCycles = diagnostics.cycles.files || [];
  const funcCycles = diagnostics.cycles.functions || [];

  if (fileCycles.length === 0 && funcCycles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'diag-empty';
    empty.textContent = '순환 참조가 없습니다';
    cycleSection.appendChild(empty);
  } else {
    for (const cycle of fileCycles) {
      const item = document.createElement('div');
      item.className = 'diag-item severity-error';
      item.textContent = `파일 순환: ${cycle.join(' → ')}`;
      cycleSection.appendChild(item);
    }
    for (const cycle of funcCycles) {
      const item = document.createElement('div');
      item.className = 'diag-item severity-warning';
      item.textContent = `함수 순환: ${cycle.map(n => n.split('::').pop()).join(' → ')}`;
      cycleSection.appendChild(item);
    }
  }
  content.appendChild(cycleSection);

  //결합도 과다 섹션
  const couplingSection = document.createElement('div');
  couplingSection.className = 'diag-section';
  const couplingTitle = document.createElement('div');
  couplingTitle.className = 'diag-section-title';
  couplingTitle.textContent = '결합도 과다';
  couplingSection.appendChild(couplingTitle);

  const couplingIssues = diagnostics.couplingIssues || [];
  if (couplingIssues.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'diag-empty';
    empty.textContent = '결합도 문제가 없습니다';
    couplingSection.appendChild(empty);
  } else {
    for (const issue of couplingIssues) {
      const item = document.createElement('div');
      item.className = 'diag-item severity-warning';
      item.textContent = `${issue.nodeId.split('::').pop()}: ${issue.message}`;
      item.addEventListener('click', () => { highlightNode(issue.nodeId); });
      couplingSection.appendChild(item);
    }
  }
  content.appendChild(couplingSection);

  //안티패턴 섹션
  const antiSection = document.createElement('div');
  antiSection.className = 'diag-section';
  const antiTitle = document.createElement('div');
  antiTitle.className = 'diag-section-title';
  antiTitle.textContent = '안티패턴';
  antiSection.appendChild(antiTitle);

  const antiPatterns = diagnostics.antiPatterns || [];
  if (antiPatterns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'diag-empty';
    empty.textContent = '안티패턴이 없습니다';
    antiSection.appendChild(empty);
  } else {
    for (const issue of antiPatterns) {
      const item = document.createElement('div');
      item.className = 'diag-item severity-info';
      item.textContent = issue.message;
      item.addEventListener('click', () => { highlightNode(issue.nodeId); });
      antiSection.appendChild(item);
    }
  }
  content.appendChild(antiSection);

  //리팩토링 제안 표시
  if (suggestions && suggestions.length > 0) {
    for (const sug of suggestions) {
      const item = document.createElement('div');
      item.className = 'suggestion-item';

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
    const refs = (fn.inboundRefCount || 0);
    const icon = fn.type === 'variable' ? '\u25C6' : '\u0192';
    const item = document.createElement('div');
    item.className = 'fn-preview-item';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'fn-preview-icon';
    iconSpan.textContent = icon;
    item.appendChild(iconSpan);
    item.appendChild(document.createTextNode(fn.name));
    if (refs > 0) {
      const refSpan = document.createElement('span');
      refSpan.className = 'fn-preview-refs';
      refSpan.textContent = refs + '\u2191';
      item.appendChild(refSpan);
    }
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
  const content = document.getElementById('code-viewer-content');
  if (!panel || !header || !content) return;

  const fileName = node.data('label') || '';
  const functions = node.data('functions') || [];

  header.textContent = fileName;
  content.textContent = '';

  if (functions.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 20px; color: #64748b; font-style: italic;';
    empty.textContent = '\uD568\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4';
    content.appendChild(empty);
    panel.classList.remove('collapsed');
    return;
  }

  const list = document.createElement('div');
  list.className = 'fn-list';

  for (const fn of functions) {
    const item = document.createElement('div');
    item.className = 'fn-list-item';

    const icon = fn.type === 'variable' ? '\u25C6' : (fn.type.includes('function') ? '\u0192' : '\u25CB');
    const refs = (fn.inboundRefCount || 0);

    const iconSpan = document.createElement('span');
    iconSpan.className = 'fn-list-icon';
    iconSpan.textContent = icon;
    item.appendChild(iconSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'fn-list-name';
    nameSpan.textContent = fn.name;
    item.appendChild(nameSpan);

    if (refs > 0) {
      const refSpan = document.createElement('span');
      refSpan.className = 'fn-list-refs';
      refSpan.textContent = refs + '\u2191';
      item.appendChild(refSpan);
    }

    item.addEventListener('click', () => {
      if (fn.code && typeof showCodeViewer === 'function') {
        showCodeViewer({
          ...fn,
          filePath: node.data('fullPath'),
          label: fn.name,
        });
      }
      list.querySelectorAll('.fn-list-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
    });

    list.appendChild(item);
  }

  content.appendChild(list);
  panel.classList.remove('collapsed');
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
      const color = EDGE_TYPE_COLORS[type] || '#60A5FA';
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
