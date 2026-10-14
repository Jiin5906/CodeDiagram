//graphBuilder 결합도 연결 테스트: 파일 노드·진단·제안이 같은 지표(CR-RFC-2026-002)를 쓰는지 검사한다.
const { buildGraph } = require('../../server/services/graphBuilder');
const { fixture } = require('../helpers/fixtures');

const STATUSES = ['SAFE', 'WARN', 'HAZARD', 'N/A'];

let pyGraph;
let jsGraph;
beforeAll(async () => {
  pyGraph = await buildGraph(fixture('sample_project'));
  jsGraph = await buildGraph(fixture('js_project'));
});

const fileNodesOf = (graph) => graph.nodes.filter((n) => n.data.type === 'file');
const functionNodesOf = (graph) =>
  graph.nodes.filter((n) => n.data.type === 'function' || n.data.type === 'js-function');

describe('응답 형태', () => {
  test('예전 결합도 필드를 내보내지 않는다', () => {
    expect(pyGraph).not.toHaveProperty('couplingScores');
    expect(pyGraph.diagnostics).not.toHaveProperty('couplingIssues');
    expect(pyGraph.diagnostics.coupling.criteria.name).toBe('CR-RFC-2026-002');
  });

  test('진단의 결합도 항목은 분석한 파일 수만큼 있다', () => {
    expect(pyGraph.diagnostics.coupling.files).toHaveLength(3);
    expect(jsGraph.diagnostics.coupling.files).toHaveLength(3);
  });
});

describe('파일 노드', () => {
  test('모든 파일 노드에 metrics와 refactor_target이 있다', () => {
    for (const graph of [pyGraph, jsGraph]) {
      for (const { data } of fileNodesOf(graph)) {
        expect(data).not.toHaveProperty('couplingScore');
        expect(STATUSES).toContain(data.metrics.status);
        expect(data.metrics.cbo).toBe(data.metrics.ca + data.metrics.ce);
        expect(data.refactor_target).toBe(data.metrics.status === 'HAZARD');
      }
    }
  });

  test('파일 노드와 진단 탭은 같은 지표를 쓴다', () => {
    const byFile = new Map(pyGraph.diagnostics.coupling.files.map((e) => [e.file, e]));
    for (const { data } of fileNodesOf(pyGraph)) {
      expect(byFile.get(data.fullPath).metrics).toEqual(data.metrics);
    }
  });

  test('node_id는 실제 파일 노드 ID다 (티어 언어는 경로, 웹 언어는 접미사)', () => {
    const pyIds = new Set(fileNodesOf(pyGraph).map((n) => n.data.id));
    for (const entry of pyGraph.diagnostics.coupling.files) {
      expect(entry.node_id).toBe(entry.file);
      expect(pyIds.has(entry.node_id)).toBe(true);
    }
    const jsIds = new Set(fileNodesOf(jsGraph).map((n) => n.data.id));
    for (const entry of jsGraph.diagnostics.coupling.files) {
      expect(entry.node_id).toBe(`${entry.file}__javascript`);
      expect(jsIds.has(entry.node_id)).toBe(true);
    }
  });
});

describe('함수 노드', () => {
  test('inDegree·outDegree는 연결된 고유 함수 수(호출 엣지 수)다', () => {
    for (const graph of [pyGraph, jsGraph]) {
      for (const { data } of functionNodesOf(graph)) {
        expect(data).not.toHaveProperty('inboundRefCount');
        expect(data).not.toHaveProperty('outboundRefCount');
        expect(data.inDegree).toBe(graph.edges.filter((e) => e.target === data.id).length);
        expect(data.outDegree).toBe(graph.edges.filter((e) => e.source === data.id).length);
      }
    }
  });

  test('티어 라벨은 "N곳에서 참조"다', () => {
    for (const graph of [pyGraph, jsGraph]) {
      const tierLabels = graph.nodes.filter((n) => n.data.type === 'tier').map((n) => n.data.label);
      expect(tierLabels.length).toBeGreaterThan(0);
      for (const label of tierLabels) expect(label).toMatch(/^\d+곳에서 참조$/);
    }
  });
});

describe('리팩토링 제안', () => {
  test('결합도 제안 수는 HAZARD 파일 수와 같다', () => {
    for (const graph of [pyGraph, jsGraph]) {
      const hazards = graph.diagnostics.coupling.files.filter((e) => e.metrics.status === 'HAZARD');
      const couplingSuggestions = graph.suggestions.filter((s) => s.type === 'coupling');
      expect(couplingSuggestions).toHaveLength(hazards.length);
    }
  });
});
