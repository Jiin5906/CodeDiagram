//AI 설명 캐시 함수다.
//함수 코드의 SHA해시를 키로 사용하는 인매모리 캐시다.
//같은 코드에 대해 AI를 반복 호출하지 않도록 했다.

const { sha256 } = require('../utils/hash');

const cache = new Map();

function getCacheKey(code) {
  return sha256(code);
}

function get(code) {
  const key = getCacheKey(code);
  return cache.get(key) || null;
}

function set(code, explanation) {
  const key = getCacheKey(code);
  cache.set(key, explanation);
}

function size() {
  return cache.size;
}

function clear() {
  cache.clear();
}

module.exports = { get, set, size, clear };
