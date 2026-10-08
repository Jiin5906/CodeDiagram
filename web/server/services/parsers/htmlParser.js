//HTML 파일을 파싱하여 요소, import, 인라인 스크립트/스타일 정보를 추출한다.

const Parser = require('tree-sitter');
const HTML = require('tree-sitter-html');

function createParser() {
  const p = new Parser();
  //문법 패키지의 타입 정의가 tree-sitter 0.22 타입과 맞지 않아 캐스팅한다 (런타임 동작은 같다)
  p.setLanguage(/** @type {any} */ (HTML));
  return p;
}

function parseHtml(code, filePath) {
  const parser = createParser();
  const tree = parser.parse(code);
  const root = tree.rootNode;

  const elements = [];
  const imports = [];
  const eventBindings = [];
  const inlineScripts = [];
  const inlineStyles = [];

  collectElements(root, filePath, elements, imports, eventBindings, inlineScripts, inlineStyles);

  return {
    functions: [],
    calls: [],
    imports,
    classes: [],
    variables: [],
    variableRefs: [],
    elements,
    selectors: [],
    eventBindings,
    domAccesses: [],
    inlineScripts,
    inlineStyles,
  };
}

//HTML 요소들을 재귀적으로 순회하며 정보를 수집한다.
const ELEMENT_TYPES = new Set(['element', 'self_closing_tag', 'script_element', 'style_element']);

function collectElements(
  node,
  filePath,
  elements,
  imports,
  eventBindings,
  inlineScripts,
  inlineStyles,
) {
  if (ELEMENT_TYPES.has(node.type)) {
    const startTag =
      node.type === 'self_closing_tag'
        ? node
        : node.childForFieldName('start_tag') || findChildByType(node, 'start_tag');
    if (!startTag) {
      for (let i = 0; i < node.childCount; i++) {
        collectElements(
          node.child(i),
          filePath,
          elements,
          imports,
          eventBindings,
          inlineScripts,
          inlineStyles,
        );
      }
      return;
    }

    const tagName = getTagName(startTag);
    const attrs = getAttributes(startTag);
    const line = node.startPosition.row + 1;

    //요소 정보 수집
    const elem = {
      tag: tagName,
      id: attrs.id || null,
      classes: attrs.class ? attrs.class.split(/\s+/).filter(Boolean) : [],
      dataAttrs: {},
      filePath,
      line,
    };

    //data-* 속성 수집
    for (const [key, val] of Object.entries(attrs)) {
      if (key.startsWith('data-')) {
        elem.dataAttrs[key] = val;
      }
    }

    elements.push(elem);

    //외부 리소스 참조 수집
    if (tagName === 'script' && attrs.src) {
      imports.push({ type: 'script-ref', href: attrs.src, filePath, line });
    } else if (tagName === 'link' && attrs.href && attrs.rel === 'stylesheet') {
      imports.push({ type: 'style-ref', href: attrs.href, filePath, line });
    } else if (tagName === 'link' && attrs.href) {
      imports.push({ type: 'link-ref', href: attrs.href, filePath, line });
    } else if (
      (tagName === 'img' || tagName === 'source' || tagName === 'video' || tagName === 'audio') &&
      attrs.src
    ) {
      imports.push({ type: 'resource-ref', href: attrs.src, filePath, line });
    }

    //인라인 이벤트 핸들러 수집
    const eventAttrs = [
      'onclick',
      'onload',
      'onsubmit',
      'onchange',
      'oninput',
      'onkeydown',
      'onkeyup',
      'onkeypress',
      'onmouseover',
      'onmouseout',
      'onfocus',
      'onblur',
      'onscroll',
      'onresize',
    ];
    for (const evtAttr of eventAttrs) {
      if (attrs[evtAttr]) {
        eventBindings.push({
          elementId: attrs.id || null,
          elementClasses: elem.classes,
          elementTag: tagName,
          eventType: evtAttr.replace('on', ''),
          handler: attrs[evtAttr],
          filePath,
          line,
          isInline: true,
        });
      }
    }

    //인라인 스크립트 수집
    if (tagName === 'script' && !attrs.src) {
      const textContent = getTextContent(node);
      if (textContent.trim()) {
        inlineScripts.push({ code: textContent, filePath, line });
      }
    }

    //인라인 스타일 수집
    if (tagName === 'style') {
      const textContent = getTextContent(node);
      if (textContent.trim()) {
        inlineStyles.push({ code: textContent, filePath, line });
      }
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    collectElements(
      node.child(i),
      filePath,
      elements,
      imports,
      eventBindings,
      inlineScripts,
      inlineStyles,
    );
  }
}

function findChildByType(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return node.child(i);
  }
  return null;
}

function getTagName(startTag) {
  for (let i = 0; i < startTag.childCount; i++) {
    const child = startTag.child(i);
    if (child.type === 'tag_name') return child.text.toLowerCase();
  }
  return '';
}

function getAttributes(startTag) {
  const attrs = {};
  for (let i = 0; i < startTag.childCount; i++) {
    const child = startTag.child(i);
    if (child.type === 'attribute') {
      const nameNode =
        child.childForFieldName('attribute_name') || findChildByType(child, 'attribute_name');
      const valueNode =
        child.childForFieldName('attribute_value') ||
        findChildByType(child, 'attribute_value') ||
        findChildByType(child, 'quoted_attribute_value');
      if (nameNode) {
        let val = '';
        if (valueNode) {
          val = valueNode.text.replace(/^["']|["']$/g, '');
        }
        attrs[nameNode.text.toLowerCase()] = val;
      }
    }
  }
  return attrs;
}

function getTextContent(elementNode) {
  let text = '';
  for (let i = 0; i < elementNode.childCount; i++) {
    const child = elementNode.child(i);
    if (child.type === 'raw_text' || child.type === 'text') {
      text += child.text;
    }
  }
  return text;
}

module.exports = { parseHtml };
