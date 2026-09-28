//로컬 그래프 뷰 (Phase 2)
//선택한 파일 노드의 이웃만 표시하고 확대한다. 빈 곳 클릭 또는 Esc로 전체 보기로 돌아간다.

let _localGraphActive = false;
let _localGraphCenterId = null;
let _localGraphDepth = 1;
let _localGraphSavedViewport = null;

function enterLocalGraph(nodeId, depth) {
  if (!cy || _localGraphActive) return;
  depth = depth || _localGraphDepth;

  const centerNode = cy.getElementById(nodeId);
  if (!centerNode.length) return;

  _localGraphActive = true;
  _localGraphCenterId = nodeId;
  _localGraphDepth = depth;

  //현재 뷰포트 저장
  _localGraphSavedViewport = {
    zoom: cy.zoom(),
    pan: { ...cy.pan() },
  };

  applyLocalGraphFilter(nodeId, depth);
}

function exitLocalGraph() {
  if (!cy || !_localGraphActive) return;

  _localGraphActive = false;

  cy.batch(() => {
    cy.elements().removeClass('local-graph-hidden local-graph-center');
  });

  //뷰포트 복구
  if (_localGraphSavedViewport) {
    cy.viewport({
      zoom: _localGraphSavedViewport.zoom,
      pan: _localGraphSavedViewport.pan,
    });
    _localGraphSavedViewport = null;
  }

  _localGraphCenterId = null;
}

function setLocalGraphDepth(depth) {
  if (!_localGraphActive || !_localGraphCenterId) return;
  _localGraphDepth = depth;
  applyLocalGraphFilter(_localGraphCenterId, depth);
}

function applyLocalGraphFilter(nodeId, depth) {
  const centerNode = cy.getElementById(nodeId);
  if (!centerNode.length) return;

  //N-depth 이웃 계산
  let neighborhood = centerNode.closedNeighborhood();
  for (let i = 1; i < depth; i++) {
    neighborhood = neighborhood.closedNeighborhood();
  }

  //연결된 엣지도 포함
  const connectedEdges = neighborhood.connectedEdges().filter(edge => {
    return neighborhood.contains(edge.source()) && neighborhood.contains(edge.target());
  });

  const visible = neighborhood.union(connectedEdges);

  cy.batch(() => {
    cy.elements().addClass('local-graph-hidden');
    visible.removeClass('local-graph-hidden');
    cy.elements().removeClass('local-graph-center');
    centerNode.addClass('local-graph-center');
  });

  //보이는 노드에 맞춰 뷰 조정
  cy.animate({
    fit: { eles: visible.nodes(), padding: 60 },
  }, { duration: 300, easing: 'ease-out-cubic' });
}

function isLocalGraphActive() {
  return _localGraphActive;
}
