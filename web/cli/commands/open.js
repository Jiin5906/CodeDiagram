'use strict';

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const { buildGraph } = require('../../server/services/graphBuilder');
const { loadConfig }  = require('../config');

const c = {
  purple: (s) => `\x1b[38;2;167;139;250m${s}\x1b[0m`,
  green:  (s) => `\x1b[38;2;74;222;128m${s}\x1b[0m`,
  yellow: (s) => `\x1b[38;2;251;191;36m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

const OPEN_CMD = { darwin: 'open', win32: 'start', linux: 'xdg-open' };

function openFile(absolutePath) {
  const { editor } = loadConfig();

  if (editor) {
    //저장된 에디터 명령어로 파일을 연다.
    spawn(editor, [absolutePath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  //설정된 에디터가 없으면 OS 기본 앱으로 연다.
  const cmd = OPEN_CMD[os.platform()];
  if (!cmd) {
    console.log(`\n  ${c.dim(`직접 열어주세요: ${absolutePath}`)}\n`);
    return;
  }
  spawn(cmd, [absolutePath], { detached: true, stdio: 'ignore' }).unref();
}

function buildFileList(graph) {
  const files = [];
  for (const node of graph.nodes ?? []) {
    if (node.data.type === 'file') {
      files.push(node.data.fullPath ?? node.data.id);
    }
  }
  return files;
}

async function runOpen(projectPath, query) {
  if (!query) {
    console.log(`\n  ${c.dim('사용법: /open <파일명 또는 경로 일부>')}\n`);
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

  const allFiles = buildFileList(graph);
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

  const absolutePath = path.join(projectPath, matches[0]);
  console.log(`\n  ${c.green('→')} ${matches[0]} 을 엽니다...\n`);
  openFile(absolutePath);
}

module.exports = { runOpen };
