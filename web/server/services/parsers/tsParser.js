//TypeScript 파일을 파싱하여 함수, 클래스, 호출, import, 타입 정보를 추출한다.
//JS 파서를 기반으로 TypeScript 전용 노드 타입을 추가 처리한다.

const Parser = require('tree-sitter');
const TypeScriptLanguage = require('tree-sitter-typescript').typescript;

function createParser() {
  const p = new Parser();
  p.setLanguage(TypeScriptLanguage);
  return p;
}

function parseTs(code, filePath) {
  const parser = createParser();
  const tree = parser.parse(code);
  const root = tree.rootNode;

  const functions = [];
  const calls = [];
  const imports = [];
  const classes = [];
  const variables = [];
  const variableRefs = [];
  const interfaces = [];
  const typeAliases = [];
  const enums = [];

  collectImports(root, filePath, imports);
  collectDefinitions(root, code, filePath, functions, calls, classes, interfaces, typeAliases, enums, null);
  collectVariables(root, filePath, variables);

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
    interfaces,
    typeAliases,
    enums,
    elements: [],
    selectors: [],
    eventBindings: [],
    domAccesses: [],
  };
}

/* ── Import 수집 ── */

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
      //export된 선언 재귀 처리
      const declaration = child.childForFieldName('declaration');
      if (declaration) {
        collectImports(child, filePath, imports);
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

/* ── 함수/클래스/인터페이스/타입/열거형 정의 수집 ── */

function collectDefinitions(node, code, filePath, functions, calls, classes, interfaces, typeAliases, enums, className) {
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
          if (nameNode && valueNode &&
              (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression' || valueNode.type === 'function')) {
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

    //export된 선언
    if (child.type === 'export_statement') {
      collectDefinitions(child, code, filePath, functions, calls, classes, interfaces, typeAliases, enums, className);
    }

    //클래스 정의
    if (child.type === 'class_declaration' || child.type === 'class' || child.type === 'abstract_class_declaration') {
      const nameNode = child.childForFieldName('name');
      const clsName = nameNode ? nameNode.text : 'AnonymousClass';

      const superclasses = [];
      //extends
      const heritage = child.childForFieldName('heritage') || findChildByType(child, 'class_heritage');
      if (heritage) {
        for (let j = 0; j < heritage.childCount; j++) {
          const h = heritage.child(j);
          if (h.type === 'extends_clause') {
            for (let k = 0; k < h.childCount; k++) {
              const ext = h.child(k);
              if (ext.type === 'identifier' || ext.type === 'member_expression' || ext.type === 'generic_type') {
                const typeName = ext.type === 'generic_type' ? (ext.child(0) ? ext.child(0).text : ext.text) : ext.text;
                superclasses.push(typeName);
              }
            }
          }
          if (h.type === 'implements_clause') {
            for (let k = 0; k < h.childCount; k++) {
              const impl = h.child(k);
              if (impl.type === 'identifier' || impl.type === 'generic_type' || impl.type === 'type_identifier') {
                const typeName = impl.type === 'generic_type' ? (impl.child(0) ? impl.child(0).text : impl.text) : impl.text;
                superclasses.push(typeName);
              }
            }
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
          if (member.type === 'method_definition' || member.type === 'public_field_definition') {
            if (member.type === 'method_definition') {
              const func = extractFunction(member, filePath, clsName);
              functions.push(func);
              const methodBody = getFunctionBody(member);
              if (methodBody) collectCalls(methodBody, func.qualifiedName, filePath, calls);
            }
            if (member.type === 'public_field_definition') {
              const fieldName = member.childForFieldName('name');
              const fieldValue = member.childForFieldName('value');
              if (fieldName && fieldValue &&
                  (fieldValue.type === 'arrow_function' || fieldValue.type === 'function_expression')) {
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

    //인터페이스 정의
    if (child.type === 'interface_declaration') {
      const nameNode = child.childForFieldName('name');
      const ifName = nameNode ? nameNode.text : 'AnonymousInterface';
      const superInterfaces = [];

      //extends clause
      const extendsClause = findChildByType(child, 'extends_type_clause');
      if (extendsClause) {
        for (let j = 0; j < extendsClause.childCount; j++) {
          const ext = extendsClause.child(j);
          if (ext.type === 'identifier' || ext.type === 'type_identifier' || ext.type === 'generic_type') {
            const typeName = ext.type === 'generic_type' ? (ext.child(0) ? ext.child(0).text : ext.text) : ext.text;
            superInterfaces.push(typeName);
          }
        }
      }

      interfaces.push({
        name: ifName,
        filePath,
        superInterfaces,
        startLine: child.startPosition.row + 1,
        endLine: child.endPosition.row + 1,
      });

      //인터페이스도 클래스 목록에 추가 (그래프 빌더 호환)
      classes.push({
        name: ifName,
        filePath,
        superclasses: superInterfaces,
        startLine: child.startPosition.row + 1,
        endLine: child.endPosition.row + 1,
      });
    }

    //타입 별칭 정의
    if (child.type === 'type_alias_declaration') {
      const nameNode = child.childForFieldName('name');
      if (nameNode) {
        typeAliases.push({
          name: nameNode.text,
          filePath,
          startLine: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
          code: child.text,
        });
      }
    }

    //열거형 정의
    if (child.type === 'enum_declaration') {
      const nameNode = child.childForFieldName('name');
      if (nameNode) {
        enums.push({
          name: nameNode.text,
          filePath,
          startLine: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
          code: child.text,
        });

        //열거형도 클래스 목록에 추가 (그래프 빌더 호환)
        classes.push({
          name: nameNode.text,
          filePath,
          superclasses: [],
          startLine: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
        });
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
    let funcNode = node.child(0);
    let calleeName = '';

    //TypeScript에서 await this.request<T>(...) 구문은
    //call_expression의 첫 자식이 await_expression으로 감싸짐
    if (funcNode && funcNode.type === 'await_expression') {
      const inner = funcNode.child(funcNode.childCount - 1);
      if (inner) funcNode = inner;
    }

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

const TS_BUILTINS = new Set([
  'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
  'console', 'window', 'document', 'Math', 'JSON', 'Date',
  'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol',
  'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'fetch', 'XMLHttpRequest', 'FormData', 'URLSearchParams',
  'require', 'module', 'exports', '__dirname', '__filename',
  'process', 'global', 'Buffer',
  'Partial', 'Required', 'Readonly', 'Record', 'Pick', 'Omit',
  'Exclude', 'Extract', 'NonNullable', 'ReturnType', 'InstanceType',
  'Parameters', 'ConstructorParameters',
  'void', 'never', 'unknown', 'any',
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
          if (valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression' || valueNode.type === 'function')) {
            continue;
          }
          if (nameNode && nameNode.type === 'identifier' && !TS_BUILTINS.has(nameNode.text)) {
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

    //export 내부 변수 선언도 처리
    if (child.type === 'export_statement') {
      collectVariables(child, filePath, variables);
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
    if (!TS_BUILTINS.has(name)) {
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

/* ── 유틸리티 ── */

function getFunctionBody(node) {
  return node.childForFieldName('body');
}

function findFunctionNode(root, func, startLine) {
  function search(node) {
    if ((node.type === 'function_declaration' || node.type === 'method_definition') &&
        node.startPosition.row + 1 === startLine) {
      return node;
    }
    if ((node.type === 'arrow_function' || node.type === 'function_expression' || node.type === 'function') &&
        node.startPosition.row + 1 === startLine) {
      return node;
    }
    if (node.type === 'variable_declarator') {
      const value = node.childForFieldName('value');
      if (value && (value.type === 'arrow_function' || value.type === 'function_expression') &&
          node.parent && node.parent.startPosition.row + 1 === startLine) {
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

module.exports = { parseTs };
