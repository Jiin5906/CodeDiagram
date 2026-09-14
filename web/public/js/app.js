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

      const funcCount = data.nodes.filter(n => n.data.type === 'function').length;
      const jsFuncCount = data.nodes.filter(n => n.data.type === 'js-function').length;
      const tsFuncCount = data.nodes.filter(n => n.data.type === 'ts-function').length;
      const cppFuncCount = data.nodes.filter(n => n.data.type === 'cpp-function').length;
      const csFuncCount = data.nodes.filter(n => n.data.type === 'csharp-function').length;
      const fileCount = data.nodes.filter(n => n.data.type === 'file').length;
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

      //툴바 버튼 및 구분선 표시
      document.getElementById('search-input').classList.remove('hidden');
      document.getElementById('toggle-edges-btn').classList.remove('hidden');
      document.getElementById('view-toggle-btn').classList.remove('hidden');
      document.getElementById('diagnostics-btn').classList.remove('hidden');
      document.getElementById('collapse-all-btn').classList.remove('hidden');
      document.getElementById('file-tree-toggle').classList.remove('hidden');
      document.getElementById('layout-select').classList.remove('hidden');
      document.getElementById('divider-1').classList.remove('hidden');
      document.getElementById('divider-2').classList.remove('hidden');

      //엣지 토글 상태 초기화
      edgesVisible = false;
      document.getElementById('toggle-edges-btn').textContent = '그래프 보기';
      document.getElementById('toggle-edges-btn').classList.remove('active');

    } catch (err) {
      hideLoadingState(status);
      showErrorMessage(status, err);
    } finally {
      btn.disabled = false;
      input.disabled = false;
    }
  });

  //진단 버튼 클릭
  document.getElementById('diagnostics-btn').addEventListener('click', () => {
    if (!lastAnalysisData) return;
    showDiagnosticsPanel(
      lastAnalysisData.diagnostics,
      lastAnalysisData.suggestions
    );
  });
});

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

/* ── 에러 피드백 ── */

function showErrorMessage(statusEl, err) {
  const message = err.message || '알 수 없는 오류';
  let hint = '';

  if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
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
