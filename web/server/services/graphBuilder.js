//그래프 데이터 생성 코드
//parser과 resolver을 조합하여 최종 그래프 JSON을 만듦. 실행 순서는 다음과 같다.
/*
    1. gitService로 모든 .py 파일을 찾음
    2. 각 파일을 청크 단위로 파싱하여 함수, 호출, import, 클래스 정보를 수집
    3. resolver로 호출 관계와 상속 관계를 엣지로 변환
    4. metricsService로 결합도 계산
    5. diagnosticsService로 진단 실행
    6. refactoringService로 리팩토링 제안 생성
    7. buildNodes로 Cytoscape.js 호환 노드 목록 생성
*/

const fs = require('fs');
const { parseFile } = require('./parser');
const { resolveCalls, resolveInheritance } = require('./resolver');
const { findPythonFiles } = require('./gitService');
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
  const { files, warnings } = findPythonFiles(projectPath);

  if (files.length === 0) {
    throw new Error('No .py files found in the project');
  }

  const allFunctions = [];
  const allCalls = [];
  const allImports = [];
  const allClasses = [];

  /* ── 청크 단위 파싱 ── */
  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const chunk = files.slice(i, i + CHUNK_SIZE);

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
        result = parseFile(code, file.relativePath);
      } catch (err) {
        warnings.push(`Failed to parse ${file.relativePath}: ${err.message}`);
        continue;
      }

      allFunctions.push(...result.functions);
      allCalls.push(...result.calls);
      allImports.push({
        filePath: file.relativePath,
        imports: result.imports,
      });
      if (result.classes) {
        allClasses.push(...result.classes);
      }
    }

    //청크 사이에 이벤트 루프 양보
    if (i + CHUNK_SIZE < files.length) {
      await yieldToEventLoop();
    }
  }

  //호출 관계를 엣지로 변환
  const callEdges = resolveCalls(allFunctions, allCalls, allImports);

  //상속 관계를 엣지로 변환
  const inheritanceEdges = resolveInheritance(allClasses);

  //결합도 계산
  const { fileCounts } = computeFileCoupling(callEdges);
  const couplingScores = normalizeCoupling(fileCounts);

  //진단 실행
  const diagnostics = runDiagnostics(callEdges, allFunctions, allClasses);

  //리팩토링 제안 생성
  const suggestions = generateSuggestions(diagnostics);

  //참조 횟수 계산 (각 함수가 호출 당하는 총 횟수)
  const inboundCountMap = {};
  for (const edge of callEdges) {
    const targetId = edge.target;
    if (!inboundCountMap[targetId]) {
      inboundCountMap[targetId] = 0;
    }
    inboundCountMap[targetId] += edge.references.length;
  }

  //3단계 노드 생성 (tier → file → function)
  const { nodes, tiers } = buildTieredNodes(allFunctions, files, inboundCountMap, couplingScores);

  //패키지 노드 생성
  const packageNodes = buildPackageNodes(files);

  //순환 경로에 포함되는 엣지 ID 목록 생성
  const cycleEdgeIds = buildCycleEdgeIds(diagnostics.cycles.functions, callEdges);

  return {
    nodes,
    edges: callEdges,
    inheritanceEdges,
    packageNodes,
    tiers,
    warnings,
    couplingScores,
    diagnostics,
    suggestions,
    cycleEdgeIds,
  };
}

//3단계 Cytoscape 호환 노드 목록 생성 함수다.
//tier 노드 → file 노드 → function 노드의 3단계 중첩 구조를 만든다.
//같은 파일이라도 함수의 참조 횟수가 다르면 별도 파일 노드로 분할된다.
function buildTieredNodes(functions, files, inboundCountMap, couplingScores) {
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
        },
      });
    }

    for (const func of funcs) {
      const nodeId = `${func.filePath}::${func.qualifiedName}`;
      nodes.push({
        data: {
          id: nodeId,
          label: func.qualifiedName,
          type: 'function',
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
      //실제 엣지 존재 여부 확인
      const exists = edges.some(e => e.source === source && e.target === target);
      if (exists) cycleEdgeIds.add(edgeId);
    }
  }
  return Array.from(cycleEdgeIds);
}

module.exports = { buildGraph };
