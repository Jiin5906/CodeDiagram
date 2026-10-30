//동시 분석 수 제한이다.
//분석(clone + 파싱)은 CPU·메모리를 많이 쓰므로 동시에 maxConcurrent개까지만 돌리고,
//넘치면 짧은 대기열(maxQueued개, 최대 waitMs)에서 기다리게 한다. 대기열도 차거나 시간이 지나면 503.
//대기 중 브라우저가 연결을 끊으면(signal abort) 대기열에서 빼서 빈 요청이 자리를 차지하지 않게 한다.

const DEFAULTS = { maxConcurrent: 2, maxQueued: 4, waitMs: 30000 };
const RETRY_AFTER_SEC = 5;

let running = 0;
//{ grant, fail } 목록. 먼저 온 순서대로 자리를 받는다.
const waiting = [];

//.env 값을 테스트에서 바꿔 끼울 수 있게 호출할 때마다 읽는다
function setting(envName, fallback) {
  const value = Number(process.env[envName]);
  return value > 0 ? value : fallback;
}

function busyError() {
  return Object.assign(new Error('서버가 다른 분석을 처리 중입니다. 잠시 후 다시 시도해 주세요.'), {
    status: 503,
    code: 'SERVER_BUSY',
    retryAfter: RETRY_AFTER_SEC,
  });
}

function abortError() {
  return Object.assign(new Error('분석 요청이 취소되었습니다.'), { name: 'AbortError' });
}

//자리를 반납하는 함수를 만든다. 두 번 불러도 한 번만 반납된다.
function makeRelease() {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    running--;
    const next = waiting.shift();
    if (next) next.grant();
  };
}

//분석 자리를 얻으면 반납 함수로 resolve한다. 자리를 못 얻으면 503 에러, 취소되면 AbortError로 reject.
function acquire(signal) {
  if (signal?.aborted) return Promise.reject(abortError());

  if (running < setting('MAX_CONCURRENT_ANALYSES', DEFAULTS.maxConcurrent)) {
    running++;
    return Promise.resolve(makeRelease());
  }
  if (waiting.length >= setting('MAX_QUEUED_ANALYSES', DEFAULTS.maxQueued)) {
    return Promise.reject(busyError());
  }

  return new Promise((resolve, reject) => {
    const entry = {
      grant() {
        cleanup();
        running++;
        resolve(makeRelease());
      },
      fail(err) {
        cleanup();
        const index = waiting.indexOf(entry);
        if (index !== -1) waiting.splice(index, 1);
        reject(err);
      },
    };
    const onAbort = () => entry.fail(abortError());
    const timer = setTimeout(
      () => entry.fail(busyError()),
      setting('ANALYSIS_QUEUE_WAIT_MS', DEFAULTS.waitMs),
    );
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    waiting.push(entry);
  });
}

//테스트용 현재 상태
function stats() {
  return { running, waiting: waiting.length };
}

module.exports = { acquire, stats };
