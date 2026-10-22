//AI 리팩토링에 넘길 문맥(진단 정보 + 대상 코드)을 모으는 서비스
//코드는 클라이언트가 보낸 것을 쓰지 않고, 제안의 relatedNodes(그래프 노드 ID)를 보고 서버가 직접 읽는다.
// - '경로'            → 파일 전체
// - '경로::이름'      → 파일을 다시 파싱해 그 함수(qualifiedName) 또는 클래스 범위만 잘라낸다

const { parseFile } = require('./parser');
const { readProjectFile, languageOf } = require('../utils/projectFile');

const SUGGESTION_TYPES = ['cycle', 'coupling'];
const MAX_TARGETS = 10;
//AI에 보내는 코드 총량 상한. 넘으면 몰래 자르지 않고 413으로 알린다.
const MAX_CONTEXT_CHARS = 100000;

function contextError(status, message) {
  return Object.assign(new Error(message), { status });
}

//클라이언트가 보낸 제안에서 필요한 필드만 골라 형식을 확인한다. 잘못되면 400 에러를 던진다.
function sanitizeSuggestion(suggestion) {
  if (!suggestion || typeof suggestion !== 'object') {
    throw contextError(400, 'suggestion이 필요합니다');
  }
  const { type, title, description, relatedNodes, metrics } = suggestion;
  if (!SUGGESTION_TYPES.includes(type)) {
    throw contextError(400, '지원하지 않는 제안 종류입니다');
  }
  if (
    !Array.isArray(relatedNodes) ||
    relatedNodes.length === 0 ||
    !relatedNodes.every((id) => typeof id === 'string' && id)
  ) {
    throw contextError(400, 'relatedNodes가 필요합니다');
  }

  const clean = {
    type,
    title: typeof title === 'string' ? title : '',
    description: typeof description === 'string' ? description : '',
    advice: typeof suggestion.suggestion === 'string' ? suggestion.suggestion : '',
    relatedNodes: [...new Set(relatedNodes)],
  };
  //결합도 제안에만 있는 원값 (Ca, Ce, I, HAZARD 사유)
  if (metrics && typeof metrics === 'object') {
    clean.metrics = {
      ca: metrics.ca,
      ce: metrics.ce,
      instability: metrics.instability,
      hazard_reasons: Array.isArray(metrics.hazard_reasons) ? metrics.hazard_reasons : [],
    };
  }
  return clean;
}

//노드 ID를 파일 경로와 이름으로 나눈다. 이름이 없으면 파일 노드다.
function splitNodeId(id) {
  const sep = id.indexOf('::');
  if (sep === -1) return { file: id, name: null };
  return { file: id.slice(0, sep), name: id.slice(sep + 2) };
}

//파일 코드에서 이름에 맞는 함수 또는 클래스의 범위를 찾는다. 못 찾으면 null
function findRange(code, file, name) {
  const language = languageOf(file);
  const parsed = language ? parseFile(code, file, language) : null;
  if (!parsed) return null;

  const func = (parsed.functions || []).find((f) => f.qualifiedName === name);
  if (func) {
    return { kind: 'function', startLine: func.startLine, endLine: func.endLine };
  }
  //클래스는 '경로::클래스명'으로 온다
  const cls = (parsed.classes || []).find((c) => c.name === name);
  if (cls) {
    return { kind: 'class', startLine: cls.startLine, endLine: cls.endLine };
  }
  return null;
}

//제안 하나에 대한 AI 문맥을 만든다. 반환값은 aiService가 프롬프트로 바꾼다.
function buildRefactorContext(root, rawSuggestion) {
  const suggestion = sanitizeSuggestion(rawSuggestion);
  const warnings = [];

  let ids = suggestion.relatedNodes;
  if (ids.length > MAX_TARGETS) {
    warnings.push(`대상 노드가 많아 앞의 ${MAX_TARGETS}개만 AI에 보냈습니다.`);
    ids = ids.slice(0, MAX_TARGETS);
  }

  const fileCache = new Map();
  const targets = [];
  for (const id of ids) {
    const { file, name } = splitNodeId(id);
    if (!fileCache.has(file)) fileCache.set(file, readProjectFile(root, file));
    const code = fileCache.get(file);

    const range = name ? findRange(code, file, name) : null;
    if (name && !range) {
      warnings.push(`${id}의 위치를 찾지 못해 파일 전체를 보냈습니다.`);
    }
    if (range) {
      const lines = code.split('\n');
      targets.push({
        id,
        file,
        kind: range.kind,
        startLine: range.startLine,
        endLine: range.endLine,
        code: lines.slice(range.startLine - 1, range.endLine).join('\n'),
      });
    } else {
      targets.push({ id, file, kind: 'file', startLine: 1, endLine: null, code });
    }
  }

  const totalChars = targets.reduce((sum, t) => sum + t.code.length, 0);
  if (totalChars > MAX_CONTEXT_CHARS) {
    throw contextError(
      413,
      `AI에 보낼 코드가 너무 큽니다 (${totalChars}자, 최대 ${MAX_CONTEXT_CHARS}자). 더 작은 단위의 제안으로 시도해 주세요.`,
    );
  }

  return { suggestion, targets, warnings };
}

module.exports = { buildRefactorContext, MAX_TARGETS, MAX_CONTEXT_CHARS };
