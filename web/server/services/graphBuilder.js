//그래프 데이터 생성 코드
//parser와 resolver를 조합하여 최종 그래프 JSON을 만든다.
//지원 언어: Python, C++, C#, TypeScript, Java, JavaScript, HTML, CSS
/*
    1. gitService로 모든 지원 파일을 찾음
    2. 각 파일을 청크 단위로 파싱하여 함수, 호출, import, 클래스 정보를 수집
    3. 티어 기반 언어(Python/C++/C#/TS/Java)는 resolver로,
       웹 언어(HTML/CSS/JS)는 webResolver로 관계를 엣지로 변환
    4. metricsService로 파일 결합도 지표(Ca·Ce·I·CBO) 계산 (CR-RFC-2026-002)
    5. diagnosticsService로 진단 실행
    6. refactoringService로 리팩토링 제안 생성
    7. buildNodes로 Cytoscape.js 호환 노드 목록 생성
*/

const fs = require('fs');
const { parseFile } = require('./parser');
const { resolveCalls, resolveInheritance, resolveVariableRefs } = require('./resolver');
const { resolveWebRelations, resolveJsCalls } = require('./webResolver');
const { findFiles } = require('./gitService');
const { computeFileMetrics } = require('./metricsService');
const { runDiagnostics } = require('./diagnosticsService');
const { generateSuggestions } = require('./refactoringService');

//청크 단위 파싱 크기
const CHUNK_SIZE = 20;

//이벤트 루프 양보 유틸리티
function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

//티어 기반 언어: Python, C++, C#, TypeScript, Java (resolver.js로 해석)
//웹 언어: HTML, CSS, JavaScript (webResolver.js로 해석)
const TIERED_LANGUAGES = new Set(['python', 'cpp', 'csharp', 'typescript', 'java']);

//파일 노드 ID 규칙: 티어 언어는 경로 그대로, 웹 언어는 경로에 언어 접미사를 붙인다.
//HTML 인라인 스크립트처럼 한 경로에 언어별 파일 노드가 여럿 생길 수 있어서다.
function fileNodeIdOf(file) {
  return TIERED_LANGUAGES.has(file.language)
    ? file.relativePath
    : `${file.relativePath}__${file.language}`;
}

//파일 노드와 진단 항목에 공통으로 싣는 결합도 데이터 (응답 스키마: metrics, refactor_target)
function fileCouplingData(metricsByFile, filePath) {
  const metrics = metricsByFile[filePath];
  return { metrics, refactor_target: metrics.status === 'HAZARD' };
}

//프로젝트 디렉토리에서 그래프를 만드는 비동기 함수다.
//options.signal이 abort되면(브라우저가 연결을 끊음) 다음 청크 경계에서 AbortError를 던지고 멈춘다.
async function buildGraph(projectPath, options = {}) {
  const { signal } = options;
  const { files, warnings } = findFiles(projectPath);

  if (files.length === 0) {
    throw new Error(
      '지원하는 파일을 찾을 수 없습니다 (.py, .html, .css, .js, .ts, .tsx, .cpp, .h, .cs, .java)',
    );
  }

  //파일을 언어별로 분류
  const tieredFiles = files.filter((f) => TIERED_LANGUAGES.has(f.language));
  const webFiles = files.filter((f) => !TIERED_LANGUAGES.has(f.language));

  //티어 기반 언어 데이터 (Python, C++, C#, TypeScript, Java)
  const tieredFunctions = [];
  const tieredCalls = [];
  const tieredImports = [];
  const tieredClasses = [];
  const tieredVariables = [];
  const tieredVariableRefs = [];

  //웹 전용 데이터
  const webParsedFiles = [];

  //JS 전용 데이터 (JS 함수 호출·상속·변수 해석용)
  const jsFunctions = [];
  const jsCalls = [];
  const jsImports = [];
  const jsClasses = [];
  const jsVariables = [];
  const jsVariableRefs = [];

  /* ── 청크 단위 파싱 ── */
  const allFiles = [...tieredFiles, ...webFiles];
  for (let i = 0; i < allFiles.length; i += CHUNK_SIZE) {
    const chunk = allFiles.slice(i, i + CHUNK_SIZE);

    for (const file of chunk) {
      let code;
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- findFiles가 순회해 찾은 파일 경로
        code = fs.readFileSync(file.path, 'utf-8');
      } catch (err) {
        //err.message에는 절대경로가 들어 있어 응답에 싣지 않고 에러 코드(ENOENT, EACCES 등)만 남긴다
        warnings.push(`Failed to read ${file.relativePath}: ${err.code || 'read error'}`);
        continue;
      }

      let result;
      try {
        result = parseFile(code, file.relativePath, file.language);
      } catch (err) {
        //파서 에러 상세는 서버 로그에만 남긴다
        console.warn(`[parse] ${file.relativePath}:`, err);
        warnings.push(`Failed to parse ${file.relativePath}`);
        continue;
      }

      if (!result) continue;

      if (TIERED_LANGUAGES.has(file.language)) {
        tieredFunctions.push(...result.functions);
        tieredCalls.push(...result.calls);
        tieredImports.push({
          filePath: file.relativePath,
          imports: result.imports,
        });
        if (result.classes) tieredClasses.push(...result.classes);
        if (result.variables) tieredVariables.push(...result.variables);
        if (result.variableRefs) tieredVariableRefs.push(...result.variableRefs);
      } else {
        webParsedFiles.push({
          filePath: file.relativePath,
          language: file.language,
          parsed: result,
        });

        //JS 함수/호출/상속/변수 데이터 별도 수집
        if (file.language === 'javascript') {
          jsFunctions.push(...result.functions);
          jsCalls.push(...result.calls);
          jsImports.push({
            filePath: file.relativePath,
            imports: result.imports,
          });
          if (result.classes) jsClasses.push(...result.classes);
          if (result.variables) jsVariables.push(...result.variables);
          if (result.variableRefs) jsVariableRefs.push(...result.variableRefs);
        }
      }
    }

    if (i + CHUNK_SIZE < allFiles.length) {
      await yieldToEventLoop();
      //양보하는 동안 연결이 끊겼으면 남은 파싱을 하지 않는다
      signal?.throwIfAborted();
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
              pf.parsed.domAccesses = [
                ...(pf.parsed.domAccesses || []),
                ...(inlineResult.domAccesses || []),
              ];
              pf.parsed.eventBindings = [
                ...(pf.parsed.eventBindings || []),
                ...(inlineResult.eventBindings || []),
              ];
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
              pf.parsed.selectors = [
                ...(pf.parsed.selectors || []),
                ...(inlineResult.selectors || []),
              ];
              pf.parsed.variables = [
                ...(pf.parsed.variables || []),
                ...(inlineResult.variables || []),
              ];
              pf.parsed.variableRefs = [
                ...(pf.parsed.variableRefs || []),
                ...(inlineResult.variableRefs || []),
              ];
            }
          } catch {
            //인라인 파싱 실패는 무시
          }
        }
      }
    }
  }

  /* ── 티어 기반 언어 해석 (Python, C++, C#, TypeScript, Java) ── */
  let tieredCallEdges = [];
  let tieredInheritanceEdges = [];
  let tieredVariableEdges = [];
  if (tieredFiles.length > 0) {
    tieredCallEdges = resolveCalls(tieredFunctions, tieredCalls, tieredImports);
    tieredInheritanceEdges = resolveInheritance(tieredClasses);
    tieredVariableEdges = resolveVariableRefs(tieredVariables, tieredVariableRefs, tieredImports);
  }

  /* ── 웹 해석 ── */
  let webEdges = [];
  let jsCallEdges = [];
  let jsInheritanceEdges = [];
  let jsVariableEdges = [];
  if (webFiles.length > 0) {
    webEdges = resolveWebRelations(webParsedFiles, projectPath);
    if (jsFunctions.length > 0) {
      jsCallEdges = resolveJsCalls(jsFunctions, jsCalls, jsImports);
    }
    if (jsClasses.length > 0) {
      jsInheritanceEdges = resolveInheritance(jsClasses);
    }
    if (jsVariables.length > 0) {
      jsVariableEdges = resolveVariableRefs(jsVariables, jsVariableRefs, jsImports);
    }
  }

  //모든 엣지 합치기
  const allCallEdges = [...tieredCallEdges, ...jsCallEdges];
  const allInheritanceEdges = [...tieredInheritanceEdges, ...jsInheritanceEdges];
  const allVariableEdges = [...tieredVariableEdges, ...jsVariableEdges];

  //파일 결합도 지표 (CR-RFC-2026-002): 호출·상속·변수 참조 엣지를 파일 단위로 접어 Ca·Ce·I를 구한다
  const metricsByFile = computeFileMetrics(
    [allCallEdges, allInheritanceEdges, allVariableEdges],
    files.map((f) => f.relativePath),
  );
  //진단 탭·리팩토링 제안용 파일별 항목
  const fileCouplingEntries = files.map((f) => ({
    node_id: fileNodeIdOf(f),
    file: f.relativePath,
    ...fileCouplingData(metricsByFile, f.relativePath),
  }));

  //진단 실행
  const diagnostics = runDiagnostics(allCallEdges, fileCouplingEntries);

  //리팩토링 제안 생성
  const suggestions = generateSuggestions(diagnostics);

  //함수별 고유 연결 수 (inDegree: 이 함수를 호출하는 함수 수, outDegree: 이 함수가 호출하는 함수 수)
  //resolver가 같은 호출자→대상 쌍을 엣지 하나로 묶으므로 엣지 수가 곧 고유 함수 수다
  const inDegreeMap = {};
  const outDegreeMap = {};
  for (const edge of allCallEdges) {
    inDegreeMap[edge.target] = (inDegreeMap[edge.target] || 0) + 1;
    outDegreeMap[edge.source] = (outDegreeMap[edge.source] || 0) + 1;
  }

  //3단계 노드 생성 (티어 기반 언어 — 고유 연결 수별 계층 구조)
  const { nodes, tiers } = buildTieredNodes(
    tieredFunctions,
    tieredFiles,
    inDegreeMap,
    outDegreeMap,
    metricsByFile,
    tieredVariables,
  );

  //웹 전용 노드 추가 (언어별 컨테이너: HTML, CSS, JS)
  const { nodes: webNodes, langs } = buildWebNodes(
    webParsedFiles,
    webEdges,
    jsFunctions,
    inDegreeMap,
    outDegreeMap,
    metricsByFile,
  );
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
    diagnostics,
    suggestions,
    cycleEdgeIds,
    fileCounts: {
      python: files.filter((f) => f.language === 'python').length,
      html: files.filter((f) => f.language === 'html').length,
      css: files.filter((f) => f.language === 'css').length,
      javascript: files.filter((f) => f.language === 'javascript').length,
      cpp: files.filter((f) => f.language === 'cpp').length,
      csharp: files.filter((f) => f.language === 'csharp').length,
      typescript: files.filter((f) => f.language === 'typescript').length,
      java: files.filter((f) => f.language === 'java').length,
    },
  };
}

//3단계 Cytoscape 호환 노드 목록 생성 함수다.
//tier(고유 연결 수) → file → function/variable 의 3단계 중첩 구조를 만든다.
//파일 노드는 하나만 생성되며, 파일의 "대표 티어"는 내부 함수 중 최대 inDegree로 결정된다.
//개별 함수의 고유 연결 수는 함수 노드의 inDegree·outDegree 데이터로 유지된다.
//대상: Python, C++, C#, TypeScript, Java
function buildTieredNodes(
  functions,
  files,
  inDegreeMap,
  outDegreeMap,
  metricsByFile,
  allVariables,
) {
  const nodes = [];

  //각 함수의 고유 연결 수 결정 (inbound + outbound)
  const funcInboundMap = {};
  const funcOutboundMap = {};
  for (const func of functions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    funcInboundMap[nodeId] = inDegreeMap[nodeId] || 0;
    funcOutboundMap[nodeId] = outDegreeMap[nodeId] || 0;
  }

  //파일별 최대 inDegree(대표 티어) 계산
  const fileMaxTier = {};
  for (const func of functions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    fileMaxTier[func.filePath] = Math.max(fileMaxTier[func.filePath] || 0, funcInboundMap[nodeId]);
  }

  //고유 티어 값 수집 (내림차순 정렬)
  const tierSet = new Set(Object.values(fileMaxTier));
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
        label: `${tierValue}곳에서 참조`,
      },
    });
  }

  //파일별 함수 그룹핑 (티어 기준 제거)
  const fileFuncGroups = {};
  for (const func of functions) {
    if (!fileFuncGroups[func.filePath]) {
      fileFuncGroups[func.filePath] = [];
    }
    fileFuncGroups[func.filePath].push(func);
  }

  //함수가 없는 파일은 빈 그룹으로 추가
  for (const file of files) {
    if (!fileFuncGroups[file.relativePath]) {
      fileFuncGroups[file.relativePath] = [];
    }
  }

  //파일 언어 정보 인덱스
  const fileLangMap = {};
  for (const file of files) {
    fileLangMap[file.relativePath] = file.language;
  }

  //파일 노드 + 함수 노드 생성
  const createdFileNodes = new Set();
  for (const [filePath, funcs] of Object.entries(fileFuncGroups)) {
    const representativeTier = fileMaxTier[filePath] || 0;
    const fileNodeId = filePath;

    if (!createdFileNodes.has(fileNodeId)) {
      createdFileNodes.add(fileNodeId);
      nodes.push({
        data: {
          id: fileNodeId,
          label: filePath.split('/').pop(),
          type: 'file',
          fullPath: filePath,
          parent: `tier__${representativeTier}`,
          ...fileCouplingData(metricsByFile, filePath),
          language: fileLangMap[filePath] || 'unknown',
        },
      });
    }

    for (const func of funcs) {
      const nodeId = `${func.filePath}::${func.qualifiedName}`;
      const inCount = funcInboundMap[nodeId];
      const outCount = funcOutboundMap[nodeId];
      //언어별 노드 타입 구분
      const lang = fileLangMap[func.filePath] || 'unknown';
      const nodeType = lang === 'javascript' ? 'js-function' : 'function';
      //고유 연결 수를 라벨에 표시 (in↓ out↑)
      const refParts = [];
      if (inCount > 0) refParts.push(`${inCount}↓`);
      if (outCount > 0) refParts.push(`${outCount}↑`);
      const label =
        refParts.length > 0 ? `${func.qualifiedName} (${refParts.join(' ')})` : func.qualifiedName;

      nodes.push({
        data: {
          id: nodeId,
          label: label,
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
          inDegree: inCount,
          outDegree: outCount,
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

      const fileNodeId = v.filePath;
      const hasFileNode = createdFileNodes.has(fileNodeId);

      if (!hasFileNode) {
        createdFileNodes.add(fileNodeId);
        const representativeTier = fileMaxTier[v.filePath] || 0;
        nodes.push({
          data: {
            id: fileNodeId,
            label: v.filePath.split('/').pop(),
            type: 'file',
            fullPath: v.filePath,
            parent: `tier__${representativeTier}`,
            ...fileCouplingData(metricsByFile, v.filePath),
            language: fileLangMap[v.filePath] || 'unknown',
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
  const filteredNodes = nodes.filter((n) => {
    if (n.data.type === 'tier') {
      return tiersWithChildren.has(n.data.id);
    }
    return true;
  });
  const activeTiers = tiers.filter((t) => tiersWithChildren.has(`tier__${t}`));

  return { nodes: filteredNodes, tiers: activeTiers };
}

//웹 전용 노드를 생성한다 (HTML 요소, CSS 셀렉터, JS 함수).
//언어별 컨테이너(lang) → 참조 횟수(tier) → 파일(file) → 리프 노드의 4단계 중첩 구조를 만든다.
//파일 노드는 하나만 생성되며, 파일의 "대표 티어"는 내부 노드 중 최대 참조 횟수로 결정된다.
function buildWebNodes(
  webParsedFiles,
  webEdges,
  jsFunctions,
  inDegreeMap,
  outDegreeMap,
  metricsByFile,
) {
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

  //파일별·언어별 최대 참조 횟수(대표 티어) 사전 계산
  const fileMaxTier = {}; // key: `${language}::${filePath}`, value: maxTier

  //HTML/CSS 노드의 참조 횟수 사전 수집
  for (const pf of webParsedFiles) {
    const langFileKey = `${pf.language}::${pf.filePath}`;
    if (pf.language === 'html') {
      for (const elem of pf.parsed.elements || []) {
        if (elem.id) {
          const nodeId = `${pf.filePath}::elem#${elem.id}`;
          if (neededIds.has(nodeId)) {
            fileMaxTier[langFileKey] = Math.max(
              fileMaxTier[langFileKey] || 0,
              webRefCount[nodeId] || 0,
            );
          }
        }
        for (const cls of elem.classes) {
          const nodeId = `${pf.filePath}::elem.${cls}`;
          if (neededIds.has(nodeId)) {
            fileMaxTier[langFileKey] = Math.max(
              fileMaxTier[langFileKey] || 0,
              webRefCount[nodeId] || 0,
            );
          }
        }
        const tagNodeId = `${pf.filePath}::elem<${elem.tag}>`;
        if (neededIds.has(tagNodeId)) {
          fileMaxTier[langFileKey] = Math.max(
            fileMaxTier[langFileKey] || 0,
            webRefCount[tagNodeId] || 0,
          );
        }
      }
    } else if (pf.language === 'css') {
      for (const sel of pf.parsed.selectors || []) {
        const nodeId = `${pf.filePath}::${sel.raw}`;
        if (neededIds.has(nodeId)) {
          fileMaxTier[langFileKey] = Math.max(
            fileMaxTier[langFileKey] || 0,
            webRefCount[nodeId] || 0,
          );
        }
      }
      for (const v of pf.parsed.variables || []) {
        if (v.type === 'css-variable') {
          const varNodeId = `${v.filePath}::${v.name}`;
          fileMaxTier[langFileKey] = Math.max(
            fileMaxTier[langFileKey] || 0,
            webRefCount[varNodeId] || 0,
          );
        }
      }
    }
  }

  //JS 함수의 고유 연결 수 사전 수집 (inDegree 기준)
  for (const func of jsFunctions) {
    const nodeId = `${func.filePath}::${func.qualifiedName}`;
    const tierValue = inDegreeMap[nodeId] || 0;
    const langFileKey = `javascript::${func.filePath}`;
    fileMaxTier[langFileKey] = Math.max(fileMaxTier[langFileKey] || 0, tierValue);
  }

  //언어 컨테이너 → 참조 횟수 티어 → 파일 노드를 필요시 생성하는 헬퍼
  const labelMap = { html: 'HTML', css: 'CSS', javascript: 'JavaScript' };

  function ensureLangTierAndFile(language, filePath) {
    const langFileKey = `${language}::${filePath}`;
    const maxTier = fileMaxTier[langFileKey] || 0;

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
    const subTierId = `tier__${language}__${maxTier}`;
    if (!createdSubTiers.has(subTierId)) {
      createdSubTiers.add(subTierId);
      nodes.push({
        data: {
          id: subTierId,
          type: 'tier',
          tierValue: maxTier,
          //JS는 함수 고유 연결 수, HTML·CSS는 웹 관계 참조 횟수로 묶는다
          label: language === 'javascript' ? `${maxTier}곳에서 참조` : `${maxTier}회 참조`,
          parent: langId,
        },
      });
    }

    //3단계: 파일 노드 (서브 티어 안) — 티어 접미사 제거
    const fileNodeId = `${filePath}__${language}`;
    if (!createdFileNodes.has(fileNodeId)) {
      createdFileNodes.add(fileNodeId);
      nodes.push({
        data: {
          id: fileNodeId,
          label: filePath.split('/').pop(),
          type: 'file',
          fullPath: filePath,
          parent: subTierId,
          ...fileCouplingData(metricsByFile, filePath),
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
      for (const elem of pf.parsed.elements || []) {
        //ID 기반 노드
        if (elem.id) {
          const nodeId = `${pf.filePath}::elem#${elem.id}`;
          if (neededIds.has(nodeId) && !addedIds.has(nodeId)) {
            addedIds.add(nodeId);
            const tierValue = webRefCount[nodeId] || 0;
            const fileNodeId = ensureLangTierAndFile('html', pf.filePath);
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
            const fileNodeId = ensureLangTierAndFile('html', pf.filePath);
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
          const fileNodeId = ensureLangTierAndFile('html', pf.filePath);
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
      for (const sel of pf.parsed.selectors || []) {
        const nodeId = `${pf.filePath}::${sel.raw}`;
        if (neededIds.has(nodeId) && !addedIds.has(nodeId)) {
          addedIds.add(nodeId);
          const tierValue = webRefCount[nodeId] || 0;
          const fileNodeId = ensureLangTierAndFile('css', pf.filePath);
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
      for (const v of pf.parsed.variables || []) {
        if (v.type === 'css-variable') {
          const varNodeId = `${v.filePath}::${v.name}`;
          if (!addedIds.has(varNodeId)) {
            addedIds.add(varNodeId);
            const tierValue = webRefCount[varNodeId] || 0;
            const fileNodeId = ensureLangTierAndFile('css', v.filePath);
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
    const inCount = inDegreeMap[nodeId] || 0;
    const outCount = outDegreeMap[nodeId] || 0;
    const fileNodeId = ensureLangTierAndFile('javascript', func.filePath);
    //참조 횟수를 라벨에 표시 (in↓ out↑)
    const refParts = [];
    if (inCount > 0) refParts.push(`${inCount}↓`);
    if (outCount > 0) refParts.push(`${outCount}↑`);
    const label =
      refParts.length > 0 ? `${func.qualifiedName} (${refParts.join(' ')})` : func.qualifiedName;
    nodes.push({
      data: {
        id: nodeId,
        label: label,
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
        inDegree: inCount,
        outDegree: outCount,
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
      const exists = edges.some((e) => e.source === source && e.target === target);
      if (exists) cycleEdgeIds.add(edgeId);
    }
  }
  return Array.from(cycleEdgeIds);
}

module.exports = { buildGraph };
