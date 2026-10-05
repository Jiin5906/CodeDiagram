//코드 파일을 파싱하는 코드
//tree-sitter를 사용하여 7개 언어(Python, JS, HTML, CSS, C++, C#, TypeScript)를 파싱한다.

const Parser = require('tree-sitter');
const Python = require('tree-sitter-python');
const { parseHtml } = require('./parsers/htmlParser');
const { parseCss } = require('./parsers/cssParser');
const { parseJs } = require('./parsers/jsParser');
const { parseCpp } = require('./parsers/cppParser');
const { parseCsharp } = require('./parsers/csharpParser');
const { parseTs } = require('./parsers/tsParser');

function createParser() {
  const p = new Parser();
  //문법 패키지의 타입 정의가 tree-sitter 0.22 타입과 맞지 않아 캐스팅한다 (런타임 동작은 같다)
  p.setLanguage(/** @type {any} */ (Python));
  return p;
}

//언어별 파서 팩토리. language를 지정하면 해당 파서를, 생략하면 Python 파서를 사용한다.
function parseFile(code, filePath, language) {
  if (language && language !== 'python') {
    switch (language) {
      case 'html': return parseHtml(code, filePath);
      case 'css':  return parseCss(code, filePath);
      case 'javascript': return parseJs(code, filePath);
      case 'cpp': return parseCpp(code, filePath);
      case 'csharp': return parseCsharp(code, filePath);
      case 'typescript': return parseTs(code, filePath);
      default: return null;
    }
  }
  return parsePython(code, filePath);
}

//파이썬 파일 하나를 파싱해서 함수, 호출, import, 클래스 정보를 추출하는 함수다.
function parsePython(code, filePath) {
  const parser = createParser();
  const tree = parser.parse(code);
  const root = tree.rootNode;

  const functions = [];
  const calls = [];
  const imports = [];
  const classes = [];

  //import문 수집
  collectImports(root, imports);

  //최상위 함수와 클래스 메서드 수집
  collectDefinitions(root, code, filePath, functions, calls, classes, null);

  //변수/필드 수집
  const variables = [];
  collectVariables(root, filePath, variables, null);

  //변수 참조 수집
  const variableRefs = [];
  for (const func of functions) {
    //함수 body에서 변수 참조를 수집하기 위해 다시 트리를 탐색
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

function collectImports(node, imports) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'import_from_statement') {
      const moduleNode = child.childForFieldName('module_name');
      const moduleName = moduleNode ? moduleNode.text : '';
      //import된 이름들 수집
      for (let j = 0; j < child.childCount; j++) {
        const nameNode = child.child(j);
        if (nameNode.type === 'dotted_name' && nameNode !== moduleNode) {
          imports.push({ module: moduleName, name: nameNode.text });
        } else if (nameNode.type === 'aliased_import') {
          const origName = nameNode.child(0)?.text || '';
          const alias = nameNode.childForFieldName('alias')?.text || origName;
          imports.push({ module: moduleName, name: origName, alias });
        }
      }
    } else if (child.type === 'import_statement') {
      for (let j = 0; j < child.childCount; j++) {
        const nameNode = child.child(j);
        if (nameNode.type === 'dotted_name') {
          imports.push({ module: nameNode.text, name: nameNode.text });
        } else if (nameNode.type === 'aliased_import') {
          const origName = nameNode.child(0)?.text || '';
          const alias = nameNode.childForFieldName('alias')?.text || origName;
          imports.push({ module: origName, name: origName, alias });
        }
      }
    }
  }
}

function collectDefinitions(node, code, filePath, functions, calls, classes, className) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === 'class_definition') {
      const nameNode = child.childForFieldName('name');
      const clsName = nameNode ? nameNode.text : 'UnknownClass';

      //상속 부모 클래스 추출
      const superclasses = [];
      const argList = child.childForFieldName('superclasses');
      if (argList) {
        for (let j = 0; j < argList.childCount; j++) {
          const arg = argList.child(j);
          if (arg.type === 'identifier' || arg.type === 'dotted_name' || arg.type === 'attribute') {
            superclasses.push(arg.text);
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

      const body = child.childForFieldName('body');
      if (body) {
        collectDefinitions(body, code, filePath, functions, calls, classes, clsName);
      }
    } else if (child.type === 'decorated_definition') {
      //데코레이터가 붙은 함수/클래스 정의를 내부 정의로 재귀 처리
      collectDefinitions(child, code, filePath, functions, calls, classes, className);
    } else if (child.type === 'function_definition') {
      const funcInfo = extractFunction(child, code, filePath, className);
      functions.push(funcInfo);

      //이 함수 안에서의 호출 수집
      const body = child.childForFieldName('body');
      if (body) {
        collectCalls(body, funcInfo.qualifiedName, filePath, calls);
      }
    }
  }
}

function extractFunction(node, code, filePath, className) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? nameNode.text : 'anonymous';
  const qualifiedName = className ? `${className}.${name}` : name;
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const funcCode = node.text;

  //docstring 추출
  let docstring = '';
  const body = node.childForFieldName('body');
  if (body && body.childCount > 0) {
    const firstStmt = body.child(0);
    if (firstStmt.type === 'expression_statement') {
      const expr = firstStmt.child(0);
      if (expr && (expr.type === 'string' || expr.type === 'concatenated_string')) {
        docstring = expr.text;
      }
    }
  }

  //함수 위에 있는 주석 추출
  let comment = '';
  let prev = node.previousSibling;
  //공백이나 줄바꿈 노드를 건너뛰고 앞에 있는 주석을 찾음
  while (prev && prev.type !== 'comment' && !prev.isNamed) {
    prev = prev.previousSibling;
  }
  if (prev && prev.type === 'comment') {
    comment = prev.text;
  }

  return {
    name,
    qualifiedName,
    className: className || null,
    filePath,
    startLine,
    endLine,
    code: funcCode,
    docstring,
    comment,
  };
}

function collectCalls(node, callerName, filePath, calls) {
  if (node.type === 'call') {
    const funcNode = node.child(0);
    let calleeName = '';

    if (funcNode.type === 'identifier') {
      calleeName = funcNode.text;
    } else if (funcNode.type === 'attribute') {
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

//변수/필드를 수집하는 함수다.
//모듈 최상위 assignment와 클래스 body 내 assignment에서 변수명을 추출한다.
const VARIABLE_BLACKLIST = new Set([
  'self', 'cls', 'True', 'False', 'None', 'print', 'len', 'range',
  'int', 'str', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
  'type', 'super', 'object', 'isinstance', 'issubclass', 'hasattr',
  'getattr', 'setattr', 'delattr', 'property', 'staticmethod',
  'classmethod', 'enumerate', 'zip', 'map', 'filter', 'sorted',
  'reversed', 'min', 'max', 'sum', 'abs', 'round', 'input', 'open',
  'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
  'AttributeError', 'RuntimeError', 'StopIteration', 'NotImplementedError',
  '__name__', '__main__', '__init__', '__all__', '__file__', '__doc__',
]);

function collectVariables(node, filePath, variables, className) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === 'class_definition') {
      const nameNode = child.childForFieldName('name');
      const clsName = nameNode ? nameNode.text : 'UnknownClass';
      const body = child.childForFieldName('body');
      if (body) {
        collectVariables(body, filePath, variables, clsName);
      }
    } else if (child.type === 'expression_statement') {
      const expr = child.child(0);
      if (expr && expr.type === 'assignment') {
        const left = expr.childForFieldName('left');
        if (left) {
          const varName = extractVarName(left, className);
          if (varName && !VARIABLE_BLACKLIST.has(varName.split('.').pop())) {
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
  }
}

function extractVarName(node, className) {
  if (node.type === 'identifier') {
    return className ? `${className}.${node.text}` : node.text;
  }
  if (node.type === 'attribute') {
    //self.x 같은 경우 → ClassName.x로 변환
    const obj = node.child(0);
    const attr = node.childForFieldName('attribute');
    if (obj && attr && (obj.text === 'self' || obj.text === 'cls') && className) {
      return `${className}.${attr.text}`;
    }
    return node.text;
  }
  return null;
}

//함수 body 내에서 변수/필드 참조를 수집한다.
//call의 직접 함수명 identifier는 제외 (이미 함수 호출로 처리됨)
function collectVariableRefs(node, callerName, filePath, refs) {
  if (node.type === 'call') {
    //call 노드의 인자만 탐색 (함수명 자체는 건너뜀)
    const args = node.childForFieldName('arguments');
    if (args) {
      collectVariableRefs(args, callerName, filePath, refs);
    }
    return;
  }

  if (node.type === 'identifier') {
    const name = node.text;
    if (!VARIABLE_BLACKLIST.has(name)) {
      refs.push({
        caller: callerName,
        variable: name,
        filePath,
        line: node.startPosition.row + 1,
      });
    }
    return;
  }

  if (node.type === 'attribute') {
    //self.x → ClassName.x 참조로 기록
    const obj = node.child(0);
    const attr = node.childForFieldName('attribute');
    if (obj && attr && (obj.text === 'self' || obj.text === 'cls')) {
      refs.push({
        caller: callerName,
        variable: `self.${attr.text}`,
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

//함수 노드를 트리에서 다시 찾기 위한 헬퍼
function findFunctionNode(root, qualifiedName, startLine) {
  const parts = qualifiedName.split('.');
  const funcName = parts[parts.length - 1];

  function search(node) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'function_definition') {
        const nameNode = child.childForFieldName('name');
        if (nameNode && nameNode.text === funcName && child.startPosition.row + 1 === startLine) {
          return child;
        }
      }
      if (child.type === 'class_definition') {
        const body = child.childForFieldName('body');
        if (body) {
          const found = search(body);
          if (found) return found;
        }
      }
    }
    return null;
  }

  return search(root);
}

module.exports = { parseFile };
