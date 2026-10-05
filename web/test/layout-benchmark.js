//레이아웃 알고리즘 비교 벤치마크
//사용법: node test/layout-benchmark.js

const { performance } = require('perf_hooks');

//더미 그래프 데이터 생성
function generateGraph(nodeCount) {
  const nodes = [];
  const edges = [];
  const fileCount = Math.max(1, Math.floor(nodeCount / 5));

  //파일 노드
  for (let f = 0; f < fileCount; f++) {
    nodes.push({ data: { id: `file_${f}`, type: 'file', label: `file_${f}.py` } });
  }

  //함수 노드
  for (let i = 0; i < nodeCount; i++) {
    const fileIdx = i % fileCount;
    nodes.push({
      data: {
        id: `func_${i}`,
        type: 'function',
        label: `func_${i}`,
        parent: `file_${fileIdx}`,
      },
    });
  }

  //랜덤 엣지 (노드 수의 1.5배)
  const edgeCount = Math.floor(nodeCount * 1.5);
  for (let i = 0; i < edgeCount; i++) {
    const src = Math.floor(Math.random() * nodeCount);
    let tgt = Math.floor(Math.random() * nodeCount);
    if (src === tgt) tgt = (tgt + 1) % nodeCount;
    edges.push({
      source: `func_${src}`,
      target: `func_${tgt}`,
      references: [{ file: 'test.py', line: i + 1, caller: `func_${src}` }],
    });
  }

  return { nodes, edges, tiers: [1], fileCounts: { python: fileCount } };
}

//벤치마크 실행
function runBenchmark() {
  const sizes = [10, 50, 100];
  const results = [];

  console.log('=== CodeDiagram Layout Benchmark ===\n');

  for (const size of sizes) {
    const graph = generateGraph(size);
    const nodeCount = graph.nodes.length;
    const edgeCount = graph.edges.length;

    //fcose 시뮬레이션 (실제 cytoscape 없이 데이터 구조 처리 시간 측정)
    const start = performance.now();

    //노드 위치 계산 시뮬레이션
    const positions = {};
    for (const node of graph.nodes) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * size * 10;
      positions[node.data.id] = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    }

    //겹침 감지
    let overlapCount = 0;
    const posArr = Object.values(positions);
    for (let i = 0; i < posArr.length; i++) {
      for (let j = i + 1; j < posArr.length; j++) {
        const dx = posArr[i].x - posArr[j].x;
        const dy = posArr[i].y - posArr[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < 30) {
          overlapCount++;
        }
      }
    }

    const elapsed = performance.now() - start;

    results.push({
      size,
      nodes: nodeCount,
      edges: edgeCount,
      time: elapsed.toFixed(2),
      overlaps: overlapCount,
    });
  }

  //결과 테이블 출력
  console.log('| Nodes | Total Elements | Edges | Time (ms) | Overlaps |');
  console.log('|-------|---------------|-------|-----------|----------|');
  for (const r of results) {
    console.log(
      `| ${r.size.toString().padStart(5)} | ${r.nodes.toString().padStart(13)} | ${r.edges.toString().padStart(5)} | ${r.time.padStart(9)} | ${r.overlaps.toString().padStart(8)} |`,
    );
  }

  console.log('\n* 실제 레이아웃 성능은 브라우저에서 render-benchmark.html로 측정하세요.');
}

runBenchmark();
