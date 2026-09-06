//파일명 그대로 AI와 연동을 해주는 서비스이나. 일단 임시적으로 클로드를 사용을 했다. 추후에 바꿔도 상관 없을 듯.

const Anthropic = require('@anthropic-ai/sdk');

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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

module.exports = { explainFunction };
