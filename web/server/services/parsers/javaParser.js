//자바 파일을 파싱해서 함수, 클래스, 호출, import, 변수를 추출한다

const Parser = require('tree-sitter');
const Java = require('tree-sitter-java');

function createParser() {
  const p = new Parser();
  //문법 패키지의 타입 정의가 tree-sitter 0.22 타입과 맞지 않아 캐스팅을 한다 (런타임 동작은 같음)
  p.setLanguage(/** @type {any} */ (Java));
  return p;
}

function parseJava(code, filePath) {
  const parser = createParser();
  const tree = parser.parse(code);
  const root = tree.rootNode;

  const result = {
    functions: [],
    calls: [],
    imports: [],
    classes: [],
    variables: [],
    variableRefs: [],
  };

  collectImports(root, result.imports);
  collectDefinitions(root, filePath, result, null);

  return result;
}

//import 정보 수집
function collectImports(root, imports) {
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child.type !== 'import_declaration') continue;

    const nameNode =
      findChildByType(child, 'scoped_identifier') || findChildByType(child, 'identifier');
    if (!nameNode) continue;

    const fullName = nameNode.text;
    const isStatic = findChildByType(child, 'static') !== null;
    const isWildcard = findChildByType(child, 'asterisk') !== null;
    if (isWildcard) {
      //import java.util.*; → 패키지 전체
      imports.push({ module: fullName, name: '*' });
    } else if (isStatic) {
      //import static a.b.Utils.trim; → module은 클래스(a.b.Utils), name은 멤버(trim)
      imports.push({ module: withoutLastSegment(fullName), name: lastSegment(fullName) });
    } else {
      //import a.b.Utils; → module="a.b.Utils", name="Utils"
      imports.push({ module: fullName, name: lastSegment(fullName) });
    }
  }
}

//클래스, 메서드, 필드 정의 수집
const CLASS_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
]);
//클래스 body 종류. 이 노드들은 그대로 안으로 들어가 탐색한다
const BODY_TYPES = new Set(['class_body', 'interface_body', 'enum_body', 'enum_body_declarations']);

//ctx: 현재 클래스 정보 { className, superclass } (최상위면 null)
function collectDefinitions(node, filePath, result, ctx) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (CLASS_TYPES.has(child.type)) {
      collectClass(child, filePath, result);
    } else if (BODY_TYPES.has(child.type)) {
      collectDefinitions(child, filePath, result, ctx);
    } else if (
      ctx &&
      (child.type === 'method_declaration' ||
        child.type === 'constructor_declaration' ||
        child.type === 'compact_constructor_declaration')
    ) {
      collectMethod(child, filePath, result, ctx);
    } else if (
      ctx &&
      (child.type === 'field_declaration' || child.type === 'constant_declaration')
    ) {
      collectField(child, filePath, result, ctx);
    }
  }
}
function collectClass(node, filePath, result) {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  //extends + implements (인터페이스의 extends 포함)를 모두 부모 타입으로 기록
  const superclasses = [];
  for (const field of ['superclass', 'interfaces']) {
    const typeNode = node.childForFieldName(field);
    if (typeNode) extractTypeNames(typeNode, superclasses);
  }
  const extendsInterfaces = findChildByType(node, 'extends_interfaces');
  if (extendsInterfaces) extractTypeNames(extendsInterfaces, superclasses);

  result.classes.push({
    name: nameNode.text,
    filePath,
    superclasses,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  });

  const superNode = node.childForFieldName('superclass');
  const ctx = {
    className: nameNode.text,
    //super.m() 호출을 부모 클래스로 연결하기 위해 extends 대상만 따로 보관
    superclass: superNode ? superclasses[0] : null,
  };

  const body = node.childForFieldName('body');
  if (body) collectDefinitions(body, filePath, result, ctx);
}

//타입 노드에서 클래스 이름만 뽑는다. Base<T> → Base, a.b.Base → Base
function extractTypeNames(node, out) {
  if (node.type === 'type_identifier') {
    out.push(node.text);
  } else if (node.type === 'scoped_type_identifier') {
    out.push(lastSegment(node.text));
  } else if (node.type !== 'type_arguments') {
    //superclass, type_list, generic_type 등은 안으로 들어가고, 제네릭 인자(<T>)는 건너뛴다
    for (let i = 0; i < node.namedChildCount; i++) {
      extractTypeNames(node.namedChild(i), out);
    }
  }
}

//메서드, 주석, 필드 처리
function collectMethod(node, filePath, result, ctx) {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nameNode.text;
  const qualifiedName = `${ctx.className}.${name}`;
  const { docstring, comment } = extractComments(node);

  result.functions.push({
    name,
    qualifiedName,
    className: ctx.className,
    filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    code: node.text,
    docstring,
    comment,
  });

  //인터페이스/abstract 메서드는 body가 없다
  const body = node.childForFieldName('body');
  if (body) {
    collectCalls(body, qualifiedName, filePath, result.calls, ctx);
    collectVariableRefs(body, qualifiedName, filePath, result.variableRefs, ctx);
  }
}

//바로 앞의 주석: /** */ 이면 Javadoc(docstring), 그 외 주석이면 comment
function extractComments(node) {
  const prev = node.previousNamedSibling;
  if (prev && prev.type === 'block_comment' && prev.text.startsWith('/**')) {
    return { docstring: prev.text, comment: '' };
  }
  if (prev && (prev.type === 'line_comment' || prev.type === 'block_comment')) {
    return { docstring: '', comment: prev.text };
  }
  return { docstring: '', comment: '' };
}

function collectField(node, filePath, result, ctx) {
  //int a, b; 처럼 선언자가 여러 개일 수 있다
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child.type !== 'variable_declarator') continue;
    const nameNode = child.childForFieldName('name');
    if (!nameNode) continue;
    result.variables.push({
      name: `${ctx.className}.${nameNode.text}`,
      className: ctx.className,
      filePath,
      line: node.startPosition.row + 1,
    });
  }
}

/* ── 호출 수집 ── */

function collectCalls(node, callerName, filePath, calls, ctx) {
  let callee = '';

  if (node.type === 'method_invocation') {
    const objectNode = node.childForFieldName('object');
    const name = node.childForFieldName('name').text;
    if (!objectNode) {
      callee = name; //foo()
    } else if (objectNode.type === 'this') {
      callee = `${ctx.className}.${name}`; //this.foo() → 내 클래스
    } else if (objectNode.type === 'super') {
      callee = ctx.superclass ? `${ctx.superclass}.${name}` : name; //super.foo() → 부모 클래스
    } else {
      callee = `${objectNode.text}.${name}`; //obj.foo(), Utils.foo()
    }
  } else if (node.type === 'object_creation_expression') {
    //new Foo() / new Foo<>() → 생성자 Foo
    const typeNames = [];
    extractTypeNames(node.childForFieldName('type'), typeNames);
    callee = typeNames[0] || '';
  } else if (node.type === 'explicit_constructor_invocation') {
    //생성자 안의 super(...) / this(...)
    const ctor = node.childForFieldName('constructor');
    if (ctor && ctor.type === 'super' && ctx.superclass) callee = ctx.superclass;
    else if (ctor && ctor.type === 'this') callee = ctx.className;
  }

  if (callee) {
    calls.push({ caller: callerName, callee, filePath, line: node.startPosition.row + 1 });
  }

  for (let i = 0; i < node.childCount; i++) {
    collectCalls(node.child(i), callerName, filePath, calls, ctx);
  }
}
/* ── 변수 참조 수집 ── */

//필드로 착각하기 쉬운 JDK 클래스 이름. 참조로 기록하지 않는다
const JAVA_BUILTINS = new Set([
  'System',
  'Math',
  'String',
  'Integer',
  'Long',
  'Double',
  'Float',
  'Boolean',
  'Character',
  'Object',
  'Objects',
  'Arrays',
  'Collections',
  'List',
  'Map',
  'Set',
  'Optional',
  'Thread',
]);

function collectVariableRefs(node, callerName, filePath, refs, ctx) {
  if (node.type === 'identifier') {
    if (!JAVA_BUILTINS.has(node.text)) {
      refs.push({
        caller: callerName,
        variable: node.text,
        filePath,
        line: node.startPosition.row + 1,
      });
    }
    return;
  }

  if (node.type === 'field_access' && node.childForFieldName('object').type === 'this') {
    //this.value → Calculator.value (resolver가 같은 파일의 필드로 바로 찾을 수 있게)
    const field = node.childForFieldName('field').text;
    refs.push({
      caller: callerName,
      variable: `${ctx.className}.${field}`,
      filePath,
      line: node.startPosition.row + 1,
    });
    return;
  }

  //메서드 이름(foo())과 생성할 타입 이름(new Foo())은 변수가 아니므로 건너뛴다
  if (node.type === 'method_invocation') {
    const objectNode = node.childForFieldName('object');
    if (objectNode) collectVariableRefs(objectNode, callerName, filePath, refs, ctx);
    collectVariableRefs(node.childForFieldName('arguments'), callerName, filePath, refs, ctx);
    return;
  }
  if (node.type === 'object_creation_expression') {
    collectVariableRefs(node.childForFieldName('arguments'), callerName, filePath, refs, ctx);
    return;
  }

  for (let i = 0; i < node.childCount; i++) {
    collectVariableRefs(node.child(i), callerName, filePath, refs, ctx);
  }
}
/* ── 헬퍼 ── */

function findChildByType(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return node.child(i);
  }
  return null;
}

function lastSegment(name) {
  const parts = name.split('.');
  return parts[parts.length - 1];
}

function withoutLastSegment(name) {
  return name.split('.').slice(0, -1).join('.');
}

module.exports = { parseJava };
