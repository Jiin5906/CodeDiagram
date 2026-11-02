//인코딩 자동 판별 파일 읽기 유틸리티
//UTF-8을 우선 시도하고, Windows Visual Studio/Unity C# 등에서 흔히 저장되는
//EUC-KR(CP949) 인코딩 파일을 깨짐 없이 UTF-8 문자열로 디코딩한다.

const fs = require('fs');

/**
 * 버퍼 또는 바이트 배열을 UTF-8 또는 EUC-KR로 디코딩한다.
 * @param {Buffer} buffer
 * @returns {string}
 */
function decodeTextBuffer(buffer) {
  if (!buffer || buffer.length === 0) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (_utfErr) {
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch (_eucErr) {
      return buffer.toString('utf-8');
    }
  }
}

/**
 * 파일을 읽어 UTF-8 또는 EUC-KR로 자동 판별하여 문자열로 반환한다.
 * @param {string} filePath
 * @returns {string}
 */
function readSourceFile(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const buffer = fs.readFileSync(filePath);
  return decodeTextBuffer(buffer);
}

module.exports = { decodeTextBuffer, readSourceFile };
