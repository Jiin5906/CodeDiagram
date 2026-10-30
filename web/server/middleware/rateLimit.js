//요청 횟수 제한 공용 함수다. 로그인 시도 제한과 AI 호출 제한이 같이 쓴다.
//express-rate-limit 의존성 대신 메모리 Map으로 직접 구현했다. 서버를 재시작하면 기록이 사라진다.
//고정 윈도우 방식이라 윈도우 경계에서 순간적으로 최대 2배까지 몰릴 수 있지만 이 규모에서는 문제 삼지 않는다.

//만료된 기록을 정리하는 주기 (기록 횟수 기준)
const PURGE_EVERY = 100;

//windowMs 동안 key별로 max회까지 허용하는 제한기를 만든다.
//take(key, max, res): 허용이면 true, 초과면 429를 응답하고 false
function createRateLimiter({ windowMs, code, message }) {
  //key → { count, resetAt }
  const buckets = new Map();
  let takes = 0;

  //떠난 IP·세션의 기록이 메모리에 쌓이지 않게 가끔 한꺼번에 지운다
  function purgeExpired(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  function take(key, max, res) {
    const now = Date.now();
    if (++takes % PURGE_EVERY === 0) purgeExpired(now);

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: message, code });
      return false;
    }
    return true;
  }

  //테스트에서 기록을 비운다
  function reset() {
    buckets.clear();
    takes = 0;
  }

  return { take, reset };
}

module.exports = { createRateLimiter };
