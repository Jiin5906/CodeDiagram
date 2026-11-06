'use strict';

const path = require('path');
const chokidar = require('chokidar');
const { buildGraph } = require('../../server/services/graphBuilder');
const { parseFile } = require('../../server/services/parser');
const { readSourceFile } = require('../../server/utils/fileEncoding');
const { renderSummary } = require('../display/summary');
const { renderMetrics } = require('../display/metrics');

const c = {
  purple: (s) => `\x1b[38;2;167;139;250m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[38;2;103;232;249m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

const LANG_MAP = {
  py: 'python', ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', java: 'java',
  cpp: 'cpp', h: 'cpp', cs: 'csharp', html: 'html', css: 'css',
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

async function runAnalyze(projectPath) {
  console.log(`\n  ${c.purple('분석 중...')}\n`);

  let graph;
  try {
    graph = await buildGraph(projectPath);
  } catch (err) {
    if (err.message.includes('지원하는 파일을 찾을 수 없습니다')) {
      console.log(`\n  ${c.dim('지원하는 파일이 없습니다.')}`);
      console.log(`  ${c.dim('(.py .ts .js .java .cpp .cs .html .css)')}\n`);
      return;
    }
    throw err;
  }

  renderSummary(graph);

  console.log(`  ${c.dim('파일 저장 시 자동으로 복잡도를 보여줍니다. (Ctrl+C 로 종료)')}\n`);

  const watcher = chokidar.watch('**/*.{py,ts,tsx,js,jsx,java,cpp,h,cs,html,css}', {
    cwd: projectPath,
    ignored: ['**/node_modules/**', '**/.git/**', '**/build/**', '**/dist/**'],
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on('change', async (relativePath) => {
    const absolutePath = path.join(projectPath, relativePath);
    const ext = path.extname(relativePath).slice(1);
    const language = LANG_MAP[ext];
    if (!language) return;

    try {
      const code = readSourceFile(absolutePath);
      parseFile(code, relativePath, language);

      graph = await buildGraph(projectPath);
      const updated = buildMetricsMap(graph);

      console.log(`\n  ${c.cyan('[저장 감지]')} ${relativePath}`);
      renderMetrics(relativePath, updated[relativePath]);
    } catch (err) {
      console.log(`\n  ${c.dim(`[파싱 오류] ${relativePath}: ${err.message}`)}\n`);
    }
  });

  watcher.on('error', (err) => {
    console.error(`\n  감시 오류: ${err.message}\n`);
  });
}

module.exports = { runAnalyze };
