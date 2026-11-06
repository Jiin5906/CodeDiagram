'use strict';

const { buildGraph } = require('../../server/services/graphBuilder');
const { renderMetrics, renderRefList } = require('../display/metrics');

const c = {
  purple: (s) => `\x1b[38;2;167;139;250m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[38;2;103;232;249m${s}\x1b[0m`,
  yellow: (s) => `\x1b[38;2;251;191;36m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

//모든 엣지를 순회해 대상 파일의 참조됨(afferent)·참조함(efferent) 파일 목록을 추출한다.
function buildRefMap(graph, targetFile) {
  const allEdges = [
    ...(graph.edges ?? []),
    ...(graph.inheritanceEdges ?? []),
    ...(graph.variableEdges ?? []),
    ...(graph.webEdges ?? []),
  ];

  const afferent = new Set(); //이 파일을 의존하는 파일
  const efferent = new Set(); //이 파일이 의존하는 파일

  for (const edge of allEdges) {
    const from = typeof edge.source === 'string' ? edge.source.split('::')[0] : null;
    const to   = typeof edge.target === 'string' ? edge.target.split('::')[0] : null;
    if (!from || !to || from === to) continue;

    if (to === targetFile)   afferent.add(from);
    if (from === targetFile) efferent.add(to);
  }

  return { afferent: [...afferent].sort(), efferent: [...efferent].sort() };
}

function buildMetricsMap(graph) {
  const map = {};
  for (const node of graph.nodes ?? []) {
    if (node.data.type === 'file' && node.data.metrics) {
      map[node.data.fullPath ?? node.data.id] = node.data.metrics;
    }
  }
  return map;
}

async function runCheck(projectPath, query) {
  if (!query) {
    console.log(`\n  ${c.dim('사용법: /check <파일명 또는 경로 일부>')}\n`);
    return;
  }

  console.log(`\n  ${c.purple('분석 중...')}\n`);

  let graph;
  try {
    graph = await buildGraph(projectPath);
  } catch (err) {
    if (err.message.includes('지원하는 파일을 찾을 수 없습니다')) {
      console.log(`\n  ${c.dim('지원하는 파일이 없습니다.')}\n`);
      return;
    }
    throw err;
  }

  const metricsMap = buildMetricsMap(graph);
  const allFiles = Object.keys(metricsMap);

  //입력값을 포함하는 파일 경로 목록 (대소문자 무시)
  const q = query.toLowerCase();
  const matches = allFiles.filter((f) => f.toLowerCase().includes(q));

  if (matches.length === 0) {
    console.log(`\n  ${c.dim(`'${query}' 에 해당하는 파일을 찾을 수 없습니다.`)}\n`);
    return;
  }

  if (matches.length > 1) {
    console.log(`\n  ${c.yellow('여러 파일이 일치합니다. 더 구체적으로 입력하세요.')}\n`);
    for (const f of matches) {
      console.log(`  ${c.dim('·')} ${f}`);
    }
    console.log();
    return;
  }

  //정확히 하나만 매칭된 경우 복잡도 + 참조 파일 목록 출력
  const targetFile = matches[0];
  renderMetrics(targetFile, metricsMap[targetFile]);

  const { afferent, efferent } = buildRefMap(graph, targetFile);
  renderRefList(afferent, efferent, projectPath);
}

module.exports = { runCheck };
