//비대 코드 판정 기준 — 파일·클래스가 너무 커서 분할을 권하는 기준이다.
//숫자를 바꿀 때는 이 파일만 고치면 된다 (진단 탭·그래프 글로우·테스트가 모두 여기를 읽는다).
const SIZE_CRITERIA = Object.freeze({
  //비대 파일: 줄 수 또는 함수 수 중 하나라도 넘으면 해당 등급
  file: Object.freeze({ warnLines: 500, hazardLines: 1000, warnFuncs: 30, hazardFuncs: 50 }),
  //비대 클래스(God Class): 줄 수 또는 메서드 수 중 하나라도 넘으면 해당 등급
  klass: Object.freeze({ warnLines: 300, hazardLines: 600, warnMethods: 20, hazardMethods: 35 }),
});

module.exports = { SIZE_CRITERIA };
