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

  //엣지를 제거 표시 (점선으로 변경)
  edge.addClass('preview-removed');
  previewBackup = { removedEdgeIds: [edgeId], ghostIds: [] };

  const lastName = lastNode.split('::').pop();
  const firstName = firstNode.split('::').pop();
  _showPreviewBanner(`미리보기: ${lastName} → ${firstName} 엣지 제거 시뮬레이션`);
}

//미리보기 배너를 띄우고 원래대로 버튼을 연결한다
function _showPreviewBanner(text) {
  const banner = document.getElementById('preview-banner');
  document.getElementById('preview-banner-text').textContent = text;
  banner.classList.remove('hidden');
  document.getElementById('preview-restore-btn').onclick = restoreFromPreview;
}

//미리보기를 취소하고 원래 상태로 복원한다.
function restoreFromPreview() {
  if (!previewBackup || !cy) return;

  //제거 표시한 엣지는 스타일만 되돌리고, AI 미리보기로 추가한 임시 요소는 지운다
  for (const id of previewBackup.removedEdgeIds) {
    cy.getElementById(id).removeClass('preview-removed');
  }
  for (const id of previewBackup.ghostIds) {
    cy.getElementById(id).remove();
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
  content.classList.remove('ai-refactor');
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

//── AI 리팩토링 ──
//제안 하나를 /api/refactor로 보내고, 받은 리팩토링안을 Diff 오버레이에 보여준다.
//결과는 미리보기일 뿐이며 사용자 파일은 바꾸지 않는다.

//늦게 도착한 이전 요청의 응답을 무시하기 위한 순번
let aiRefactorSeq = 0;

async function showAiRefactor(suggestion) {
  const overlay = document.getElementById('diff-overlay');
  const content = document.getElementById('diff-content');
  const title = document.getElementById('diff-title');
  if (!overlay || !content) return;

  const seq = ++aiRefactorSeq;
  content.textContent = '';
  content.classList.add('ai-refactor');
  title.textContent = `AI 리팩토링: ${suggestion.title}`;
  _aiNote(content, 'AI가 리팩토링안을 만들고 있습니다...');
  overlay.classList.remove('hidden');

  if (typeof graphData === 'undefined' || !graphData || !graphData.analysisId) {
    content.textContent = '';
    _aiNote(content, '분석 정보가 없습니다. 먼저 프로젝트를 분석해 주세요.');
    return;
  }

  try {
    const response = await fetch('/api/refactor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId: graphData.analysisId, suggestion }),
    });
    const data = await response.json().catch(() => ({}));
    if (seq !== aiRefactorSeq) return;

    content.textContent = '';
    if (response.status === 401) {
      //로그인하지 않았거나 키가 거부됐다. 로그인에 성공하면 같은 제안으로 다시 요청한다.
      _aiNote(content, data.error || 'AI 리팩토링은 API 키를 등록해야 쓸 수 있습니다.');
      if (typeof requireLoginFor === 'function') {
        requireLoginFor(() => showAiRefactor(suggestion));
      }
      return;
    }
    if (!response.ok) {
      _aiNote(content, data.error || 'AI 리팩토링을 가져오지 못했습니다.');
      return;
    }
    _renderAiRefactor(content, data);
  } catch {
    if (seq !== aiRefactorSeq) return;
    content.textContent = '';
    _aiNote(content, '서버에 연결하지 못했습니다.');
  }
}

//안내 문구 한 줄
function _aiNote(parent, text) {
  const note = document.createElement('div');
  note.className = 'ai-refactor-note';
  note.textContent = text;
  parent.appendChild(note);
}

//제목이 있는 구역을 만들어 붙이고 돌려준다
function _aiSection(parent, heading) {
  const section = document.createElement('div');
  section.className = 'ai-refactor-section';
  const title = document.createElement('div');
  title.className = 'diff-section-title';
  title.textContent = heading;
  section.appendChild(title);
  parent.appendChild(section);
  return section;
}

//문자열 목록을 ul로 그린다
function _aiList(parent, items) {
  const ul = document.createElement('ul');
  ul.className = 'ai-refactor-list';
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  }
  parent.appendChild(ul);
}

//확장자에 맞춰 하이라이팅한 코드 블록
function _aiCodeBlock(code, file) {
  const pre = document.createElement('pre');
  pre.className = 'ai-refactor-code';
  const codeEl = document.createElement('code');
  const ext = file ? '.' + file.split('.').pop().toLowerCase() : '';
  const lang = typeof langMap !== 'undefined' ? langMap[ext] : '';
  codeEl.textContent = code || '(없음)';
  if (lang) codeEl.className = `language-${lang}`;
  if (typeof hljs !== 'undefined' && code) hljs.highlightElement(codeEl);
  pre.appendChild(codeEl);
  return pre;
}

//응답({ result, model, cached, warnings })을 오버레이에 그린다
function _renderAiRefactor(content, data) {
  const { result, model, cached, warnings } = data;

  const meta = document.createElement('div');
  meta.className = 'ai-refactor-meta';
  meta.textContent = `${model}${cached ? ' · 캐시된 결과' : ''} · 미리보기 전용 (파일은 바뀌지 않습니다)`;
  content.appendChild(meta);

  for (const w of warnings || []) _aiNote(content, `⚠ ${w}`);

  const summary = _aiSection(content, '요약');
  const p = document.createElement('div');
  p.className = 'suggestion-text';
  p.textContent = result.summary;
  summary.appendChild(p);

  if (result.steps.length) _aiList(_aiSection(content, '단계'), result.steps);

  for (const change of result.changes) {
    const section = _aiSection(content, change.file);
    if (change.explanation) {
      const exp = document.createElement('div');
      exp.className = 'suggestion-desc';
      exp.textContent = change.explanation;
      section.appendChild(exp);
    }
    const cols = document.createElement('div');
    cols.className = 'ai-refactor-cols';
    for (const [label, code] of [
      ['변경 전', change.before],
      ['변경 후', change.after],
    ]) {
      const col = document.createElement('div');
      col.className = 'diff-section';
      const colTitle = document.createElement('div');
      colTitle.className = 'ai-refactor-col-title';
      colTitle.textContent = label;
      col.appendChild(colTitle);
      col.appendChild(_aiCodeBlock(code, change.file));
      cols.appendChild(col);
    }
    section.appendChild(cols);
  }

  if (result.risks.length) _aiList(_aiSection(content, '주의할 점'), result.risks);

  const delta = result.graphDelta;
  const deltaCount = delta.addedNodes.length + delta.removedEdges.length + delta.addedEdges.length;
  if (deltaCount > 0) {
    const actions = document.createElement('div');
    actions.className = 'suggestion-actions';
    const btn = document.createElement('button');
    btn.className = 'suggestion-preview-btn';
    btn.textContent = '그래프에서 미리보기';
    btn.addEventListener('click', () => {
      hideDiffView();
      previewAiGraphDelta(delta);
    });
    actions.appendChild(btn);
    content.appendChild(actions);
  }
}

//AI가 제안한 구조 변화를 현재 그래프 위에 겹쳐 보여준다.
//제거될 엣지는 점선, 새 노드·엣지는 초록 점선의 임시 요소로 추가하고, "원래대로"로 모두 되돌린다.
function previewAiGraphDelta(delta) {
  if (!cy) return;
  if (previewBackup) restoreFromPreview();

  const backup = { removedEdgeIds: [], ghostIds: [] };

  for (const { source, target } of delta.removedEdges) {
    cy.edges()
      .filter((e) => e.data('source') === source && e.data('target') === target)
      .forEach((e) => {
        e.addClass('preview-removed');
        backup.removedEdgeIds.push(e.id());
      });
  }

  //새 노드는 연결될 기존 노드 근처에, 없으면 화면 가운데에 둔다
  const ghostIdOf = new Map();
  const ext = cy.extent();
  delta.addedNodes.forEach(({ id, label }, i) => {
    if (cy.getElementById(id).length) return;
    const neighborId = delta.addedEdges
      .map((e) => (e.source === id ? e.target : e.target === id ? e.source : null))
      .find((n) => n && cy.getElementById(n).length);
    const base = neighborId
      ? cy.getElementById(neighborId).position()
      : { x: (ext.x1 + ext.x2) / 2, y: (ext.y1 + ext.y2) / 2 };
    const ghostId = `ai-ghost::${id}`;
    cy.add({
      group: 'nodes',
      data: { id: ghostId, label: label || id.split('::').pop(), type: 'ai-ghost' },
      position: { x: base.x + 80, y: base.y + 60 * (i + 1) },
      classes: 'ai-ghost',
    });
    ghostIdOf.set(id, ghostId);
    backup.ghostIds.push(ghostId);
  });

  //양 끝이 그래프에 있는 엣지만 추가한다
  const resolve = (id) => ghostIdOf.get(id) || (cy.getElementById(id).length ? id : null);
  for (const { source, target } of delta.addedEdges) {
    const s = resolve(source);
    const t = resolve(target);
    if (!s || !t) continue;
    const edgeId = `ai-ghost-edge::${s}->${t}`;
    if (cy.getElementById(edgeId).length) continue;
    cy.add({ group: 'edges', data: { id: edgeId, source: s, target: t }, classes: 'ai-ghost' });
    backup.ghostIds.push(edgeId);
  }

  previewBackup = backup;
  _showPreviewBanner(
    `AI 리팩토링 미리보기: 엣지 ${backup.removedEdgeIds.length}개 제거, 요소 ${backup.ghostIds.length}개 추가`,
  );
}
