//실제 외부 API(Anthropic)를 호출하는 테스트 전용 설정이다. 비용이 발생한다.
//실행: npm run test:live
const base = require('./jest.config');

//이 설정으로 실행할 때만 live 테스트를 켠다
process.env.RUN_LIVE_API = '1';

module.exports = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/', '/fixtures/'],
  testMatch: ['<rootDir>/test/live/**/*.test.js'],
  setupFiles: [],
  coverageThreshold: undefined,
};
