//파이썬 파일을 파싱하는 코드
//tree-sitter를 사용하여 파이썬 파일을 파싱한다.

const Parser = require('tree-sitter');
const Python = require('tree-sitter-python');

function createParser() {
  const p = new Parser();
  p.setLanguage(Python);
  return p;
}

//파이썬 파일 하나를 파싱해서 함수, 호출, import, 클래스 정보를 추출하는 함수다.
function parseFile(code, filePath) {
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

  return { functions, calls, imports, classes };
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

module.exports = { parseFile };
