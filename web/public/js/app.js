//앱 초기화 및 이벤트 연결 코드다
//페이지 로드 시 실행되는 메인 진입점임.
//그래프 초기화를 하고 분석을 누르면 analyze에 포스트를 요청하고 응답으로 받은 그래프 데이터를 화면에 렌더링하여 화면에 보여주는 연결 코드다.

//최근 분석 결과 보관 (진단 버튼에서 사용)
let lastAnalysisData = null;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('analyze-form');
  const input = document.getElementById('source-input');
  const btn = document.getElementById('analyze-btn');
  const status = document.getElementById('status');
  const container = document.getElementById('cy');
  const emptyState = document.getElementById('empty-state');

  //Cytoscape 초기화
  initGraph(container);

  //분석 전에는 리본 메뉴를 잠그고, 누르면 안내한다
  setupRibbonGuard(input, btn);

  //빈 상태 표시
  if (emptyState) emptyState.classList.add('visible');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const source = input.value.trim();
    if (!source) return;

    btn.disabled = true;
    input.disabled = true;

    //빈 상태 숨기기
    if (emptyState) emptyState.classList.remove('visible');

    //로딩 스피너 표시
    showLoadingState(status, 'Git 클론 중...');

    try {
      updateLoadingStep(status, '서버에 분석 요청 중...');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });

      updateLoadingStep(status, '응답 파싱 중...');

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '서버 오류');
      }

      updateLoadingStep(status, '그래프 구성 중...');

      lastAnalysisData = data;

      const funcCount = data.nodes.filter((n) => n.data.type === 'function').length;
      const jsFuncCount = data.nodes.filter((n) => n.data.type === 'js-function').length;
      const tsFuncCount = data.nodes.filter((n) => n.data.type === 'ts-function').length;
      const cppFuncCount = data.nodes.filter((n) => n.data.type === 'cpp-function').length;
      const csFuncCount = data.nodes.filter((n) => n.data.type === 'csharp-function').length;
      const fileCount = data.nodes.filter((n) => n.data.type === 'file').length;
      const tierCount = data.tiers ? data.tiers.length : 0;

      //언어별 파일 카운트
      let fileDetail = '';
      if (data.fileCounts) {
        const parts = [];
        if (data.fileCounts.python > 0) parts.push(`Python ${data.fileCounts.python}`);
        if (data.fileCounts.html > 0) parts.push(`HTML ${data.fileCounts.html}`);
        if (data.fileCounts.css > 0) parts.push(`CSS ${data.fileCounts.css}`);
        if (data.fileCounts.javascript > 0) parts.push(`JS ${data.fileCounts.javascript}`);
        if (data.fileCounts.typescript > 0) parts.push(`TS ${data.fileCounts.typescript}`);
        if (data.fileCounts.cpp > 0) parts.push(`C++ ${data.fileCounts.cpp}`);
        if (data.fileCounts.csharp > 0) parts.push(`C# ${data.fileCounts.csharp}`);
        if (data.fileCounts.java > 0) parts.push(`Java ${data.fileCounts.java}`);
        fileDetail = parts.join(', ');
      }

      const totalFuncs = funcCount + jsFuncCount + tsFuncCount + cppFuncCount + csFuncCount;
      const webEdgeCount = data.webEdges ? data.webEdges.length : 0;
      const totalEdges = data.edges.length + webEdgeCount;
      const fileLabel = fileDetail ? `${fileCount}개 파일 (${fileDetail})` : `${fileCount}개 파일`;
      hideLoadingState(status);
      status.textContent = `${tierCount}개 참조 그룹, ${fileLabel}, ${totalFuncs}개 함수, ${totalEdges}개 관계 발견`;
      status.className = 'success';

      if (data.warnings && data.warnings.length > 0) {
        status.textContent += ` (경고: ${data.warnings.length}개)`;
      }

      renderGraph(data);
      setupInteractions();
      buildFileTree(data);
      setupFileTree();

      //진단 패널이 열린 채로 새 분석을 하면 패널을 새 결과로 다시 그린다.
      //패널 내용은 showDiagnosticsPanel 안에서만 만들어지므로, 부르지 않으면 이전 저장소의 진단이 남는다.
      //열린 탭과 검색어는 showDiagnosticsPanel이 그대로 유지한다.
      const diagPanel = document.getElementById('diagnostics-panel');
      if (diagPanel && !diagPanel.classList.contains('collapsed')) {
        showDiagnosticsPanel(data.diagnostics, data.suggestions);
      }

      //동적 범례 렌더링
      renderDynamicLegend(data);

      //하단 상태바 표시
      const statusBar = document.getElementById('status-bar');
      if (statusBar) statusBar.classList.remove('hidden');

      //경고 배지
      const warningBadge = document.getElementById('warning-badge');
      if (data.warnings && data.warnings.length > 0 && warningBadge) {
        warningBadge.textContent = '\u26A0 ' + data.warnings.length;
        warningBadge.classList.remove('hidden');
        warningBadge.onclick = () => {
          if (lastAnalysisData) {
            showDiagnosticsPanel(lastAnalysisData.diagnostics, lastAnalysisData.suggestions);
          }
        };
      } else if (warningBadge) {
        warningBadge.classList.add('hidden');
      }

      //리포 칩 표시 + 입력폼 축소
      const repoChip = document.getElementById('repo-chip');
      if (repoChip) {
        const chipText = source.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        repoChip.textContent = chipText;
        repoChip.classList.remove('hidden');
      }

      //계층형 토글 버튼 표시
      const gs = document.getElementById('graph-settings');
      if (gs) gs.classList.remove('hidden');

      //UI 요소 표시
      document.getElementById('search-input').classList.remove('hidden');

      //첫 분석이 끝났으니 리본 메뉴 잠금을 푼다
      setRibbonLocked(false);

      //localStorage에서 패널 상태 복원 (코드 뷰어는 제외 — 새 분석은 그래프 전체를 먼저 보여준다)
      restorePanelState();
      if (typeof hideCodeViewer === 'function') hideCodeViewer();
    } catch (err) {
      hideLoadingState(status);
      showErrorMessage(status, err);
    } finally {
      btn.disabled = false;
      input.disabled = false;
    }
  });

  //진단 버튼 클릭 (열려 있으면 닫고, 닫혀 있으면 열기 - 토글)
  document.getElementById('diagnostics-btn').addEventListener('click', () => {
    if (!lastAnalysisData) return;
    const diagPanel = document.getElementById('diagnostics-panel');
    const isDiagOpen = diagPanel && !diagPanel.classList.contains('collapsed');
    if (isDiagOpen) {
      if (typeof hideDiagnosticsPanel === 'function') hideDiagnosticsPanel();
      return;
    }
    showDiagnosticsPanel(lastAnalysisData.diagnostics, lastAnalysisData.suggestions);
  });
});

/* ── 분석 전 메뉴 안내 ── */

let _toastTimer = null;

//리본 메뉴 잠금을 켜고 끈다.
//버튼을 disabled로 만들면 클릭 이벤트 자체가 오지 않아 안내를 띄울 수 없으므로
//aria-disabled(화면 낭독기용)와 클래스(흐린 표시)로만 잠금을 나타낸다.
function setRibbonLocked(locked) {
  const ribbon = document.getElementById('ribbon');
  if (!ribbon) return;
  ribbon.classList.toggle('needs-analysis', locked);
  ribbon.querySelectorAll('.ribbon-btn').forEach((b) => {
    if (locked) b.setAttribute('aria-disabled', 'true');
    else b.removeAttribute('aria-disabled');
  });
}

function setupRibbonGuard(input, analyzeBtn) {
  const ribbon = document.getElementById('ribbon');
  if (!ribbon) return;
  setRibbonLocked(true);

  //캡처 단계(세 번째 인자 true)에서 버튼보다 먼저 클릭을 받는다.
  //여기서 전파를 멈추면 각 버튼에 붙은 원래 핸들러는 실행되지 않는다.
  ribbon.addEventListener(
    'click',
    (e) => {
      if (lastAnalysisData) return;
      if (!e.target.closest('.ribbon-btn')) return;
      e.preventDefault();
      e.stopPropagation();
      promptForSource(input, analyzeBtn);
    },
    true,
  );

  //강조 표시는 흔들기가 끝나거나 입력칸을 벗어나면 지운다
  const clearAttention = () => input.classList.remove('attention');
  input.addEventListener('animationend', clearAttention);
  input.addEventListener('blur', clearAttention);
}

//상황에 맞는 안내를 띄우고 입력칸으로 시선을 옮긴다
function promptForSource(input, analyzeBtn) {
  const analyzing = analyzeBtn.disabled;
  let message;
  if (analyzing) message = '분석 중입니다. 잠시만 기다려 주세요';
  else if (!input.value.trim()) message = '분석할 GitHub URL이나 폴더 경로를 먼저 입력해 주세요';
  else message = '분석 버튼을 눌러 분석을 시작해 주세요';
  showToast(message);

  //분석 중에는 입력칸이 disabled라 포커스를 줄 수 없다
  if (analyzing) return;
  input.focus();
  //애니메이션을 처음부터 다시 재생하려면 클래스를 뗀 뒤 레이아웃을 한 번 읽고 다시 붙인다
  input.classList.remove('attention');
  void input.offsetWidth;
  input.classList.add('attention');
}

//짧은 안내 메시지. 연달아 부르면 마지막 메시지 기준으로 다시 2.5초를 센다.
function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ── 로딩 상태 표시 ── */

function showLoadingState(statusEl, message) {
  statusEl.className = 'loading-status';
  statusEl.textContent = '';
  const spinner = document.createElement('span');
  spinner.className = 'loading-spinner';
  const text = document.createElement('span');
  text.textContent = message;
  text.className = 'loading-text';
  statusEl.appendChild(spinner);
  statusEl.appendChild(text);
}

function updateLoadingStep(statusEl, message) {
  const text = statusEl.querySelector('.loading-text');
  if (text) {
    text.textContent = message;
  } else {
    showLoadingState(statusEl, message);
  }
}

function hideLoadingState(statusEl) {
  statusEl.textContent = '';
  statusEl.className = '';
}

/* ── 패널 상태 저장/복원 (localStorage) ── */

//value는 패널이 "열려 있는지"다 (fileTree, legendOpen 모두 true = 열림)
function savePanelState(key, value) {
  try {
    const state = JSON.parse(localStorage.getItem('codediagram-panels') || '{}');
    state[key] = value;
    localStorage.setItem('codediagram-panels', JSON.stringify(state));
  } catch (e) {
    /* noop */
  }
}

function restorePanelState() {
  try {
    const state = JSON.parse(localStorage.getItem('codediagram-panels') || '{}');
    const fileTree = document.getElementById('file-tree-panel');

    //파일 트리가 열린 채로 끝났을 때만 다시 연다 (저장값 true = 열림)
    if (fileTree && state.fileTree === true) {
      fileTree.classList.remove('collapsed');
    }
    //코드 뷰어는 파일/함수를 눌렀을 때만 열리므로 열림 상태를 복원하지 않는다
  } catch (e) {
    /* noop */
  }
}

//패널 상태 저장 설정
document.addEventListener('DOMContentLoaded', () => {
  //패널 상태를 localStorage에 저장하도록 기존 토글 이벤트 보강
  const fileTreePanel = document.getElementById('file-tree-panel');
  if (fileTreePanel) {
    const observer = new MutationObserver(() => {
      savePanelState('fileTree', !fileTreePanel.classList.contains('collapsed'));
    });
    observer.observe(fileTreePanel, { attributes: true, attributeFilter: ['class'] });
  }
});

/* ── 동적 범례 렌더링 ── */

const LANG_LEGEND = {
  python: { color: LANG_COLORS.python.bg, label: 'Python' },
  javascript: { color: LANG_COLORS.javascript.bg, label: 'JavaScript' },
  typescript: { color: LANG_COLORS.typescript.bg, label: 'TypeScript' },
  cpp: { color: LANG_COLORS.cpp.bg, label: 'C++' },
  csharp: { color: LANG_COLORS.csharp.bg, label: 'C#' },
  java: { color: LANG_COLORS.java.bg, label: 'Java' },
  html: { color: LANG_COLORS.html.bg, label: 'HTML' },
  css: { color: LANG_COLORS.css.bg, label: 'CSS' },
};

//범례에 표시할 관계 유형 (같은 색은 한 줄로 묶음). 색은 graph.js의 EDGE_TYPE_COLORS와 같다.
const EDGE_LEGEND = [
  { types: ['call'], label: '함수 호출' },
  { types: ['inheritance'], label: '상속' },
  { types: ['variable-ref'], label: '변수 참조' },
  { types: ['script-ref', 'style-ref'], label: '스크립트·스타일 연결' },
  { types: ['dom-access'], label: 'DOM 접근' },
  { types: ['css-target'], label: 'CSS 적용 대상' },
  { types: ['event-binding'], label: '이벤트 연결' },
  { types: ['js-import', 'css-import'], label: 'import' },
  { types: ['css-var'], label: 'CSS 변수' },
];

function renderDynamicLegend(data) {
  const fileView = document.getElementById('legend-file-view');
  if (!fileView) return;

  fileView.textContent = '';

  //1) 언어 — 분석 결과에 존재하는 언어만
  const fc = data.fileCounts || {};
  const langItems = Object.entries(LANG_LEGEND)
    .filter(([key]) => fc[key] > 0)
    .map(([key, info]) => _legendRow(_legendDot(info.color), info.label, fc[key]));
  if (langItems.length)
    fileView.appendChild(_legendSection('언어 (원 색)', langItems, 'legend-grid'));

  //2) 선 색 — 실제로 존재하는 관계 유형만. 기본은 회색이고 마우스를 올리면 이 색으로 바뀐다.
  const present = new Set();
  if (data.edges && data.edges.length) present.add('call');
  if (data.inheritanceEdges && data.inheritanceEdges.length) present.add('inheritance');
  if (data.variableEdges && data.variableEdges.length) present.add('variable-ref');
  for (const e of data.webEdges || []) present.add(e.type);
  const edgeItems = EDGE_LEGEND.filter((item) => item.types.some((t) => present.has(t))).map(
    (item) => _legendRow(_legendLine(EDGE_TYPE_COLORS[item.types[0]]), item.label),
  );
  if (edgeItems.length)
    fileView.appendChild(_legendSection('선 색 (마우스를 올리면 표시)', edgeItems));

  //3) 진단 표시 — codeEffects.js의 테두리·글로우와 같은 기준
  const diag = data.diagnostics || {};
  const hasCycle = ((diag.cycles && diag.cycles.files) || []).length > 0;
  //결합도 판정 (CR-RFC-2026-002) — 기준 숫자는 서버가 보낸 criteria를 그대로 쓴다
  const coupling = diag.coupling || { files: [] };
  const criteria = coupling.criteria;
  const hazardCount = coupling.files.filter((e) => e.metrics.status === 'HAZARD').length;
  const warnCount = coupling.files.filter((e) => e.metrics.status === 'WARN').length;
  const diagItems = [];
  if (hasCycle)
    diagItems.push(_legendRow(_legendRing('#E06666'), '서로를 참조하는 파일 (순환 참조)'));
  //결합도 글로우 — 진단 탭 "파일 결합도"와 같은 판정 (숫자는 진단 탭 개수)
  if (criteria && hazardCount > 0)
    diagItems.push(
      _legendRow(
        _legendDot('#DC2626', true), //codeEffects.js COUPLING_GLOW_LEVELS.HAZARD와 같은 색
        `빨간 빛: 결합도 HAZARD (I > ${criteria.warnMax}·CBO ≥ ${criteria.minCboHazard} 또는 Ce ≥ ${criteria.ceHazard})`,
        hazardCount,
      ),
    );
  if (criteria && warnCount > 0)
    diagItems.push(
      _legendRow(
        _legendDot('#EA580C', true), //codeEffects.js COUPLING_GLOW_LEVELS.WARN과 같은 색
        `주황 빛: 결합도 WARN (I > ${criteria.safeMax}·CBO ≥ ${criteria.minCboWarn})`,
        warnCount,
      ),
    );
  //판정 기준 — HAZARD가 없어도 어떤 기준으로 판정했는지는 항상 보여준다
  if (criteria)
    diagItems.push(
      _legendRow(_legendSymbol('I'), `판정 기준: ${criteria.name} (I = Ce / (Ca + Ce))`),
    );
  if (diagItems.length) fileView.appendChild(_legendSection('진단 표시', diagItems));

  //4) 읽는 법
  fileView.appendChild(
    _legendSection('읽는 법', [
      _legendRow(_legendSymbol('●'), '원이 클수록 코드가 길거나 함수가 많은 파일'),
      _legendRow(_legendSymbol('─'), '선이 굵을수록 참조가 많음'),
      _legendRow(
        _legendSymbol('↗'),
        '클릭하면 연결된 파일로 확대 (빈 곳 클릭: 전체 보기), 더블클릭하면 코드 카드',
      ),
    ]),
  );

  //5) 파일을 클릭하면 오른쪽에 뜨는 함수 목록의 기호
  fileView.appendChild(
    _legendSection('함수 목록 (파일 클릭 시)', [
      _legendRow(_legendSymbol('ƒ'), '함수'),
      _legendRow(_legendSymbol('◆'), '변수'),
      _legendRow(
        _legendSymbol('3↓', 'refs'),
        '이 함수를 호출하는 함수 수. 많을수록 여기저기서 쓰는 함수',
      ),
      _legendRow(
        _legendSymbol('2↑', 'refs out'),
        '이 함수가 호출하는 함수 수. 많을수록 의존하는 곳이 많음',
      ),
    ]),
  );

  //범례 접기/펼치기 — 분석 직후 그래프를 가리지 않도록 기본은 접힘, 펼친 상태는 기억
  const toggle = document.getElementById('legend-toggle');
  const panel = document.getElementById('legend-panel');
  if (toggle && panel) {
    const applyCollapsed = (collapsed) => {
      panel.classList.toggle('collapsed', collapsed);
      toggle.textContent = collapsed ? '범례 ▸' : '범례 ▾';
      toggle.setAttribute('aria-expanded', String(!collapsed));
    };
    applyCollapsed(_loadPanelState().legendOpen !== true);
    toggle.onclick = () => {
      const collapsed = !panel.classList.contains('collapsed');
      applyCollapsed(collapsed);
      savePanelState('legendOpen', !collapsed);
    };
  }
}

function _loadPanelState() {
  try {
    return JSON.parse(localStorage.getItem('codediagram-panels') || '{}');
  } catch (e) {
    return {};
  }
}

function _legendSection(title, rows, extraClass) {
  const section = document.createElement('div');
  section.className = 'legend-section';
  const heading = document.createElement('div');
  heading.className = 'legend-section-title';
  heading.textContent = title;
  const body = document.createElement('div');
  body.className = 'legend-section-body' + (extraClass ? ' ' + extraClass : '');
  rows.forEach((row) => body.appendChild(row));
  section.appendChild(heading);
  section.appendChild(body);
  return section;
}

//count가 있으면 라벨 오른쪽에 흐린 숫자로 표시 (예: Python 12)
function _legendRow(marker, label, count) {
  const row = document.createElement('div');
  row.className = 'legend-item';
  row.appendChild(marker);
  const text = document.createElement('span');
  text.textContent = label;
  row.appendChild(text);
  if (count !== undefined) {
    const countEl = document.createElement('span');
    countEl.className = 'legend-count';
    countEl.textContent = count;
    row.appendChild(countEl);
  }
  return row;
}

function _legendDot(color, glow) {
  const dot = document.createElement('span');
  dot.className = 'legend-dot' + (glow ? ' glow' : '');
  dot.style.setProperty('--dot-color', color);
  return dot;
}

//진단 표시용 고리 (그래프에서 파일 원의 테두리 색과 같음)
function _legendRing(color) {
  const ring = document.createElement('span');
  ring.className = 'legend-ring';
  ring.style.borderColor = color;
  return ring;
}

function _legendLine(color) {
  const line = document.createElement('span');
  line.className = 'legend-line';
  line.style.background = color;
  return line;
}
function _legendSymbol(symbol, variant) {
  const span = document.createElement('span');
  span.className = 'legend-symbol' + (variant ? ' ' + variant : '');
  span.textContent = symbol;
  return span;
}

/* ── 에러 피드백 ── */

function showErrorMessage(statusEl, err) {
  const message = err.message || '알 수 없는 오류';
  let hint = '';

  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('Failed to fetch')
  ) {
    hint = ' (서버 연결을 확인하세요)';
  } else if (message.includes('404') || message.includes('찾을 수 없')) {
    hint = ' (경로나 URL을 확인하세요)';
  } else if (message.includes('clone') || message.includes('git')) {
    hint = ' (Git URL 형식을 확인하세요)';
  } else if (message.includes('timeout') || message.includes('시간 초과')) {
    hint = ' (잠시 후 다시 시도하세요)';
  } else if (message.includes('파일') || message.includes('file')) {
    hint = ' (파일 경로를 확인하세요)';
  }

  statusEl.textContent = `${message}${hint}`;
  statusEl.className = 'error';
}
