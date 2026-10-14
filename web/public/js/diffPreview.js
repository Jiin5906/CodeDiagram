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

//Diff 비교 뷰: 제안 타입별 구조적 Diff 생성
function showDiffView(suggestion) {
  const overlay = document.getElementById('diff-overlay');
  const content = document.getElementById('diff-content');
  const title = document.getElementById('diff-title');

  if (!overlay || !content) return;

  content.textContent = '';
  title.textContent = `Diff: ${suggestion.title}`;

  const beforeLines = [];
  const afterLines = [];

  if (suggestion.type === 'cycle') {
    //순환 경로 엣지 제거 전후
    const nodes = suggestion.relatedNodes || [];
    if (nodes.length > 1) {
      beforeLines.push('# 현재 구조 (순환 참조 존재)');
      for (let i = 0; i < nodes.length - 1; i++) {
        const from = nodes[i].split('::').pop();
        const to = nodes[i + 1].split('::').pop();
        beforeLines.push(`  ${from} → ${to}`);
      }

      afterLines.push('# 제안 구조 (마지막 엣지 제거)');
      for (let i = 0; i < nodes.length - 2; i++) {
        const from = nodes[i].split('::').pop();
        const to = nodes[i + 1].split('::').pop();
        afterLines.push(`  ${from} → ${to}`);
      }
      const removedFrom = nodes[nodes.length - 2].split('::').pop();
      const removedTo = nodes[nodes.length - 1].split('::').pop();
      afterLines.push(`- ${removedFrom} → ${removedTo}  (제거)`);
    }
  } else if (suggestion.type === 'coupling') {
    //파일 결합도 HAZARD (CR-RFC-2026-002) — 제안에 실린 원값과 사유에 맞춰 구조 전환을 보여준다
    const file = (suggestion.relatedNodes && suggestion.relatedNodes[0]) || '';
    const name = file.split('/').pop() || '대상 파일';
    const m = suggestion.metrics || {};
    const reasons = m.hazard_reasons || [];

    beforeLines.push(`# 현재 구조 (결합도 HAZARD — Ca ${m.ca} · Ce ${m.ce} · I ${m.instability})`);
    beforeLines.push(`  ${m.ca}개 파일 → ${name}   (이 파일에 의존)`);
    beforeLines.push(`  ${name} → ${m.ce}개 파일   (이 파일이 의존)`);

    afterLines.push('# 제안 구조');
    //I가 높음: 구체 구현 대신 추상화에 의존하게 바꾼다 (의존성 역전)
    if (reasons.includes('instability')) {
      afterLines.push(`- ${name} → 구체 구현 파일들에 직접 의존`);
      afterLines.push(`+ ${name} → Interface (추상화)`);
      afterLines.push(`+ 구체 구현 파일들 → Interface 구현`);
    }
    //Ce가 많음: 의존 대상을 파사드 하나로 모은다
    if (reasons.includes('efferent')) {
      afterLines.push(`- ${name} → ${m.ce}개 파일에 직접 의존`);
      afterLines.push(`+ ${name} → Facade → ${m.ce}개 파일`);
    }
    afterLines.push(`  ${suggestion.suggestion}`);
  } else if (suggestion.type === 'antipattern') {
    //대형 유닛 → 분할 제안
    const nodeId = suggestion.nodeId || '';
    const name = nodeId.split('::').pop() || '대형 함수';

    beforeLines.push('# 현재 구조 (대형 유닛)');
    beforeLines.push(`  ${name}: 과도한 책임 집중`);
    beforeLines.push(`  - 기능 A 처리`);
    beforeLines.push(`  - 기능 B 처리`);
    beforeLines.push(`  - 기능 C 처리`);

    afterLines.push('# 제안 구조 (책임 분리)');
    afterLines.push(`+ ${name}_processA(): 기능 A 전담`);
    afterLines.push(`+ ${name}_processB(): 기능 B 전담`);
    afterLines.push(`+ ${name}_processC(): 기능 C 전담`);
    afterLines.push(`  ${name}: 오케스트레이션만 담당`);
  } else {
    beforeLines.push('# 현재 구조');
    beforeLines.push(`  ${suggestion.description || '변경 없음'}`);
    afterLines.push('# 제안 구조');
    afterLines.push(`  ${suggestion.suggestion || '변경 없음'}`);
  }

  //Diff 렌더링
  const beforeSection = document.createElement('div');
  beforeSection.className = 'diff-section';
  const beforeTitle = document.createElement('div');
  beforeTitle.className = 'diff-section-title';
  beforeTitle.textContent = '변경 전';
  beforeSection.appendChild(beforeTitle);

  for (const line of beforeLines) {
    const lineEl = document.createElement('div');
    lineEl.className = 'diff-line';
    if (line.startsWith('- ')) {
      lineEl.className += ' diff-removed';
    }
    lineEl.textContent = line;
    beforeSection.appendChild(lineEl);
  }

  const afterSection = document.createElement('div');
  afterSection.className = 'diff-section';
  const afterTitle = document.createElement('div');
  afterTitle.className = 'diff-section-title';
  afterTitle.textContent = '변경 후';
  afterSection.appendChild(afterTitle);

  for (const line of afterLines) {
    const lineEl = document.createElement('div');
    lineEl.className = 'diff-line';
    if (line.startsWith('+ ')) {
      lineEl.className += ' diff-added';
    } else if (line.startsWith('- ')) {
      lineEl.className += ' diff-removed';
    }
    lineEl.textContent = line;
    afterSection.appendChild(lineEl);
  }

  content.appendChild(beforeSection);
  content.appendChild(afterSection);

  overlay.classList.remove('hidden');
}

function hideDiffView() {
  const overlay = document.getElementById('diff-overlay');
  if (overlay) overlay.classList.add('hidden');
}
