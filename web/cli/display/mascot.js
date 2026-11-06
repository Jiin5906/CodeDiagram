'use strict';

//픽셀 아트 (9행 × 13열, 위아래 빈 행 제거)
const ART = [
  '....LLPPP....',
  '...LPPPPPP...',
  '..LPPEPEPPP..',
  '..PPPEPEPPRR.',
  '..PPPPPPRRR..',
  '..LRRRRRRDD..',
  '.RRRDDDDDDD..',
  '...DDDDDDD...',
  '....DDDDD....',
];

const RGB = {
  L: [196, 181, 253],
  P: [167, 139, 250],
  D: [109, 91, 208],
  E: [248, 250, 255],
  R: [103, 232, 249],
};

const C256 = { L: 183, P: 141, D: 62, E: 231, R: 87 };
const use256 = process.env.TERM_PROGRAM === 'Apple_Terminal';

const paint = (p) =>
  use256 ? `\x1b[48;5;${C256[p]}m` : `\x1b[48;2;${RGB[p].join(';')}m`;

//픽셀당 2칸으로 출력한다. `.`은 터미널 배경색(투명)으로 처리한다.
function renderMascot() {
  const lines = ART.map((row) =>
    [...row].map((p) =>
      p === '.' ? '\x1b[0m  ' : `${paint(p)}  `
    ).join('') + '\x1b[0m'
  );

  //마스코트 오른쪽에 타이틀을 나란히 붙인다.
  lines[3] += `   \x1b[38;2;167;139;250mCodeDiagram\x1b[0m  \x1b[2mv1.0\x1b[0m`;
  lines[4] += `   \x1b[2m코드 복잡도 분석 도구\x1b[0m`;

  return lines.join('\n');
}

module.exports = { renderMascot };
