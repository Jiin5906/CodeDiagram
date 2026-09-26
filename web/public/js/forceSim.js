//옵시디언 스타일 실시간 물리 시뮬레이션 코드 (파일 뷰 전용)
//d3-force로 레이아웃을 계산하고 매 틱마다 Cytoscape 노드 위치를 갱신한다.
//- 로딩: 노드가 중심에서 퍼져나가며 자리 잡는 애니메이션
//- 드래그: 끌고 있는 노드를 고정하고 시뮬레이션을 다시 데워 이웃 노드가 고무줄처럼 따라온다

//이보다 노드가 많으면 로딩 애니메이션 없이 최종 배치만 적용 (드래그 물리는 유지)
const FORCE_LIVE_MAX_NODES = 600;

let _forceSim = null;
let _forceNodes = null;
let _forceNodeById = null;
let _forceHandlers = null;

//물리 파라미터
//실제 저장소(requests, cpp-projects, 50projects50days, thefuck)로 측정해 정한 값:
//원 사이 간격 중간값 약 60px, 원형도 0.84~0.91, 연결된 파일끼리의 근접도는 유지
const FORCE_PARAMS = {
  repel: 700,        //척력 (노드끼리 밀어내는 힘)
  linkDistance: 90,  //선의 기본 길이 (참조가 많을수록 최대 35%까지 짧아짐)
  center: 0.09,      //중심 인력 (높을수록 둥글게 뭉침)
};

//선의 당김을 약하게 두어야 척력과 중심 인력이 모양을 결정해 옵시디언처럼 둥근 원판이 된다.
//강하면 링크가 많은 파일 쪽으로 군집이 길쭉하게 늘어난다.
const FORCE_LINK_STRENGTH = 0.15;
//원 둘레에서 이웃 원까지 최소 여백 (라벨이 들어갈 공간)
const FORCE_COLLIDE_PADDING = 30;

function isForceSimAvailable() {
  return typeof d3 !== 'undefined' && typeof d3.forceSimulation === 'function';
}

//시드 고정 난수. 같은 초기 배치에서 항상 같은 결과가 나오므로
//미리 계산한 최종 배치와 애니메이션이 도착하는 배치가 일치한다.
function _seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function _createForceSim(nodes, links) {
  return d3.forceSimulation(nodes)
    .randomSource(_seededRandom(42))
    .alphaDecay(0.035)
    .velocityDecay(0.4)
    .force('link', d3.forceLink(links).id(d => d.id)
      //중심 간 거리이므로 두 노드의 반지름을 더해 원 사이 간격을 일정하게 유지
      .distance(l => {
        const base = FORCE_PARAMS.linkDistance;
        return Math.max(base * 0.65, base - l.refCount * 3) + l.source.r + l.target.r;
      })
      .strength(FORCE_LINK_STRENGTH))
    .force('charge', d3.forceManyBody().strength(-FORCE_PARAMS.repel))
    .force('collide', d3.forceCollide(d => d.r + FORCE_COLLIDE_PADDING).strength(0.9))
    .force('x', d3.forceX(0).strength(FORCE_PARAMS.center))
    .force('y', d3.forceY(0).strength(FORCE_PARAMS.center))
    .stop();
}

//파일 뷰 노드에 물리 레이아웃을 적용한다. renderGraph에서 cy.add() 직후 호출.
function runForceLayout() {
  stopForceSim();
  if (!cy) return;

  const cyNodes = cy.nodes('[type="file-node"]');
  const cyEdges = cy.edges('[type="aggregated"]');
  if (cyNodes.empty()) return;

  //x/y를 비워두면 d3가 중심 근처 나선형으로 초기 배치한다 (퍼져나가는 애니메이션의 시작점)
  const makeNodes = () => cyNodes.map(n => ({ id: n.id(), r: (n.data('size') || 20) / 2 }));
  const makeLinks = () => cyEdges.map(e => ({
    source: e.data('source'),
    target: e.data('target'),
    refCount: e.data('refCount') || 1,
  }));

  //1) 최종 배치를 미리 계산해 뷰포트를 맞춘다 (애니메이션 중 화면이 흔들리지 않게)
  const preNodes = makeNodes();
  const preSim = _createForceSim(preNodes, makeLinks());
  const ticks = Math.ceil(Math.log(preSim.alphaMin()) / Math.log(1 - preSim.alphaDecay()));
  preSim.tick(ticks);

  cy.batch(() => {
    for (const d of preNodes) cy.getElementById(d.id).position({ x: d.x, y: d.y });
  });
  cy.fit(cyNodes, 40);
  //노드가 적으면 fit이 과하게 확대해 카드(LOD) 단계로 넘어가므로 기본 배율로 제한
  if (cy.zoom() > 1.2) {
    cy.zoom(1.2);
    cy.center(cyNodes);
  }

  //2) 같은 초기 배치에서 시뮬레이션을 다시 실행하며 매 틱 화면에 반영
  const live = preNodes.length <= FORCE_LIVE_MAX_NODES;
  if (live) {
    _forceNodes = makeNodes();
    _forceSim = _createForceSim(_forceNodes, makeLinks());
  } else {
    //대규모: 이미 안정된 배치를 그대로 쓰고 드래그할 때만 시뮬레이션을 깨운다
    _forceNodes = preNodes;
    _forceSim = preSim;
  }
  _forceNodeById = new Map(_forceNodes.map(d => [d.id, d]));
  _forceSim.on('tick', _applyForcePositions);

  if (live) {
    _applyForcePositions();
    _forceSim.alpha(1).restart();
  }

  _bindForceDrag();
}

function _applyForcePositions() {
  //다른 뷰로 전환되었거나 요소가 제거되었으면 시뮬레이션 중지
  if (!cy || currentViewMode !== 'file' || !_forceNodes) {
    stopForceSim();
    return;
  }

  let stale = false;
  cy.batch(() => {
    for (const d of _forceNodes) {
      //드래그 중인 노드는 Cytoscape가 위치를 관리한다
      if (d.fx != null) continue;
      const node = cy.getElementById(d.id);
      if (node.empty()) {
        stale = true;
        break;
      }
      node.position({ x: d.x, y: d.y });
    }
  });
  if (stale) stopForceSim();
}

function _bindForceDrag() {
  const selector = 'node[type="file-node"]';
  let heated = false;

  const pin = (evt) => {
    const d = _forceNodeById && _forceNodeById.get(evt.target.id());
    if (!d) return null;
    const p = evt.target.position();
    d.fx = p.x;
    d.fy = p.y;
    return d;
  };

  const onGrab = (evt) => {
    pin(evt);
  };

  //클릭만 했을 때 그래프가 출렁이지 않도록 실제로 끌기 시작할 때 시뮬레이션을 데운다
  const onDrag = (evt) => {
    if (!pin(evt) || !_forceSim) return;
    if (!heated) {
      heated = true;
      _forceSim.alphaTarget(0.3).restart();
    }
  };

  //놓으면 고정을 풀어 옵시디언처럼 다시 물리에 맡긴다
  const onFree = (evt) => {
    const d = _forceNodeById && _forceNodeById.get(evt.target.id());
    if (d) {
      d.fx = null;
      d.fy = null;
    }
    if (_forceSim && heated) _forceSim.alphaTarget(0);
    heated = false;
  };

  cy.on('grab', selector, onGrab);
  cy.on('drag', selector, onDrag);
  cy.on('free', selector, onFree);
  _forceHandlers = { selector, onGrab, onDrag, onFree };
}

function stopForceSim() {
  if (_forceSim) {
    _forceSim.on('tick', null);
    _forceSim.stop();
  }
  if (_forceHandlers && cy) {
    const { selector, onGrab, onDrag, onFree } = _forceHandlers;
    cy.off('grab', selector, onGrab);
    cy.off('drag', selector, onDrag);
    cy.off('free', selector, onFree);
  }
  _forceSim = null;
  _forceNodes = null;
  _forceNodeById = null;
  _forceHandlers = null;
}
