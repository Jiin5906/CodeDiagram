//파일 간 결합도 계산 서비스
//호출 엣지를 기반으로 파일 간 결합도 점수를 산출한다.

//파일 간 호출 횟수를 집계하여 결합도 맵을 생성한다.
function computeFileCoupling(edges) {
  //파일 쌍별 호출 횟수 집계
  const couplingMap = {}; //key: "fileA::fileB", value: 호출 수
  const fileCounts = {}; //파일별 외부 연결 총 수

  for (const edge of edges) {
    const sourceFile = edge.source.split('::')[0];
    const targetFile = edge.target.split('::')[0];
    if (sourceFile === targetFile) continue;

    const refCount = edge.references ? edge.references.length : 1;
    const pairKey = [sourceFile, targetFile].sort().join('↔');

    if (!couplingMap[pairKey]) couplingMap[pairKey] = 0;
    couplingMap[pairKey] += refCount;

    if (!fileCounts[sourceFile]) fileCounts[sourceFile] = 0;
    if (!fileCounts[targetFile]) fileCounts[targetFile] = 0;
    fileCounts[sourceFile] += refCount;
    fileCounts[targetFile] += refCount;
  }

  return { couplingMap, fileCounts };
}

//결합도 점수를 0~1로 정규화한다.
function normalizeCoupling(fileCounts) {
  const scores = {};
  const values = Object.values(fileCounts);
  if (values.length === 0) return scores;

  const maxCount = Math.max(...values);
  if (maxCount === 0) return scores;

  for (const [file, count] of Object.entries(fileCounts)) {
    scores[file] = count / maxCount;
  }
  return scores;
}

module.exports = { computeFileCoupling, normalizeCoupling };
