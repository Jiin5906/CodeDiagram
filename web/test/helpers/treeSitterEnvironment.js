//tree-sitter를 Jest 워커 프로세스당 한 번만 로드하는 테스트 환경이다.
//tree-sitter 0.22의 JS 래퍼(index.js)는 로드될 때 Tree.prototype.rootNode를 getter로 덮어쓴다.
//Jest는 테스트 파일마다 모듈을 새로 로드하지만 네이티브 애드온(.node)은 프로세스에서 공유되므로,
//같은 워커에서 두 번째 테스트 파일이 래퍼를 다시 로드하면 rootNode가 undefined가 된다.
//(워커 배정 순서에 따라 테스트가 무작위로 실패하던 원인)
//그래서 여기서 실제 Node require로 한 번만 로드하고, 테스트 코드에는 treeSitterShim.js로 넘겨준다.
const { TestEnvironment } = require('jest-environment-node');
const TreeSitter = require('tree-sitter');

class TreeSitterEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.__TREE_SITTER__ = TreeSitter;
  }
}

module.exports = TreeSitterEnvironment;
