//JavaScript 파일을 파싱하여 함수, 클래스, 호출, import/export, DOM 접근, 이벤트 바인딩을 추출한다.

const Parser = require('tree-sitter');
const JavaScript = require('tree-sitter-javascript');

function createParser() {
  const p = new Parser();
  //문법 패키지의 타입 정의가 tree-sitter 0.22 타입과 맞지 않아 캐스팅한다 (런타임 동작은 같다)
  p.setLanguage(/** @type {any} */ (JavaScript));
  return p;
}

function parseJs(code, filePath) {
  const parser = createParser();
  const tree = parser.parse(code);
  const root = tree.rootNode;

  const functions = [];
  const calls = [];
  const imports = [];
  const classes = [];
  const variables = [];
  const variableRefs = [];
  const domAccesses = [];
  const eventBindings = [];

  collectImports(root, filePath, imports);
  collectDefinitions(root, code, filePath, functions, calls, classes, null);
  collectVariables(root, filePath, variables);
  collectDomAndEvents(root, filePath, functions, domAccesses, eventBindings, calls);

  //함수 body에서 변수 참조 수집
  for (const func of functions) {
    const funcNode = findFunctionNode(root, func, func.startLine);
    if (funcNode) {
      const body = getFunctionBody(funcNode);
      if (body) {
        collectVariableRefs(body, func.qualifiedName, filePath, variableRefs);
      }
    }
  }

  return {
    functions,
    calls,
    imports,
    classes,
    variables,
    variableRefs,
    elements: [],
    selectors: [],
    eventBindings,
    domAccesses,
  };
}

/* ── Import/Export 수집 ── */

function collectImports(node, filePath, imports) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    //ES6 import
    if (child.type === 'import_statement') {
      const source = child.childForFieldName('source');
      if (source) {
        const moduleName = source.text.replace(/^["']|["']$/g, '');
        imports.push({
          module: moduleName,
          name: moduleName,
          type: 'es6-import',
          filePath,
          line: child.startPosition.row + 1,
        });
      }
    }

    //CommonJS require
    if (child.type === 'lexical_declaration' || child.type === 'variable_declaration') {
      extractRequireCalls(child, filePath, imports);
    }
    if (child.type === 'expression_statement') {
      extractRequireCalls(child, filePath, imports);
    }

    //export
    if (child.type === 'export_statement') {
      const source = child.childForFieldName('source');
      if (source) {
        const moduleName = source.text.replace(/^["']|["']$/g, '');
        imports.push({
          module: moduleName,
          name: moduleName,
          type: 'es6-reexport',
          filePath,
          line: child.startPosition.row + 1,
        });
      }
    }
  }
}

function extractRequireCalls(node, filePath, imports) {
  if (node.type === 'call_expression') {
    const func = node.child(0);
    if (func && func.type === 'identifier' && func.text === 'require') {
      const args = node.childForFieldName('arguments');
      if (args && args.childCount > 0) {
        for (let i = 0; i < args.childCount; i++) {
          const arg = args.child(i);
          if (arg.type === 'string' || arg.type === 'template_string') {
            const moduleName = arg.text.replace(/^["'`]|["'`]$/g, '');
            imports.push({
              module: moduleName,
              name: moduleName,
              type: 'commonjs-require',
              filePath,
              line: node.startPosition.row + 1,
            });
          }
        }
      }
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    extractRequireCalls(node.child(i), filePath, imports);
  }
}

/* ── 함수/클래스 정의 수집 ── */

function collectDefinitions(node, code, filePath, functions, calls, classes, className) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    //함수 선언
    if (child.type === 'function_declaration') {
      const func = extractFunction(child, filePath, className);
      functions.push(func);
      const body = getFunctionBody(child);
      if (body) collectCalls(body, func.qualifiedName, filePath, calls);
    }

    //화살표 함수 또는 함수 표현식이 변수에 할당된 경우
    if (child.type === 'lexical_declaration' || child.type === 'variable_declaration') {
      for (let j = 0; j < child.childCount; j++) {
        const declarator = child.child(j);
        if (declarator.type === 'variable_declarator') {
          const nameNode = declarator.childForFieldName('name');
          const valueNode = declarator.childForFieldName('value');
          if (
            nameNode &&
            valueNode &&
            (valueNode.type === 'arrow_function' ||
              valueNode.type === 'function_expression' ||
              valueNode.type === 'function')
          ) {
            const func = {
              name: nameNode.text,
              qualifiedName: className ? `${className}.${nameNode.text}` : nameNode.text,
              className: className || null,
              filePath,
              startLine: child.startPosition.row + 1,
              endLine: valueNode.endPosition.row + 1,
              code: child.text,
              docstring: '',
              comment: extractComment(child),
            };
            functions.push(func);
            const body = getFunctionBody(valueNode);
            if (body) collectCalls(body, func.qualifiedName, filePath, calls);
          }
        }
      }
    }

    //export된 함수
    if (child.type === 'export_statement') {
      const declaration = child.childForFieldName('declaration');
      if (declaration) {
        collectDefinitions(child, code, filePath, functions, calls, classes, className);
      }
    }

    //클래스 정의
    if (child.type === 'class_declaration' || child.type === 'class') {
      const nameNode = child.childForFieldName('name');
      const clsName = nameNode ? nameNode.text : 'AnonymousClass';

      const superclasses = [];
      const heritage =
        child.childForFieldName('heritage') || findChildByType(child, 'class_heritage');
      if (heritage) {
        for (let j = 0; j < heritage.childCount; j++) {
          const h = heritage.child(j);
          if (h.type === 'identifier' || h.type === 'member_expression') {
            superclasses.push(h.text);
          }
        }
      }

      classes.push({
        name: clsName,
        filePath,
        superclasses,
        startLine: child.startPosition.row + 1,
        endLine: child.endPosition.row + 1,
      });

      //클래스 body에서 메서드 수집
      const body = child.childForFieldName('body');
      if (body) {
        for (let j = 0; j < body.childCount; j++) {
          const member = body.child(j);
          if (member.type === 'method_definition') {
            const func = extractFunction(member, filePath, clsName);
            functions.push(func);
            const methodBody = getFunctionBody(member);
            if (methodBody) collectCalls(methodBody, func.qualifiedName, filePath, calls);
          }
          if (member.type === 'field_definition') {
            const fieldName = member.childForFieldName('property');
            const fieldValue = member.childForFieldName('value');
            if (
              fieldName &&
              fieldValue &&
              (fieldValue.type === 'arrow_function' || fieldValue.type === 'function_expression')
            ) {
              const func = {
                name: fieldName.text,
                qualifiedName: `${clsName}.${fieldName.text}`,
                className: clsName,
                filePath,
                startLine: member.startPosition.row + 1,
                endLine: member.endPosition.row + 1,
                code: member.text,
                docstring: '',
                comment: '',
              };
              functions.push(func);
              const body2 = getFunctionBody(fieldValue);
              if (body2) collectCalls(body2, func.qualifiedName, filePath, calls);
            }
          }
        }
      }
    }
  }
}

function extractFunction(node, filePath, className) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? nameNode.text : 'anonymous';
  const qualifiedName = className ? `${className}.${name}` : name;

  return {
    name,
    qualifiedName,
    className: className || null,
    filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    code: node.text,
    docstring: '',
    comment: extractComment(node),
  };
}

function extractComment(node) {
  let prev = node.previousSibling;
  while (prev && !prev.isNamed) {
    prev = prev.previousSibling;
  }
  if (prev && prev.type === 'comment') {
    return prev.text;
  }
  return '';
}

/* ── 함수 호출 수집 ── */

function collectCalls(node, callerName, filePath, calls) {
  if (node.type === 'call_expression') {
    const funcNode = node.child(0);
    let calleeName = '';

    if (funcNode.type === 'identifier') {
      calleeName = funcNode.text;
    } else if (funcNode.type === 'member_expression') {
      calleeName = funcNode.text;
    }

    if (calleeName) {
      calls.push({
        caller: callerName,
        callee: calleeName,
        filePath,
        line: node.startPosition.row + 1,
      });
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    collectCalls(node.child(i), callerName, filePath, calls);
  }
}

/* ── 변수 수집 ── */

const JS_BUILTINS = new Set([
  'undefined',
  'null',
  'true',
  'false',
  'NaN',
  'Infinity',
  'console',
  'window',
  'document',
  'Math',
  'JSON',
  'Date',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'RegExp',
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Symbol',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'fetch',
  'XMLHttpRequest',
  'FormData',
  'URLSearchParams',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'process',
  'global',
  'Buffer',
]);

function collectVariables(node, filePath, variables) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === 'lexical_declaration' || child.type === 'variable_declaration') {
      for (let j = 0; j < child.childCount; j++) {
        const declarator = child.child(j);
        if (declarator.type === 'variable_declarator') {
          const nameNode = declarator.childForFieldName('name');
          const valueNode = declarator.childForFieldName('value');
          //함수/화살표 함수는 함수로 처리되므로 건너뜀
          if (
            valueNode &&
            (valueNode.type === 'arrow_function' ||
              valueNode.type === 'function_expression' ||
              valueNode.type === 'function')
          ) {
            continue;
          }
          if (nameNode && nameNode.type === 'identifier' && !JS_BUILTINS.has(nameNode.text)) {
            variables.push({
              name: nameNode.text,
              className: null,
              filePath,
              line: child.startPosition.row + 1,
            });
          }
        }
      }
    }
  }
}

function collectVariableRefs(node, callerName, filePath, refs) {
  if (node.type === 'call_expression') {
    const args = node.childForFieldName('arguments');
    if (args) {
      collectVariableRefs(args, callerName, filePath, refs);
    }
    return;
  }

  if (node.type === 'identifier') {
    const name = node.text;
    if (!JS_BUILTINS.has(name)) {
      refs.push({
        caller: callerName,
        variable: name,
        filePath,
        line: node.startPosition.row + 1,
      });
    }
    return;
  }

  for (let i = 0; i < node.childCount; i++) {
    collectVariableRefs(node.child(i), callerName, filePath, refs);
  }
}

/* ── DOM 접근 및 이벤트 바인딩 수집 ── */

function collectDomAndEvents(node, filePath, functions, domAccesses, eventBindings, calls) {
  if (node.type === 'call_expression') {
    const funcNode = node.child(0);
    if (funcNode && funcNode.type === 'member_expression') {
      const methodName = funcNode.childForFieldName('property');
      if (methodName) {
        const method = methodName.text;
        const args = node.childForFieldName('arguments');

        //DOM 접근 메서드 감지
        const domMethods = {
          getElementById: 'id',
          getElementsByClassName: 'class',
          getElementsByTagName: 'tag',
          querySelector: 'selector',
          querySelectorAll: 'selector',
        };

        if (domMethods[method] && args) {
          const firstArg = getFirstStringArg(args);
          if (firstArg) {
            //현재 호출 위치의 함수 이름 찾기
            const callerFunc = findEnclosingFunction(node, functions, filePath);
            domAccesses.push({
              method,
              queryType: domMethods[method],
              query: firstArg,
              filePath,
              line: node.startPosition.row + 1,
              caller: callerFunc,
            });
          }
        }

        //addEventListener 감지
        if (method === 'addEventListener' && args) {
          const eventArgs = getStringArgs(args);
          if (eventArgs.length >= 1) {
            const handlerArg = getHandlerArg(args);
            eventBindings.push({
              eventType: eventArgs[0],
              handler: handlerArg,
              filePath,
              line: node.startPosition.row + 1,
              caller: findEnclosingFunction(node, functions, filePath),
              isInline: false,
            });
          }
        }

        //classList.add/remove/toggle 감지
        if ((method === 'add' || method === 'remove' || method === 'toggle') && args) {
          const obj = funcNode.childForFieldName('object');
          if (obj && obj.type === 'member_expression') {
            const prop = obj.childForFieldName('property');
            if (prop && prop.text === 'classList') {
              const className = getFirstStringArg(args);
              if (className) {
                domAccesses.push({
                  method: `classList.${method}`,
                  queryType: 'class',
                  query: className,
                  filePath,
                  line: node.startPosition.row + 1,
                  caller: findEnclosingFunction(node, functions, filePath),
                });
              }
            }
          }
        }

        //element.style 수정 감지
        if (funcNode.text.includes('.style.')) {
          domAccesses.push({
            method: 'style-modify',
            queryType: 'style',
            query: funcNode.text,
            filePath,
            line: node.startPosition.row + 1,
            caller: findEnclosingFunction(node, functions, filePath),
          });
        }
      }
    }
  }

  //element.style.x = ... 할당 감지
  if (node.type === 'assignment_expression') {
    const left = node.childForFieldName('left');
    if (left && left.type === 'member_expression' && left.text.includes('.style.')) {
      domAccesses.push({
        method: 'style-modify',
        queryType: 'style',
        query: left.text,
        filePath,
        line: node.startPosition.row + 1,
        caller: findEnclosingFunction(node, functions, filePath),
      });
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    collectDomAndEvents(node.child(i), filePath, functions, domAccesses, eventBindings, calls);
  }
}

function getFirstStringArg(argsNode) {
  for (let i = 0; i < argsNode.childCount; i++) {
    const arg = argsNode.child(i);
    if (arg.type === 'string' || arg.type === 'template_string') {
      return arg.text.replace(/^["'`]|["'`]$/g, '');
    }
  }
  return null;
}

function getStringArgs(argsNode) {
  const result = [];
  for (let i = 0; i < argsNode.childCount; i++) {
    const arg = argsNode.child(i);
    if (arg.type === 'string' || arg.type === 'template_string') {
      result.push(arg.text.replace(/^["'`]|["'`]$/g, ''));
    }
  }
  return result;
}

function getHandlerArg(argsNode) {
  let count = 0;
  for (let i = 0; i < argsNode.childCount; i++) {
    const arg = argsNode.child(i);
    if (arg.type === ',' || arg.type === '(' || arg.type === ')') continue;
    count++;
    if (count === 2) {
      if (arg.type === 'identifier') return arg.text;
      if (arg.type === 'member_expression') return arg.text;
      return null;
    }
  }
  return null;
}

function findEnclosingFunction(node, functions, filePath) {
  //노드의 줄 번호로 가장 가까운 함수 찾기
  const line = node.startPosition.row + 1;
  /** @type {{ startLine: number, endLine: number, qualifiedName: string } | null} */
  let best = null;
  for (const func of functions) {
    if (func.filePath === filePath && func.startLine <= line && func.endLine >= line) {
      if (!best || func.endLine - func.startLine < best.endLine - best.startLine) {
        best = func;
      }
    }
  }
  return best ? best.qualifiedName : null;
}

function getFunctionBody(node) {
  return node.childForFieldName('body');
}

function findFunctionNode(root, func, startLine) {
  function search(node) {
    if (
      (node.type === 'function_declaration' || node.type === 'method_definition') &&
      node.startPosition.row + 1 === startLine
    ) {
      return node;
    }
    //화살표 함수/함수 표현식
    if (
      (node.type === 'arrow_function' ||
        node.type === 'function_expression' ||
        node.type === 'function') &&
      node.startPosition.row + 1 === startLine
    ) {
      return node;
    }
    //변수 선언에 할당된 함수
    if (node.type === 'variable_declarator') {
      const value = node.childForFieldName('value');
      if (
        value &&
        (value.type === 'arrow_function' || value.type === 'function_expression') &&
        node.parent &&
        node.parent.startPosition.row + 1 === startLine
      ) {
        return value;
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const found = search(node.child(i));
      if (found) return found;
    }
    return null;
  }

  return search(root);
}

function findChildByType(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return node.child(i);
  }
  return null;
}

module.exports = { parseJs };
