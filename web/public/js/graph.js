//그래프 랜더링 및 스타일 코드

let cy = null;
//현재 뷰 모드: 'function' 또는 'package'
let currentViewMode = 'function';
//원본 그래프 데이터 보관
let graphData = null;

function initGraph(container) {
  cy = cytoscape({
    container: container,
    style: [
      //티어 노드 — 참조 횟수 그룹 컨테이너
      {
        selector: 'node[type="tier"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#0f1419',
          'background-opacity': 0.6,
          'border-color': '#f59e0b',
          'border-width': 2,
          'border-opacity': 0.7,
          'border-style': 'dashed',
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '39px',
          'color': '#fbbf24',
          'padding': '30px',
          'text-margin-y': '-6px',
          'font-weight': 'bold',
          'min-width': '240px',
          'min-height': '140px',
          'z-compound-depth': 'bottom',
          'text-background-color': '#0f1419',
          'text-background-opacity': 1,
          'text-background-padding': '6px',
          'text-background-shape': 'roundrectangle',
        },
      },
      //언어 컨테이너 노드 — 웹 언어별 그룹 (HTML/CSS/JS)
      {
        selector: 'node[type="lang"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#0f1419',
          'background-opacity': 0.6,
          'border-color': '#6b7280',
          'border-width': 2,
          'border-opacity': 0.7,
          'border-style': 'dashed',
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '39px',
          'color': '#9ca3af',
          'padding': '30px',
          'text-margin-y': '-6px',
          'font-weight': 'bold',
          'min-width': '240px',
          'min-height': '140px',
          'z-compound-depth': 'bottom',
          'text-background-color': '#0f1419',
          'text-background-opacity': 1,
          'text-background-padding': '6px',
          'text-background-shape': 'roundrectangle',
        },
      },
      //HTML 언어 컨테이너 — 초록 테두리
      {
        selector: 'node[type="lang"][language="html"]',
        style: {
          'border-color': '#16a34a',
          'color': '#4ade80',
        },
      },
      //CSS 언어 컨테이너 — 보라 테두리
      {
        selector: 'node[type="lang"][language="css"]',
        style: {
          'border-color': '#7c3aed',
          'color': '#a78bfa',
        },
      },
      //JS 언어 컨테이너 — 노란 테두리
      {
        selector: 'node[type="lang"][language="javascript"]',
        style: {
          'border-color': '#d97706',
          'color': '#fbbf24',
        },
      },
      //패키지 노드 — 초록 테두리 컨테이너
      {
        selector: 'node[type="package"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#0f1419',
          'background-opacity': 0.6,
          'border-color': '#22c55e',
          'border-width': 2,
          'border-opacity': 0.8,
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '23px',
          'color': '#4ade80',
          'padding': '40px',
          'text-margin-y': '-4px',
          'font-weight': 'bold',
          'min-width': '200px',
          'min-height': '120px',
          'z-compound-depth': 'bottom',
        },
      },
      //파일 노드 — 파란 테두리 컨테이너
      {
        selector: 'node[type="file"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#111827',
          'background-opacity': 0.85,
          'border-color': '#3b82f6',
          'border-width': 2,
          'border-opacity': 0.8,
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#93c5fd',
          'padding': '18px',
          'text-margin-y': '-2px',
          'font-weight': 'bold',
          'min-width': '180px',
          'min-height': '90px',
          'z-compound-depth': 'bottom',
          'text-background-color': '#111827',
          'text-background-opacity': 1,
          'text-background-padding': '4px',
          'text-background-shape': 'roundrectangle',
        },
      },
      //결합도에 따른 파일 노드 테두리 두께 — 결합도 높을수록 두꺼운 테두리
      {
        selector: 'node[type="file"][couplingScore > 0.3]',
        style: {
          'border-width': 'mapData(couplingScore, 0, 1, 2, 7)',
          'border-color': 'mapData(couplingScore, 0, 1, #3b82f6, #f59e0b)',
        },
      },
      //함수 노드 — 둥근 알약 모양
      {
        selector: 'node[type="function"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#1e293b',
          'border-color': '#475569',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#e2e8f0',
          'width': 'label',
          'height': '40px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //inbound 참조 횟수에 따른 함수 노드 테두리 두께 + 배경색 (호출당한 횟수)
      {
        selector: 'node[type="function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #475569, #f59e0b)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #1e293b, #422006)',
        },
      },
      {
        selector: 'node[type="js-function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #d97706, #f59e0b)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #422006, #78350f)',
        },
      },
      {
        selector: 'node[type="ts-function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #3b82f6, #f59e0b)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #1e3a5f, #422006)',
        },
      },
      {
        selector: 'node[type="cpp-function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #06b6d4, #f59e0b)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #164e63, #422006)',
        },
      },
      {
        selector: 'node[type="csharp-function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #22c55e, #f59e0b)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #14532d, #422006)',
        },
      },
      //outbound 참조 횟수에 따른 함수 노드 스타일 (호출한 횟수 — inbound가 0인 경우만)
      {
        selector: 'node[type="function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #475569, #60a5fa)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #1e293b, #172554)',
        },
      },
      {
        selector: 'node[type="js-function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #d97706, #60a5fa)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #422006, #172554)',
        },
      },
      {
        selector: 'node[type="ts-function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #3b82f6, #60a5fa)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #1e3a5f, #172554)',
        },
      },
      {
        selector: 'node[type="cpp-function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #06b6d4, #60a5fa)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #164e63, #172554)',
        },
      },
      {
        selector: 'node[type="csharp-function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #22c55e, #60a5fa)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #14532d, #172554)',
        },
      },
      //변수 노드 — 다이아몬드 모양, 청록색
      {
        selector: 'node[type="variable"]',
        style: {
          'shape': 'diamond',
          'background-color': '#134e4a',
          'border-color': '#14b8a6',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '21px',
          'color': '#5eead4',
          'width': 'label',
          'height': '36px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //클래스 필드 변수 — 보라색 강조
      {
        selector: 'node[type="variable"][className]',
        style: {
          'border-color': '#a78bfa',
          'color': '#c4b5fd',
        },
      },
      //클래스 메서드 노드 — 보라색 강조
      {
        selector: 'node[type="function"][className]',
        style: {
          'border-color': '#7c3aed',
          'color': '#c4b5fd',
          'border-width': 1.5,
        },
      },
      //JS 함수 노드 — 노란색 계열
      {
        selector: 'node[type="js-function"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#422006',
          'border-color': '#d97706',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#fbbf24',
          'width': 'label',
          'height': '40px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //JS 클래스 메서드 — 주황 강조
      {
        selector: 'node[type="js-function"][className]',
        style: {
          'border-color': '#ea580c',
          'color': '#fdba74',
          'border-width': 1.5,
        },
      },
      //HTML 요소 노드 — 초록색 계열
      {
        selector: 'node[type="html-element"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#052e16',
          'border-color': '#16a34a',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '21px',
          'color': '#4ade80',
          'width': 'label',
          'height': '36px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //CSS 셀렉터 노드 — 보라색 계열
      {
        selector: 'node[type="css-selector"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#2e1065',
          'border-color': '#7c3aed',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '21px',
          'color': '#a78bfa',
          'width': 'label',
          'height': '36px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //TypeScript 함수 노드 — 파란색 계열
      {
        selector: 'node[type="ts-function"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#1e3a5f',
          'border-color': '#3b82f6',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#93c5fd',
          'width': 'label',
          'height': '40px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //TS 클래스 메서드 — 남색 강조
      {
        selector: 'node[type="ts-function"][className]',
        style: {
          'border-color': '#2563eb',
          'color': '#bfdbfe',
          'border-width': 1.5,
        },
      },
      //C++ 함수 노드 — 청록색 계열
      {
        selector: 'node[type="cpp-function"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#164e63',
          'border-color': '#06b6d4',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#67e8f9',
          'width': 'label',
          'height': '40px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //C++ 클래스 메서드 — 시안 강조
      {
        selector: 'node[type="cpp-function"][className]',
        style: {
          'border-color': '#0891b2',
          'color': '#a5f3fc',
          'border-width': 1.5,
        },
      },
      //C# 함수 노드 — 녹색 계열
      {
        selector: 'node[type="csharp-function"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#14532d',
          'border-color': '#22c55e',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#86efac',
          'width': 'label',
          'height': '40px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //C# 클래스 메서드 — 에메랄드 강조
      {
        selector: 'node[type="csharp-function"][className]',
        style: {
          'border-color': '#16a34a',
          'color': '#bbf7d0',
          'border-width': 1.5,
        },
      },
      //TypeScript 파일 노드 — 파란 테두리
      {
        selector: 'node[type="file"][language="typescript"]',
        style: {
          'border-color': '#3b82f6',
          'color': '#93c5fd',
        },
      },
      //C++ 파일 노드 — 시안 테두리
      {
        selector: 'node[type="file"][language="cpp"]',
        style: {
          'border-color': '#06b6d4',
          'color': '#67e8f9',
        },
      },
      //C# 파일 노드 — 녹색 테두리
      {
        selector: 'node[type="file"][language="csharp"]',
        style: {
          'border-color': '#22c55e',
          'color': '#86efac',
        },
      },
      //CSS 변수 노드 — 분홍색 계열 다이아몬드
      {
        selector: 'node[type="css-variable"]',
        style: {
          'shape': 'diamond',
          'background-color': '#4a044e',
          'border-color': '#c026d3',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '21px',
          'color': '#e879f9',
          'width': 'label',
          'height': '36px',
          'padding': '14px',
          'font-family': '"Cascadia Code", "Fira Code", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //HTML 파일 노드 — 초록 테두리
      {
        selector: 'node[type="file"][language="html"]',
        style: {
          'border-color': '#16a34a',
          'color': '#4ade80',
        },
      },
      //CSS 파일 노드 — 보라 테두리
      {
        selector: 'node[type="file"][language="css"]',
        style: {
          'border-color': '#7c3aed',
          'color': '#a78bfa',
        },
      },
      //JS 파일 노드 — 노란 테두리
      {
        selector: 'node[type="file"][language="javascript"]',
        style: {
          'border-color': '#d97706',
          'color': '#fbbf24',
        },
      },
      //접힌 노드 — 점선 테두리
      {
        selector: 'node.collapsed',
        style: {
          'border-style': 'dashed',
          'border-opacity': 0.5,
        },
      },
      //마우스 올렸을 때 효과
      {
        selector: 'node[type="function"]:active',
        style: {
          'overlay-color': '#60a5fa',
          'overlay-opacity': 0.08,
        },
      },
      //선택된 함수 노드 하이라이트
      {
        selector: 'node.highlighted',
        style: {
          'border-color': '#f59e0b',
          'border-width': 2.5,
          'background-color': '#1c1917',
          'color': '#fbbf24',
          'z-index': 10,
        },
      },
      //엣지 — 기본 숨김 (노드 클릭 시 관련 엣지만 표시)
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': '#60a5fa',
          'line-opacity': 0,
          'target-arrow-color': '#60a5fa',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.9,
          'curve-style': 'bezier',
          'display': 'none',
        },
      },
      //엣지 라벨 (참조 횟수 표시)
      {
        selector: 'edge[refCount > 1]',
        style: {
          'label': 'data(refCount)',
          'font-size': '36px',
          'color': '#94a3b8',
          'text-background-color': '#0a0e17',
          'text-background-opacity': 1,
          'text-background-padding': '3px',
          'text-background-shape': 'roundrectangle',
          'font-weight': 'bold',
        },
      },
      //변수 참조 엣지 — 청록색 점선
      {
        selector: 'edge[edgeType="variable-ref"]',
        style: {
          'line-color': '#14b8a6',
          'line-style': 'dashed',
          'target-arrow-color': '#14b8a6',
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'line-opacity': 0.6,
        },
      },
      //상속 엣지 — 보라색 점선
      {
        selector: 'edge[edgeType="inheritance"]',
        style: {
          'line-color': '#a78bfa',
          'line-style': 'dashed',
          'target-arrow-color': '#a78bfa',
          'target-arrow-shape': 'triangle-backcurve',
          'width': 2,
          'line-opacity': 0.7,
        },
      },
      //웹 관계 엣지 — script-ref, style-ref (초록 점선)
      {
        selector: 'edge[edgeType="script-ref"], edge[edgeType="style-ref"]',
        style: {
          'line-color': '#22c55e',
          'line-style': 'dashed',
          'target-arrow-color': '#22c55e',
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'line-opacity': 0.6,
        },
      },
      //DOM 접근 엣지 — 주황 점선
      {
        selector: 'edge[edgeType="dom-access"]',
        style: {
          'line-color': '#f97316',
          'line-style': 'dashed',
          'target-arrow-color': '#f97316',
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'line-opacity': 0.6,
        },
      },
      //CSS 타겟 엣지 — 보라 점선
      {
        selector: 'edge[edgeType="css-target"]',
        style: {
          'line-color': '#a78bfa',
          'line-style': 'dashed',
          'target-arrow-color': '#a78bfa',
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'line-opacity': 0.5,
        },
      },
      //이벤트 바인딩 엣지 — 분홍색 점선
      {
        selector: 'edge[edgeType="event-binding"]',
        style: {
          'line-color': '#ec4899',
          'line-style': 'dashed',
          'target-arrow-color': '#ec4899',
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'line-opacity': 0.6,
        },
      },
      //JS import 엣지 — 노란 점선
      {
        selector: 'edge[edgeType="js-import"], edge[edgeType="css-import"]',
        style: {
          'line-color': '#eab308',
          'line-style': 'dashed',
          'target-arrow-color': '#eab308',
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'line-opacity': 0.5,
        },
      },
      //CSS 변수 참조 엣지 — 분홍 점선
      {
        selector: 'edge[edgeType="css-var"]',
        style: {
          'line-color': '#c026d3',
          'line-style': 'dashed',
          'target-arrow-color': '#c026d3',
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'line-opacity': 0.5,
        },
      },
      //순환 참조 엣지 — 빨간 하이라이트
      {
        selector: 'edge.cycle-edge',
        style: {
          'line-color': '#ef4444',
          'target-arrow-color': '#ef4444',
          'width': 2.5,
          'line-opacity': 0.9,
        },
      },
      //선택된 엣지 하이라이트
      {
        selector: 'edge.highlighted',
        style: {
          'line-color': '#f59e0b',
          'target-arrow-color': '#f59e0b',
          'width': 2.5,
          'line-opacity': 1,
          'z-index': 10,
        },
      },
      //선택 안 된 요소들 흐리게 처리
      {
        selector: 'node.dimmed',
        style: {
          'opacity': 0.3,
        },
      },
      {
        selector: 'edge.dimmed',
        style: {
          'opacity': 0.1,
        },
      },
      //미리보기 모드에서 제거될 엣지 표시
      {
        selector: 'edge.preview-removed',
        style: {
          'line-color': '#ef4444',
          'line-style': 'dashed',
          'line-opacity': 0.3,
          'target-arrow-color': '#ef4444',
          'width': 1,
        },
      },
    ],
    layout: { name: 'preset' },
    wheelSensitivity: 0.3,
    minZoom: 0.1,
    maxZoom: 5,
  });

  return cy;
}

function renderGraph(data) {
  if (!cy) return;

  //원본 데이터 보관
  graphData = data;
  currentViewMode = 'function';

  cy.elements().remove();

  //리프 노드 타입 목록
  const leafTypes = new Set(['function', 'js-function', 'ts-function', 'cpp-function', 'csharp-function', 'variable', 'css-variable', 'html-element', 'css-selector']);

  //엣지에 연결된 함수 노드 ID 수집 (고립 함수 필터링용)
  const connectedIds = new Set();
  for (const edge of data.edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }
  if (data.inheritanceEdges) {
    for (const edge of data.inheritanceEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
  }
  if (data.variableEdges) {
    for (const edge of data.variableEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
  }
  if (data.webEdges) {
    for (const edge of data.webEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
  }

  //유지할 노드 ID 결정 (4단계 계층 대응: leaf → file → tier → lang)
  const keptIds = new Set();
  for (const node of data.nodes) {
    if (leafTypes.has(node.data.type) && connectedIds.has(node.data.id)) {
      keptIds.add(node.data.id);
    }
  }
  //부모 방향으로 전파 (3회 반복으로 file → tier → lang 까지 도달)
  for (let pass = 0; pass < 3; pass++) {
    for (const node of data.nodes) {
      if (keptIds.has(node.data.id) && node.data.parent) {
        keptIds.add(node.data.parent);
      }
    }
  }

  //노드 추가 (엣지 없는 고립 리프와 빈 컨테이너 제외)
  const containerTypes = new Set(['file', 'tier', 'lang']);
  const elements = [];
  for (const node of data.nodes) {
    if (leafTypes.has(node.data.type) && !connectedIds.has(node.data.id)) continue;
    if (containerTypes.has(node.data.type) && !keptIds.has(node.data.id)) continue;
    elements.push(node);
  }

  //호출 엣지 추가
  const addedNodeIds = new Set(elements.filter(e => e.data && !e.data.source).map(e => e.data.id));
  for (const edge of data.edges) {
    if (!addedNodeIds.has(edge.source) || !addedNodeIds.has(edge.target)) continue;
    elements.push({
      data: {
        id: `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        refCount: edge.references.length,
        references: edge.references,
        edgeType: 'call',
      },
    });
  }

  //상속 엣지 추가 (source와 target 노드가 모두 존재할 때만)
  if (data.inheritanceEdges) {
    for (const edge of data.inheritanceEdges) {
      if (addedNodeIds.has(edge.source) && addedNodeIds.has(edge.target)) {
        elements.push({
          data: {
            id: `inherit__${edge.source}->${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: 'inheritance',
          },
        });
      }
    }
  }

  //변수 참조 엣지 추가
  if (data.variableEdges) {
    for (const edge of data.variableEdges) {
      if (addedNodeIds.has(edge.source) && addedNodeIds.has(edge.target)) {
        elements.push({
          data: {
            id: `varref__${edge.source}->${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: 'variable-ref',
            refCount: edge.references.length,
            references: edge.references,
          },
        });
      }
    }
  }

  //웹 관계 엣지 추가
  if (data.webEdges) {
    for (const edge of data.webEdges) {
      if (addedNodeIds.has(edge.source) && addedNodeIds.has(edge.target)) {
        const edgeId = `web__${edge.source}->${edge.target}__${edge.type}`;
        elements.push({
          data: {
            id: edgeId,
            source: edge.source,
            target: edge.target,
            edgeType: edge.type,
            refCount: edge.references ? edge.references.length : 1,
            references: edge.references,
          },
        });
      }
    }
  }

  cy.add(elements);

  //순환 참조 엣지에 클래스 추가
  if (data.cycleEdgeIds) {
    for (const edgeId of data.cycleEdgeIds) {
      const edge = cy.getElementById(edgeId);
      if (edge.length) edge.addClass('cycle-edge');
    }
  }

  //최상위 컨테이너 ID 목록 생성 (tier + lang)
  const sortedTiers = data.tiers ? [...data.tiers].sort((a, b) => a - b) : [];
  const containerIds = sortedTiers.map(t => `tier__${t}`);
  //언어 컨테이너를 고정 순서로 추가 (HTML → CSS → JS)
  if (data.langs) {
    const langOrder = ['html', 'css', 'javascript'];
    for (const lang of langOrder) {
      if (data.langs.includes(lang)) {
        containerIds.push(`lang__${lang}`);
      }
    }
  }

  //1단계: fcose로 내부 노드 자동 배치 (완료 후 컨테이너 재배치)
  cy.layout({
    name: 'fcose',
    animate: false,
    fit: false,
    padding: 30,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 80,
    nodeRepulsion: 6000,
    edgeElasticity: 0.3,
    nestingFactor: 0.4,
    gravity: 0.3,
    gravityRange: 2.0,
    quality: 'default',
    randomize: true,
    numIter: 800,
    nodeSeparation: 120,
    avoidOverlap: true,
    stop: function () {
      //2단계: 레이아웃 완료 후 컨테이너 박스를 좌→우로 겹치지 않게 재배치
      arrangeContainers(containerIds);
    },
  }).run();

  //범례 표시
  document.getElementById('legend').classList.add('visible');

  return cy;
}

//패키지 뷰로 전환한다.
function renderPackageView(data) {
  if (!cy || !data) return;
  currentViewMode = 'package';

  cy.elements().remove();
  const elements = [];

  //패키지 노드 추가
  if (data.packageNodes) {
    for (const node of data.packageNodes) {
      elements.push(node);
    }
  }

  //파일 노드를 패키지 안에 추가
  const fileSet = new Set();
  for (const node of data.nodes) {
    if (node.data.type === 'file') {
      const filePath = node.data.fullPath;
      if (fileSet.has(filePath)) continue;
      fileSet.add(filePath);

      const dir = filePath.split('/').slice(0, -1).join('/') || '.';
      elements.push({
        data: {
          id: `pkgfile__${filePath}`,
          label: filePath.split('/').pop(),
          type: 'file',
          fullPath: filePath,
          parent: `pkg__${dir}`,
          couplingScore: node.data.couplingScore || 0,
        },
      });
    }
  }

  //파일 간 엣지 추가 (중복 제거)
  const fileEdgeSet = new Set();
  for (const edge of data.edges) {
    const sf = edge.source.split('::')[0];
    const tf = edge.target.split('::')[0];
    if (sf === tf) continue;
    const key = `${sf}->${tf}`;
    if (fileEdgeSet.has(key)) continue;
    fileEdgeSet.add(key);
    elements.push({
      data: {
        id: `pkgedge__${key}`,
        source: `pkgfile__${sf}`,
        target: `pkgfile__${tf}`,
        edgeType: 'call',
      },
    });
  }

  cy.add(elements);

  cy.layout({
    name: 'fcose',
    animate: false,
    fit: true,
    padding: 60,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 100,
    nodeRepulsion: 6000,
    quality: 'default',
    randomize: true,
    numIter: 2000,
  }).run();
}

//최상위 컨테이너 박스들을 좌→우 순서로 재배치하는 함수다.
//tier 컨테이너와 lang 컨테이너 모두 처리한다.
//재귀적으로 내부 계층을 정리한 뒤 최상위 컨테이너를 좌→우 배치한다.
//  - Python tier: tier → file → leaf (3단계)
//  - Web lang: lang → tier → file → leaf (4단계)
function arrangeContainers(containerIds) {
  if (!containerIds || containerIds.length === 0) return;

  //compound 노드 패딩 보정값
  const containerGap = 166;
  const subTierGap = 120;
  const fileGap = 80;
  const fnGap = 8;

  //파일 노드 내부의 리프 노드를 행 기반으로 컴팩트하게 배치한다.
  function arrangeLeafNodes(fileNode) {
    const leafNodes = fileNode.children();
    if (leafNodes.length === 0) return null;

    const items = [];
    leafNodes.forEach(n => {
      const bb = n.boundingBox();
      items.push({ node: n, w: bb.w, h: bb.h });
    });

    const targetCols = Math.max(1, Math.ceil(Math.sqrt(items.length)));
    const widthsSorted = items.map(f => f.w).sort((a, b) => b - a);
    let maxRowW = 0;
    for (let i = 0; i < Math.min(targetCols, widthsSorted.length); i++) {
      maxRowW += widthsSorted[i] + fnGap;
    }

    let rowX = 0, rowY = 0, rowMaxH = 0;
    for (const item of items) {
      if (rowX > 0 && rowX + item.w > maxRowW) {
        rowX = 0;
        rowY += rowMaxH + fnGap;
        rowMaxH = 0;
      }
      item.node.position({ x: rowX + item.w / 2, y: rowY + item.h / 2 });
      rowX += item.w + fnGap;
      rowMaxH = Math.max(rowMaxH, item.h);
    }

    const bb = leafNodes.boundingBox();
    return { leafNodes, bb, w: bb.w, h: bb.h };
  }

  //블록 목록을 그리드 배치한다. 각 블록의 leafNodes를 이동시킨다.
  function gridLayout(blocks, gap) {
    if (blocks.length === 0) return null;

    let allLeafNodes = cy.collection();
    const cols = Math.max(1, Math.ceil(Math.cbrt(blocks.length)));
    blocks.sort((a, b) => b.h - a.h);

    let gridX = 0, gridY = 0, rowMaxH = 0, col = 0;
    for (const block of blocks) {
      const dx = gridX - block.bb.x1;
      const dy = gridY - block.bb.y1;
      block.leafNodes.forEach(node => {
        const pos = node.position();
        node.position({ x: pos.x + dx, y: pos.y + dy });
      });
      allLeafNodes = allLeafNodes.union(block.leafNodes);

      rowMaxH = Math.max(rowMaxH, block.h);
      gridX += block.w + gap;
      col++;
      if (col >= cols) {
        gridX = 0;
        gridY += rowMaxH + gap;
        rowMaxH = 0;
        col = 0;
      }
    }

    const bb = allLeafNodes.boundingBox();
    return { leafNodes: allLeafNodes, bb, w: bb.w, h: bb.h };
  }

  //컨테이너 내부를 재귀적으로 정리한다.
  //반환: { leafNodes, bb, w, h } 또는 null
  function arrangeInternals(containerNode) {
    const children = containerNode.children();
    if (children.length === 0) return null;

    const firstChildType = children[0].data('type');

    if (firstChildType === 'tier') {
      //자식이 서브 티어 (lang → tier 구조) — 재귀 처리
      const subBlocks = [];
      children.forEach(subTier => {
        const result = arrangeInternals(subTier);
        if (result) subBlocks.push(result);
      });
      return gridLayout(subBlocks, subTierGap);

    } else {
      //자식이 파일 노드 — 리프 배치 후 파일 그리드 배치
      const fileBlocks = [];
      children.forEach(fileNode => {
        const result = arrangeLeafNodes(fileNode);
        if (result) fileBlocks.push(result);
      });
      return gridLayout(fileBlocks, fileGap);
    }
  }

  //모든 최상위 컨테이너 내부 정리
  const containerInfo = [];
  for (const containerId of containerIds) {
    const containerNode = cy.getElementById(containerId);
    if (!containerNode.length) continue;
    if (containerNode.descendants().length === 0) continue;

    const result = arrangeInternals(containerNode);
    if (!result) continue;

    console.log(`[layout] ${containerId}: ${result.leafNodes.length} leaves, bbox ${Math.round(result.w)}×${Math.round(result.h)}`);
    containerInfo.push({ containerId, leafNodes: result.leafNodes, bb: result.bb });
  }

  if (containerInfo.length === 0) return;

  //최상위 컨테이너들을 자동 줄바꿈으로 배치
  const maxW = Math.max(...containerInfo.map(t => t.bb.w));
  const targetWidth = Math.max(maxW + containerGap, 2500);

  const rows = [[]];
  let rowW = 0;
  for (const info of containerInfo) {
    if (rowW > 0 && rowW + info.bb.w > targetWidth) {
      rows.push([]);
      rowW = 0;
    }
    rows[rows.length - 1].push(info);
    rowW += info.bb.w + containerGap;
  }

  let rowY = 0;
  for (const row of rows) {
    const rowH = Math.max(...row.map(r => r.bb.h));
    let x = 0;

    for (const info of row) {
      const { leafNodes, bb } = info;
      const offsetX = x - bb.x1;
      const offsetY = rowY + (rowH - bb.h) / 2 - bb.y1;
      leafNodes.forEach(node => {
        const pos = node.position();
        node.position({ x: pos.x + offsetX, y: pos.y + offsetY });
      });
      x += bb.w + containerGap;
    }

    rowY += rowH + containerGap;
  }

  console.log(`[layout] rows: ${rows.length}, rowSizes: [${rows.map(r => r.length).join(',')}], targetWidth: ${targetWidth}`);
  cy.fit(undefined, 20);

  //초기 줌: 노드 수에 따라 동적 조정 후 첫 리프 노드 중심으로 패닝
  const allLeaves = cy.nodes('[type="function"], [type="variable"], [type="js-function"], [type="ts-function"], [type="cpp-function"], [type="csharp-function"], [type="css-variable"], [type="html-element"], [type="css-selector"]');
  const nodeCount = allLeaves.length;
  const zoomLevel = nodeCount <= 10 ? 1.2
    : nodeCount <= 30 ? 0.9
    : nodeCount <= 80 ? 0.7
    : 0.5;
  const firstLeaf = cy.nodes('[type="function"], [type="js-function"], [type="ts-function"], [type="cpp-function"], [type="csharp-function"]')[0];
  if (firstLeaf) {
    cy.zoom({ level: zoomLevel, position: firstLeaf.position() });
    cy.center(firstLeaf);
  }
}

//파일 상세 뷰: 해당 파일의 함수 노드만 + 외부 연결 스텁 노드 표시
function renderFileDetailView(data, filePath) {
  if (!cy || !data) return;
  currentViewMode = 'file-detail';

  cy.elements().remove();
  const elements = [];

  //해당 파일의 함수/변수 노드 수집
  const fileNodeIds = new Set();
  for (const node of data.nodes) {
    if ((node.data.type === 'function' || node.data.type === 'variable') && node.data.filePath === filePath) {
      fileNodeIds.add(node.data.id);
      elements.push({
        data: {
          ...node.data,
          parent: undefined, //부모 없이 자유 배치
        },
      });
    }
  }

  //외부 연결 스텁 노드 수집
  const stubIds = new Set();
  const allEdges = [...(data.edges || []), ...(data.variableEdges || [])];

  for (const edge of allEdges) {
    const srcIn = fileNodeIds.has(edge.source);
    const tgtIn = fileNodeIds.has(edge.target);

    if (srcIn && !tgtIn && !stubIds.has(edge.target)) {
      stubIds.add(edge.target);
      const name = edge.target.split('::').pop();
      const file = edge.target.split('::')[0];
      elements.push({
        data: {
          id: edge.target,
          label: name,
          type: 'function',
          filePath: file,
          qualifiedName: name,
          isStub: true,
        },
      });
    }

    if (tgtIn && !srcIn && !stubIds.has(edge.source)) {
      stubIds.add(edge.source);
      const name = edge.source.split('::').pop();
      const file = edge.source.split('::')[0];
      elements.push({
        data: {
          id: edge.source,
          label: name,
          type: 'function',
          filePath: file,
          qualifiedName: name,
          isStub: true,
        },
      });
    }
  }

  //관련 엣지 추가
  const allNodeIds = new Set([...fileNodeIds, ...stubIds]);
  for (const edge of data.edges) {
    if (allNodeIds.has(edge.source) && allNodeIds.has(edge.target)) {
      elements.push({
        data: {
          id: `${edge.source}->${edge.target}`,
          source: edge.source,
          target: edge.target,
          refCount: edge.references.length,
          references: edge.references,
          edgeType: 'call',
        },
      });
    }
  }

  if (data.variableEdges) {
    for (const edge of data.variableEdges) {
      if (allNodeIds.has(edge.source) && allNodeIds.has(edge.target)) {
        elements.push({
          data: {
            id: `varref__${edge.source}->${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: 'variable-ref',
            refCount: edge.references.length,
            references: edge.references,
          },
        });
      }
    }
  }

  cy.add(elements);

  //스텁 노드에 특수 스타일 적용
  cy.nodes('[?isStub]').style({
    'opacity': 0.5,
    'border-style': 'dashed',
  });

  //모든 엣지 표시
  cy.edges().style({ 'display': 'element', 'line-opacity': 0.6 });

  cy.layout({
    name: 'fcose',
    animate: false,
    fit: true,
    padding: 60,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 80,
    nodeRepulsion: 5000,
    quality: 'default',
    randomize: true,
    numIter: 1000,
  }).run();

  //뒤로가기 버튼 표시
  document.getElementById('back-to-package-btn').classList.remove('hidden');
}

function highlightNode(nodeId) {
  if (!cy) return;
  cy.nodes().removeClass('highlighted dimmed');
  cy.edges().removeClass('highlighted dimmed');

  //엣지 토글 상태에 따라 초기화
  if (typeof edgesVisible !== 'undefined' && edgesVisible) {
    //토글 ON 상태: 모든 엣지 유지, opacity 낮춤
    cy.edges().style({ 'display': 'element', 'line-opacity': 0.3 });
  } else {
    //토글 OFF 상태: 모든 엣지 숨김
    cy.edges().style('display', 'none');
  }

  const node = cy.getElementById(nodeId);
  if (node.length) {
    node.addClass('highlighted');

    //연결된 엣지와 이웃 노드 하이라이트
    const connectedEdges = node.connectedEdges();
    const neighborNodes = node.neighborhood('node');

    //연결된 엣지만 강조 표시
    connectedEdges.style('display', 'element');
    connectedEdges.addClass('highlighted');

    //모든 조상 노드(file, tier, lang)도 흐려지지 않도록 처리
    const ancestors = node.ancestors();
    const keepVisible = node.union(neighborNodes).union(ancestors);

    //이웃 노드의 모든 조상도 흐려지지 않도록 처리
    let neighborAncestors = cy.collection();
    neighborNodes.forEach(n => {
      neighborAncestors = neighborAncestors.union(n.ancestors());
    });

    //나머지는 전부 흐리게
    cy.nodes().not(keepVisible).not(neighborAncestors).addClass('dimmed');
  }
}

function clearHighlights() {
  if (!cy) return;
  cy.nodes().removeClass('highlighted dimmed');
  cy.edges().removeClass('highlighted dimmed');

  //엣지 토글 상태에 따라 복원
  if (typeof edgesVisible !== 'undefined' && edgesVisible) {
    cy.edges().style({ 'display': 'element', 'line-opacity': 0.3 });
  } else {
    cy.edges().style('display', 'none');
  }
}
