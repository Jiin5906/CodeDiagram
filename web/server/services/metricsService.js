//파일 단위 결합도 지표 서비스 (CR-RFC-2026-002)
//파일 하나를 모듈로 보고 Robert C. Martin의 Ca·Ce·I(불안정성)·CBO를 계산한다.
const { COUPLING_CRITERIA } = require('../config/couplingThresholds');

//노드 ID("파일 경로::이름")에서 파일 경로만 꺼냅니다.
function fileOf(nodeId) {
  return nodeId.split('::')[0];
}

//불안정성 지수와 Ce, CBO로 등급을 판정한다.
//소수 법칙(Law of Small Numbers)에 의한 왜곡 방지:
//- CBO < minCboWarn(5): 경량 모듈로 간주하여 항상 SAFE
//- minCboWarn(5) ≤ CBO < minCboHazard(10): I > safeMax(0.4)이면 WARN
//- CBO ≥ minCboHazard(10): I > warnMax(0.7)이면 HAZARD
//- Ce ≥ ceHazard(10): CBO와 무관하게 efferent 사유로 HAZARD
function judgeInstability(instability, ce, cbo = ce) {
  const { safeMax, warnMax, ceHazard, minCboHazard = 10, minCboWarn = 5 } = COUPLING_CRITERIA;
  const hazardReasons = [];
  if (instability > warnMax && cbo >= minCboHazard) hazardReasons.push('instability');
  if (ce >= ceHazard) hazardReasons.push('efferent');

  if (hazardReasons.length > 0) return { status: 'HAZARD', hazardReasons };
  if (instability > safeMax && cbo >= minCboWarn) return { status: 'WARN', hazardReasons };
  return { status: 'SAFE', hazardReasons };
}

//Ca·Ce로 불안정성 지수를 구하고 판정한다.
//판정은 반올림 전 값으로 하고, 응답에 싣는 instability만 소수점 셋째 자리로 반올림한다.
function classifyCoupling({ ca, ce }) {
  if (ca + ce === 0) {
    return { instability: null, status: 'N/A', hazardReasons: [] };
  }
  const cbo = ca + ce;
  const instability = ce / (ca + ce);
  const { status, hazardReasons } = judgeInstability(instability, ce, cbo);
  return { instability: Math.round(instability * 1000) / 1000, status, hazardReasons };
}

//엣지 목록들(호출·상속·변수 참조)을 파일 단위로 접어 파일별 지표를 만든다.
//같은 파일을 여러 번 참조해도 1로 센다. 같은 파일 내부 참조와 분석 대상 밖 파일은 제외한다.
function computeFileMetrics(edgeLists, knownFiles) {
  const known = new Set(knownFiles);
  const efferent = new Map(); //파일 → 이 파일이 참조하는 파일 집합 (Ce)
  const afferent = new Map(); //파일 → 이 파일을 참조하는 파일 집합 (Ca)
  for (const file of known) {
    efferent.set(file, new Set());
    afferent.set(file, new Set());
  }

  for (const edges of edgeLists) {
    for (const edge of edges) {
      const from = fileOf(edge.source);
      const to = fileOf(edge.target);
      if (from === to) continue;
      if (!known.has(from) || !known.has(to)) continue;
      efferent.get(from).add(to);
      afferent.get(to).add(from);
    }
  }

  const metricsByFile = {};
  for (const file of known) {
    const ca = afferent.get(file).size;
    const ce = efferent.get(file).size;
    const { instability, status, hazardReasons } = classifyCoupling({ ca, ce });
    metricsByFile[file] = {
      ca,
      ce,
      cbo: ca + ce,
      instability,
      status,
      hazard_reasons: hazardReasons,
    };
  }
  return metricsByFile;
}

module.exports = { computeFileMetrics, classifyCoupling, judgeInstability };
