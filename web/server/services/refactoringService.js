//진단 결과 기반 리팩토링 제안 텍스트를 생성하는 서비스

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

  //결합도 과다 관련 제안
  for (const issue of diagnostics.couplingIssues) {
    const funcName = issue.nodeId.split('::').pop();
    if (issue.type === 'high_inbound') {
      suggestions.push({
        type: 'coupling',
        severity: 'warning',
        title: `${funcName}: 인바운드 결합도 과다`,
        description: issue.message,
        suggestion:
          '파사드(Facade) 패턴을 도입하거나 중재자(Mediator)를 통해 간접 호출로 전환하세요.',
        relatedNodes: [issue.nodeId],
      });
    } else {
      suggestions.push({
        type: 'coupling',
        severity: 'warning',
        title: `${funcName}: 아웃바운드 결합도 과다`,
        description: issue.message,
        suggestion: '함수를 여러 개의 단일 책임 함수로 분리하세요.',
        relatedNodes: [issue.nodeId],
      });
    }
  }

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
