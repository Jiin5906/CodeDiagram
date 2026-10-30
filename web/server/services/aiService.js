//파일명 그대로 AI와 연동을 해주는 서비스이나. 일단 임시적으로 클로드를 사용을 했다. 추후에 바꿔도 상관 없을 듯.

const { Anthropic } = require('@anthropic-ai/sdk');

/** @type {Anthropic | null} */
let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

//Claude API로 함수 설명을 생성하는 함수다.
async function explainFunction({ name, code, docstring, comment, filePath }) {
  const anthropic = getClient();

  const contextParts = [];
  if (docstring) contextParts.push(`Docstring: ${docstring}`);
  if (comment) contextParts.push(`Comment: ${comment}`);

  const prompt = `다음 Python 함수의 역할을 간결하게 설명해주세요 (한국어, 3-5문장).

함수 이름: ${name}
파일: ${filePath}
${contextParts.length > 0 ? contextParts.join('\n') : ''}

코드:
\`\`\`python
${code}
\`\`\`

이 함수가 무엇을 하는지, 입력과 출력이 무엇인지, 프로젝트에서 어떤 역할을 하는지 설명해주세요.`;

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  //thinking 블록이 앞에 올 수 있으므로 첫 번째 text 블록을 찾는다
  const block = message.content.find((b) => b.type === 'text');
  return block ? block.text : undefined;
}

//결합도 위험(HAZARD/WARN) 파일의 코드와 지표를 분석해 3줄 리팩토링 제안을 생성한다.
async function explainCoupling({ filePath, code, metrics, dependencies }) {
  const anthropic = getClient();
  const m = metrics || {};
  const deps = dependencies || {};
  const incoming =
    Array.isArray(deps.incoming) && deps.incoming.length > 0 ? deps.incoming.join(', ') : '없음';
  const outgoing =
    Array.isArray(deps.outgoing) && deps.outgoing.length > 0 ? deps.outgoing.join(', ') : '없음';
  const reasons =
    Array.isArray(m.hazard_reasons) && m.hazard_reasons.length > 0
      ? m.hazard_reasons.join(', ')
      : 'instability';
  const snippet = String(code || '').slice(0, 6000);

  const prompt = `다음 소스 파일의 결합도(Coupling) 지표와 코드를 분석하여 결합도를 낮추기 위한 리팩토링 제안을 한국어 3줄로 작성해주세요.

파일: ${filePath}
결합도 판정: ${m.status || 'HAZARD'} (사유: ${reasons})
지표: 불안정성 I=${m.instability ?? '-'}, 피참조 Ca=${m.ca ?? 0}, 외부참조 Ce=${m.ce ?? 0}, CBO=${m.cbo ?? 0}
이 파일을 참조하는 파일(Ca): ${incoming}
이 파일이 참조하는 외부 파일(Ce): ${outgoing}

코드:
\`\`\`
${snippet}
\`\`\`

[출력 규칙]
1. 인사말, 서두, 맺음말 없이 오직 아래 3개 번호 항목만 출력
2. 각 항목은 핵심만 3문장 이내로 명확하게 작성

1. 결합도 진단: 
2. 분리 대상: 
3. 리팩토링 방향: `;

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content.find((b) => b.type === 'text');
  return block ? block.text : undefined;
}

module.exports = { explainFunction, explainCoupling };
