//파일명 그대로 AI와 연동을 해주는 서비스이나. 일단 임시적으로 클로드를 사용을 했다. 추후에 바꿔도 상관 없을 듯.

const { Anthropic } = require('@anthropic-ai/sdk');
const refactorSchema = require('../../schemas/ai-refactor-schema.json');
const { SYSTEM_PROMPT, buildUserPrompt } = require('../prompts/refactorPrompt');

//요청마다 그 사용자의 키로 클라이언트를 만든다. 사람마다 키가 다르므로 하나를 공유하지 않는다.
//키가 비어 있으면 SDK가 몰래 환경변수 키를 쓰므로, 그 전에 막는다.
function createClient(apiKey) {
  if (!apiKey) throw aiError('AI_KEY_MISSING', 'API key is required');
  return new Anthropic({ apiKey });
}

//Anthropic이 키를 거부하면(로그인 후 키가 폐기된 경우 등) 라우트가 재로그인을 요구할 수 있게 code를 붙인다
//항상 던지므로 never로 표시한다 (.catch 뒤의 응답 타입이 void와 섞이지 않게)
/** @returns {never} */
function rethrowKeyError(err) {
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    throw aiError('AI_KEY_REJECTED', 'The API key was rejected');
  }
  throw err;
}

//사용자가 입력한 키가 진짜인지 확인한다. 모델 목록 조회는 토큰을 쓰지 않아 요금이 들지 않는다.
//키가 틀리거나(401) 권한이 없으면(403) false, 네트워크·서버 오류는 그대로 던진다.
async function verifyApiKey(apiKey) {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 10_000 });
  try {
    await client.models.list({ limit: 1 });
    return true;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return false;
    if (err instanceof Anthropic.PermissionDeniedError) return false;
    throw err;
  }
}

//Claude API로 함수 설명을 생성하는 함수다.
async function explainFunction({ name, code, docstring, comment, filePath }, apiKey) {
  const anthropic = createClient(apiKey);

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

  const message = await anthropic.messages
    .create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })
    .catch(rethrowKeyError);

  //첫 블록이 텍스트가 아니면 기존과 같이 undefined를 돌려준다
  const block = message.content[0];
  return block.type === 'text' ? block.text : undefined;
}

//AI 리팩토링 기본 모델. .env의 ANTHROPIC_REFACTOR_MODEL로 바꿀 수 있다.
const DEFAULT_REFACTOR_MODEL = 'claude-haiku-5-5';

//code가 붙은 에러를 만든다. 라우트가 code를 보고 응답 코드를 정한다.
function aiError(code, message) {
  return Object.assign(new Error(message), { code });
}

//리팩토링 요청 본문을 만든다. 같은 본문이면 같은 결과이므로 라우트는 이 값을 캐시 키로 쓴다.
//프롬프트가 비어 있으면 REFACTOR_PROMPT_MISSING 에러를 던진다.
function buildRefactorRequest(context) {
  if (!SYSTEM_PROMPT.trim()) {
    throw aiError('REFACTOR_PROMPT_MISSING', 'Refactor prompt is not configured');
  }

  /** @type {import('@anthropic-ai/sdk/resources/messages').MessageCreateParamsNonStreaming} */
  const request = {
    model: process.env.ANTHROPIC_REFACTOR_MODEL || DEFAULT_REFACTOR_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(context) }],
    //응답을 스키마에 맞는 JSON으로 강제한다 (구조화 출력)
    output_config: { format: { type: 'json_schema', schema: refactorSchema } },
  };
  return request;
}

//Claude API로 리팩토링안을 받아 스키마 형태의 객체로 돌려준다.
async function suggestRefactoring(request, apiKey) {
  const anthropic = createClient(apiKey);
  const message = await anthropic.messages.create(request).catch(rethrowKeyError);

  //거절·토큰 초과는 JSON이 없거나 잘려 있으므로 파싱 전에 걸러낸다
  if (message.stop_reason === 'refusal') {
    throw aiError('AI_REFUSED', 'The model declined the request');
  }
  if (message.stop_reason === 'max_tokens') {
    throw aiError('AI_TRUNCATED', 'The response hit max_tokens');
  }

  const block = message.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') {
    throw aiError('AI_BAD_RESPONSE', 'No text block in the response');
  }
  try {
    return JSON.parse(block.text);
  } catch {
    throw aiError('AI_BAD_RESPONSE', 'The response is not valid JSON');
  }
}

module.exports = { explainFunction, buildRefactorRequest, suggestRefactoring, verifyApiKey };
