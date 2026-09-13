//C++ 파일을 파싱하여 함수, 클래스, 호출, include, 변수를 추출한다.

const Parser = require('tree-sitter');
const Cpp = require('tree-sitter-cpp');

function createParser() {
  const p = new Parser();
  p.setLanguage(Cpp);
  return p;
}

function parseCpp(code, filePath) {
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
    const funcNode = findFunctionNode(root, func.qualifiedName, func.startLine);
    if (funcNode) {
      const body = funcNode.childForFieldName('body');
      if (body) {
        collectVariableRefs(body, func.qualifiedName, filePath, variableRefs);
      }
    }
  }

  return { functions, calls, imports, classes, variables, variableRefs };
}

/* ── Import 수집 (#include, using) ── */

function collectImports(node, imports) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    //#include "file.h" 또는 #include <header>
    if (child.type === 'preproc_include') {
      const pathNode = child.childForFieldName('path');
      if (pathNode) {
        const raw = pathNode.text.replace(/^["<]|[">]$/g, '');
        imports.push({ module: raw, name: raw });
      }
    }

    //using namespace xxx; 또는 using xxx::yyy;
    if (child.type === 'using_declaration') {
      const text = child.text.replace(/^using\s+/, '').replace(/;$/, '').trim();
      if (text.startsWith('namespace ')) {
        const ns = text.replace('namespace ', '');
        imports.push({ module: ns, name: ns });
      } else {
        const parts = text.split('::');
        const name = parts[parts.length - 1];
        const module = parts.slice(0, -1).join('::');
        imports.push({ module: module || name, name });
      }
    }
  }
}

/* ── 함수/클래스 정의 수집 ── */

function collectDefinitions(node, code, filePath, functions, calls, classes, className) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    //클래스 정의
    if (child.type === 'class_specifier' || child.type === 'struct_specifier') {
      const nameNode = child.childForFieldName('name');
      const clsName = nameNode ? nameNode.text : null;
      if (!clsName) continue;

      const superclasses = [];
      const baseClause = child.childForFieldName('base_clause') || findChildByType(child, 'base_class_clause');
      if (baseClause) {
        extractBaseClasses(baseClause, superclasses);
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

    //함수 정의
    if (child.type === 'function_definition') {
      const funcInfo = extractFunction(child, filePath, className);
      if (funcInfo) {
        functions.push(funcInfo);
        const body = child.childForFieldName('body');
        if (body) {
          collectCalls(body, funcInfo.qualifiedName, filePath, calls);
        }
      }
    }

    //접근 지정자(public:, private: 등) 내부의 메서드
    if (child.type === 'access_specifier') continue;

    //declaration 내부에 함수 정의가 있을 수 있음
    if (child.type === 'declaration') {
      //함수 선언은 건너뜀 (body 없음)
      continue;
    }

    //template_declaration 내부의 함수/클래스
    if (child.type === 'template_declaration') {
      collectDefinitions(child, code, filePath, functions, calls, classes, className);
    }

    //전처리기 블록 내부 탐색 (#ifdef, #ifndef, #if, #else, #elif)
    if (child.type === 'preproc_ifdef' || child.type === 'preproc_if' ||
        child.type === 'preproc_else' || child.type === 'preproc_elif') {
      collectDefinitions(child, code, filePath, functions, calls, classes, className);
    }
  }
}

function extractFunction(node, filePath, className) {
  const declarator = node.childForFieldName('declarator');
  if (!declarator) return null;

  //body가 없으면 선언만 있는 것이므로 건너뜀
  const body = node.childForFieldName('body');
  if (!body) return null;

  let name = '';
  let resolvedClassName = className;

  if (declarator.type === 'function_declarator') {
    const nameNode = declarator.childForFieldName('declarator');
    if (nameNode) {
      if (nameNode.type === 'qualified_identifier') {
        //ClassName::methodName 형태
        const scope = nameNode.childForFieldName('scope');
        const nameField = nameNode.childForFieldName('name');
        if (scope && nameField) {
          resolvedClassName = scope.text.replace(/:+$/, '');
          name = nameField.text;
        } else {
          name = nameNode.text;
        }
      } else if (nameNode.type === 'destructor_name') {
        name = nameNode.text;
      } else {
        name = nameNode.text;
      }
    }
  } else if (declarator.type === 'qualified_identifier') {
    const scope = declarator.childForFieldName('scope');
    const nameField = declarator.childForFieldName('name');
    if (scope && nameField) {
      resolvedClassName = scope.text.replace(/:+$/, '');
      name = nameField.text;
    }
  }

  if (!name) {
    //fallback: declarator의 텍스트에서 이름 추출 시도
    const text = declarator.text;
    const match = text.match(/(\w+)\s*\(/);
    if (match) name = match[1];
    else return null;
  }

  //resolver 호환성: 내부적으로 `.` 구분자 사용
  const qualifiedName = resolvedClassName ? `${resolvedClassName}.${name}` : name;

  return {
    name,
    qualifiedName,
    className: resolvedClassName || null,
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
    if (child.type === 'base_class_clause') {
      extractBaseClasses(child, superclasses);
    }
    //type_identifier 또는 qualified_identifier가 기본 클래스 이름
    if (child.type === 'type_identifier') {
      superclasses.push(child.text);
    } else if (child.type === 'qualified_identifier') {
      //namespace::Class → Class만 사용
      const nameField = child.childForFieldName('name');
      superclasses.push(nameField ? nameField.text : child.text);
    }
  }
}

/* ── 호출 수집 ── */

function collectCalls(node, callerName, filePath, calls) {
  if (node.type === 'call_expression') {
    const funcNode = node.child(0);
    let calleeName = '';

    if (funcNode) {
      if (funcNode.type === 'identifier') {
        calleeName = funcNode.text;
      } else if (funcNode.type === 'field_expression') {
        //obj.method() → method 이름 추출, obj.method 형태로 저장
        const field = funcNode.childForFieldName('field');
        const arg = funcNode.childForFieldName('argument');
        if (arg && field) {
          calleeName = `${arg.text}.${field.text}`;
        }
      } else if (funcNode.type === 'qualified_identifier') {
        //ClassName::method() → ClassName.method로 변환
        const scope = funcNode.childForFieldName('scope');
        const nameField = funcNode.childForFieldName('name');
        if (scope && nameField) {
          calleeName = `${scope.text}.${nameField.text}`;
        } else {
          calleeName = funcNode.text.replace(/::/g, '.');
        }
      } else if (funcNode.type === 'template_function') {
        //template_function: func<T>() → func 이름만 추출
        const nameNode = funcNode.childForFieldName('name');
        if (nameNode) calleeName = nameNode.text;
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

  for (let i = 0; i < node.childCount; i++) {
    collectCalls(node.child(i), callerName, filePath, calls);
  }
}

/* ── 변수 수집 ── */

const CPP_BUILTINS = new Set([
  'std', 'cout', 'cin', 'endl', 'cerr', 'clog',
  'string', 'vector', 'map', 'set', 'list', 'deque', 'queue', 'stack',
  'pair', 'tuple', 'array', 'unordered_map', 'unordered_set',
  'shared_ptr', 'unique_ptr', 'weak_ptr', 'make_shared', 'make_unique',
  'nullptr', 'true', 'false', 'this',
  'int', 'float', 'double', 'char', 'bool', 'void', 'long', 'short',
  'unsigned', 'signed', 'size_t', 'auto',
  'printf', 'scanf', 'malloc', 'free', 'sizeof',
]);

function collectVariables(node, filePath, variables, className) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === 'class_specifier' || child.type === 'struct_specifier') {
      const nameNode = child.childForFieldName('name');
      const clsName = nameNode ? nameNode.text : null;
      if (clsName) {
        const body = child.childForFieldName('body');
        if (body) {
          collectVariables(body, filePath, variables, clsName);
        }
      }
    }

    //클래스 필드 (field_declaration)
    if (child.type === 'field_declaration') {
      const declarator = child.childForFieldName('declarator');
      if (declarator) {
        const name = extractDeclaratorName(declarator);
        if (name && !CPP_BUILTINS.has(name)) {
          const varName = className ? `${className}.${name}` : name;
          variables.push({
            name: varName,
            className: className || null,
            filePath,
            line: child.startPosition.row + 1,
          });
        }
      }
    }

    //전역 변수 (declaration at top level, not inside function)
    if (child.type === 'declaration' && !className) {
      const declarator = child.childForFieldName('declarator');
      if (declarator) {
        const name = extractDeclaratorName(declarator);
        if (name && !CPP_BUILTINS.has(name)) {
          variables.push({
            name,
            className: null,
            filePath,
            line: child.startPosition.row + 1,
          });
        }
      }
    }

    //전처리기 블록 내부 탐색
    if (child.type === 'preproc_ifdef' || child.type === 'preproc_if' ||
        child.type === 'preproc_else' || child.type === 'preproc_elif') {
      collectVariables(child, filePath, variables, className);
    }
  }
}

function extractDeclaratorName(node) {
  if (node.type === 'identifier') return node.text;
  if (node.type === 'field_identifier') return node.text;
  if (node.type === 'init_declarator') {
    const decl = node.childForFieldName('declarator');
    if (decl) return extractDeclaratorName(decl);
  }
  if (node.type === 'pointer_declarator') {
    const decl = node.childForFieldName('declarator');
    if (decl) return extractDeclaratorName(decl);
  }
  if (node.type === 'reference_declarator') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') return child.text;
    }
  }
  return null;
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
    if (!CPP_BUILTINS.has(name)) {
      refs.push({
        caller: callerName,
        variable: name,
        filePath,
        line: node.startPosition.row + 1,
      });
    }
    return;
  }

  if (node.type === 'field_expression') {
    //this->field → ClassName.field로 기록 (caller에서 className 추출)
    const arg = node.childForFieldName('argument');
    const field = node.childForFieldName('field');
    if (arg && field && arg.text === 'this') {
      refs.push({
        caller: callerName,
        variable: `this.${field.text}`,
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

function findFunctionNode(root, qualifiedName, startLine) {
  function search(node) {
    if (node.type === 'function_definition' && node.startPosition.row + 1 === startLine) {
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

module.exports = { parseCpp };
