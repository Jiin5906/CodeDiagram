#!/usr/bin/env node
'use strict';

const readline = require('readline');
const os       = require('os');
const path     = require('path');
const fs       = require('fs');

const c = {
  purple: (s) => `\x1b[38;2;167;139;250m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[38;2;103;232;249m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

const { renderMascot } = require('./display/mascot');
const { saveConfig }   = require('./config');

//첫 실행 여부: 홈 디렉터리에 플래그 파일이 없으면 최초 실행으로 판단하고 파일을 생성한다.
const FLAG_PATH        = path.join(os.homedir(), '.codediagram_seen');
const API_KEY_PATTERN  = /^sk-ant-[A-Za-z0-9_-]{20,200}$/;

function isFirstRun() {
  if (fs.existsSync(FLAG_PATH)) return false;
  fs.writeFileSync(FLAG_PATH, '1');
  return true;
}

//Enter 키를 기다린다.
function waitEnter(rl) {
  return new Promise((resolve) => {
    rl.question(`  ${c.dim('Enter 를 눌러 계속하세요...')}`, () => {
      console.log();
      resolve();
    });
  });
}

async function runTutorial(rl) {
  //환영 메시지
  console.log(`\n  ${c.bold('CodeDiagram 에 오신 걸 환영합니다!')}\n`);
  console.log(`  ${c.dim('코드 복잡도와 의존 관계를 터미널에서 바로 분석하는 도구입니다.')}`);
  console.log(`  ${c.dim('3단계로 빠르게 설정합니다.')}\n`);
  await waitEnter(rl);

  //1단계: 에디터
  console.log(`  ${c.bold('── 1단계 / 3  에디터 설정 ───────────────────')}\n`);
  console.log(`  ${c.dim('/open 명령어로 파일을 열 때 사용할 에디터를 선택하세요.')}`);
  console.log(`  ${c.dim('/edit 으로 언제든 바꿀 수 있습니다.')}\n`);
  await askEditor(rl);

  //2단계: API 키
  console.log(`  ${c.bold('── 2단계 / 3  AI 기능 설정 ──────────────────')}\n`);
  console.log(`  ${c.dim('Anthropic API 키를 등록하면 /refactor 명령으로')}`);
  console.log(`  ${c.dim('AI 리팩토링 제안을 받을 수 있습니다.')}`);
  console.log(`  ${c.dim('/edit 으로 언제든 다시 입력할 수 있습니다.')}`);
  console.log(`  ${c.dim('키가 없으면 Enter 로 건너뜁니다.')}\n`);
  await askApiKey(rl);

  //3단계: 사용법 안내
  console.log(`  ${c.bold('── 3단계 / 3  사용법 안내 ───────────────────')}\n`);
  console.log(`  ${c.dim('준비 완료! 아래 명령어로 시작하세요.')}\n`);
  console.log(`  ${c.cyan('/analyze')}           ${c.dim('현재 디렉터리 분석 + 저장 감지')}`);
  console.log(`  ${c.cyan('/check')}  ${c.dim('<파일명>')}   ${c.dim('특정 파일 복잡도 조회')}`);
  console.log(`  ${c.cyan('/refactor')} ${c.dim('<파일명>')}   ${c.dim('AI 리팩토링 제안')}`);
  console.log(`  ${c.cyan('/open')}   ${c.dim('<파일명>')}   ${c.dim('에디터로 파일 열기')}`);
  console.log(`  ${c.cyan('/all')}               ${c.dim('브라우저로 전체 시각화')}`);
  console.log(`  ${c.cyan('/edit')}              ${c.dim('에디터·API 키 재설정')}`);
  console.log(`  ${c.cyan('/help')}              ${c.dim('명령어 목록 보기')}\n`);
  console.log(`  ${c.purple('/analyze')} ${c.dim('를 입력해 시작해보세요!')}\n`);
}

//선택 가능한 에디터 목록
const EDITORS = [
  { label: 'VS Code',         cmd: 'code'      },
  { label: 'Cursor',          cmd: 'cursor'    },
  { label: 'Android Studio',  cmd: 'studio'    },
  { label: 'IntelliJ IDEA',   cmd: 'idea'      },
  { label: 'WebStorm',        cmd: 'webstorm'  },
  { label: 'Sublime Text',    cmd: 'subl'      },
  { label: 'Vim',             cmd: 'vim'       },
  { label: 'Neovim',          cmd: 'nvim'      },
];

//에디터를 화살표 키로 선택한다.
async function askEditor(rl) {
  const items = [
    ...EDITORS,
    { label: '직접 입력', cmd: null   },
    { label: '건너뜀',   cmd: 'skip' },
  ];

  return new Promise((resolve) => {
    let idx = 0;

    //목록을 커서 위치부터 덮어쓴다.
    function renderList() {
      process.stdout.write(`\x1b[${items.length}A`);
      for (let i = 0; i < items.length; i++) {
        const sel    = i === idx;
        const marker = sel ? c.purple('▶') : ' ';
        const label  = sel ? c.bold(items[i].label) : items[i].label;
        process.stdout.write(`\r\x1b[K  ${marker} ${label}\n`);
      }
    }

    //초기 출력
    console.log(`\n  ${c.bold('에디터를 선택하세요')}`);
    console.log(`  ${c.dim('↑↓ 이동  Enter 선택')}\n`);
    for (let i = 0; i < items.length; i++) {
      const sel    = i === idx;
      const marker = sel ? c.purple('▶') : ' ';
      const label  = sel ? c.bold(items[i].label) : items[i].label;
      process.stdout.write(`  ${marker} ${label}\n`);
    }
    process.stdout.write('\x1b[?25l'); //커서 숨김

    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin, rl);

    function onKeypress(str, key) {
      if (!key) return;
      if (key.ctrl && key.name === 'c') { cleanup(); process.exit(0); }
      if      (key.name === 'up')     { idx = (idx - 1 + items.length) % items.length; renderList(); }
      else if (key.name === 'down')   { idx = (idx + 1) % items.length; renderList(); }
      else if (key.name === 'return') { cleanup(); handleSelect(); }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdout.write('\x1b[?25h'); //커서 복원
      rl.resume();
    }

    function handleSelect() {
      const chosen = items[idx];
      if (chosen.cmd === 'skip') {
        console.log(`\n  ${c.dim('건너뜁니다.')}\n`);
        resolve();
      } else if (chosen.cmd === null) {
        rl.question(`\n  ${c.dim('명령어를 입력하세요: ')}`, (custom) => {
          const cmd = custom.trim();
          if (cmd) {
            saveConfig({ editor: cmd });
            console.log(`\n  ${c.dim(`'${cmd}' 로 저장했습니다.`)}\n`);
          } else {
            console.log(`\n  ${c.dim('건너뜁니다.')}\n`);
          }
          resolve();
        });
      } else {
        saveConfig({ editor: chosen.cmd });
        console.log(`\n  ${c.dim(`'${chosen.label}' 로 저장했습니다.`)}\n`);
        resolve();
      }
    }

    //현재 틱의 버퍼(예: /tutorial 입력 시 엔터)가 소비된 뒤 리스너를 등록한다.
    setImmediate(() => process.stdin.on('keypress', onKeypress));
  });
}

//Anthropic API 키를 입력받아 검증 후 저장한다.
async function askApiKey(rl) {
  return new Promise((resolve) => {
    rl.question(
      `  ${c.dim('Anthropic API 키를 입력하세요 (AI 리팩토링 기능 사용)')}\n` +
      `  ${c.dim('(Enter 로 건너뜀)')}\n` +
      `  ${c.purple('>')} `,
      async (answer) => {
        const apiKey = answer.trim();
        if (!apiKey) {
          console.log(`\n  ${c.dim('건너뜁니다.')}\n`);
          resolve();
          return;
        }
        if (!API_KEY_PATTERN.test(apiKey)) {
          console.log(`\n  ${c.dim('sk-ant- 로 시작하는 키를 입력해야 합니다. 건너뜁니다.')}\n`);
          resolve();
          return;
        }
        console.log(`\n  ${c.dim('키 확인 중...')}`);
        try {
          const { verifyApiKey } = require('../server/services/aiService');
          const valid = await verifyApiKey(apiKey);
          if (valid) {
            saveConfig({ apiKey });
            console.log(`  ${c.dim('저장했습니다.')}\n`);
          } else {
            console.log(`  ${c.dim('유효하지 않은 키입니다. 나중에 다시 설정하세요.')}\n`);
          }
        } catch (_) {
          console.log(`  ${c.dim('키 확인 중 오류가 발생했습니다. 나중에 다시 시도하세요.')}\n`);
        }
        resolve();
      }
    );
  });
}

function showWelcome() {
  console.log(renderMascot());
  console.log();
}

function showHelp() {
  console.log();
  console.log(`  ${c.cyan('/analyze')}          현재 디렉토리 분석 + 저장 감지`);
  console.log(`  ${c.cyan('/check')}   ${c.dim('<파일명>')}  특정 파일의 복잡도 조회`);
  console.log(`  ${c.cyan('/refactor')} ${c.dim('<파일명>')}  AI 리팩토링 제안`);
  console.log(`  ${c.cyan('/open')}    ${c.dim('<파일명>')}  특정 파일을 에디터로 열기`);
  console.log(`  ${c.cyan('/all')}              브라우저로 전체 시각화 열기`);
  console.log(`  ${c.cyan('/edit')}             에디터·API 키 재설정`);
  console.log(`  ${c.cyan('/help')}             명령어 목록`);
  console.log(`  ${c.cyan('/exit')}             종료\n`);
  // /tutorial 은 내부 테스트용으로 목록에서 제외
}

async function handleCommand(cmd, projectPath, rl) {
  const trimmed = cmd.trim();

  if (trimmed === '/analyze') {
    const { runAnalyze } = require('./commands/analyze');
    await runAnalyze(projectPath);
  } else if (trimmed.startsWith('/check')) {
    const query = trimmed.slice('/check'.length).trim();
    const { runCheck } = require('./commands/check');
    await runCheck(projectPath, query);
  } else if (trimmed.startsWith('/refactor')) {
    const query = trimmed.slice('/refactor'.length).trim();
    const { runRefactor } = require('./commands/refactor');
    await runRefactor(projectPath, query);
  } else if (trimmed.startsWith('/open')) {
    const query = trimmed.slice('/open'.length).trim();
    const { runOpen } = require('./commands/open');
    await runOpen(projectPath, query);
  } else if (trimmed === '/all') {
    const { runAll } = require('./commands/all');
    await runAll(projectPath);
  } else if (trimmed === '/tutorial') {
    await runTutorial(rl);           // 숨김 명령어 (내부 테스트용)
  } else if (trimmed === '/edit') {
    await runTutorial(rl);
  } else if (trimmed === '/help') {
    showHelp();
  } else if (trimmed === '/exit' || trimmed === '/quit') {
    console.log(`\n  ${c.dim('종료합니다.')}\n`);
    process.exit(0);
  } else if (trimmed !== '') {
    console.log(`\n  ${c.dim('알 수 없는 명령어입니다. /help 를 입력하세요.')}\n`);
  }
}

async function main() {
  const projectPath = process.cwd();

  showWelcome();

  //rl을 먼저 생성해야 첫 실행 질문 함수에서 사용할 수 있다.
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.purple('>')} `,
  });

  if (isFirstRun()) {
    await runTutorial(rl);
  }

  rl.prompt();

  rl.on('line', async (line) => {
    await handleCommand(line, projectPath, rl);
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n  ${c.dim('종료합니다.')}\n`);
    process.exit(0);
  });
}

main().catch(console.error);
