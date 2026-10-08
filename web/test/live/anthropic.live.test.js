//실제 Anthropic API를 호출하는 테스트다. 비용이 발생하므로 기본 실행(npm test)에서는 제외된다.
//실행: npm run test:live  (web/.env 또는 셸에 ANTHROPIC_API_KEY 필요)
require('dotenv').config({ path: __dirname + '/../../.env' });
const { explainFunction } = require('../../server/services/aiService');

const enabled = process.env.RUN_LIVE_API === '1' && !!process.env.ANTHROPIC_API_KEY;
const describeLive = enabled ? describe : describe.skip;

describeLive('Anthropic API (live)', () => {
  test('explains a tiny function', async () => {
    const text = await explainFunction({
      name: 'add',
      code: 'def add(a, b):\n    return a + b',
      docstring: '',
      comment: '',
      filePath: 'math_ops.py',
    });
    expect(typeof text).toBe('string');
    expect(/** @type {string} */ (text).length).toBeGreaterThan(0);
  }, 30000);
});
