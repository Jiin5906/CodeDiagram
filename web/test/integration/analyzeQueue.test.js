//통합 테스트: /api/analyze의 동시 분석 제한과 연결 끊김 처리
//buildGraph를 mock으로 바꿔 끝나는 시점을 테스트가 정한다.
const http = require('http');
const request = require('supertest');

jest.mock('../../server/services/graphBuilder', () => ({ buildGraph: jest.fn() }));

const { buildGraph } = require('../../server/services/graphBuilder');
const app = require('../../server/index');
const { fixture } = require('../helpers/fixtures');

const source = fixture('sample_project');

//끝나는 시점을 테스트가 정하는 buildGraph. finishAll()을 부르면 진행 중인 분석이 빈 그래프로 끝난다.
function pendingGraph() {
  /** @type {Array<() => void>} */
  const finishers = [];
  jest
    .mocked(buildGraph)
    .mockImplementation(
      () => new Promise((resolve) => finishers.push(() => resolve({ nodes: [], edges: [] }))),
    );
  return { finishAll: () => finishers.splice(0).forEach((finish) => finish()) };
}

//buildGraph가 count번 호출될 때까지 기다린다 (요청이 대기열을 지나 분석을 시작했는지 확인)
async function waitForCalls(count) {
  for (let i = 0; i < 200 && jest.mocked(buildGraph).mock.calls.length < count; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(jest.mocked(buildGraph).mock.calls.length).toBe(count);
}

describe('POST /api/analyze 동시 분석 제한', () => {
  const saved = {};
  const ENV = {
    MAX_CONCURRENT_ANALYSES: '1',
    MAX_QUEUED_ANALYSES: '1',
    ANALYSIS_QUEUE_WAIT_MS: '2000',
  };
  /** @type {http.Server} */
  let server;
  let port = 0;

  //연결 끊김 테스트에서 직접 소켓을 닫으려고 실제 포트를 연다 (127.0.0.1, 테스트 동안만)
  beforeAll((done) => {
    server = http.createServer(app).listen(0, '127.0.0.1', () => {
      port = /** @type {import('net').AddressInfo} */ (server.address()).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.mocked(buildGraph).mockReset();
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

  function analyze() {
    return request(server).post('/api/analyze').send({ source });
  }

  test('상한과 대기열을 넘으면 503, 자리가 나면 대기 중이던 요청이 이어서 처리된다', async () => {
    const { finishAll } = pendingGraph();
    const first = analyze().then((res) => res);
    await waitForCalls(1);
    const second = analyze().then((res) => res);
    //두 번째가 대기열에 들어갈 시간을 준다
    await new Promise((resolve) => setTimeout(resolve, 50));

    //세 번째는 대기열도 차서 바로 503
    const third = await analyze();
    expect(third.status).toBe(503);
    expect(third.body.code).toBe('SERVER_BUSY');
    expect(third.headers['retry-after']).toBe('5');

    finishAll();
    expect((await first).status).toBe(200);
    await waitForCalls(2);
    finishAll();
    expect((await second).status).toBe(200);
  });

  test('분석이 에러로 끝나도 자리를 반납한다', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(buildGraph).mockRejectedValueOnce(new Error('boom'));
    expect((await analyze()).status).toBe(500);
    errorSpy.mockRestore();

    jest.mocked(buildGraph).mockResolvedValueOnce({ nodes: [], edges: [] });
    expect((await analyze()).status).toBe(200);
  });

  test('브라우저가 연결을 끊으면 분석에 abort 신호가 간다', async () => {
    const { finishAll } = pendingGraph();
    const body = JSON.stringify({ source });
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/analyze',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    });
    req.on('error', () => {});
    req.end(body);

    await waitForCalls(1);
    const { signal } = jest.mocked(buildGraph).mock.calls[0][1];
    expect(signal.aborted).toBe(false);

    req.destroy();
    for (let i = 0; i < 200 && !signal.aborted; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(signal.aborted).toBe(true);
    finishAll();
  });
});
