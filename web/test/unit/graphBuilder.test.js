const path = require('path');
const { buildGraph } = require('../../server/services/graphBuilder');

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'sample_project');

describe('graphBuilder', () => {
  test('builds a graph from fixture project', async () => {
    const graph = await buildGraph(fixturesDir);

    expect(graph.nodes).toBeDefined();
    expect(graph.edges).toBeDefined();
    expect(graph.warnings).toBeDefined();
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  });

  test('creates file nodes', async () => {
    const graph = await buildGraph(fixturesDir);
    const fileNodes = graph.nodes.filter((n) => n.data.type === 'file');

    expect(fileNodes.length).toBeGreaterThanOrEqual(3);
    const fileIds = fileNodes.map((n) => n.data.id);
    expect(fileIds).toContain('main.py');
    expect(fileIds).toContain('utils.py');
    expect(fileIds).toContain('math_ops.py');
  });

  test('creates function nodes with parent references', async () => {
    const graph = await buildGraph(fixturesDir);
    const funcNodes = graph.nodes.filter((n) => n.data.type === 'function');

    expect(funcNodes.length).toBeGreaterThan(0);
    for (const node of funcNodes) {
      expect(node.data.parent).toBeDefined();
      expect(node.data.code).toBeDefined();
    }
  });

  test('creates edges with references', async () => {
    const graph = await buildGraph(fixturesDir);

    expect(graph.edges.length).toBeGreaterThan(0);
    for (const edge of graph.edges) {
      expect(edge.source).toBeDefined();
      expect(edge.target).toBeDefined();
      expect(edge.references.length).toBeGreaterThan(0);
    }
  });

  test('rejects a directory without supported files', async () => {
    await expect(
      buildGraph(path.join(__dirname, '..', 'fixtures', 'nonexistent_empty')),
    ).rejects.toThrow();
  });
});
