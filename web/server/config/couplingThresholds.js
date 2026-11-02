//결합도 판정 기준 (CR-RFC-2026-002)
//이 파일이 결합도 판정의 기준이 되기 때문에 나중에 수정을 할 때면 여기서 수정만 하면된다.
const COUPLING_CRITERIA = Object.freeze({
  name: 'CR-RFC-2026-002',
  //0.0 ≤ I ≤ SAFE_MAX 또는 CBO < minCboWarn -> SAFE
  safeMax: 0.4,
  //SAFE_MAX < I ≤ WARN_MAX (CBO ≥ minCboWarn) → WARN, 그보다 크고 CBO ≥ minCboHazard이면 HAZARD
  warnMax: 0.7,
  //I > safeMax 일 때 WARN으로 판정하기 위한 최소 결합도 하한선 (소수 결합도 왜곡 방지)
  minCboWarn: 5,
  //I > warnMax 일 때 HAZARD로 판정하기 위한 최소 결합도 하한선 (제안서 CR-RFC-2026-001 기준)
  minCboHazard: 10,
  //I와 관계없이 Ce가 이 값 이상이면 HAZARD
  ceHazard: 10,
});

module.exports = { COUPLING_CRITERIA };
