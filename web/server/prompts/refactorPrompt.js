//AI 리팩토링 프롬프트 — 팀에서 직접 작성하는 파일이다.
//
//1. SYSTEM_PROMPT: AI의 역할과 리팩토링 규칙을 적는다.
//   비어 있으면 /api/refactor가 503("프롬프트가 설정되지 않았습니다")을 돌려준다.
//2. buildUserPrompt(context): 진단 정보와 대상 코드를 AI에게 보낼 문장으로 만든다.
//   아래 기본 구현은 문맥을 그대로 나열만 한다. 필요하면 자유롭게 고친다.
//
//응답 형식(JSON)은 schemas/ai-refactor-schema.json으로 API가 강제하므로 프롬프트에 형식을 적지 않아도 된다.
//각 필드의 의미(summary, steps, changes, graphDelta, risks)는 스키마의 description을 참고한다.
//
//context 형태 (services/refactorContext.js가 만든다):
//{
//  suggestion: { type: 'cycle'|'coupling', title, description, advice, relatedNodes[], metrics? },
//  targets: [{ id, file, kind: 'function'|'class'|'file', startLine, endLine, code }],
//}

//TODO(팀): AI의 역할과 리팩토링 규칙을 작성한다.
const SYSTEM_PROMPT = '';

//진단 정보와 대상 코드를 사용자 메시지 하나로 만든다.
//코드는 <code> 태그로 감싸 "지시가 아닌 데이터"임을 구분한다.
function buildUserPrompt(context) {
  const { suggestion, targets } = context;
  const parts = [];

  parts.push('<diagnosis>');
  parts.push(`종류: ${suggestion.type}`);
  parts.push(`제목: ${suggestion.title}`);
  parts.push(`설명: ${suggestion.description}`);
  parts.push(`기본 제안: ${suggestion.advice}`);
  parts.push(`관련 노드: ${suggestion.relatedNodes.join(' → ')}`);
  if (suggestion.metrics) {
    const m = suggestion.metrics;
    parts.push(
      `결합도: Ca ${m.ca}, Ce ${m.ce}, I ${m.instability}, 사유 ${m.hazard_reasons.join(', ')}`,
    );
  }
  parts.push('</diagnosis>');

  for (const t of targets) {
    const range = t.endLine ? ` lines="${t.startLine}-${t.endLine}"` : '';
    parts.push(`<code id="${t.id}" file="${t.file}" kind="${t.kind}"${range}>`);
    parts.push(t.code);
    parts.push('</code>');
  }

  return parts.join('\n');
}

module.exports = { SYSTEM_PROMPT, buildUserPrompt };
