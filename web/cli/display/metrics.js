'use strict';

const path = require('path');

const c = {
  red:    (s) => `\x1b[38;2;248;113;113m${s}\x1b[0m`,
  yellow: (s) => `\x1b[38;2;251;191;36m${s}\x1b[0m`,
  green:  (s) => `\x1b[38;2;74;222;128m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[38;2;103;232;249m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

//터미널 하이퍼링크 생성
//지원 터미널이 존재한다(iTerm2, VS Code 터미널)에서 Cmd or Ctrl + 클릭으로 지원
function fileLink(text, absolutePath) {
  const url = `file://${absolutePath}`;
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function instabilityBar(value) {
  if (value === null) return c.dim('N/A');

  const filled = Math.round(value * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  if (value > 0.7) return c.red(bar);
  if (value > 0.4) return c.yellow(bar);
  return c.green(bar);
}

function statusIcon(status) {
  if (status === 'HAZARD') return c.red('✗ HAZARD');
  if (status === 'WARN')   return c.yellow('⚠ WARN');
  return c.green('✓ SAFE');
}

function renderMetrics(filePath, metrics) {
  const { ca, ce, instability, status } = metrics;
  const iVal = instability !== null ? instability.toFixed(2) : 'N/A';

  console.log();
  console.log(`  ${statusIcon(status)}  ${filePath}`);
  console.log();
  console.log(`  참조됨  ${c.green('↓')} ${ca}`);
  console.log(`  참조함  ${c.cyan('↑')} ${ce}`);
  console.log(`  불안정  ${instabilityBar(instability)}  ${iVal}`);
  console.log();
}

//참조됨(afferent)·참조함(efferent) 파일 목록을 출력한다.
//afferent: 이 파일을 의존하는 파일 배열
//efferent: 이 파일이 의존하는 파일 배열
function renderRefList(afferent, efferent, projectPath) {
  if (afferent.length > 0) {
    console.log(`  ${c.bold('── 참조됨 ─────────────────────────────────────')}`);
    console.log(`  ${c.dim(`이 파일을 의존하는 파일 (${afferent.length}개)`)}\n`);
    for (const f of afferent) {
      const display = projectPath ? fileLink(f, path.join(projectPath, f)) :
        f;
      console.log(`  ${c.green('↓')}  ${display}`);
    }
    console.log();
  }

  if (efferent.length > 0) {
    console.log(`  ${c.bold('── 참조함 ─────────────────────────────────────')}`);
    console.log(`  ${c.dim(`이 파일이 의존하는 파일 (${efferent.length}개)`)}\n`);
    for (const f of efferent) {
      const display = projectPath ? fileLink(f, path.join(projectPath, f)) : f;
      console.log(`  ${c.cyan('↑')}  ${display}`);
    }
    console.log();
  }

  if (afferent.length === 0 && efferent.length === 0) {
    console.log(`  ${c.dim('다른 파일과 참조 관계가 없습니다.')}\n`);
  }
}

module.exports = { renderMetrics, renderRefList, statusIcon, instabilityBar };
