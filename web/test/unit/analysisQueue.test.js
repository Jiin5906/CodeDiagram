//단위 테스트: 동시 분석 제한이 상한까지만 바로 허용하고, 넘치면 대기열에서 기다리거나 503으로 거절하는지 검사한다.
//모듈 상태(running, waiting)를 테스트마다 새로 시작하려고 jest.isolateModules로 매번 다시 불러온다.

/** @returns {typeof import('../../server/services/analysisQueue')} */
function freshQueue() {
  let queue;
  jest.isolateModules(() => {
    queue = require('../../server/services/analysisQueue');
  });
  return /** @type {any} */ (queue);
}

describe('analysisQueue', () => {
  const saved = {};
  const ENV = {
    MAX_CONCURRENT_ANALYSES: '2',
    MAX_QUEUED_ANALYSES: '1',
    ANALYSIS_QUEUE_WAIT_MS: '50',
  };

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test('상한까지는 바로 자리를 준다', async () => {
    const queue = freshQueue();
    await queue.acquire();
    await queue.acquire();
    expect(queue.stats()).toEqual({ running: 2, waiting: 0 });
  });

  test('자리가 없으면 기다렸다가 반납되면 받는다', async () => {
    const queue = freshQueue();
    const release = await queue.acquire();
    await queue.acquire();
    const waiting = queue.acquire();
    expect(queue.stats()).toEqual({ running: 2, waiting: 1 });

    release();
    await expect(waiting).resolves.toBeInstanceOf(Function);
    expect(queue.stats()).toEqual({ running: 2, waiting: 0 });
  });

  test('대기열이 차면 바로 503', async () => {
    const queue = freshQueue();
    await queue.acquire();
    await queue.acquire();
    const waiting = queue.acquire();
    await expect(queue.acquire()).rejects.toMatchObject({ status: 503, code: 'SERVER_BUSY' });
    waiting.catch(() => {});
  });

  test('기다리는 시간이 지나면 503으로 빠진다', async () => {
    const queue = freshQueue();
    await queue.acquire();
    await queue.acquire();
    await expect(queue.acquire()).rejects.toMatchObject({ status: 503, retryAfter: 5 });
    expect(queue.stats().waiting).toBe(0);
  });

  test('기다리는 중 연결이 끊기면 대기열에서 빠진다', async () => {
    const queue = freshQueue();
    await queue.acquire();
    await queue.acquire();
    const controller = new AbortController();
    const waiting = queue.acquire(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(queue.stats().waiting).toBe(0);
  });

  test('반납 함수를 두 번 불러도 자리는 한 번만 돌아온다', async () => {
    const queue = freshQueue();
    const release = await queue.acquire();
    release();
    release();
    expect(queue.stats().running).toBe(0);
  });
});
