//기본 테스트 설정: 단위 / 계약 / 통합 테스트. 네트워크와 실제 외부 API는 사용하지 않는다.
//실제 API 테스트(test/live)는 jest.live.config.js로만 실행한다.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/fixtures/', '<rootDir>/test/live/'],
  //분석용으로 클론한 저장소(web/repos)의 package.json·테스트를 수집하지 않는다
  modulePathIgnorePatterns: ['<rootDir>/repos/'],
  setupFiles: ['<rootDir>/test/helpers/setupEnv.js'],
  collectCoverageFrom: ['server/**/*.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],
  //처음 측정치(2026-10-05: 구문 88 / 분기 71 / 함수 92 / 줄 88%) 바로 아래로 시작해서 점차 올린다
  coverageThreshold: {
    global: { statements: 85, branches: 68, functions: 90, lines: 85 },
  },
};
