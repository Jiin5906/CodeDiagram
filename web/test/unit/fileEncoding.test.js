const { decodeTextBuffer } = require('../../server/utils/fileEncoding');

describe('fileEncoding utility', () => {
  test('decodes valid UTF-8 buffer', () => {
    const text = '안녕하세요 Hello World';
    const buf = Buffer.from(text, 'utf-8');
    expect(decodeTextBuffer(buf)).toBe(text);
  });

  test('decodes EUC-KR / CP949 buffer without garbled text', () => {
    //'비네트 최대 세기' EUC-KR 바이트
    const text = '비네트 최대 세기';
    const eucKrBuf = Buffer.from([
      0xba, 0xf1, 0xb3, 0xd7, 0xc6, 0xae, 0x20, 0xc3, 0xd6, 0xb4, 0xeb, 0x20, 0xbc, 0xbc, 0xb1,
      0xe2,
    ]);
    expect(decodeTextBuffer(eucKrBuf)).toBe(text);
  });

  test('handles empty or null buffer', () => {
    expect(decodeTextBuffer(Buffer.alloc(0))).toBe('');
    // @ts-expect-error test null input
    expect(decodeTextBuffer(null)).toBe('');
  });
});
