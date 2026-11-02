//파일 심볼릭 링크를 만들 수 있는 환경인지 판정한다.
//Windows에서는 개발자 모드·관리자 권한이 없으면 EPERM이 나므로, 그때는 링크 테스트를 CI(Linux)에서만 돌린다.
const fs = require('fs');
const os = require('os');
const path = require('path');

function checkFileSymlink() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-symcheck-'));
  try {
    fs.writeFileSync(path.join(dir, 'a'), '');
    fs.symlinkSync(path.join(dir, 'a'), path.join(dir, 'b'));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { canSymlink: checkFileSymlink() };
