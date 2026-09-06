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

  //Cytoscape 초기화
  initGraph(container);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const source = input.value.trim();
    if (!source) return;

    btn.disabled = true;
    status.textContent = '분석 중...';
    status.className = '';

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '서버 오류');
      }

      lastAnalysisData = data;

      const funcCount = data.nodes.filter(n => n.data.type === 'function').length;
      const fileCount = data.nodes.filter(n => n.data.type === 'file').length;
      const tierCount = data.tiers ? data.tiers.length : 0;

      status.textContent = `${tierCount}개 참조 그룹, ${fileCount}개 파일, ${funcCount}개 함수, ${data.edges.length}개 호출 관계 발견`;
      status.className = 'success';

      if (data.warnings && data.warnings.length > 0) {
        status.textContent += ` (경고: ${data.warnings.length}개)`;
      }

      renderGraph(data);
      setupInteractions();

      //툴바 버튼 표시
      document.getElementById('search-input').classList.remove('hidden');
      document.getElementById('toggle-edges-btn').classList.remove('hidden');
      document.getElementById('view-toggle-btn').classList.remove('hidden');
      document.getElementById('diagnostics-btn').classList.remove('hidden');
      document.getElementById('collapse-all-btn').classList.remove('hidden');

      //엣지 토글 상태 초기화
      edgesVisible = false;
      document.getElementById('toggle-edges-btn').textContent = '그래프 보기';
      document.getElementById('toggle-edges-btn').classList.remove('active');

    } catch (err) {
      status.textContent = err.message;
      status.className = 'error';
    } finally {
      btn.disabled = false;
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
