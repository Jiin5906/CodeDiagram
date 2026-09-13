//그래프 데이터 생성 코드
//parser과 resolver을 조합하여 최종 그래프 JSON을 만듦. 실행 순서는 다음과 같다.
/*
    1. gitService로 모든 지원 파일을 찾음 (.py, .html, .css, .js)
    2. 각 파일을 청크 단위로 파싱하여 함수, 호출, import, 클래스 정보를 수집
    3. Python 파일은 resolver로, 웹 파일은 webResolver로 호출/상속/변수 관계를 엣지로 변환
    4. metricsService로 결합도 계산
    5. diagnosticsService로 진단 실행
    6. refactoringService로 리팩토링 제안 생성
    7. buildNodes로 Cytoscape.js 호환 노드 목록 생성
*/

const fs = require('fs');
const { parseFile } = require('./parser');
const { resolveCalls, resolveInheritance, resolveVariableRefs } = require('./resolver');
const { resolveWebRelations, resolveJsCalls } = require('./webResolver');
const { findPythonFiles, findFiles } = require('./gitService');
const { computeFileCoupling, normalizeCoupling } = require('./metricsService');
const { runDiagnostics } = require('./diagnosticsService');
const { generateSuggestions } = require('./refactoringService');

//청크 단위 파싱 크기
const CHUNK_SIZE = 20;

//이벤트 루프 양보 유틸리티
function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}

//프로젝트 디렉토리에서 그래프를 만드는 비동기 함수다.
async function buildGraph(projectPath) {
  const { files, warnings } = findFiles(projectPath);

  if (files.length === 0) {
    throw new Error('지원하는 파일을 찾을 수 없습니다 (.py, .html, .css, .js, .cpp, .h, .cs)');
  }

  //파일을 언어별로 분류
  //tier 기반 처리 언어: Python, C++, C#
  const TIERED_LANGUAGES = new Set(['python', 'cpp', 'csharp']);
  const pythonFiles = files.filter(f => TIERED_LANGUAGES.has(f.language));
  const webFiles = files.filter(f => !TIERED_LANGUAGES.has(f.language));

  //Python 전용 데이터
  const pyFunctions = [];
  const pyCalls = [];
  const pyImports = [];
  const pyClasses = [];
  const pyVariables = [];
  const pyVariableRefs = [];

  //웹 전용 데이터
  const webParsedFiles = [];

  //JS 전용 데이터 (JS 함수 호출 해석용)
  const jsFunctions = [];
  const jsCalls = [];

  /* ── 청크 단위 파싱 ── */
  const allFiles = [...pythonFiles, ...webFiles];
  for (let i = 0; i < allFiles.length; i += CHUNK_SIZE) {
    const chunk = allFiles.slice(i, i + CHUNK_SIZE);

    for (const file of chunk) {
      let code;
      try {
        code = fs.readFileSync(file.path, 'utf-8');
      } catch (err) {
        warnings.push(`Failed to read ${file.relativePath}: ${err.message}`);
        continue;
      }

      let result;
      try {
        result = parseFile(code, file.relativePath, file.language);
      } catch (err) {
        warnings.push(`Failed to parse ${file.relativePath}: ${err.message}`);
        continue;
      }

      if (!result) continue;

      if (TIERED_LANGUAGES.has(file.language)) {
        pyFunctions.push(...result.functions);
        pyCalls.push(...result.calls);
        pyImports.push({
          filePath: file.relativePath,
          imports: result.imports,
        });
        if (result.classes) pyClasses.push(...result.classes);
        if (result.variables) pyVariables.push(...result.variables);
        if (result.variableRefs) pyVariableRefs.push(...result.variableRefs);
      } else {
        webParsedFiles.push({
          filePath: file.relativePath,
          language: file.language,
          parsed: result,
        });

        //JS 함수/호출 데이터 별도 수집
        if (file.language === 'javascript') {
          jsFunctions.push(...result.functions);
          jsCalls.push(...result.calls);
        }
      }
    }

    if (i + CHUNK_SIZE < allFiles.length) {
      await yieldToEventLoop();
    }
  }

  //인라인 스크립트/스타일 처리
  for (const pf of webParsedFiles) {
    if (pf.language === 'html') {
      //인라인 스크립트를 JS 파서로 파싱
      if (pf.parsed.inlineScripts) {
        for (const inline of pf.parsed.inlineScripts) {
          try {
            const inlineResult = parseFile(inline.code, pf.filePath, 'javascript');
            if (inlineResult) {
              jsFunctions.push(...inlineResult.functions);
              jsCalls.push(...inlineResult.calls);
              //인라인 결과를 HTML 파일의 웹 데이터에 병합
              pf.parsed.domAccesses = [...(pf.parsed.domAccesses || []), ...(inlineResult.domAccesses || [])];
              pf.parsed.eventBindings = [...(pf.parsed.eventBindings || []), ...(inlineResult.eventBindings || [])];
            }
          } catch {
            //인라인 파싱 실패는 무시
          }
        }
      }

      //인라인 스타일을 CSS 파서로 파싱
      if (pf.parsed.inlineStyles) {
        for (const inline of pf.parsed.inlineStyles) {
          try {
            const inlineResult = parseFile(inline.code, pf.filePath, 'css');
            if (inlineResult) {
              pf.parsed.selectors = [...(pf.parsed.selectors || []), ...(inlineResult.selectors || [])];
              pf.parsed.variables = [...(pf.parsed.variables || []), ...(inlineResult.variables || [])];
              pf.parsed.variableRefs = [...(pf.parsed.variableRefs || []), ...(inlineResult.variableRefs || [])];
            }
          } catch {
            //인라인 파싱 실패는 무시
          }
        }
      }
    }
  }

  /* ── Python 해석 ── */
  let pyCallEdges = [];
  let pyInheritanceEdges = [];
  let pyVariableEdges = [];
  if (pythonFiles.length > 0) {
    pyCallEdges = resolveCalls(pyFunctions, pyCalls, pyImports);
    pyInheritanceEdges = resolveInheritance(pyClasses);
    pyVariableEdges = resolveVariableRefs(pyVariables, pyVariableRefs, pyImports);
  }

  /* ── 웹 해석 ── */
  let webEdges = [];
  let jsCallEdges = [];
  if (webFiles.length > 0) {
    webEdges = resolveWebRelations(webParsedFiles, projectPath);
    if (jsFunctions.length > 0) {
      jsCallEdges = resolveJsCalls(jsFunctions, jsCalls, []);
    }
  }

  //모든 엣지 합치기
  const allCallEdges = [...pyCallEdges, ...jsCallEdges];
  const allInheritanceEdges = [...pyInheritanceEdges];
  const allVariableEdges = [...pyVariableEdges];

  //결합도 계산
  const { fileCounts } = computeFileCoupling(allCallEdges);
  const couplingScores = normalizeCoupling(fileCounts);

  //전체 함수 목록 (Python + JS)
  const allFunctions = [...pyFunctions, ...jsFunctions];
  const allClasses = [...pyClasses];

  //JS 클래스도 추가
  for (const pf of webParsedFiles) {
    if (pf.language === 'javascript' && pf.parsed.classes) {
      allClasses.push(...pf.parsed.classes);
    }
  }

  //진단 실행
  const diagnostics = runDiagnostics(allCallEdges, allFunctions, allClasses, webParsedFiles);

  //리팩토링 제안 생성
  const suggestions = generateSuggestions(diagnostics);

  //참조 횟수 계산
  const inboundCountMap = {};
  for (const edge of allCallEdges) {
    const targetId = edge.target;
    if (!inboundCountMap[targetId]) inboundCountMap[targetId] = 0;
    inboundCountMap[targetId] += edge.references.length;
  }

  //3단계 노드 생성 (Python 전용 — tier 시스템)
  const { nodes, tiers } = buildTieredNodes(pyFunctions, pythonFiles, inboundCountMap, couplingScores, pyVariables);

  //웹 전용 노드 추가 (언어별 컨테이너: HTML, CSS, JS)
  const { nodes: webNodes, langs } = buildWebNodes(webParsedFiles, webEdges, jsFunctions, inboundCountMap, couplingScores);
  nodes.push(...webNodes);

  //패키지 노드 생성
  const packageNodes = buildPackageNodes(files);

  //순환 경로에 포함되는 엣지 ID 목록 생성
  const cycleEdgeIds = buildCycleEdgeIds(diagnostics.cycles.functions, allCallEdges);

  return {
    nodes,
    edges: allCallEdges,
    inheritanceEdges: allInheritanceEdges,
    variableEdges: allVariableEdges,
    webEdges,
    packageNodes,
    tiers,
    langs,
    warnings,
    couplingScores,
    diagnostics,
    suggestions,
    cycleEdgeIds,
    fileCounts: {
      python: files.filter(f => f.language === 'python').length,
      html: files.filter(f => f.language === 'html').length,
      css: files.filter(f => f.language === 'css').length,
      javascript: files.filter(f => f.language === 'javascript').length,
      cpp: files.filter(f => f.language === 'cpp').length,
      csharp: files.filter(f => f.language === 'csharp').length,
    },
  };
}

//3단계 Cytoscape 호환 노드 목록 생성 함수다.
//tier 노드 → file 노드 → function 노드의 3단계 중첩 구조를 만든다.
//같은 파일이라도 함수의 참조 횟수가 다르면 별도 파일 노드로 분할된다.
function buildTieredNodes(functions, files, inboundCountMap, couplingScores, allVariables) {
  const nodes = [];

  //각 함수의 참조 횟수 결정
  const funcTierMap = {};
  for (const func of functions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    const count = inboundCountMap[nodeId] || 0;
    funcTierMap[nodeId] = count;
  }

  //고유 티어 값 수집 (내림차순 정렬)
  const tierSet = new Set(Object.values(funcTierMap));
  //함수가 없는 파일도 0회 참조 그룹에 포함
  tierSet.add(0);
  const tiers = Array.from(tierSet).sort((a, b) => b - a);

  //티어 노드 생성
  for (const tierValue of tiers) {
    nodes.push({
      data: {
        id: `tier__${tierValue}`,
        type: 'tier',
        tierValue: tierValue,
        label: `${tierValue}회 참조`,
      },
    });
  }

  //티어별·파일별 함수 그룹핑
  //key: "tierValue::filePath", value: [func, ...]
  const tierFileGroups = {};
  for (const func of functions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    const tierValue = funcTierMap[nodeId];
    const groupKey = `${tierValue}::${func.filePath}`;
    if (!tierFileGroups[groupKey]) {
      tierFileGroups[groupKey] = [];
    }
    tierFileGroups[groupKey].push(func);
  }

  //함수가 없는 파일은 0회 참조 그룹에 빈 파일 노드로 추가
  const filesWithFunctions = new Set(functions.map(f => f.filePath));
  for (const file of files) {
    if (!filesWithFunctions.has(file.relativePath)) {
      const groupKey = `0::${file.relativePath}`;
      if (!tierFileGroups[groupKey]) {
        tierFileGroups[groupKey] = [];
      }
    }
  }

  //파일 언어 정보 인덱스
  const fileLangMap = {};
  for (const file of files) {
    fileLangMap[file.relativePath] = file.language;
  }

  //분할 파일 노드 + 함수 노드 생성
  const createdFileNodes = new Set();
  for (const [groupKey, funcs] of Object.entries(tierFileGroups)) {
    const sepIdx = groupKey.indexOf('::');
    const tierValueStr = groupKey.substring(0, sepIdx);
    const filePath = groupKey.substring(sepIdx + 2);
    const tierValue = parseInt(tierValueStr, 10);
    const fileNodeId = `${filePath}__tier${tierValue}`;

    if (!createdFileNodes.has(fileNodeId)) {
      createdFileNodes.add(fileNodeId);
      nodes.push({
        data: {
          id: fileNodeId,
          label: filePath.split('/').pop(),
          type: 'file',
          fullPath: filePath,
          parent: `tier__${tierValue}`,
          couplingScore: couplingScores[filePath] || 0,
          language: fileLangMap[filePath] || 'python',
        },
      });
    }

    for (const func of funcs) {
      const nodeId = `${func.filePath}::${func.qualifiedName}`;
      //JS 함수인지 Python 함수인지 구분
      const lang = fileLangMap[func.filePath] || 'python';
      const nodeType = lang === 'javascript' ? 'js-function' : 'function';

      nodes.push({
        data: {
          id: nodeId,
          label: func.qualifiedName,
          type: nodeType,
          parent: fileNodeId,
          filePath: func.filePath,
          name: func.name,
          qualifiedName: func.qualifiedName,
          className: func.className,
          startLine: func.startLine,
          endLine: func.endLine,
          code: func.code,
          docstring: func.docstring,
          comment: func.comment,
          inboundRefCount: tierValue,
          language: lang,
        },
      });
    }
  }

  //변수 노드를 파일 노드 자식으로 추가
  if (allVariables && allVariables.length > 0) {
    const addedVarIds = new Set();
    for (const v of allVariables) {
      const varNodeId = `${v.filePath}::${v.name}`;
      if (addedVarIds.has(varNodeId)) continue;
      addedVarIds.add(varNodeId);

      const fileNodeId = `${v.filePath}__tier0`;
      const hasFileNode = createdFileNodes.has(fileNodeId);

      if (!hasFileNode) {
        createdFileNodes.add(fileNodeId);
        nodes.push({
          data: {
            id: fileNodeId,
            label: v.filePath.split('/').pop(),
            type: 'file',
            fullPath: v.filePath,
            parent: 'tier__0',
            couplingScore: couplingScores[v.filePath] || 0,
            language: fileLangMap[v.filePath] || 'python',
          },
        });
      }

      //CSS 변수인지 일반 변수인지 구분
      const varType = v.type === 'css-variable' ? 'css-variable' : 'variable';

      nodes.push({
        data: {
          id: varNodeId,
          label: v.name,
          type: varType,
          parent: fileNodeId,
          filePath: v.filePath,
          name: v.name,
          className: v.className,
          line: v.line,
        },
      });
    }
  }

  //자식이 없는 티어 노드 제거
  const tiersWithChildren = new Set();
  for (const node of nodes) {
    if (node.data.type === 'file' && node.data.parent) {
      tiersWithChildren.add(node.data.parent);
    }
  }
  const filteredNodes = nodes.filter(n => {
    if (n.data.type === 'tier') {
      return tiersWithChildren.has(n.data.id);
    }
    return true;
  });
  const activeTiers = tiers.filter(t => tiersWithChildren.has(`tier__${t}`));

  return { nodes: filteredNodes, tiers: activeTiers };
}

//웹 전용 노드를 생성한다 (HTML 요소, CSS 셀렉터, JS 함수).
//언어별 컨테이너(lang) → 참조 횟수(tier) → 파일(file) → 리프 노드의 4단계 중첩 구조를 만든다.
function buildWebNodes(webParsedFiles, webEdges, jsFunctions, inboundCountMap, couplingScores) {
  const nodes = [];
  const langs = [];
  const createdLangs = new Set();
  const createdSubTiers = new Set();
  const createdFileNodes = new Set();

  //엣지에서 참조되는 노드 ID 수집 (HTML/CSS 필터링용)
  const neededIds = new Set();
  for (const edge of webEdges) {
    neededIds.add(edge.source);
    neededIds.add(edge.target);
  }

  //웹 노드별 참조 횟수 계산 (소스 또는 타겟으로 등장하는 엣지 수)
  const webRefCount = {};
  for (const edge of webEdges) {
    const cnt = edge.references ? edge.references.length : 1;
    if (edge.source) webRefCount[edge.source] = (webRefCount[edge.source] || 0) + cnt;
    if (edge.target) webRefCount[edge.target] = (webRefCount[edge.target] || 0) + cnt;
  }

  //언어 컨테이너 → 참조 횟수 티어 → 파일 노드를 필요시 생성하는 헬퍼
  const labelMap = { html: 'HTML', css: 'CSS', javascript: 'JavaScript' };

  function ensureLangTierAndFile(language, filePath, tierValue) {
    //1단계: 언어 컨테이너
    const langId = `lang__${language}`;
    if (!createdLangs.has(language)) {
      createdLangs.add(language);
      langs.push(language);
      nodes.push({
        data: {
          id: langId,
          type: 'lang',
          language: language,
          label: labelMap[language] || language,
        },
      });
    }

    //2단계: 참조 횟수 서브 티어 (언어 컨테이너 안)
    const subTierId = `tier__${language}__${tierValue}`;
    if (!createdSubTiers.has(subTierId)) {
      createdSubTiers.add(subTierId);
      nodes.push({
        data: {
          id: subTierId,
          type: 'tier',
          tierValue: tierValue,
          label: `${tierValue}회 참조`,
          parent: langId,
        },
      });
    }

    //3단계: 파일 노드 (서브 티어 안)
    const fileNodeId = `${filePath}__${language}_tier${tierValue}`;
    if (!createdFileNodes.has(fileNodeId)) {
      createdFileNodes.add(fileNodeId);
      nodes.push({
        data: {
          id: fileNodeId,
          label: filePath.split('/').pop(),
          type: 'file',
          fullPath: filePath,
          parent: subTierId,
          couplingScore: couplingScores[filePath] || 0,
          language: language,
        },
      });
    }
    return fileNodeId;
  }

  //HTML 요소 노드 생성
  const addedIds = new Set();
  for (const pf of webParsedFiles) {
    if (pf.language === 'html') {
      for (const elem of (pf.parsed.elements || [])) {
        //ID 기반 노드
        if (elem.id) {
          const nodeId = `${pf.filePath}::elem#${elem.id}`;
          if (neededIds.has(nodeId) && !addedIds.has(nodeId)) {
            addedIds.add(nodeId);
            const tierValue = webRefCount[nodeId] || 0;
            const fileNodeId = ensureLangTierAndFile('html', pf.filePath, tierValue);
            nodes.push({
              data: {
                id: nodeId,
                label: `#${elem.id}`,
                type: 'html-element',
                filePath: pf.filePath,
                parent: fileNodeId,
                tag: elem.tag,
                elementId: elem.id,
                line: elem.line,
                refCount: tierValue,
              },
            });
          }
        }
        //클래스 기반 노드
        for (const cls of elem.classes) {
          const nodeId = `${pf.filePath}::elem.${cls}`;
          if (neededIds.has(nodeId) && !addedIds.has(nodeId)) {
            addedIds.add(nodeId);
            const tierValue = webRefCount[nodeId] || 0;
            const fileNodeId = ensureLangTierAndFile('html', pf.filePath, tierValue);
            nodes.push({
              data: {
                id: nodeId,
                label: `.${cls}`,
                type: 'html-element',
                filePath: pf.filePath,
                parent: fileNodeId,
                tag: elem.tag,
                elementClass: cls,
                line: elem.line,
                refCount: tierValue,
              },
            });
          }
        }
        //태그 기반 노드
        const tagNodeId = `${pf.filePath}::elem<${elem.tag}>`;
        if (neededIds.has(tagNodeId) && !addedIds.has(tagNodeId)) {
          addedIds.add(tagNodeId);
          const tierValue = webRefCount[tagNodeId] || 0;
          const fileNodeId = ensureLangTierAndFile('html', pf.filePath, tierValue);
          nodes.push({
            data: {
              id: tagNodeId,
              label: `<${elem.tag}>`,
              type: 'html-element',
              filePath: pf.filePath,
              parent: fileNodeId,
              tag: elem.tag,
              line: elem.line,
              refCount: tierValue,
            },
          });
        }
      }
    }
  }

  //CSS 셀렉터 노드 생성
  for (const pf of webParsedFiles) {
    if (pf.language === 'css') {
      for (const sel of (pf.parsed.selectors || [])) {
        const nodeId = `${pf.filePath}::${sel.raw}`;
        if (neededIds.has(nodeId) && !addedIds.has(nodeId)) {
          addedIds.add(nodeId);
          const tierValue = webRefCount[nodeId] || 0;
          const fileNodeId = ensureLangTierAndFile('css', pf.filePath, tierValue);
          nodes.push({
            data: {
              id: nodeId,
              label: sel.raw,
              type: 'css-selector',
              filePath: pf.filePath,
              parent: fileNodeId,
              line: sel.line,
              refCount: tierValue,
            },
          });
        }
      }

      //CSS 변수 노드 생성
      for (const v of (pf.parsed.variables || [])) {
        if (v.type === 'css-variable') {
          const varNodeId = `${v.filePath}::${v.name}`;
          if (!addedIds.has(varNodeId)) {
            addedIds.add(varNodeId);
            const tierValue = webRefCount[varNodeId] || 0;
            const fileNodeId = ensureLangTierAndFile('css', v.filePath, tierValue);
            nodes.push({
              data: {
                id: varNodeId,
                label: v.name,
                type: 'css-variable',
                parent: fileNodeId,
                filePath: v.filePath,
                name: v.name,
                line: v.line,
                refCount: tierValue,
              },
            });
          }
        }
      }
    }
  }

  //JS 함수 노드 생성
  for (const func of jsFunctions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    const tierValue = inboundCountMap[nodeId] || 0;
    const fileNodeId = ensureLangTierAndFile('javascript', func.filePath, tierValue);
    nodes.push({
      data: {
        id: nodeId,
        label: func.qualifiedName,
        type: 'js-function',
        parent: fileNodeId,
        filePath: func.filePath,
        name: func.name,
        qualifiedName: func.qualifiedName,
        className: func.className,
        startLine: func.startLine,
        endLine: func.endLine,
        code: func.code,
        docstring: func.docstring,
        comment: func.comment,
        inboundRefCount: tierValue,
        language: 'javascript',
      },
    });
  }

  return { nodes, langs };
}

//디렉토리 경로 기반 패키지 노드를 생성한다.
function buildPackageNodes(files) {
  const packages = new Map(); //디렉토리 경로 → 파일 목록

  for (const file of files) {
    const dir = file.relativePath.split('/').slice(0, -1).join('/') || '.';
    if (!packages.has(dir)) packages.set(dir, []);
    packages.get(dir).push(file.relativePath);
  }

  const nodes = [];
  for (const [dir, filePaths] of packages) {
    nodes.push({
      data: {
        id: `pkg__${dir}`,
        label: dir === '.' ? '(루트)' : dir,
        type: 'package',
        filePaths,
      },
    });
  }
  return nodes;
}

//순환 경로에 포함된 엣지 ID 목록을 생성한다.
function buildCycleEdgeIds(funcCycles, edges) {
  const cycleEdgeIds = new Set();
  for (const cycle of funcCycles) {
    for (let i = 0; i < cycle.length - 1; i++) {
      const source = cycle[i];
      const target = cycle[i + 1];
      const edgeId = `${source}->${target}`;
      const exists = edges.some(e => e.source === source && e.target === target);
      if (exists) cycleEdgeIds.add(edgeId);
    }
  }
  return Array.from(cycleEdgeIds);
}

module.exports = { buildGraph };
