//단위 테스트: AI 캐시가 개수 상한을 넘으면 가장 오래 쓰지 않은 항목부터 지우는지(LRU) 검사한다.
const cache = require('../../server/services/cacheService');

describe('cacheService LRU', () => {
  const originalMax = process.env.CACHE_MAX_ENTRIES;

  beforeEach(() => {
    cache.clear();
    process.env.CACHE_MAX_ENTRIES = '3';
  });

  afterEach(() => {
    if (originalMax === undefined) delete process.env.CACHE_MAX_ENTRIES;
    else process.env.CACHE_MAX_ENTRIES = originalMax;
  });

  test('상한을 넘으면 가장 먼저 넣은 항목이 사라진다', () => {
    cache.set('a', 'A');
    cache.set('b', 'B');
    cache.set('c', 'C');
    cache.set('d', 'D');
    expect(cache.size()).toBe(3);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('d')).toBe('D');
  });

  test('최근에 읽은 항목은 남고 그다음으로 오래된 항목이 사라진다', () => {
    cache.set('a', 'A');
    cache.set('b', 'B');
    cache.set('c', 'C');
    expect(cache.get('a')).toBe('A');
    cache.set('d', 'D');
    expect(cache.get('a')).toBe('A');
    expect(cache.get('b')).toBeNull();
  });

  test('같은 키를 다시 넣으면 값이 바뀌고 개수는 늘지 않는다', () => {
    cache.set('a', 'A');
    cache.set('a', 'A2');
    expect(cache.size()).toBe(1);
    expect(cache.get('a')).toBe('A2');
  });
});
