//HTML/CSS/JS 간 크로스 언어 관계를 해석하는 웹 전용 resolver다.
//Python resolver와 분리하여 웹 파일 간 연결 관계를 해석한다.

const path = require('path');

//웹 파일들의 크로스 언어 관계를 모두 해석하여 엣지 배열로 반환한다.
function resolveWebRelations(parsedFiles, projectPath) {
  const edges = [];

  //파일별 파싱 결과를 언어별로 분류
  const htmlFiles = [];
  const cssFiles = [];
  const jsFiles = [];

  for (const pf of parsedFiles) {
    if (pf.language === 'html') htmlFiles.push(pf);
    else if (pf.language === 'css') cssFiles.push(pf);
    else if (pf.language === 'javascript') jsFiles.push(pf);
  }

  //HTML 요소 인덱스 구축 (id, class, tag 기반)
  const elemById = new Map();    // id → { element, filePath }
  const elemByClass = new Map(); // class → [{ element, filePath }]
  const elemByTag = new Map();   // tag → [{ element, filePath }]

  for (const hf of htmlFiles) {
    for (const elem of (hf.parsed.elements || [])) {
      if (elem.id) {
        elemById.set(elem.id, { element: elem, filePath: hf.filePath });
      }
      for (const cls of elem.classes) {
        if (!elemByClass.has(cls)) elemByClass.set(cls, []);
        elemByClass.get(cls).push({ element: elem, filePath: hf.filePath });
      }
      if (!elemByTag.has(elem.tag)) elemByTag.set(elem.tag, []);
      elemByTag.get(elem.tag).push({ element: elem, filePath: hf.filePath });
    }
  }

  //CSS 변수 인덱스 구축
  const cssVarDefs = new Map(); // --var-name → { filePath, line }
  for (const cf of cssFiles) {
    for (const v of (cf.parsed.variables || [])) {
      cssVarDefs.set(v.name, { filePath: cf.filePath, line: v.line });
    }
  }

  //JS 함수 인덱스 구축
  const jsFuncByName = new Map(); // name → [{ func, filePath }]
  for (const jf of jsFiles) {
    for (const func of (jf.parsed.functions || [])) {
      if (!jsFuncByName.has(func.name)) jsFuncByName.set(func.name, []);
      jsFuncByName.get(func.name).push({ func, filePath: jf.filePath });
      if (func.qualifiedName !== func.name) {
        if (!jsFuncByName.has(func.qualifiedName)) jsFuncByName.set(func.qualifiedName, []);
        jsFuncByName.get(func.qualifiedName).push({ func, filePath: jf.filePath });
      }
    }
  }

  //1. HTML → JS/CSS 파일 참조 (script-ref, style-ref)
  for (const hf of htmlFiles) {
    for (const imp of (hf.parsed.imports || [])) {
      if (imp.type === 'script-ref' || imp.type === 'style-ref') {
        const targetPath = resolveHref(imp.href, hf.filePath, parsedFiles);
        if (targetPath) {
          edges.push({
            source: hf.filePath,
            target: targetPath,
            type: imp.type,
            sourceType: 'file',
            targetType: 'file',
            references: [{ file: hf.filePath, line: imp.line }],
          });
        }
      }
    }
  }

  //2. JS DOM 접근 → HTML 요소 매칭
  for (const jf of jsFiles) {
    for (const access of (jf.parsed.domAccesses || [])) {
      const sourceId = access.caller
        ? `${jf.filePath}::${access.caller}`
        : jf.filePath;

      if (access.queryType === 'id') {
        const target = elemById.get(access.query);
        if (target) {
          edges.push({
            source: sourceId,
            target: `${target.filePath}::elem#${access.query}`,
            type: 'dom-access',
            sourceType: access.caller ? 'js-function' : 'file',
            targetType: 'html-element',
            references: [{ file: jf.filePath, line: access.line }],
            detail: { method: access.method, query: access.query },
          });
        }
      } else if (access.queryType === 'class') {
        const targets = elemByClass.get(access.query) || [];
        for (const target of targets) {
          edges.push({
            source: sourceId,
            target: `${target.filePath}::elem.${access.query}`,
            type: 'dom-access',
            sourceType: access.caller ? 'js-function' : 'file',
            targetType: 'html-element',
            references: [{ file: jf.filePath, line: access.line }],
            detail: { method: access.method, query: access.query },
          });
          break; //클래스당 하나의 엣지만 생성
        }
      } else if (access.queryType === 'tag') {
        const targets = elemByTag.get(access.query) || [];
        if (targets.length > 0) {
          edges.push({
            source: sourceId,
            target: `${targets[0].filePath}::elem<${access.query}>`,
            type: 'dom-access',
            sourceType: access.caller ? 'js-function' : 'file',
            targetType: 'html-element',
            references: [{ file: jf.filePath, line: access.line }],
            detail: { method: access.method, query: access.query },
          });
        }
      } else if (access.queryType === 'selector') {
        //querySelector — 셀렉터에서 id/class 추출하여 매칭
        const idMatch = access.query.match(/#([\w-]+)/);
        const classMatch = access.query.match(/\.([\w-]+)/);
        if (idMatch) {
          const target = elemById.get(idMatch[1]);
          if (target) {
            edges.push({
              source: sourceId,
              target: `${target.filePath}::elem#${idMatch[1]}`,
              type: 'dom-access',
              sourceType: access.caller ? 'js-function' : 'file',
              targetType: 'html-element',
              references: [{ file: jf.filePath, line: access.line }],
              detail: { method: access.method, query: access.query },
            });
          }
        } else if (classMatch) {
          const targets = elemByClass.get(classMatch[1]) || [];
          if (targets.length > 0) {
            edges.push({
              source: sourceId,
              target: `${targets[0].filePath}::elem.${classMatch[1]}`,
              type: 'dom-access',
              sourceType: access.caller ? 'js-function' : 'file',
              targetType: 'html-element',
              references: [{ file: jf.filePath, line: access.line }],
              detail: { method: access.method, query: access.query },
            });
          }
        }
      } else if (access.queryType === 'style') {
        //style 수정은 CSS와 연결
        edges.push({
          source: sourceId,
          target: `${jf.filePath}::style-modify`,
          type: 'style-modify',
          sourceType: access.caller ? 'js-function' : 'file',
          targetType: 'css-property',
          references: [{ file: jf.filePath, line: access.line }],
        });
      }
    }
  }

  //3. CSS 셀렉터 → HTML 요소 매칭
  for (const cf of cssFiles) {
    for (const sel of (cf.parsed.selectors || [])) {
      //ID 셀렉터 매칭
      for (const id of sel.ids) {
        const target = elemById.get(id);
        if (target) {
          edges.push({
            source: `${cf.filePath}::${sel.raw}`,
            target: `${target.filePath}::elem#${id}`,
            type: 'css-target',
            sourceType: 'css-selector',
            targetType: 'html-element',
            references: [{ file: cf.filePath, line: sel.line }],
          });
        }
      }
      //클래스 셀렉터 매칭
      for (const cls of sel.classes) {
        const targets = elemByClass.get(cls) || [];
        if (targets.length > 0) {
          edges.push({
            source: `${cf.filePath}::${sel.raw}`,
            target: `${targets[0].filePath}::elem.${cls}`,
            type: 'css-target',
            sourceType: 'css-selector',
            targetType: 'html-element',
            references: [{ file: cf.filePath, line: sel.line }],
          });
        }
      }
      //태그 셀렉터 매칭
      for (const tag of sel.tags) {
        const targets = elemByTag.get(tag) || [];
        if (targets.length > 0) {
          edges.push({
            source: `${cf.filePath}::${sel.raw}`,
            target: `${targets[0].filePath}::elem<${tag}>`,
            type: 'css-target',
            sourceType: 'css-selector',
            targetType: 'html-element',
            references: [{ file: cf.filePath, line: sel.line }],
          });
        }
      }
    }
  }

  //4. 이벤트 바인딩 → JS 함수 매칭
  //HTML 인라인 이벤트
  for (const hf of htmlFiles) {
    for (const evt of (hf.parsed.eventBindings || [])) {
      //인라인 핸들러에서 함수명 추출 (onclick="handleClick()" → handleClick)
      const funcMatch = evt.handler.match(/(\w+)\s*\(/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const targetFuncs = jsFuncByName.get(funcName);
        if (targetFuncs && targetFuncs.length > 0) {
          const target = targetFuncs[0];
          const elemId = evt.elementId
            ? `${hf.filePath}::elem#${evt.elementId}`
            : `${hf.filePath}::elem<${evt.elementTag}>`;
          edges.push({
            source: elemId,
            target: `${target.filePath}::${target.func.qualifiedName}`,
            type: 'event-binding',
            sourceType: 'html-element',
            targetType: 'js-function',
            references: [{ file: hf.filePath, line: evt.line }],
            detail: { eventType: evt.eventType },
          });
        }
      }
    }
  }

  //JS addEventListener
  for (const jf of jsFiles) {
    for (const evt of (jf.parsed.eventBindings || [])) {
      if (evt.handler) {
        const targetFuncs = jsFuncByName.get(evt.handler);
        if (targetFuncs && targetFuncs.length > 0) {
          const target = targetFuncs[0];
          const sourceId = evt.caller
            ? `${jf.filePath}::${evt.caller}`
            : jf.filePath;
          edges.push({
            source: sourceId,
            target: `${target.filePath}::${target.func.qualifiedName}`,
            type: 'event-binding',
            sourceType: evt.caller ? 'js-function' : 'file',
            targetType: 'js-function',
            references: [{ file: jf.filePath, line: evt.line }],
            detail: { eventType: evt.eventType },
          });
        }
      }
    }
  }

  //5. CSS @import 관계
  for (const cf of cssFiles) {
    for (const imp of (cf.parsed.imports || [])) {
      if (imp.type === 'css-import') {
        const targetPath = resolveHref(imp.href, cf.filePath, parsedFiles);
        if (targetPath) {
          edges.push({
            source: cf.filePath,
            target: targetPath,
            type: 'css-import',
            sourceType: 'file',
            targetType: 'file',
            references: [{ file: cf.filePath, line: imp.line }],
          });
        }
      }
    }
  }

  //6. JS import/require 관계
  for (const jf of jsFiles) {
    for (const imp of (jf.parsed.imports || [])) {
      const targetPath = resolveJsImport(imp.module, jf.filePath, parsedFiles);
      if (targetPath && targetPath !== jf.filePath) {
        edges.push({
          source: jf.filePath,
          target: targetPath,
          type: 'js-import',
          sourceType: 'file',
          targetType: 'file',
          references: [{ file: jf.filePath, line: imp.line }],
        });
      }
    }
  }

  //7. CSS 변수 참조 관계
  for (const cf of cssFiles) {
    for (const ref of (cf.parsed.variableRefs || [])) {
      if (ref.type === 'css-var-ref') {
        const varDef = cssVarDefs.get(ref.variable);
        if (varDef) {
          edges.push({
            source: cf.filePath,
            target: `${varDef.filePath}::${ref.variable}`,
            type: 'css-var',
            sourceType: 'file',
            targetType: 'css-variable',
            references: [{ file: cf.filePath, line: ref.line }],
          });
        }
      }
    }
  }

  //중복 엣지 제거
  return deduplicateEdges(edges);
}

//href를 실제 파일 경로로 해석한다.
function resolveHref(href, fromFile, parsedFiles) {
  if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
    return null;
  }

  //상대 경로 해석
  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  const resolved = href.startsWith('/')
    ? href.substring(1)
    : (fromDir ? fromDir + '/' + href : href);

  //정규화
  const normalized = path.normalize(resolved).replace(/\\/g, '/');

  //파싱된 파일 목록에서 매칭
  for (const pf of parsedFiles) {
    if (pf.filePath === normalized || pf.filePath.endsWith('/' + normalized) || pf.filePath === href) {
      return pf.filePath;
    }
  }

  //파일명만으로 매칭
  const basename = href.split('/').pop();
  for (const pf of parsedFiles) {
    if (pf.filePath.endsWith('/' + basename) || pf.filePath === basename) {
      return pf.filePath;
    }
  }

  return null;
}

//JS import 경로를 파싱된 파일 경로로 해석한다.
function resolveJsImport(modulePath, fromFile, parsedFiles) {
  if (!modulePath.startsWith('.') && !modulePath.startsWith('/')) {
    return null; //npm 패키지는 무시
  }

  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  let resolved = modulePath.startsWith('/')
    ? modulePath.substring(1)
    : (fromDir ? fromDir + '/' + modulePath : modulePath);

  resolved = path.normalize(resolved).replace(/\\/g, '/');

  //확장자 추가하여 매칭
  const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js'];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    for (const pf of parsedFiles) {
      if (pf.filePath === candidate || pf.filePath.endsWith('/' + candidate)) {
        return pf.filePath;
      }
    }
  }

  return null;
}

function deduplicateEdges(edges) {
  const seen = new Map();
  for (const edge of edges) {
    const key = `${edge.source}→${edge.target}→${edge.type}`;
    if (!seen.has(key)) {
      seen.set(key, edge);
    } else {
      //참조 정보 병합
      const existing = seen.get(key);
      existing.references.push(...edge.references);
    }
  }
  return Array.from(seen.values());
}

//JS 함수 호출 관계를 해석한다 (Python resolver와 유사한 로직).
function resolveJsCalls(allFunctions, allCalls, allImports) {
  const funcByName = new Map();
  const funcByFile = new Map();

  for (const func of allFunctions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    const entry = { ...func, nodeId };

    if (!funcByName.has(func.name)) funcByName.set(func.name, []);
    funcByName.get(func.name).push(entry);

    if (func.qualifiedName !== func.name) {
      if (!funcByName.has(func.qualifiedName)) funcByName.set(func.qualifiedName, []);
      funcByName.get(func.qualifiedName).push(entry);
    }

    if (!funcByFile.has(func.filePath)) funcByFile.set(func.filePath, []);
    funcByFile.get(func.filePath).push(entry);
  }

  const edgeMap = new Map();

  for (const call of allCalls) {
    const callerNodeId = `${call.filePath}::${call.caller}`;
    const parts = call.callee.split('.');
    const simpleCallee = parts[parts.length - 1];

    //1. 같은 파일
    const fileFuncs = funcByFile.get(call.filePath) || [];
    let target = fileFuncs.find(f =>
      f.qualifiedName === call.callee || f.name === call.callee || f.name === simpleCallee
    );

    //2. 전역 탐색
    if (!target) {
      const globals = funcByName.get(simpleCallee) || funcByName.get(call.callee) || [];
      if (globals.length > 0) {
        target = globals.find(f => f.filePath !== call.filePath) || globals[0];
      }
    }

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

module.exports = { resolveWebRelations, resolveJsCalls };
