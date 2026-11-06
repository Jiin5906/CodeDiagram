'use strict';

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const c = {
  purple: (s) => `\x1b[38;2;167;139;250m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[38;2;103;232;249m${s}\x1b[0m`,
  green:  (s) => `\x1b[38;2;74;222;128m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

const OPEN_CMD = { darwin: 'open', win32: 'start', linux: 'xdg-open' };
const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const URL  = `http://${HOST}:${PORT}`;

function openBrowser(url) {
  const cmd = OPEN_CMD[os.platform()];
  if (!cmd) {
    console.log(`\n  ${c.dim(`브라우저를 직접 열어주세요: ${url}`)}\n`);
    return;
  }
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

function startServer(projectPath) {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '../../server/index.js');
    const server = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT,
        HOST,
        DEFAULT_PROJECT_PATH: projectPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    server.stdout.on('data', (data) => {
      if (data.toString().includes('Server running')) resolve(server);
    });

    server.stderr.on('data', (data) => {
      if (data.toString().includes('EADDRINUSE')) resolve(null);
    });

    server.on('error', reject);
    setTimeout(() => reject(new Error('서버 시작 타임아웃')), 5000);
  });
}

async function runAll(projectPath) {
  console.log(`\n  ${c.purple('서버 시작 중...')}\n`);

  let server;
  try {
    server = await startServer(projectPath);
  } catch (err) {
    console.log(`\n  ${c.dim(`서버 시작 실패: ${err.message}`)}\n`);
    return;
  }

  if (server) {
    console.log(`  ${c.green('✓')} 서버 실행 완료`);
  } else {
    console.log(`  ${c.dim('이미 서버가 실행 중입니다.')}`);
  }
  console.log(`  ${c.dim('현재 프로젝트 분석 중...')}`);
  const browserUrl = `${URL}/?source=${encodeURIComponent(projectPath)}`;

  console.log(`  ${c.cyan('→')} ${URL}\n`);
  openBrowser(browserUrl);

  process.on('exit', () => server?.kill());
  process.on('SIGINT', () => { server?.kill(); process.exit(0); });
}

module.exports = { runAll };
