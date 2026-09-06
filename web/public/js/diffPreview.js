//리팩토링 미리보기 시뮬레이션 코드
//순환 참조 제거를 시뮬레이션하고 원래대로 복원하는 기능을 제공한다.

//미리보기 이전 상태를 저장
let previewBackup = null;

//순환 경로에서 마지막 엣지를 제거하는 미리보기를 실행한다.
function previewCycleRemoval(cyclePath) {
  if (!cy || !cyclePath || cyclePath.length < 2) return;

  //이미 미리보기 중이면 먼저 복원
  if (previewBackup) {
    restoreFromPreview();
  }

  //마지막 엣지 찾기 (순환의 마지막 → 처음)
  const lastNode = cyclePath[cyclePath.length - 2];
  const firstNode = cyclePath[cyclePath.length - 1];

  //가능한 엣지 ID 패턴
  const edgeId = `${lastNode}->${firstNode}`;
  const edge = cy.getElementById(edgeId);

  if (edge.length === 0) return;

  //현재 스타일 백업
  previewBackup = {
    edgeId: edgeId,
    wasVisible: edge.style('display') !== 'none',
  };

  //엣지를 제거 표시 (점선으로 변경)
  edge.addClass('preview-removed');

  //미리보기 배너 표시
  const banner = document.getElementById('preview-banner');
  const bannerText = document.getElementById('preview-banner-text');
  const lastName = lastNode.split('::').pop();
  const firstName = firstNode.split('::').pop();
  bannerText.textContent = `미리보기: ${lastName} → ${firstName} 엣지 제거 시뮬레이션`;
  banner.classList.remove('hidden');

  //원래대로 버튼 연결
  document.getElementById('preview-restore-btn').onclick = restoreFromPreview;
}

//미리보기를 취소하고 원래 상태로 복원한다.
function restoreFromPreview() {
  if (!previewBackup || !cy) return;

  const edge = cy.getElementById(previewBackup.edgeId);
  if (edge.length) {
    edge.removeClass('preview-removed');
  }

  previewBackup = null;

  //배너 숨기기
  document.getElementById('preview-banner').classList.add('hidden');
}
