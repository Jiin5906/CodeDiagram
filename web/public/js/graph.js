//그래프 랜더링 및 스타일 코드

let cy = null;
//현재 뷰 모드: 'function' 또는 'package'
let currentViewMode = 'function';
//원본 그래프 데이터 보관
let graphData = null;

function initGraph(container) {
  cy = cytoscape({
    container: container,
    style: [
      //티어 노드 — 참조 횟수 그룹 컨테이너
      {
        selector: 'node[type="tier"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#0f1419',
          'background-opacity': 0.6,
          'border-color': '#f59e0b',
          'border-width': 2,
          'border-opacity': 0.7,
          'border-style': 'dashed',
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '39px',
          'color': '#fbbf24',
          'padding': '30px',
          'text-margin-y': '-6px',
          'font-weight': 'bold',
          'min-width': '240px',
          'min-height': '140px',
          'z-compound-depth': 'bottom',
          'text-background-color': '#0f1419',
          'text-background-opacity': 1,
          'text-background-padding': '6px',
          'text-background-shape': 'roundrectangle',
        },
      },
      //패키지 노드 — 초록 테두리 컨테이너
      {
        selector: 'node[type="package"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#0f1419',
          'background-opacity': 0.6,
          'border-color': '#22c55e',
          'border-width': 2,
          'border-opacity': 0.8,
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '23px',
          'color': '#4ade80',
          'padding': '40px',
          'text-margin-y': '-4px',
          'font-weight': 'bold',
          'min-width': '200px',
          'min-height': '120px',
          'z-compound-depth': 'bottom',
        },
      },
      //파일 노드 — 파란 테두리 컨테이너
      {
        selector: 'node[type="file"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#111827',
          'background-opacity': 0.85,
          'border-color': '#3b82f6',
          'border-width': 2,
          'border-opacity': 0.8,
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#93c5fd',
          'padding': '18px',
          'text-margin-y': '-2px',
          'font-weight': 'bold',
          'min-width': '180px',
          'min-height': '90px',
          'z-compound-depth': 'bottom',
          'text-background-color': '#111827',
          'text-background-opacity': 1,
          'text-background-padding': '4px',
          'text-background-shape': 'roundrectangle',
        },
      },
      //결합도에 따른 파일 노드 테두리 두께 — 결합도 높을수록 두꺼운 테두리
      {
        selector: 'node[type="file"][couplingScore > 0.3]',
        style: {
          'border-width': 'mapData(couplingScore, 0, 1, 2, 7)',
          'border-color': 'mapData(couplingScore, 0, 1, #3b82f6, #f59e0b)',
        },
      },
      //함수 노드 — 둥근 알약 모양
      {
        selector: 'node[type="function"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#1e293b',
          'border-color': '#475569',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#e2e8f0',
          'width': 'label',
          'height': '40px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //변수 노드 — 다이아몬드 모양, 청록색
      {
        selector: 'node[type="variable"]',
        style: {
          'shape': 'diamond',
          'background-color': '#134e4a',
          'border-color': '#14b8a6',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '21px',
          'color': '#5eead4',
          'width': 'label',
          'height': '36px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //클래스 필드 변수 — 보라색 강조
      {
        selector: 'node[type="variable"][className]',
        style: {
          'border-color': '#a78bfa',
          'color': '#c4b5fd',
        },
      },
      //클래스 메서드 노드 — 보라색 강조
      {
        selector: 'node[type="function"][className]',
        style: {
          'border-color': '#7c3aed',
          'color': '#c4b5fd',
          'border-width': 1.5,
        },
      },
      //접힌 노드 — 점선 테두리
      {
        selector: 'node.collapsed',
        style: {
          'border-style': 'dashed',
          'border-opacity': 0.5,
        },
      },
      //마우스 올렸을 때 효과
      {
        selector: 'node[type="function"]:active',
        style: {
          'overlay-color': '#60a5fa',
          'overlay-opacity': 0.08,
        },
      },
      //선택된 함수 노드 하이라이트
      {
        selector: 'node.highlighted',
        style: {
          'border-color': '#f59e0b',
          'border-width': 2.5,
          'background-color': '#1c1917',
          'color': '#fbbf24',
          'z-index': 10,
        },
      },
      //엣지 — 기본 숨김 (노드 클릭 시 관련 엣지만 표시)
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': '#60a5fa',
          'line-opacity': 0,
          'target-arrow-color': '#60a5fa',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.9,
          'curve-style': 'bezier',
          'display': 'none',
        },
      },
      //엣지 라벨 (참조 횟수 표시)
      {
        selector: 'edge[refCount > 1]',
        style: {
          'label': 'data(refCount)',
          'font-size': '36px',
          'color': '#94a3b8',
          'text-background-color': '#0a0e17',
          'text-background-opacity': 1,
          'text-background-padding': '3px',
          'text-background-shape': 'roundrectangle',
          'font-weight': 'bold',
        },
      },
      //변수 참조 엣지 — 청록색 점선
      {
        selector: 'edge[edgeType="variable-ref"]',
        style: {
          'line-color': '#14b8a6',
          'line-style': 'dashed',
          'target-arrow-color': '#14b8a6',
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'line-opacity': 0.6,
        },
      },
      //상속 엣지 — 보라색 점선
      {
        selector: 'edge[edgeType="inheritance"]',
        style: {
          'line-color': '#a78bfa',
          'line-style': 'dashed',
          'target-arrow-color': '#a78bfa',
          'target-arrow-shape': 'triangle-backcurve',
          'width': 2,
          'line-opacity': 0.7,
        },
      },
      //순환 참조 엣지 — 빨간 하이라이트
      {
        selector: 'edge.cycle-edge',
        style: {
          'line-color': '#ef4444',
          'target-arrow-color': '#ef4444',
          'width': 2.5,
          'line-opacity': 0.9,
        },
      },
      //선택된 엣지 하이라이트
      {
        selector: 'edge.highlighted',
        style: {
          'line-color': '#f59e0b',
          'target-arrow-color': '#f59e0b',
          'width': 2.5,
          'line-opacity': 1,
          'z-index': 10,
        },
      },
      //선택 안 된 요소들 흐리게 처리
      {
        selector: 'node.dimmed',
        style: {
          'opacity': 0.3,
        },
      },
      {
        selector: 'edge.dimmed',
        style: {
          'opacity': 0.1,
        },
      },
      //미리보기 모드에서 제거될 엣지 표시
      {
        selector: 'edge.preview-removed',
        style: {
          'line-color': '#ef4444',
          'line-style': 'dashed',
          'line-opacity': 0.3,
          'target-arrow-color': '#ef4444',
          'width': 1,
        },
      },
    ],
    layout: { name: 'preset' },
    wheelSensitivity: 0.3,
    minZoom: 0.1,
    maxZoom: 5,
  });

  return cy;
}

function renderGraph(data) {
  if (!cy) return;

  //원본 데이터 보관
  graphData = data;
  currentViewMode = 'function';

  cy.elements().remove();

  //엣지에 연결된 함수 노드 ID 수집 (고립 함수 필터링용)
  const connectedIds = new Set();
  for (const edge of data.edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }
  if (data.inheritanceEdges) {
    for (const edge of data.inheritanceEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
  }
  if (data.variableEdges) {
    for (const edge of data.variableEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
  }

  //유지할 함수/변수/파일/티어 결정
  const keptFiles = new Set();
  const keptTiers = new Set();
  for (const node of data.nodes) {
    if ((node.data.type === 'function' || node.data.type === 'variable') && connectedIds.has(node.data.id)) {
      keptFiles.add(node.data.parent);
    }
  }
  for (const node of data.nodes) {
    if (node.data.type === 'file' && keptFiles.has(node.data.id)) {
      keptTiers.add(node.data.parent);
    }
  }

  //노드 추가 (엣지 없는 고립 함수/변수와 빈 컨테이너 제외)
  const elements = [];
  for (const node of data.nodes) {
    if (node.data.type === 'function' && !connectedIds.has(node.data.id)) continue;
    if (node.data.type === 'variable' && !connectedIds.has(node.data.id)) continue;
    if (node.data.type === 'file' && !keptFiles.has(node.data.id)) continue;
    if (node.data.type === 'tier' && !keptTiers.has(node.data.id)) continue;
    elements.push(node);
  }

  //호출 엣지 추가
  const addedNodeIds = new Set(elements.filter(e => e.data && !e.data.source).map(e => e.data.id));
  for (const edge of data.edges) {
    if (!addedNodeIds.has(edge.source) || !addedNodeIds.has(edge.target)) continue;
    elements.push({
      data: {
        id: `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        refCount: edge.references.length,
        references: edge.references,
        edgeType: 'call',
      },
    });
  }

  //상속 엣지 추가 (source와 target 노드가 모두 존재할 때만)
  if (data.inheritanceEdges) {
    for (const edge of data.inheritanceEdges) {
      if (addedNodeIds.has(edge.source) && addedNodeIds.has(edge.target)) {
        elements.push({
          data: {
            id: `inherit__${edge.source}->${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: 'inheritance',
          },
        });
      }
    }
  }

  //변수 참조 엣지 추가
  if (data.variableEdges) {
    for (const edge of data.variableEdges) {
      if (addedNodeIds.has(edge.source) && addedNodeIds.has(edge.target)) {
        elements.push({
          data: {
            id: `varref__${edge.source}->${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: 'variable-ref',
            refCount: edge.references.length,
            references: edge.references,
          },
        });
      }
    }
  }

  cy.add(elements);

  //순환 참조 엣지에 클래스 추가
  if (data.cycleEdgeIds) {
    for (const edgeId of data.cycleEdgeIds) {
      const edge = cy.getElementById(edgeId);
      if (edge.length) edge.addClass('cycle-edge');
    }
  }

  //티어 목록을 오름차순 정렬 (0부터 N까지 좌→우 배치)
  const sortedTiers = data.tiers ? [...data.tiers].sort((a, b) => a - b) : [];

  //1단계: fcose로 내부 노드 자동 배치 (완료 후 티어 재배치)
  cy.layout({
    name: 'fcose',
    animate: false,
    fit: false,
    padding: 20,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 60,
    nodeRepulsion: 4000,
    edgeElasticity: 0.4,
    nestingFactor: 0.5,
    gravity: 0.4,
    gravityRange: 1.5,
    quality: 'default',
    randomize: true,
    numIter: 500,
    stop: function () {
      //2단계: 레이아웃 완료 후 티어 박스를 좌→우로 겹치지 않게 재배치
      arrangeTiers(sortedTiers);
    },
  }).run();

  //범례 표시
  document.getElementById('legend').classList.add('visible');

  return cy;
}

//패키지 뷰로 전환한다.
function renderPackageView(data) {
  if (!cy || !data) return;
  currentViewMode = 'package';

  cy.elements().remove();
  const elements = [];

  //패키지 노드 추가
  if (data.packageNodes) {
    for (const node of data.packageNodes) {
      elements.push(node);
    }
  }

  //파일 노드를 패키지 안에 추가
  const fileSet = new Set();
  for (const node of data.nodes) {
    if (node.data.type === 'file') {
      const filePath = node.data.fullPath;
      if (fileSet.has(filePath)) continue;
      fileSet.add(filePath);

      const dir = filePath.split('/').slice(0, -1).join('/') || '.';
      elements.push({
        data: {
          id: `pkgfile__${filePath}`,
          label: filePath.split('/').pop(),
          type: 'file',
          fullPath: filePath,
          parent: `pkg__${dir}`,
          couplingScore: node.data.couplingScore || 0,
        },
      });
    }
  }

  //파일 간 엣지 추가 (중복 제거)
  const fileEdgeSet = new Set();
  for (const edge of data.edges) {
    const sf = edge.source.split('::')[0];
    const tf = edge.target.split('::')[0];
    if (sf === tf) continue;
    const key = `${sf}->${tf}`;
    if (fileEdgeSet.has(key)) continue;
    fileEdgeSet.add(key);
    elements.push({
      data: {
        id: `pkgedge__${key}`,
        source: `pkgfile__${sf}`,
        target: `pkgfile__${tf}`,
        edgeType: 'call',
      },
    });
  }

  cy.add(elements);

  cy.layout({
    name: 'fcose',
    animate: false,
    fit: true,
    padding: 60,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 100,
    nodeRepulsion: 6000,
    quality: 'default',
    randomize: true,
    numIter: 2000,
  }).run();
}

//티어 박스들을 0부터 N까지 좌→우 순서로 재배치하는 함수다.
//완전 결정적 3단계 레이아웃:
//  1) 파일 내부: 함수들을 행 기반 컴팩트 배치 (fcose 결과 덮어씀)
//  2) 티어 내부: 파일들을 그리드 배치
//  3) 티어 간: 좌→우 순서 배치
function arrangeTiers(sortedTiers) {
  if (!sortedTiers || sortedTiers.length === 0) return;

  //compound 노드 패딩 보정: 리프 bbox 기준으로 계산하므로
  //시각적 간격 = gap - 2*padding 이 되어야 겹치지 않는다
  //tier padding: 30px, file padding: 18px
  //tierGap: 시각적 간격 20px + 2*(30+18) = 116 + 라벨 여유 50px = 166
  //fileGap: 시각적 간격 12px → 12 + 2*18 = 48 + 라벨 여유 32px = 80
  const tierGap = 166;
  const fileGap = 80;
  const fnGap = 8;

  const tierInfo = [];
  for (const tierValue of sortedTiers) {
    const tierNode = cy.getElementById(`tier__${tierValue}`);
    if (!tierNode.length) continue;

    const descendants = tierNode.descendants();
    if (descendants.length === 0) continue;

    const fileNodes = tierNode.children();
    const files = [];
    //모든 함수(리프) 노드를 별도로 수집 — compound 노드의 stale bbox 문제 회피
    let allFuncNodes = cy.collection();

    fileNodes.forEach(fileNode => {
      const funcNodes = fileNode.children();
      if (funcNodes.length === 0) return;

      //1단계: 파일 내부 함수를 가로 우선 흐름 배치 (엑셀 느낌)
      //가로로 나열하다 칸이 없으면 다음 줄로 넘어감
      const funcs = [];
      funcNodes.forEach(n => {
        const bb = n.boundingBox();
        funcs.push({ node: n, w: bb.w, h: bb.h });
      });

      //행 최대 너비: sqrt(개수)개 열 기준으로 계산
      const targetCols = Math.max(1, Math.ceil(Math.sqrt(funcs.length)));
      const widthsSorted = funcs.map(f => f.w).sort((a, b) => b - a);
      let maxRowW = 0;
      for (let i = 0; i < Math.min(targetCols, widthsSorted.length); i++) {
        maxRowW += widthsSorted[i] + fnGap;
      }

      let rowX = 0, rowY = 0, rowMaxH = 0;
      for (const item of funcs) {
        if (rowX > 0 && rowX + item.w > maxRowW) {
          rowX = 0;
          rowY += rowMaxH + fnGap;
          rowMaxH = 0;
        }
        item.node.position({ x: rowX + item.w / 2, y: rowY + item.h / 2 });
        rowX += item.w + fnGap;
        rowMaxH = Math.max(rowMaxH, item.h);
      }

      const newBb = funcNodes.boundingBox();
      files.push({ desc: funcNodes, bb: newBb, w: newBb.w, h: newBb.h });
      allFuncNodes = allFuncNodes.union(funcNodes);
    });

    if (files.length === 0) continue;

    //2단계: 파일들을 그리드 배치
    const cols = Math.max(1, Math.ceil(Math.cbrt(files.length)));
    files.sort((a, b) => b.h - a.h);

    let gridX = 0, gridY = 0, rowMaxH = 0, col = 0;
    for (const file of files) {
      const dx = gridX - file.bb.x1;
      const dy = gridY - file.bb.y1;
      file.desc.forEach(child => {
        const pos = child.position();
        child.position({ x: pos.x + dx, y: pos.y + dy });
      });

      rowMaxH = Math.max(rowMaxH, file.h);
      gridX += file.w + fileGap;
      col++;

      if (col >= cols) {
        gridX = 0;
        gridY += rowMaxH + fileGap;
        rowMaxH = 0;
        col = 0;
      }
    }

    //핵심 수정: 리프 노드(함수)만으로 바운딩 박스 계산
    //compound 노드(파일)의 stale bbox가 포함되면 크기가 부풀려짐
    const newBb = allFuncNodes.boundingBox();
    console.log(`[layout] tier ${tierValue}: ${files.length} files, ${allFuncNodes.length} funcs, bbox ${Math.round(newBb.w)}×${Math.round(newBb.h)}, fileCols ${cols}`);
    tierInfo.push({ tierValue, leafNodes: allFuncNodes, bb: newBb });
  }

  //3단계: 티어들을 자동 줄바꿈으로 배치
  const maxTierW = Math.max(...tierInfo.map(t => t.bb.w));
  const targetWidth = Math.max(maxTierW + tierGap, 2500);

  //티어들을 행에 분배
  const tierRows = [[]];
  let rowW = 0;
  for (const info of tierInfo) {
    if (rowW > 0 && rowW + info.bb.w > targetWidth) {
      tierRows.push([]);
      rowW = 0;
    }
    tierRows[tierRows.length - 1].push(info);
    rowW += info.bb.w + tierGap;
  }

  //각 행 내에서 좌→우 배치, 행 간에는 위→아래 배치
  let rowY = 0;
  for (const row of tierRows) {
    const rowH = Math.max(...row.map(r => r.bb.h));
    let x = 0;

    for (const info of row) {
      const { leafNodes, bb } = info;
      const offsetX = x - bb.x1;
      const offsetY = rowY + (rowH - bb.h) / 2 - bb.y1;
      //리프 노드만 이동 — compound 노드는 자동으로 따라감
      leafNodes.forEach(node => {
        const pos = node.position();
        node.position({ x: pos.x + offsetX, y: pos.y + offsetY });
      });
      x += bb.w + tierGap;
    }

    rowY += rowH + tierGap;
  }

  console.log(`[layout] rows: ${tierRows.length}, rowSizes: [${tierRows.map(r => r.length).join(',')}], targetWidth: ${targetWidth}`);
  cy.fit(undefined, 20);

  //초기 줌: 노드 수에 따라 동적 조정 후 첫 함수 노드 중심으로 패닝
  const leafNodes = cy.nodes('[type="function"], [type="variable"]');
  const nodeCount = leafNodes.length;
  //노드가 적으면 약간 확대, 많으면 전체가 보이도록 축소
  const zoomLevel = nodeCount <= 10 ? 1.2
    : nodeCount <= 30 ? 0.9
    : nodeCount <= 80 ? 0.7
    : 0.5;
  const firstFunc = cy.nodes('[type="function"]')[0];
  if (firstFunc) {
    cy.zoom({ level: zoomLevel, position: firstFunc.position() });
    cy.center(firstFunc);
  }
}

//파일 상세 뷰: 해당 파일의 함수 노드만 + 외부 연결 스텁 노드 표시
function renderFileDetailView(data, filePath) {
  if (!cy || !data) return;
  currentViewMode = 'file-detail';

  cy.elements().remove();
  const elements = [];

  //해당 파일의 함수/변수 노드 수집
  const fileNodeIds = new Set();
  for (const node of data.nodes) {
    if ((node.data.type === 'function' || node.data.type === 'variable') && node.data.filePath === filePath) {
      fileNodeIds.add(node.data.id);
      elements.push({
        data: {
          ...node.data,
          parent: undefined, //부모 없이 자유 배치
        },
      });
    }
  }

  //외부 연결 스텁 노드 수집
  const stubIds = new Set();
  const allEdges = [...(data.edges || []), ...(data.variableEdges || [])];

  for (const edge of allEdges) {
    const srcIn = fileNodeIds.has(edge.source);
    const tgtIn = fileNodeIds.has(edge.target);

    if (srcIn && !tgtIn && !stubIds.has(edge.target)) {
      stubIds.add(edge.target);
      const name = edge.target.split('::').pop();
      const file = edge.target.split('::')[0];
      elements.push({
        data: {
          id: edge.target,
          label: name,
          type: 'function',
          filePath: file,
          qualifiedName: name,
          isStub: true,
        },
      });
    }

    if (tgtIn && !srcIn && !stubIds.has(edge.source)) {
      stubIds.add(edge.source);
      const name = edge.source.split('::').pop();
      const file = edge.source.split('::')[0];
      elements.push({
        data: {
          id: edge.source,
          label: name,
          type: 'function',
          filePath: file,
          qualifiedName: name,
          isStub: true,
        },
      });
    }
  }

  //관련 엣지 추가
  const allNodeIds = new Set([...fileNodeIds, ...stubIds]);
  for (const edge of data.edges) {
    if (allNodeIds.has(edge.source) && allNodeIds.has(edge.target)) {
      elements.push({
        data: {
          id: `${edge.source}->${edge.target}`,
          source: edge.source,
          target: edge.target,
          refCount: edge.references.length,
          references: edge.references,
          edgeType: 'call',
        },
      });
    }
  }

  if (data.variableEdges) {
    for (const edge of data.variableEdges) {
      if (allNodeIds.has(edge.source) && allNodeIds.has(edge.target)) {
        elements.push({
          data: {
            id: `varref__${edge.source}->${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: 'variable-ref',
            refCount: edge.references.length,
            references: edge.references,
          },
        });
      }
    }
  }

  cy.add(elements);

  //스텁 노드에 특수 스타일 적용
  cy.nodes('[?isStub]').style({
    'opacity': 0.5,
    'border-style': 'dashed',
  });

  //모든 엣지 표시
  cy.edges().style({ 'display': 'element', 'line-opacity': 0.6 });

  cy.layout({
    name: 'fcose',
    animate: false,
    fit: true,
    padding: 60,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 80,
    nodeRepulsion: 5000,
    quality: 'default',
    randomize: true,
    numIter: 1000,
  }).run();

  //뒤로가기 버튼 표시
  document.getElementById('back-to-package-btn').classList.remove('hidden');
}

function highlightNode(nodeId) {
  if (!cy) return;
  cy.nodes().removeClass('highlighted dimmed');
  cy.edges().removeClass('highlighted dimmed');

  //엣지 토글 상태에 따라 초기화
  if (typeof edgesVisible !== 'undefined' && edgesVisible) {
    //토글 ON 상태: 모든 엣지 유지, opacity 낮춤
    cy.edges().style({ 'display': 'element', 'line-opacity': 0.3 });
  } else {
    //토글 OFF 상태: 모든 엣지 숨김
    cy.edges().style('display', 'none');
  }

  const node = cy.getElementById(nodeId);
  if (node.length) {
    node.addClass('highlighted');

    //연결된 엣지와 이웃 노드 하이라이트
    const connectedEdges = node.connectedEdges();
    const neighborNodes = node.neighborhood('node');

    //연결된 엣지만 강조 표시
    connectedEdges.style('display', 'element');
    connectedEdges.addClass('highlighted');

    //부모 파일 노드와 조부모 티어 노드도 흐려지지 않도록 처리
    const parentFile = node.parent();
    const parentTier = parentFile.parent();
    const keepVisible = node.union(neighborNodes).union(parentFile).union(parentTier);

    //이웃 노드의 부모(파일, 티어)도 흐려지지 않도록 처리
    let neighborAncestors = cy.collection();
    neighborNodes.forEach(n => {
      neighborAncestors = neighborAncestors.union(n.parent());
      if (n.parent().length) {
        neighborAncestors = neighborAncestors.union(n.parent().parent());
      }
    });

    //나머지는 전부 흐리게
    cy.nodes().not(keepVisible).not(neighborAncestors).addClass('dimmed');
  }
}

function clearHighlights() {
  if (!cy) return;
  cy.nodes().removeClass('highlighted dimmed');
  cy.edges().removeClass('highlighted dimmed');

  //엣지 토글 상태에 따라 복원
  if (typeof edgesVisible !== 'undefined' && edgesVisible) {
    cy.edges().style({ 'display': 'element', 'line-opacity': 0.3 });
  } else {
    cy.edges().style('display', 'none');
  }
}
