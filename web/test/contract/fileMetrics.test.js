//계약 테스트: 파일 결합도 지표(CR-RFC-2026-002)가 schemas/file-metrics-schema.json을 따르는지 검사한다.
//파일 노드와 diagnostics.coupling의 형식을 바꾸면 스키마도 함께 갱신해야 이 테스트가 통과한다.
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020').default;
const { buildGraph } = require('../../server/services/graphBuilder');
const { fixture } = require('../helpers/fixtures');
const schema = require('../../schemas/file-metrics-schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(schema);
//파일 하나의 항목 (스키마 루트)과 진단 탭 요약 ($defs/CouplingSummary)
const validateEntry = ajv.getSchema(schema.$id);
const validateSummary = ajv.getSchema(`${schema.$id}#/$defs/CouplingSummary`);

const PROJECTS = [
  'sample_project',
  'cpp_project',
  'csharp_project',
  'js_project',
  'ts_project',
  'java_project',
  'web_project',
  'inline_script_project',
];

//파일 노드를 응답 스키마 형태({ node_id, metrics, refactor_target })로 바꾼다
function toEntry({ data }) {
  return { node_id: data.id, metrics: data.metrics, refactor_target: data.refactor_target };
}

const graphs = {};
beforeAll(async () => {
  for (const project of PROJECTS) graphs[project] = await buildGraph(fixture(project));
});

describe('file metrics schema', () => {
  test.each(PROJECTS)('%s — 모든 파일 노드', (project) => {
    const fileNodes = graphs[project].nodes.filter((n) => n.data.type === 'file');
    expect(fileNodes.length).toBeGreaterThan(0);
    for (const node of fileNodes) {
      const ok = validateEntry(toEntry(node));
      expect(ok ? [] : { node: node.data.id, errors: validateEntry.errors }).toEqual([]);
    }
  });

  test.each(PROJECTS)('%s — diagnostics.coupling', (project) => {
    const ok = validateSummary(graphs[project].diagnostics.coupling);
    expect(ok ? [] : validateSummary.errors).toEqual([]);
  });

  test('픽스처 전체에서 네 가지 등급이 모두 나온다', () => {
    const statuses = new Set(
      PROJECTS.flatMap((p) => graphs[p].diagnostics.coupling.files.map((e) => e.metrics.status)),
    );
    expect([...statuses].sort()).toEqual(['HAZARD', 'N/A', 'SAFE', 'WARN']);
  });
});

//스키마가 실제로 잘못된 응답을 걸러내는지 (계약이 너무 느슨하지 않은지)
describe('file metrics schema rejects broken entries', () => {
  const valid = {
    node_id: 'a.py',
    metrics: {
      ca: 0,
      ce: 2,
      cbo: 2,
      instability: 1,
      status: 'HAZARD',
      hazard_reasons: ['instability'],
    },
    refactor_target: true,
  };
  const withMetrics = (patch, extra = {}) => ({
    ...valid,
    metrics: { ...valid.metrics, ...patch },
    ...extra,
  });

  test('올바른 예시는 통과한다', () => {
    expect(validateEntry(valid)).toBe(true);
  });

  test.each([
    ['instability가 문자열', withMetrics({ instability: '1' })],
    ['instability가 1 초과', withMetrics({ instability: 1.2 })],
    ['ca가 음수', withMetrics({ ca: -1 })],
    ['알 수 없는 status', withMetrics({ status: 'DANGER' })],
    ['HAZARD인데 사유가 없음', withMetrics({ hazard_reasons: [] })],
    [
      'WARN인데 사유가 있음',
      withMetrics({ status: 'WARN', instability: 0.5 }, { refactor_target: false }),
    ],
    [
      'N/A인데 instability가 숫자',
      withMetrics(
        { ca: 0, ce: 0, cbo: 0, instability: 0, status: 'N/A', hazard_reasons: [] },
        { refactor_target: false },
      ),
    ],
    [
      'SAFE인데 instability가 null',
      withMetrics(
        { status: 'SAFE', instability: null, hazard_reasons: [] },
        { refactor_target: false },
      ),
    ],
    ['HAZARD인데 refactor_target이 false', { ...valid, refactor_target: false }],
    ['예전 필드 couplingScore가 남음', { ...valid, couplingScore: 1 }],
    ['metrics에 없는 필드', withMetrics({ distance: 0.2 })],
  ])('%s', (_name, entry) => {
    expect(validateEntry(entry)).toBe(false);
  });
});

//스키마 파일 자체가 유효한 JSON Schema인지
test('schema file is a valid JSON Schema', () => {
  const raw = fs.readFileSync(
    path.join(__dirname, '../../schemas/file-metrics-schema.json'),
    'utf8',
  );
  expect(() => new Ajv2020({ strict: false }).compile(JSON.parse(raw))).not.toThrow();
});
