//테스트 픽스처 경로 모음
const path = require('path');

const FIXTURES = path.join(__dirname, '..', 'fixtures');

module.exports = {
  FIXTURES,
  fixture: (/** @type {string} */ name) => path.join(FIXTURES, name),
};
