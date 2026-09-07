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

function setupInteractions() {
  if (!cy) return;

  //기존 cytoscape 이벤트 리스너를 모두 제거하여 중복 방지
  cy.removeAllListeners();

  //엣지 클릭 → 참조 위치 팝업 표시
  cy.on('tap', 'edge', function (evt) {
    const edge = evt.target;
    const refs = edge.data('references');
    if (!refs || refs.length === 0) return;

    showRefPopup(evt.renderedPosition, refs, edge.data('source'), edge.data('target'));
    evt.stopPropagation();
  });

  //함수 노드 클릭 → AI 설명 표시
  cy.on('tap', 'node[type="function"]', function (evt) {
    const node = evt.target;
    const nodeId = node.id();

    highlightNode(nodeId);
    showExplanation(node.data());
    evt.stopPropagation();
  });

  //파일/티어 노드 더블클릭 → 접기/펼치기
  cy.on('dbltap', 'node[type="file"], node[type="tier"]', function (evt) {
    const node = evt.target;
    toggleCollapse(node);
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

  //빈 배경 클릭 → 팝업 닫기
  cy.on('tap', function (evt) {
    if (evt.target === cy) {
      hideRefPopup();
      hideExplanation();
      clearHighlights();
    }
  });

  //DOM 이벤트 리스너는 한 번만 등록
  if (!domListenersBound) {
    domListenersBound = true;

    //뒤로가기 버튼 핸들러
    document.getElementById('back-to-package-btn').addEventListener('click', () => {
      if (!graphData) return;
      if (currentViewMode === 'file-detail') {
        renderPackageView(graphData);
        setupInteractions();
        document.getElementById('back-to-package-btn').classList.add('hidden');
        document.getElementById('view-toggle-btn').textContent = '패키지 뷰';
        document.getElementById('view-toggle-btn').classList.add('active');
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

    //뷰 모드 토글 버튼
    document.getElementById('view-toggle-btn').addEventListener('click', () => {
      if (!graphData) return;
      if (currentViewMode === 'function') {
        renderPackageView(graphData);
        document.getElementById('view-toggle-btn').textContent = '패키지 뷰';
        document.getElementById('view-toggle-btn').classList.add('active');
      } else {
        renderGraph(graphData);
        setupInteractions();
        document.getElementById('view-toggle-btn').textContent = '함수 뷰';
        document.getElementById('view-toggle-btn').classList.remove('active');
        document.getElementById('back-to-package-btn').classList.add('hidden');
      }
    });

    //전체 접기/펼치기 버튼
    document.getElementById('collapse-all-btn').addEventListener('click', () => {
      if (!cy) return;
      const fileNodes = cy.nodes('[type="file"]');
      if (allCollapsed) {
        //전체 펼치기
        fileNodes.forEach(node => expandNode(node));
        allCollapsed = false;
        document.getElementById('collapse-all-btn').textContent = '전체 접기';
      } else {
        //전체 접기
        fileNodes.forEach(node => collapseNode(node));
        allCollapsed = true;
        document.getElementById('collapse-all-btn').textContent = '전체 펼치기';
      }
    });

    setupSearch();
    setupEdgeToggle();
  }
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

  //자식 노드 숨기기
  const children = node.children();
  children.forEach(child => {
    child.style('display', 'none');
    //자식의 연결 엣지도 숨기기
    child.connectedEdges().style('display', 'none');
  });
  node.addClass('collapsed');
}

function expandNode(node) {
  const nodeId = node.id();
  if (!collapsedNodes.has(nodeId)) return;
  collapsedNodes.delete(nodeId);

  //자식 노드 보이기
  const children = node.children();
  children.forEach(child => {
    child.style('display', 'element');
    //자식의 연결 엣지도 보이기 (상대 노드가 보이는 경우만)
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
      //클릭 시 해당 노드 하이라이트
      item.addEventListener('click', () => {
        highlightNode(issue.nodeId);
      });
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
      item.addEventListener('click', () => {
        highlightNode(issue.nodeId);
      });
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

      //액션 버튼 영역
      const actions = document.createElement('div');
      actions.className = 'suggestion-actions';

      //순환 참조 제안에 미리보기 버튼 추가
      if (sug.type === 'cycle' && sug.relatedNodes && sug.relatedNodes.length > 1) {
        const previewBtn = document.createElement('button');
        previewBtn.className = 'suggestion-preview-btn';
        previewBtn.textContent = '미리보기';
        previewBtn.addEventListener('click', () => {
          if (typeof previewCycleRemoval === 'function') {
            previewCycleRemoval(sug.relatedNodes);
          }
        });
        actions.appendChild(previewBtn);
      }

      //모든 제안에 Diff 보기 버튼 추가
      const diffBtn = document.createElement('button');
      diffBtn.className = 'suggestion-preview-btn';
      diffBtn.textContent = 'Diff 보기';
      diffBtn.addEventListener('click', () => {
        if (typeof showDiffView === 'function') {
          showDiffView(sug);
        }
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

  //출발/도착 라벨 생성
  const sourceName = sourceId.split('::').pop();
  const targetName = targetId.split('::').pop();
  document.getElementById('ref-popup-title').textContent = `${sourceName} → ${targetName}`;

  //안전한 DOM 방식으로 참조 목록 생성
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

    //클릭 시 호출자(caller) 함수 노드로 카메라 이동
    item.addEventListener('click', () => {
      if (!cy) return;
      //caller 이름으로 함수 노드 검색 (파일::함수 형태의 ID)
      const callerName = ref.caller;
      const callerNode = cy.nodes('[type="function"]').filter(n => {
        return n.data('qualifiedName') === callerName || n.data('label') === callerName;
      });
      if (callerNode.length > 0) {
        const target = callerNode[0];
        highlightNode(target.id());
        cy.animate({
          center: { eles: target },
          zoom: 2,
        }, { duration: 400 });
        hideRefPopup();
      }
    });

    content.appendChild(item);
  });

  //클릭한 위치 근처에 팝업 배치
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

  //코드 세팅
  codeEl.textContent = funcData.code || '';
  codeEl.classList.remove('visible');
  toggleBtn.textContent = '전체 코드 보기';
  codeSection.classList.remove('hidden');

  overlay.classList.remove('hidden');

  //캐시 확인
  if (explainCache[nodeId]) {
    content.textContent = '';
    content.appendChild(explainCache[nodeId].cloneNode(true));
    return;
  }

  //로딩 표시
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
  //안전한 DOM 방식으로 document fragment 생성
  const fragment = document.createDocumentFragment();
  const paragraphs = text.split('\n\n');

  paragraphs.forEach(para => {
    const p = document.createElement('p');
    //문단 안에서 줄바꿈 처리
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

    //매칭 노드 찾기 (함수 + 파일)
    const matched = cy.nodes('[type="function"], [type="file"]').filter(node => {
      const label = (node.data('label') || '').toLowerCase();
      return label.includes(query);
    });

    if (matched.length === 0) {
      clearSearch();
      return;
    }

    //매칭 노드와 부모 계층 하이라이트
    let keepVisible = matched;
    matched.forEach(n => {
      keepVisible = keepVisible.union(n.ancestors());
    });

    cy.nodes().removeClass('highlighted dimmed');
    matched.addClass('highlighted');
    cy.nodes().not(keepVisible).addClass('dimmed');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = input.value.trim().toLowerCase();
      if (!cy || !query) return;

      const matched = cy.nodes('[type="function"], [type="file"]').filter(node => {
        const label = (node.data('label') || '').toLowerCase();
        return label.includes(query);
      });

      if (matched.length > 0) {
        const first = matched[0];
        cy.animate({
          center: { eles: first },
          zoom: 2,
        }, { duration: 400 });
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

/* ── 엣지 보기 토글 ── */

function setupEdgeToggle() {
  const btn = document.getElementById('toggle-edges-btn');

  btn.addEventListener('click', () => {
    if (!cy) return;

    edgesVisible = !edgesVisible;

    if (edgesVisible) {
      cy.edges().style({ 'display': 'element', 'line-opacity': 0.3 });
      btn.textContent = '그래프 숨기기';
      btn.classList.add('active');
    } else {
      cy.edges().style({ 'display': 'none' });
      btn.textContent = '그래프 보기';
      btn.classList.remove('active');
    }
  });
}
