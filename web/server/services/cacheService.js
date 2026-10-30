//AI 설명 캐시 함수다.
//함수 코드의 SHA해시를 키로 사용하는 인매모리 캐시다.
//같은 코드에 대해 AI를 반복 호출하지 않도록 했다.
//서로 다른 코드를 계속 보내 메모리가 무한히 늘지 않게 개수 상한을 두고, 가장 오래 쓰지 않은 항목부터 지운다(LRU).

const { sha256 } = require('../utils/hash');

//해설 하나가 수 KB라 수 MB 수준. .env의 CACHE_MAX_ENTRIES로 바꿀 수 있다.
const DEFAULT_MAX_ENTRIES = 500;

const cache = new Map();

function maxEntries() {
  const value = Number(process.env.CACHE_MAX_ENTRIES);
  return value > 0 ? value : DEFAULT_MAX_ENTRIES;
}

function getCacheKey(code) {
  return sha256(code);
}

function get(code) {
  const key = getCacheKey(code);
  if (!cache.has(key)) return null;
  //최근 사용 순서를 유지하려고 지웠다가 다시 넣는다
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function set(code, explanation) {
  const key = getCacheKey(code);
  cache.delete(key);
  cache.set(key, explanation);
  //Map은 넣은 순서를 지키므로 맨 앞이 가장 오래 쓰지 않은 항목이다
  while (cache.size > maxEntries()) {
    cache.delete(cache.keys().next().value);
  }
}

function size() {
  return cache.size;
}

function clear() {
  cache.clear();
}

module.exports = { get, set, size, clear };
