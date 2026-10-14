//테스트에서 require('tree-sitter')를 이 파일로 연결한다 (jest.config.js의 moduleNameMapper).
//실제 모듈은 treeSitterEnvironment.js가 워커당 한 번만 로드해 둔 것을 쓴다.
module.exports = globalThis.__TREE_SITTER__;
