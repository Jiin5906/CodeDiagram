'use strict';

const path = require('path');
const { buildGraph }      = require('../../server/services/graphBuilder');
const { explainCoupling } = require('../../server/services/aiService');
const { readSourceFile }  = require('../../server/utils/fileEncoding');
const { loadConfig }      = require('../config');

const c = {
  purple: (s) => `\x1b[38;2;167;139;250m${s}\x1b[0m`,
  yellow: (s) => `\x1b[38;2;251;191;36m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

function buildMetricsMap(graph) {
  const map = {};
  for (const node of graph.nodes ?? []) {
    if (node.data.type === 'file' && node.data.metrics) {
      map[node.data.fullPath ?? node.data.id] = node.data.metrics;
    }
  }
  return map;
}

//대상 파일의 참조됨(incoming)·참조함(outgoing) 파일 목록을 추출한다.
function buildRefMap(graph, targetFile) {
  const allEdges = [
    ...(graph.edges ?? []),
    ...(graph.inheritanceEdges ?? []),
    ...(graph.variableEdges ?? []),
    ...(graph.webEdges ?? []),
  ];
  const incoming = new Set();
  const outgoing = new Set();
  for (const edge of allEdges) {
    const from = typeof edge.source === 'string' ? edge.source.split('::')[0] : null;
    const to   = typeof edge.target === 'string' ? edge.target.split('::')[0] : null;
    if (!from || !to || from === to) continue;
    if (to === targetFile)   incoming.add(from);
    if (from === targetFile) outgoing.add(to);
  }
  return { incoming: [...incoming].sort(), outgoing: [...outgoing].sort() };
}

async function runRefactor(projectPath, query) {
  if (!query) {
    console.log(`\n  ${c.dim('사용법: /refactor <파일명 또는 경로 일부>')}\n`);
    return;
  }

  const { apiKey } = loadConfig();
  if (!apiKey) {
    console.log(`\n  ${c.dim('API 키가 설정되지 않았습니다.')}`);
    console.log(`  ${c.dim('~/.codediagram_config.json 에 apiKey 를 추가하세요.')}\n`);
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
  const allFiles   = Object.keys(metricsMap);
  const q          = query.toLowerCase();
  const matches    = allFiles.filter((f) => f.toLowerCase().includes(q));

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

  const targetFile   = matches[0];
  const absolutePath = path.join(projectPath, targetFile);

  let code = '';
  try {
    code = readSourceFile(absolutePath);
  } catch (_) { /* 파일 읽기 실패해도 AI 분석 진행 */ }

  const metrics      = metricsMap[targetFile];
  const dependencies = buildRefMap(graph, targetFile);

  console.log(`  ${c.dim('AI 분석 중...')}\n`);

  try {
    const result = await explainCoupling(
      { filePath: targetFile, code, metrics, dependencies },
      apiKey,
    );

    console.log(`  ${c.bold('── AI 리팩토링 제안 ───────────────────────────')}\n`);
    console.log(`  ${result.split('\n').join('\n  ')}\n`);
  } catch (err) {
    if (err.code === 'AI_KEY_REJECTED') {
      console.log(`\n  ${c.dim('API 키가 거부되었습니다. 키를 확인해주세요.')}\n`);
    } else {
      console.log(`\n  ${c.dim(`AI 분석 중 오류가 발생했습니다: ${err.message}`)}\n`);
    }
  }
}

module.exports = { runRefactor };
