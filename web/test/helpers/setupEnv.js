//기본 테스트에서는 셸에 설정된 실제 API 키를 지워서 실수로 유료 API가 호출되지 않게 한다.
delete process.env.ANTHROPIC_API_KEY;

//clone 폴더(repos/)를 워커별 임시 폴더로 돌린다.
//gitService는 불러올 때 남은 임시 clone 폴더를 지우므로, 워커끼리 같은 폴더를 쓰면 서로의 clone을 지운다.
//개발자의 실제 web/repos 캐시도 테스트가 건드리지 않게 된다.
const os = require('os');
const path = require('path');
process.env.REPOS_DIR = path.join(
  os.tmpdir(),
  `codediagram-test-repos-${process.env.JEST_WORKER_ID || 0}`,
);
