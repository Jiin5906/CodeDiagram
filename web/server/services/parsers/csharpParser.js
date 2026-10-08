//C# 파일을 파싱하여 함수, 클래스, 호출, using, 변수를 추출한다.

const Parser = require('tree-sitter');
const CSharp = require('tree-sitter-c-sharp');

function createParser() {
  const p = new Parser();
  //문법 패키지의 타입 정의가 tree-sitter 0.22 타입과 맞지 않아 캐스팅한다 (런타임 동작은 같다)
  p.setLanguage(/** @type {any} */ (CSharp));
  return p;
}

function parseCsharp(code, filePath) {
  const parser = createParser();
  const tree = parser.parse(code);
  const root = tree.rootNode;

  const functions = [];
  const calls = [];
  const imports = [];
  const classes = [];
  const variables = [];
  const variableRefs = [];

  collectImports(root, imports);
  collectDefinitions(root, code, filePath, functions, calls, classes, null);
  collectVariables(root, filePath, variables, null);

  //함수 body에서 변수 참조 수집
  for (const func of functions) {
    const funcNode = findFunctionNode(root, func.startLine);
    if (funcNode) {
      const body = funcNode.childForFieldName('body');
      if (body) {
        collectVariableRefs(body, func.qualifiedName, filePath, variableRefs);
      }
    }
  }

  return { functions, calls, imports, classes, variables, variableRefs };
}

/* ── Import 수집 (using directive) ── */

function collectImports(node, imports) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === 'using_directive') {
      //using System.Collections.Generic; → module="System.Collections.Generic"
      const nameNode = child.childForFieldName('name') || findFirstNameNode(child);
      if (nameNode) {
        const fullName = nameNode.text;
        const parts = fullName.split('.');
        imports.push({
          module: fullName,
          name: parts[parts.length - 1],
        });
      }
    }
  }
}

function findFirstNameNode(node) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'qualified_name' || child.type === 'identifier') {
      return child;
    }
  }
  return null;
}

/* ── 함수/클래스 정의 수집 ── */

function collectDefinitions(node, code, filePath, functions, calls, classes, className) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    //namespace 안으로 재귀
    if (child.type === 'namespace_declaration') {
      const body = child.childForFieldName('body');
      if (body) {
        collectDefinitions(body, code, filePath, functions, calls, classes, className);
      }
      continue;
    }

    //file-scoped namespace
    if (child.type === 'file_scoped_namespace_declaration') {
      collectDefinitions(child, code, filePath, functions, calls, classes, className);
      continue;
    }

    //클래스, 구조체, 인터페이스
    if (
      child.type === 'class_declaration' ||
      child.type === 'struct_declaration' ||
      child.type === 'interface_declaration'
    ) {
      const nameNode = child.childForFieldName('name');
      const clsName = nameNode ? nameNode.text : null;
      if (!clsName) continue;

      const superclasses = [];
      const baseList = child.childForFieldName('bases') || findChildByType(child, 'base_list');
      if (baseList) {
        extractBaseClasses(baseList, superclasses);
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
        collectDefinitions(body, code, filePath, functions, calls, classes, clsName);
      }
    }

    //메서드 정의
    if (child.type === 'method_declaration') {
      const funcInfo = extractMethod(child, filePath, className);
      if (funcInfo) {
        functions.push(funcInfo);
        const body = child.childForFieldName('body');
        if (body) {
          collectCalls(body, funcInfo.qualifiedName, filePath, calls);
        }
      }
    }

    //생성자
    if (child.type === 'constructor_declaration') {
      const nameNode = child.childForFieldName('name');
      const name = nameNode ? nameNode.text : className || 'constructor';
      const qualifiedName = className ? `${className}.${name}` : name;

      const funcInfo = {
        name,
        qualifiedName,
        className: className || null,
        filePath,
        startLine: child.startPosition.row + 1,
        endLine: child.endPosition.row + 1,
        code: child.text,
        docstring: '',
        comment: extractComment(child),
      };
      functions.push(funcInfo);

      const body = child.childForFieldName('body');
      if (body) {
        collectCalls(body, funcInfo.qualifiedName, filePath, calls);
      }
    }

    //로컬 함수
    if (child.type === 'local_function_statement') {
      const nameNode = child.childForFieldName('name');
      if (nameNode) {
        const name = nameNode.text;
        const qualifiedName = className ? `${className}.${name}` : name;
        const funcInfo = {
          name,
          qualifiedName,
          className: className || null,
          filePath,
          startLine: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
          code: child.text,
          docstring: '',
          comment: extractComment(child),
        };
        functions.push(funcInfo);

        const body = child.childForFieldName('body');
        if (body) {
          collectCalls(body, funcInfo.qualifiedName, filePath, calls);
        }
      }
    }
  }
}

function extractMethod(node, filePath, className) {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return null;

  const name = nameNode.text;
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

function extractBaseClasses(node, superclasses) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'identifier') {
      superclasses.push(child.text);
    } else if (child.type === 'qualified_name') {
      const parts = child.text.split('.');
      superclasses.push(parts[parts.length - 1]);
    } else if (child.type === 'generic_name') {
      const nameNode = child.childForFieldName('name');
      if (nameNode) superclasses.push(nameNode.text);
    } else if (child.childCount > 0) {
      extractBaseClasses(child, superclasses);
    }
  }
}

/* ── 호출 수집 ── */

function collectCalls(node, callerName, filePath, calls) {
  if (node.type === 'invocation_expression') {
    const funcNode = node.child(0);
    let calleeName = '';

    if (funcNode) {
      if (funcNode.type === 'identifier') {
        calleeName = funcNode.text;
      } else if (funcNode.type === 'member_access_expression') {
        //obj.Method() → obj.Method 형태로 저장
        calleeName = funcNode.text;
      } else if (funcNode.type === 'qualified_name') {
        calleeName = funcNode.text.replace(/\./g, '.');
      } else if (funcNode.type === 'generic_name') {
        const nameNode = funcNode.childForFieldName('name');
        calleeName = nameNode ? nameNode.text : funcNode.text;
      }
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

  //object_creation_expression: new ClassName()
  if (node.type === 'object_creation_expression') {
    const typeNode = node.childForFieldName('type');
    if (typeNode) {
      const typeName = typeNode.text;
      calls.push({
        caller: callerName,
        callee: typeName,
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

const CSHARP_BUILTINS = new Set([
  'this',
  'base',
  'true',
  'false',
  'null',
  'int',
  'float',
  'double',
  'decimal',
  'char',
  'bool',
  'void',
  'string',
  'object',
  'byte',
  'sbyte',
  'short',
  'ushort',
  'uint',
  'long',
  'ulong',
  'var',
  'dynamic',
  'Console',
  'Math',
  'String',
  'Object',
  'Array',
  'List',
  'Dictionary',
  'HashSet',
  'Queue',
  'Stack',
  'Task',
  'Tuple',
  'Nullable',
  'Exception',
  'ArgumentException',
  'InvalidOperationException',
  'NullReferenceException',
  'IndexOutOfRangeException',
]);

function collectVariables(node, filePath, variables, className) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    //namespace 내부로 재귀
    if (child.type === 'namespace_declaration') {
      const body = child.childForFieldName('body');
      if (body) collectVariables(body, filePath, variables, className);
      continue;
    }

    if (child.type === 'file_scoped_namespace_declaration') {
      collectVariables(child, filePath, variables, className);
      continue;
    }

    //클래스/구조체 내부로 재귀
    if (child.type === 'class_declaration' || child.type === 'struct_declaration') {
      const nameNode = child.childForFieldName('name');
      const clsName = nameNode ? nameNode.text : null;
      if (clsName) {
        const body = child.childForFieldName('body');
        if (body) collectVariables(body, filePath, variables, clsName);
      }
      continue;
    }

    //필드 선언
    if (child.type === 'field_declaration') {
      const varDecl =
        child.childForFieldName('declaration') || findChildByType(child, 'variable_declaration');
      if (varDecl) {
        extractVariableNames(varDecl, className, filePath, child.startPosition.row + 1, variables);
      } else {
        //직접 자식에서 variable_declarator를 찾아봄
        for (let j = 0; j < child.childCount; j++) {
          const sub = child.child(j);
          if (sub.type === 'variable_declaration') {
            extractVariableNames(sub, className, filePath, child.startPosition.row + 1, variables);
          }
        }
      }
    }

    //프로퍼티 선언 (변수로 분류)
    if (child.type === 'property_declaration') {
      const nameNode = child.childForFieldName('name');
      if (nameNode && !CSHARP_BUILTINS.has(nameNode.text)) {
        const varName = className ? `${className}.${nameNode.text}` : nameNode.text;
        variables.push({
          name: varName,
          className: className || null,
          filePath,
          line: child.startPosition.row + 1,
        });
      }
    }
  }
}

function extractVariableNames(varDecl, className, filePath, line, variables) {
  for (let i = 0; i < varDecl.childCount; i++) {
    const child = varDecl.child(i);
    if (child.type === 'variable_declarator') {
      const nameNode = child.childForFieldName('name');
      if (nameNode && nameNode.type === 'identifier' && !CSHARP_BUILTINS.has(nameNode.text)) {
        const varName = className ? `${className}.${nameNode.text}` : nameNode.text;
        variables.push({
          name: varName,
          className: className || null,
          filePath,
          line,
        });
      }
    }
  }
}

function collectVariableRefs(node, callerName, filePath, refs) {
  if (node.type === 'invocation_expression' || node.type === 'object_creation_expression') {
    const args = node.childForFieldName('arguments') || findChildByType(node, 'argument_list');
    if (args) {
      collectVariableRefs(args, callerName, filePath, refs);
    }
    return;
  }

  if (node.type === 'identifier') {
    const name = node.text;
    if (!CSHARP_BUILTINS.has(name)) {
      refs.push({
        caller: callerName,
        variable: name,
        filePath,
        line: node.startPosition.row + 1,
      });
    }
    return;
  }

  if (node.type === 'member_access_expression') {
    //this.field → ClassName.field로 기록
    const expr = node.childForFieldName('expression');
    const name = node.childForFieldName('name');
    if (expr && name && expr.text === 'this') {
      refs.push({
        caller: callerName,
        variable: `this.${name.text}`,
        filePath,
        line: node.startPosition.row + 1,
      });
      return;
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    collectVariableRefs(node.child(i), callerName, filePath, refs);
  }
}

/* ── 헬퍼 ── */

function findFunctionNode(root, startLine) {
  function search(node) {
    if (
      (node.type === 'method_declaration' ||
        node.type === 'constructor_declaration' ||
        node.type === 'local_function_statement') &&
      node.startPosition.row + 1 === startLine
    ) {
      return node;
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

module.exports = { parseCsharp };
