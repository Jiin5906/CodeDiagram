//파서가 추출한 "함수 A가 funcB를 호출한다"라는 원시 데이터를 실제 어떤 파일의 어떤 함수인지 매칭한다.
//대상 언어: Python, C++, C#, TypeScript, Java (티어 기반 언어). 추후 Rust도 추가할 예정
/*
우선순위로 해석한다.
    0. 클래스까지 붙은 이름(Calculator.add)이 정확히 일치하는 함수가 있으면 그것으로 연결
    1. 같은 파일 내 일치하는 함수가 있으면 그것으로 연결
    2. import 기반: import문을 참고해서 해당 모듈의 함수를 찾음
    3. 전역 탐색: 전체 프로젝트에서 이름이 같은 함수를 찾음
*/

function resolveCalls(allFunctions, allCalls, allImports) {
  //함수 이름으로 빠르게 찾기 위한 조회 맵 생성
  const funcByQName = new Map(); //함수 이름 → [함수 정보들]
  const funcByFile = new Map(); //파일 경로 → [함수 정보들]

  for (const func of allFunctions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    const entry = { ...func, nodeId };

    if (!funcByQName.has(func.name)) funcByQName.set(func.name, []);
    funcByQName.get(func.name).push(entry);

    if (func.qualifiedName !== func.name) {
      if (!funcByQName.has(func.qualifiedName)) funcByQName.set(func.qualifiedName, []);
      funcByQName.get(func.qualifiedName).push(entry);
    }

    if (!funcByFile.has(func.filePath)) funcByFile.set(func.filePath, []);
    funcByFile.get(func.filePath).push(entry);
  }

  //import 조회 맵 생성
  const importMap = buildImportMap(allImports);

  //호출자-피호출자 쌍으로 묶어서 참조 목록을 만듦
  const edgeMap = new Map(); //"출발 -> 도착" → { source, target, references }

  for (const call of allCalls) {
    const callerNodeId = `${call.filePath}::${call.caller}`;
    const target = resolveCallee(call, funcByQName, funcByFile, importMap);
    if (!target) continue;

    const edgeKey = `${callerNodeId}→${target.nodeId}`;
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, {
        source: callerNodeId,
        target: target.nodeId,
        references: [],
      });
    }
    edgeMap.get(edgeKey).references.push({
      file: call.filePath,
      line: call.line,
      caller: call.caller,
    });
  }

  return Array.from(edgeMap.values());
}

function resolveCallee(call, funcByQName, funcByFile, importMap) {
  const calleeName = call.callee;

  //obj.method 같은 속성 호출 처리 — 메서드 이름만 뽑아냄
  const parts = calleeName.split('.');
  const simpleCallee = parts[parts.length - 1];

  //0. 'Calculator.add'처럼 클래스까지 붙은 이름이 프로젝트 어딘가의 함수와 정확히 일치하면 최우선
  //(Java super.add()가 같은 파일의 동명 메서드로 잘못 연결되지 않게 한다)
  if (parts.length > 1) {
    const exact = (funcByQName.get(calleeName) || []).find((f) => f.qualifiedName === calleeName);
    if (exact) return exact;
  }

  //1. 같은 파일 내에서 이름이 일치하는 함수 찾기
  const fileFuncs = funcByFile.get(call.filePath) || [];
  const sameFile = fileFuncs.find(
    (f) => f.qualifiedName === calleeName || f.name === calleeName || f.name === simpleCallee,
  );
  if (sameFile) return sameFile;

  //2. import 기반으로 해석
  const fileImports = importMap.get(call.filePath) || {};
  const importModule = fileImports[calleeName] || fileImports[simpleCallee];
  if (importModule) {
    //해당 모듈 파일에서 함수를 찾아봄
    const candidates = funcByQName.get(simpleCallee) || funcByQName.get(calleeName) || [];
    const fromModule = candidates.find((f) => {
      //모듈이 "utils"이고 파일이 "utils.py"일 수 있으니까 확장자 떼고 비교함
      const fileBase = f.filePath
        .replace(/\.(py|cpp|cc|cxx|h|hpp|cs|ts|tsx|js|jsx|java)$/, '')
        .replace(/\//g, '.');
      return (
        fileBase === importModule ||
        fileBase.endsWith('.' + importModule) ||
        fileBase.endsWith('/' + importModule)
      );
    });
    if (fromModule) return fromModule;
  }

  //3. 전역 탐색 — 이름으로 전체 프로젝트에서 찾기
  const globals = funcByQName.get(simpleCallee) || funcByQName.get(calleeName) || [];
  if (globals.length > 0) {
    //같은 파일이 아닌 외부 함수를 우선으로 찾음
    const external = globals.find((f) => f.filePath !== call.filePath);
    return external || globals[0];
  }

  return null;
}

//클래스 상속 관계를 엣지로 변환하는 함수다.
//자식 클래스 → 부모 클래스 방향의 inheritance 엣지를 생성한다.
function resolveInheritance(allClasses) {
  //클래스 이름 → 클래스 정보 매핑
  const classByName = new Map();
  for (const cls of allClasses) {
    if (!classByName.has(cls.name)) classByName.set(cls.name, []);
    classByName.get(cls.name).push(cls);
  }

  const edges = [];
  for (const cls of allClasses) {
    for (const parentName of cls.superclasses) {
      //점(.)으로 구분된 이름의 마지막 부분을 사용
      const simpleName = parentName.split('.').pop();
      const candidates = classByName.get(simpleName) || classByName.get(parentName) || [];
      if (candidates.length > 0) {
        //다른 파일의 클래스를 우선으로, 없으면 첫 번째 후보 사용
        const target = candidates.find((c) => c.filePath !== cls.filePath) || candidates[0];
        edges.push({
          source: `${cls.filePath}::${cls.name}`,
          target: `${target.filePath}::${target.name}`,
          type: 'inheritance',
        });
      }
    }
  }
  return edges;
}

//import 조회 맵 생성 헬퍼: 파일 경로 → { import된 이름 → 모듈 경로 }
function buildImportMap(allImports) {
  const importMap = new Map();
  for (const fileImports of allImports) {
    const map = {};
    for (const imp of fileImports.imports) {
      const effectiveName = imp.alias || imp.name;
      map[effectiveName] = imp.module;
    }
    importMap.set(fileImports.filePath, map);
  }
  return importMap;
}

//변수 참조를 해석하여 엣지 배열로 반환한다.
//3단계 우선순위: 같은 파일 → import → 전역
function resolveVariableRefs(allVariables, allVariableRefs, allImports) {
  //변수 이름 → [변수 정보] 맵 생성
  const varByName = new Map();
  const varByFile = new Map();

  for (const v of allVariables) {
    const nodeId = `${v.filePath}::${v.name}`;
    const entry = { ...v, nodeId };

    const simpleName = v.name.split('.').pop();
    if (!varByName.has(simpleName)) varByName.set(simpleName, []);
    varByName.get(simpleName).push(entry);

    if (!varByName.has(v.name)) varByName.set(v.name, []);
    if (!varByName.get(v.name).includes(entry)) {
      varByName.get(v.name).push(entry);
    }

    if (!varByFile.has(v.filePath)) varByFile.set(v.filePath, []);
    varByFile.get(v.filePath).push(entry);
  }

  const importMap = buildImportMap(allImports);
  const edgeMap = new Map();

  for (const ref of allVariableRefs) {
    const callerNodeId = `${ref.filePath}::${ref.caller}`;
    const varName = ref.variable;

    //self.x 참조 → className.x로 변환하여 찾기
    let target;

    //1. 같은 파일에서 찾기
    const fileVars = varByFile.get(ref.filePath) || [];

    if (varName.startsWith('self.')) {
      //self.x → 같은 파일의 ClassName.x 변수
      const attrName = varName.substring(5);
      target = fileVars.find((v) => v.name.endsWith('.' + attrName) && v.className);
    } else {
      target = fileVars.find((v) => v.name === varName || v.name.split('.').pop() === varName);
    }

    //2. import 기반
    if (!target) {
      const fileImports = importMap.get(ref.filePath) || {};
      const importModule = fileImports[varName];
      if (importModule) {
        const candidates = varByName.get(varName) || [];
        target = candidates.find((v) => {
          const fileBase = v.filePath
            .replace(/\.(py|cpp|cc|cxx|h|hpp|cs|ts|tsx|js|jsx|java)$/, '')
            .replace(/\//g, '.');
          return fileBase === importModule || fileBase.endsWith('.' + importModule);
        });
      }
    }

    //3. 전역 탐색
    if (!target) {
      const simpleName = varName.startsWith('self.') ? varName.substring(5) : varName;
      const candidates = varByName.get(simpleName) || varByName.get(varName) || [];
      if (candidates.length > 0) {
        target = candidates.find((v) => v.filePath !== ref.filePath) || candidates[0];
      }
    }

    if (!target) continue;

    //자기 자신 참조 방지
    if (callerNodeId === target.nodeId) continue;

    const edgeKey = `${callerNodeId}→${target.nodeId}`;
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, {
        source: callerNodeId,
        target: target.nodeId,
        type: 'variable-ref',
        references: [],
      });
    }
    edgeMap.get(edgeKey).references.push({
      file: ref.filePath,
      line: ref.line,
      caller: ref.caller,
    });
  }

  return Array.from(edgeMap.values());
}

module.exports = { resolveCalls, resolveInheritance, resolveVariableRefs };
