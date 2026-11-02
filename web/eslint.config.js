// ESLint flat config
// - server/, test/: Node.js CommonJS
// - public/js/: 번들러 없이 <script>로 로드되는 브라우저 전역 스크립트
const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    ignores: [
      'node_modules/',
      'repos/',
      'coverage/',
      'test/fixtures/',
      'test/.benchmark_tmp/',
      'docs/',
      //npm run vendor로 복사한 라이브러리 원본 (우리 코드가 아님)
      'public/vendor/',
    ],
  },
  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['server/**/*.js', 'test/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    files: ['server/**/*.js'],
    ...security.configs.recommended,
    rules: {
      ...security.configs.recommended.rules,
      // obj[key] 접근을 모두 경고해 오탐이 대부분이라 끈다 (프로토타입 오염은 리뷰로 확인)
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.jest } },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, cytoscape: 'readonly', hljs: 'readonly' },
    },
    rules: {
      // 파일 간 함수·상태를 전역으로 공유하므로(index.html 로드 순서 의존) 파일 단위로는 판단할 수 없다
      'no-undef': 'off',
      'no-unused-vars': ['error', { vars: 'local', argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  // 포맷 관련 규칙은 Prettier에 맡긴다 (항상 마지막)
  prettier,
];
