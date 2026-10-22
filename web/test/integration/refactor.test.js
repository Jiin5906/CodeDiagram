//통합 테스트: /api/refactor의 검증·캐시·에러 응답. aiService의 API 호출부만 mock으로 바꾼다.
const request = require('supertest');

jest.mock('../../server/services/aiService', () => ({
  ...jest.requireActual('../../server/services/aiService'),
  buildRefactorRequest: jest.fn(),
  suggestRefactoring: jest.fn(),
}));

const { buildRefactorRequest, suggestRefactoring } = require('../../server/services/aiService');
const cache = require('../../server/services/cacheService');
const { registerProject } = require('../../server/services/projectRegistry');
const { fixture } = require('../helpers/fixtures');
const app = require('../../server/index');

const analysisId = registerProject(fixture('sample_project'));
const suggestion = {
  type: 'cycle',
  title: '함수 간 순환 호출 발견',
  description: 'd',
  suggestion: 's',
  relatedNodes: ['main.py::process_data'],
};
const result = {
  summary: '요약',
  steps: [],
  changes: [],
  graphDelta: { addedNodes: [], removedEdges: [], addedEdges: [] },
  risks: [],
};

beforeEach(() => {
  cache.clear();
  jest.mocked(buildRefactorRequest).mockReset();
  jest.mocked(suggestRefactoring).mockReset();
  //실제 요청 본문 대신 문맥이 담긴 가짜 본문을 만든다 (캐시 키로 쓰인다)
  jest
    .mocked(buildRefactorRequest)
    .mockImplementation((context) => /** @type {any} */ ({ model: 'test-model', context }));
});

test('서버가 읽은 대상 코드로 AI를 한 번 호출하고 두 번째는 캐시로 응답한다', async () => {
  jest.mocked(suggestRefactoring).mockResolvedValue(result);

  const first = await request(app).post('/api/refactor').send({ analysisId, suggestion });
  expect(first.status).toBe(200);
  expect(first.body).toEqual({ result, model: 'test-model', cached: false, warnings: [] });

  const context = jest.mocked(buildRefactorRequest).mock.calls[0][0];
  expect(context.targets[0].code.startsWith('def process_data(data):')).toBe(true);

  const second = await request(app).post('/api/refactor').send({ analysisId, suggestion });
  expect(second.body.cached).toBe(true);
  expect(suggestRefactoring).toHaveBeenCalledTimes(1);
});

test.each([
  ['analysisId 없음', { suggestion }, 400],
  ['만료된 analysisId', { analysisId: 'nope', suggestion }, 404],
  ['잘못된 제안', { analysisId, suggestion: { ...suggestion, type: 'x' } }, 400],
  [
    '루트 밖 경로',
    { analysisId, suggestion: { ...suggestion, relatedNodes: ['../js_project/app.js'] } },
    403,
  ],
])('%s → %i', async (_, body, status) => {
  const res = await request(app).post('/api/refactor').send(body);
  expect(res.status).toBe(status);
  expect(suggestRefactoring).not.toHaveBeenCalled();
});

test('프롬프트가 비어 있으면 503과 작성 안내', async () => {
  jest.mocked(buildRefactorRequest).mockImplementation(() => {
    throw Object.assign(new Error('x'), { code: 'REFACTOR_PROMPT_MISSING' });
  });
  const res = await request(app).post('/api/refactor').send({ analysisId, suggestion });
  expect(res.status).toBe(503);
  expect(res.body.error).toContain('refactorPrompt.js');
});

test('API 키가 없으면 503', async () => {
  jest
    .mocked(suggestRefactoring)
    .mockRejectedValue(new Error('ANTHROPIC_API_KEY is not configured'));
  const res = await request(app).post('/api/refactor').send({ analysisId, suggestion });
  expect(res.status).toBe(503);
});

test('AI 응답 형식이 깨지면 502이고 캐시하지 않는다', async () => {
  jest
    .mocked(suggestRefactoring)
    .mockRejectedValue(Object.assign(new Error('x'), { code: 'AI_BAD_RESPONSE' }));
  const res = await request(app).post('/api/refactor').send({ analysisId, suggestion });
  expect(res.status).toBe(502);
  expect(cache.size()).toBe(0);
});
