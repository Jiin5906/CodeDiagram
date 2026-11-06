'use strict';

const { statusIcon } = require('./metrics');

const c = {
  purple: (s) => `\x1b[38;2;167;139;250m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[38;2;103;232;249m${s}\x1b[0m`,
  yellow: (s) => `\x1b[38;2;251;191;36m${s}\x1b[0m`,
  red:    (s) => `\x1b[38;2;248;113;113m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

function renderFileCounts(fileCounts) {
  const entries = Object.entries(fileCounts)
    .filter(([, count]) => count > 0)
    .map(([lang, count]) => `${lang} ${count}`);

  console.log(`  ${c.dim('파일')} ${entries.join(c.dim('  ·  '))}\n`);
}

function renderIssueList(metricsByFile) {
  const hazards = [];
  const warns = [];

  for (const [file, metrics] of Object.entries(metricsByFile)) {
    if (metrics.status === 'HAZARD') hazards.push([file, metrics]);
    else if (metrics.status === 'WARN') warns.push([file, metrics]);
  }

  if (hazards.length === 0 && warns.length === 0) {
    console.log(`  ${c.dim('주의가 필요한 파일이 없습니다.')}\n`);
    return;
  }

  console.log(`  ${c.bold('── 주의가 필요한 파일 ──────────────────────')}\n`);

  for (const [file, metrics] of hazards) {
    console.log(`  ${statusIcon('HAZARD')}  ${file}  ${c.dim(`CBO ${metrics.cbo}`)}`);
  }
  for (const [file, metrics] of warns) {
    console.log(`  ${statusIcon('WARN')}    ${file}  ${c.dim(`CBO ${metrics.cbo}`)}`);
  }

  console.log();
}

function renderCycles(cycles) {
  if (!cycles || cycles.length === 0) return;

  console.log(`  ${c.bold('── 순환 의존성 ──────────────────────────────')}\n`);

  for (const cycle of cycles) {
    const p = cycle.join(c.dim(' → '));
    console.log(`  ${c.yellow('⚠')}  ${p}`);
  }

  console.log();
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

function renderSummary(graph) {
  const { fileCounts, diagnostics } = graph;
  const total = Object.values(fileCounts).reduce((a, b) => a + b, 0);

  console.log(`\n  ${c.purple(`파일 ${total}개 분석 완료`)}`);
  console.log();

  renderFileCounts(fileCounts);
  renderIssueList(graph.metricsByFile ?? buildMetricsMap(graph));
  renderCycles(diagnostics?.cycles?.files ?? []);

  console.log(`  ${c.dim('/all 을 입력하면 브라우저에서 전체 그래프를 볼 수 있습니다.')}\n`);
}

module.exports = { renderSummary };
