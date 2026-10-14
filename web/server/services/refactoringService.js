//진단 결과 기반 리팩토링 제안 텍스트를 생성하는 서비스
const { COUPLING_CRITERIA } = require('../config/couplingThresholds');

//HAZARD 사유별 판정 근거와 권장 조치 (사유 키는 metricsService의 hazard_reasons와 같다)
const HAZARD_ADVICE = {
  instability: {
    reason: `불안정성 I > ${COUPLING_CRITERIA.warnMax}`,
    suggestion:
      '다른 파일에 기대기만 하고 이 파일에 기대는 곳은 적어 외부 변경에 쉽게 흔들립니다. ' +
      '자주 바뀌는 의존 대상을 인터페이스(추상화) 뒤로 숨기는 의존성 역전(DIP)을 적용하세요.',
  },
  efferent: {
    reason: `의존 파일 수 Ce ≥ ${COUPLING_CRITERIA.ceHazard}`,
    suggestion:
      '너무 많은 파일에 직접 의존합니다. 책임별로 파일을 나누거나, ' +
      '파사드(Facade)로 의존 대상을 한 곳에 모으세요.',
  },
};

//HAZARD 파일마다 결합도 제안을 하나씩 만든다. 판정은 metricsService에서 끝났으므로 status만 확인한다.
function buildCouplingSuggestions(coupling) {
  const suggestions = [];
  for (const entry of coupling.files) {
    if (entry.metrics.status !== 'HAZARD') continue;

    const { ca, ce, instability, hazard_reasons: reasons } = entry.metrics;
    const advice = reasons.map((reason) => HAZARD_ADVICE[reason]);
    suggestions.push({
      type: 'coupling',
      severity: 'warning',
      title: `${entry.file.split('/').pop()}: 결합도 HAZARD`,
      description: `Ca ${ca} · Ce ${ce} · I ${instability} — ${advice.map((a) => a.reason).join(', ')}`,
      suggestion: advice.map((a) => a.suggestion).join(' '),
      relatedNodes: [entry.file],
      metrics: entry.metrics,
    });
  }
  return suggestions;
}

//진단 결과를 받아 구체적인 리팩토링 제안 목록을 반환한다.
function generateSuggestions(diagnostics) {
  const suggestions = [];

  //순환 참조 관련 제안
  const { functions: funcCycles, files: fileCycles } = diagnostics.cycles;
  for (const cycle of fileCycles) {
    const cycleStr = cycle.join(' → ');
    suggestions.push({
      type: 'cycle',
      severity: 'error',
      title: '파일 간 순환 참조 발견',
      description: `순환 경로: ${cycleStr}`,
      suggestion: '마지막 의존 관계를 제거하거나 공통 인터페이스 모듈로 분리하세요.',
      relatedNodes: cycle,
    });
  }
  for (const cycle of funcCycles) {
    const cycleStr = cycle.map((n) => n.split('::').pop()).join(' → ');
    suggestions.push({
      type: 'cycle',
      severity: 'warning',
      title: '함수 간 순환 호출 발견',
      description: `순환 경로: ${cycleStr}`,
      suggestion: '콜백 패턴이나 이벤트 기반 구조로 전환하여 순환을 끊으세요.',
      relatedNodes: cycle,
    });
  }

  //파일 결합도 HAZARD 제안 (CR-RFC-2026-002)
  suggestions.push(...buildCouplingSuggestions(diagnostics.coupling));

  //안티패턴 관련 제안
  for (const issue of diagnostics.antiPatterns) {
    const name = issue.nodeId.split('::').pop();
    if (issue.type === 'god_function') {
      suggestions.push({
        type: 'antipattern',
        severity: 'info',
        title: `${name}: God Function`,
        description: issue.message,
        suggestion:
          '논리적 단위별로 헬퍼 함수를 추출하고, 주 함수는 조율(orchestration) 역할만 하도록 하세요.',
        relatedNodes: [issue.nodeId],
      });
    } else if (issue.type === 'god_class') {
      suggestions.push({
        type: 'antipattern',
        severity: 'info',
        title: `${name}: God Class`,
        description: issue.message,
        suggestion: '단일 책임 원칙(SRP)에 따라 관련 메서드끼리 별도 클래스로 분리하세요.',
        relatedNodes: [issue.nodeId],
      });
    }
  }

  return suggestions;
}

module.exports = { generateSuggestions };
