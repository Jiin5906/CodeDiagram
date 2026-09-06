//문자열을 SHA256 해시로 변환하는 코드다.

const crypto = require('crypto');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

module.exports = { sha256 };
