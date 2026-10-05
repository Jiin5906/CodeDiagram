//CSS 파일을 파싱하여 셀렉터, 변수, import 정보를 추출한다.

const Parser = require('tree-sitter');
const CSS = require('tree-sitter-css');

function createParser() {
  const p = new Parser();
  //문법 패키지의 타입 정의가 tree-sitter 0.22 타입과 맞지 않아 캐스팅한다 (런타임 동작은 같다)
  p.setLanguage(/** @type {any} */ (CSS));
  return p;
}

function parseCss(code, filePath) {
  const parser = createParser();
  const tree = parser.parse(code);
  const root = tree.rootNode;

  const selectors = [];
  const variables = [];
  const variableRefs = [];
  const imports = [];
  const functions = []; // @keyframes

  collectRules(root, filePath, selectors, variables, variableRefs, imports, functions);

  return {
    functions,
    calls: [],
    imports,
    classes: [],
    variables,
    variableRefs,
    elements: [],
    selectors,
    eventBindings: [],
    domAccesses: [],
  };
}

function collectRules(node, filePath, selectors, variables, variableRefs, imports, functions) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === 'rule_set') {
      processRuleSet(child, filePath, selectors, variables, variableRefs);
    } else if (child.type === 'import_statement') {
      processImport(child, filePath, imports);
    } else if (child.type === 'media_statement') {
      //미디어 쿼리 내부의 규칙도 수집
      const body = child.childForFieldName('body') || findChildByType(child, 'block');
      if (body) {
        collectRules(body, filePath, selectors, variables, variableRefs, imports, functions);
      }
    } else if (child.type === 'keyframes_statement') {
      processKeyframes(child, filePath, functions);
    }
  }
}

function processRuleSet(node, filePath, selectors, variables, variableRefs) {
  const line = node.startPosition.row + 1;

  //셀렉터 추출
  const selectorNodes = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'selectors') {
      extractSelectors(child, filePath, line, selectorNodes);
    }
  }
  selectors.push(...selectorNodes);

  //선언 블록에서 변수 정의/참조 추출
  const block = findChildByType(node, 'block');
  if (block) {
    for (let i = 0; i < block.childCount; i++) {
      const decl = block.child(i);
      if (decl.type === 'declaration') {
        const propNode = findChildByType(decl, 'property_name');
        if (propNode && propNode.text.startsWith('--')) {
          //CSS 커스텀 프로퍼티 정의
          variables.push({
            name: propNode.text,
            className: null,
            filePath,
            line: decl.startPosition.row + 1,
            type: 'css-variable',
          });
        }

        //var() 참조 탐색
        collectVarRefs(decl, filePath, variableRefs);
      }
    }
  }
}

function extractSelectors(node, filePath, line, results) {
  const text = node.text.trim();
  if (!text) return;

  //각 셀렉터를 쉼표로 분할
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const parsed = parseSelectorString(part);
    results.push({
      raw: part,
      ids: parsed.ids,
      classes: parsed.classes,
      tags: parsed.tags,
      attributes: parsed.attributes,
      filePath,
      line,
    });
  }
}

//셀렉터 문자열에서 ID, 클래스, 태그, 속성 셀렉터를 추출한다.
function parseSelectorString(selector) {
  const ids = [];
  const classes = [];
  const tags = [];
  const attributes = [];

  // #id 추출
  const idMatches = selector.match(/#([\w-]+)/g);
  if (idMatches) {
    for (const m of idMatches) ids.push(m.substring(1));
  }

  // .class 추출
  const classMatches = selector.match(/\.([\w-]+)/g);
  if (classMatches) {
    for (const m of classMatches) classes.push(m.substring(1));
  }

  // [attr] 추출
  const attrMatches = selector.match(/\[([\w-]+)[^\]]*\]/g);
  if (attrMatches) {
    for (const m of attrMatches) {
      const name = m.match(/\[([\w-]+)/);
      if (name) attributes.push(name[1]);
    }
  }

  //태그 추출 (셀렉터 시작 부분이나 공백/> 뒤의 태그)
  const tagMatches = selector.match(/(?:^|[\s>+~])([a-zA-Z][\w-]*)/g);
  if (tagMatches) {
    for (const m of tagMatches) {
      const tag = m.trim().replace(/^[>+~]\s*/, '');
      if (tag && !['not', 'nth-child', 'hover', 'focus', 'active', 'first-child', 'last-child', 'before', 'after'].includes(tag)) {
        tags.push(tag.toLowerCase());
      }
    }
  }

  return { ids, classes, tags, attributes };
}

function collectVarRefs(node, filePath, variableRefs) {
  if (node.type === 'call_expression' || node.type === 'function_value') {
    const funcName = node.child(0);
    if (funcName && funcName.text === 'var') {
      const args = findChildByType(node, 'arguments');
      if (args) {
        for (let i = 0; i < args.childCount; i++) {
          const arg = args.child(i);
          if (arg.text && arg.text.startsWith('--')) {
            variableRefs.push({
              caller: filePath,
              variable: arg.text.replace(/,.*$/, '').trim(),
              filePath,
              line: node.startPosition.row + 1,
              type: 'css-var-ref',
            });
          }
        }
      }
    }
  }

  //텍스트에서 var() 패턴을 정규식으로도 추출 (tree-sitter가 놓칠 수 있으므로)
  if (node.childCount === 0 && node.text) {
    const varMatches = node.text.match(/var\(\s*(--[\w-]+)/g);
    if (varMatches) {
      for (const m of varMatches) {
        const varName = m.match(/var\(\s*(--[\w-]+)/)[1];
        variableRefs.push({
          caller: filePath,
          variable: varName,
          filePath,
          line: node.startPosition.row + 1,
          type: 'css-var-ref',
        });
      }
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    collectVarRefs(node.child(i), filePath, variableRefs);
  }
}

function processImport(node, filePath, imports) {
  const text = node.text;
  //@import url("...") 또는 @import "..." 패턴
  const urlMatch = text.match(/url\(\s*["']?([^"')]+)["']?\s*\)/) || text.match(/@import\s+["']([^"']+)["']/);
  if (urlMatch) {
    imports.push({
      type: 'css-import',
      href: urlMatch[1],
      filePath,
      line: node.startPosition.row + 1,
    });
  }
}

function processKeyframes(node, filePath, functions) {
  const nameNode = node.childForFieldName('name') || findChildByType(node, 'keyframes_name');
  if (nameNode) {
    functions.push({
      name: nameNode.text,
      qualifiedName: `@keyframes ${nameNode.text}`,
      className: null,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      code: node.text,
      docstring: '',
      comment: '',
      type: 'css-keyframes',
    });
  }
}

function findChildByType(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return node.child(i);
  }
  return null;
}

module.exports = { parseCss };
