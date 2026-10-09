//계약 테스트: 모든 언어 파서의 출력이 schemas/parser-output-schema.json을 따르는지 검사한다.
//파서 출력 형식을 바꾸면 스키마도 함께 갱신해야 이 테스트가 통과한다.
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020').default;
const { parseFile } = require('../../server/services/parser');
const { findFiles } = require('../../server/services/gitService');
const { fixture } = require('../helpers/fixtures');
const schema = require('../../schemas/parser-output-schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

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

const cases = PROJECTS.flatMap((project) =>
  findFiles(fixture(project)).files.map((/** @type {any} */ f) => [
    `${project}/${f.relativePath}`,
    f,
  ]),
);

describe('parser output schema', () => {
  test.each(cases)('%s', (_name, file) => {
    const code = fs.readFileSync(file.path, 'utf-8');
    const result = parseFile(code, file.relativePath, file.language);
    const ok = validate(result);
    expect(ok ? [] : validate.errors).toEqual([]);
  });

  test('covers every supported fixture language', () => {
    const languages = new Set(cases.map(([, f]) => f.language));
    expect([...languages].sort()).toEqual(
      ['cpp', 'csharp', 'css', 'html', 'java', 'javascript', 'python', 'typescript'].sort(),
    );
  });
});

//스키마 파일 자체가 유효한 JSON Schema인지
test('schema file is a valid JSON Schema', () => {
  const raw = fs.readFileSync(
    path.join(__dirname, '../../schemas/parser-output-schema.json'),
    'utf8',
  );
  expect(() => new Ajv2020({ strict: false }).compile(JSON.parse(raw))).not.toThrow();
});
