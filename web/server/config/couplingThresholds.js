//결합도 판정 기준 (CR-RFC-2026-002)
//이 파일이 결합도 판정의 기준이 되기 때문에 나중에 수정을 할 때면 여기서 수정만 하면된다.
const COUPLING_CRITERIA = Object.freeze({
  name: 'CR-RFC-2026-002',
  //0.0 ≤ I ≤ SAFE_MAX -> SAFE
  safeMax: 0.4,
  //SAFE_MAX < I ≤ WARN_MAX → WARN, 그보다 크면 HAZARD
  warnMax: 0.7,
  //I와 관계없이 Ce가 이 값 이상이면 HAZARD
  ceHazard: 10,
});

module.exports = { COUPLING_CRITERIA };
