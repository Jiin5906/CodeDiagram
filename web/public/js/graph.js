//그래프 렌더링 및 스타일 코드
//Phase 1 리뉴얼: 파일 노드 기반 플랫 그래프 + 옵시디언 스타일 글로우/디밍

let cy = null;
//현재 뷰 모드: 'file' (기본) 또는 'function' 또는 'package' 또는 'file-detail'
let currentViewMode = 'file';
//원본 그래프 데이터 보관
let graphData = null;

//언어별 노드 색상 매핑
const LANG_COLORS = {
  python:     { bg: '#4B8BBE', border: '#346A94' },
  typescript: { bg: '#3178C6', border: '#245A96' },
  javascript: { bg: '#E3CF5A', border: '#AD9C3C' },
  cpp:        { bg: '#D0607F', border: '#A0465F' },
  csharp:     { bg: '#5A9E4B', border: '#437836' },
  html:       { bg: '#D9663F', border: '#A84C2C' },
  css:        { bg: '#8A6CC2', border: '#674F95' },
};

//엣지 타입별 색상 매핑
const EDGE_TYPE_COLORS = {
  'call':          '#548AF7',
  'variable-ref':  '#4FA8A0',
  'inheritance':   '#A58BD6',
  'script-ref':    '#5FB865',
  'style-ref':     '#5FB865',
  'dom-access':    '#D98A4E',
  'css-target':    '#A58BD6',
  'event-binding': '#C77DAD',
  'js-import':     '#E3C06B',
  'css-import':    '#E3C06B',
  'css-var':       '#B06CC0',
};

//확장자 → 언어 (같은 경로에 언어별 파일 노드가 여러 개일 때 고르는 기준)
const EXT_TO_LANG = { html: 'html', htm: 'html', css: 'css', js: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', cs: 'csharp', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp' };

//리프 노드 타입
const LEAF_TYPES = new Set([
  'function', 'js-function', 'ts-function', 'cpp-function', 'csharp-function',
  'variable', 'css-variable', 'html-element', 'css-selector',
]);

function initGraph(container) {
  cy = cytoscape({
    container: container,
    style: [
      /* ══════════════════════════════════════════════
         파일 노드 뷰 스타일 (Phase 1 리뉴얼)
         ══════════════════════════════════════════════ */

      //단색 원 + 같은 계열의 진한 1px 테두리. 글로우는 쓰지 않고 상태는 테두리로만 표시한다.
      //주의: overlay는 기본 모양이 둥근 사각형이라 원 위에 네모가 생기므로 파일 노드에서는 쓰지 않는다.
      {
        selector: 'node[type="file-node"]',
        style: {
          'shape': 'ellipse',
          'background-color': 'data(color)',
          'background-opacity': 1,
          'border-width': 1,
          'border-color': 'data(borderColor)',
          'width': 'data(size)',
          'height': 'data(size)',
          'label': 'data(label)',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 6,
          'font-family': 'Pretendard Variable, Pretendard, sans-serif',
          'font-size': 11,
          'font-weight': 500,
          'color': '#A8ABB2',
          'text-outline-color': '#1E1F22',
          'text-outline-width': 2,
          'text-outline-opacity': 1,
          'text-wrap': 'ellipsis',
          'text-max-width': '140px',
          'min-zoomed-font-size': 7,
          'overlay-opacity': 0,
          'transition-property': 'opacity, border-width, border-color, color, text-opacity',
          'transition-duration': '0.2s',
          'transition-timing-function': 'ease-out',
        },
      },
      //결합도 높은 노드 — 테두리를 조금 두껍게
      {
        selector: 'node[type="file-node"][couplingScore > 0.3]',
        style: {
          'border-width': 'mapData(couplingScore, 0.3, 1, 1.5, 3)',
        },
      },
      //클릭 시 기본 회색 사각 오버레이 제거
      {
        selector: 'node[type="file-node"]:active',
        style: {
          'overlay-opacity': 0,
        },
      },

      //줌 기반 라벨 페이드 (옵시디언 Text fade threshold). updateLabelFade()가 클래스를 붙인다.
      //주의: 호버/선택/디밍 규칙보다 앞에 있어야 그 상태들이 라벨 투명도를 덮어쓴다.
      { selector: 'node[type="file-node"].label-fade-0', style: { 'text-opacity': 0 } },
      { selector: 'node[type="file-node"].label-fade-1', style: { 'text-opacity': 0.2 } },
      { selector: 'node[type="file-node"].label-fade-2', style: { 'text-opacity': 0.4 } },
      { selector: 'node[type="file-node"].label-fade-3', style: { 'text-opacity': 0.6 } },
      { selector: 'node[type="file-node"].label-fade-4', style: { 'text-opacity': 0.8 } },

      //진단 표시 (codeEffects.js가 클래스를 붙인다) — 깜빡임 없이 바깥 테두리 색으로 고정 표시
      {
        selector: 'node[type="file-node"].diag-warning',
        style: { 'border-color': '#D6A547', 'border-width': 2.5 },
      },
      {
        selector: 'node[type="file-node"].diag-error',
        style: { 'border-color': '#E06666', 'border-width': 2.5 },
      },

      /* ── 파일 노드 인터랙션 상태 ── */

      //호버 포커스 — 라벨만 밝고 크게
      {
        selector: 'node[type="file-node"].hover-focus',
        style: {
          'color': '#DFE1E5',
          'text-opacity': 1,
          'font-size': 13,
          'font-weight': 600,
          'z-index': 999,
        },
      },
      //선택 상태 — 강조색 테두리
      {
        selector: 'node[type="file-node"]:selected',
        style: {
          'border-width': 2.5,
          'border-color': '#548AF7',
          'border-opacity': 1,
          'color': '#DFE1E5',
          'text-opacity': 1,
          'overlay-opacity': 0,
        },
      },
      //이웃 하이라이트 — 관련 노드
      {
        selector: 'node[type="file-node"].neighbor-highlight',
        style: {
          'opacity': 1.0,
          'color': '#C9CCD1',
          'text-opacity': 1,
        },
      },


      /* ── 공용 디밍/하이라이트 상태 ── */

      //포커스 디밍 — 비관련 노드
      {
        selector: 'node.dimmed',
        style: {
          'opacity': 0.06,
          'text-opacity': 0,
          'transition-property': 'opacity, text-opacity',
          'transition-duration': '0.2s',
        },
      },
      //포커스 디밍 — 비관련 엣지
      {
        selector: 'edge.dimmed',
        style: {
          'opacity': 0.03,
          'transition-property': 'opacity',
          'transition-duration': '0.2s',
        },
      },
      //선택된 노드 하이라이트 (함수 뷰 호환)
      {
        selector: 'node.highlighted',
        style: {
          'border-color': '#D6A547',
          'border-width': 2.5,
          'background-color': '#2B2D30',
          'color': '#E3C06B',
          'z-index': 10,
        },
      },
      //선택된 엣지 하이라이트 (함수 뷰 호환)
      {
        selector: 'edge.highlighted',
        style: {
          'line-color': '#D6A547',
          'target-arrow-color': '#D6A547',
          'width': 2.5,
          'line-opacity': 1,
          'z-index': 10,
        },
      },

      /* ══════════════════════════════════════════════
         함수 뷰 스타일 (기존 유지)
         ══════════════════════════════════════════════ */

      //티어 노드 — 참조 횟수 그룹 컨테이너
      {
        selector: 'node[type="tier"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#1E1F22',
          'background-opacity': 0.6,
          'border-color': '#4E5157',
          'border-width': 1,
          'border-opacity': 0.7,
          'border-style': 'dashed',
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '30px',
          'color': '#A8ABB2',
          'padding': '30px',
          'text-margin-y': '-6px',
          'font-weight': 600,
          'min-width': '240px',
          'min-height': '140px',
          'z-compound-depth': 'bottom',
          'text-background-color': '#1E1F22',
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
          'background-color': '#1E1F22',
          'background-opacity': 0.6,
          'border-color': '#6F737A',
          'border-width': 1,
          'border-opacity': 0.7,
          'border-style': 'dashed',
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '30px',
          'color': '#A8ABB2',
          'padding': '30px',
          'text-margin-y': '-6px',
          'font-weight': 600,
          'min-width': '240px',
          'min-height': '140px',
          'z-compound-depth': 'bottom',
          'text-background-color': '#1E1F22',
          'text-background-opacity': 1,
          'text-background-padding': '6px',
          'text-background-shape': 'roundrectangle',
        },
      },
      { selector: 'node[type="lang"][language="html"]', style: { 'border-color': '#4A9A50', 'color': '#7FC784' } },
      { selector: 'node[type="lang"][language="css"]', style: { 'border-color': '#8466C0', 'color': '#A58BD6' } },
      { selector: 'node[type="lang"][language="javascript"]', style: { 'border-color': '#B8862F', 'color': '#E3C06B' } },
      //패키지 노드 — 초록 테두리 컨테이너
      {
        selector: 'node[type="package"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#1E1F22',
          'background-opacity': 0.6,
          'border-color': '#5FB865',
          'border-width': 2,
          'border-opacity': 0.8,
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '23px',
          'color': '#7FC784',
          'padding': '40px',
          'text-margin-y': '-4px',
          'font-weight': 'bold',
          'min-width': '200px',
          'min-height': '120px',
          'z-compound-depth': 'bottom',
        },
      },
      //파일 노드 (함수 뷰 컨테이너) — 파란 테두리
      {
        selector: 'node[type="file"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#2B2D30',
          'background-opacity': 0.85,
          'border-color': '#3574F0',
          'border-width': 2,
          'border-opacity': 0.8,
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#8FB2F5',
          'padding': '18px',
          'text-margin-y': '-2px',
          'font-weight': 'bold',
          'min-width': '180px',
          'min-height': '90px',
          'z-compound-depth': 'bottom',
          'text-background-color': '#2B2D30',
          'text-background-opacity': 1,
          'text-background-padding': '4px',
          'text-background-shape': 'roundrectangle',
        },
      },
      {
        selector: 'node[type="file"][couplingScore > 0.3]',
        style: {
          'border-width': 'mapData(couplingScore, 0, 1, 2, 7)',
          'border-color': 'mapData(couplingScore, 0, 1, #3574F0, #D6A547)',
        },
      },
      //함수 노드 — 둥근 알약 모양
      {
        selector: 'node[type="function"]',
        style: {
          'shape': 'roundrectangle',
          'background-color': '#2B2D30',
          'border-color': '#4E5157',
          'border-width': 1.5,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '25px',
          'color': '#DFE1E5',
          'width': 'label',
          'height': '40px',
          'padding': '14px',
          'font-family': 'D2Coding, "JetBrains Mono", Consolas, monospace',
          'text-wrap': 'none',
          'z-compound-depth': 'top',
        },
      },
      //inbound 참조 횟수에 따른 함수 노드 스타일
      {
        selector: 'node[type="function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #4E5157, #D6A547)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #2B2D30, #3A2F1C)',
        },
      },
      {
        selector: 'node[type="js-function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #B8862F, #D6A547)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #3A2F1C, #4A3A1E)',
        },
      },
      {
        selector: 'node[type="ts-function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #3574F0, #D6A547)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #25324D, #3A2F1C)',
        },
      },
      {
        selector: 'node[type="cpp-function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #3FA8B5, #D6A547)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #1D3A40, #3A2F1C)',
        },
      },
      {
        selector: 'node[type="csharp-function"][inboundRefCount > 0]',
        style: {
          'border-width': 'mapData(inboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(inboundRefCount, 0, 10, #5FB865, #D6A547)',
          'background-color': 'mapData(inboundRefCount, 0, 10, #1F3A24, #3A2F1C)',
        },
      },
      //outbound 참조 횟수에 따른 함수 노드 스타일 (inbound=0인 경우만)
      {
        selector: 'node[type="function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #4E5157, #548AF7)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #2B2D30, #1F2A44)',
        },
      },
      {
        selector: 'node[type="js-function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #B8862F, #548AF7)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #3A2F1C, #1F2A44)',
        },
      },
      {
        selector: 'node[type="ts-function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #3574F0, #548AF7)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #25324D, #1F2A44)',
        },
      },
      {
        selector: 'node[type="cpp-function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #3FA8B5, #548AF7)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #1D3A40, #1F2A44)',
        },
      },
      {
        selector: 'node[type="csharp-function"][outboundRefCount > 0][inboundRefCount = 0]',
        style: {
          'border-width': 'mapData(outboundRefCount, 0, 10, 1.5, 5)',
          'border-color': 'mapData(outboundRefCount, 0, 10, #5FB865, #548AF7)',
          'background-color': 'mapData(outboundRefCount, 0, 10, #1F3A24, #1F2A44)',
        },
      },
      //변수 노드
      {
        selector: 'node[type="variable"]',
        style: {
          'shape': 'diamond', 'background-color': '#1D3634', 'border-color': '#4FA8A0',
          'border-width': 1.5, 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
          'font-size': '21px', 'color': '#86CFC6', 'width': 'label', 'height': '36px', 'padding': '14px',
          'font-family': 'D2Coding, "JetBrains Mono", Consolas, monospace', 'text-wrap': 'none', 'z-compound-depth': 'top',
        },
      },
      { selector: 'node[type="variable"][className]', style: { 'border-color': '#A58BD6', 'color': '#C3B3E3' } },
      { selector: 'node[type="function"][className]', style: { 'border-color': '#8466C0', 'color': '#C3B3E3', 'border-width': 1.5 } },
      //JS 함수 노드
      {
        selector: 'node[type="js-function"]',
        style: {
          'shape': 'roundrectangle', 'background-color': '#3A2F1C', 'border-color': '#B8862F',
          'border-width': 1.5, 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
          'font-size': '25px', 'color': '#E3C06B', 'width': 'label', 'height': '40px', 'padding': '14px',
          'font-family': 'D2Coding, "JetBrains Mono", Consolas, monospace', 'text-wrap': 'none', 'z-compound-depth': 'top',
        },
      },
      { selector: 'node[type="js-function"][className]', style: { 'border-color': '#C0703A', 'color': '#E5B084', 'border-width': 1.5 } },
      //HTML 요소 노드
      {
        selector: 'node[type="html-element"]',
        style: {
          'shape': 'roundrectangle', 'background-color': '#1C2E20', 'border-color': '#4A9A50',
          'border-width': 1.5, 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
          'font-size': '21px', 'color': '#7FC784', 'width': 'label', 'height': '36px', 'padding': '14px',
          'font-family': 'D2Coding, "JetBrains Mono", Consolas, monospace', 'text-wrap': 'none', 'z-compound-depth': 'top',
        },
      },
      //CSS 셀렉터 노드
      {
        selector: 'node[type="css-selector"]',
        style: {
          'shape': 'roundrectangle', 'background-color': '#2E2640', 'border-color': '#8466C0',
          'border-width': 1.5, 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
          'font-size': '21px', 'color': '#A58BD6', 'width': 'label', 'height': '36px', 'padding': '14px',
          'font-family': 'D2Coding, "JetBrains Mono", Consolas, monospace', 'text-wrap': 'none', 'z-compound-depth': 'top',
        },
      },
      //TypeScript 함수 노드
      {
        selector: 'node[type="ts-function"]',
        style: {
          'shape': 'roundrectangle', 'background-color': '#25324D', 'border-color': '#3574F0',
          'border-width': 1.5, 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
          'font-size': '25px', 'color': '#8FB2F5', 'width': 'label', 'height': '40px', 'padding': '14px',
          'font-family': 'D2Coding, "JetBrains Mono", Consolas, monospace', 'text-wrap': 'none', 'z-compound-depth': 'top',
        },
      },
      { selector: 'node[type="ts-function"][className]', style: { 'border-color': '#3574F0', 'color': '#B5CBF7', 'border-width': 1.5 } },
      //C++ 함수 노드
      {
        selector: 'node[type="cpp-function"]',
        style: {
          'shape': 'roundrectangle', 'background-color': '#1D3A40', 'border-color': '#3FA8B5',
          'border-width': 1.5, 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
          'font-size': '25px', 'color': '#86C9D2', 'width': 'label', 'height': '40px', 'padding': '14px',
          'font-family': 'D2Coding, "JetBrains Mono", Consolas, monospace', 'text-wrap': 'none', 'z-compound-depth': 'top',
        },
      },
      { selector: 'node[type="cpp-function"][className]', style: { 'border-color': '#2F8793', 'color': '#A9D8DE', 'border-width': 1.5 } },
      //C# 함수 노드
      {
        selector: 'node[type="csharp-function"]',
        style: {
          'shape': 'roundrectangle', 'background-color': '#1F3A24', 'border-color': '#5FB865',
          'border-width': 1.5, 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
          'font-size': '25px', 'color': '#A3D6A6', 'width': 'label', 'height': '40px', 'padding': '14px',
          'font-family': 'D2Coding, "JetBrains Mono", Consolas, monospace', 'text-wrap': 'none', 'z-compound-depth': 'top',
        },
      },
      { selector: 'node[type="csharp-function"][className]', style: { 'border-color': '#4A9A50', 'color': '#BFE3C1', 'border-width': 1.5 } },
      //CSS 변수 노드
      {
        selector: 'node[type="css-variable"]',
        style: {
          'shape': 'diamond', 'background-color': '#3A2440', 'border-color': '#B06CC0',
          'border-width': 1.5, 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
          'font-size': '21px', 'color': '#D39BDD', 'width': 'label', 'height': '36px', 'padding': '14px',
          'font-family': 'D2Coding, "JetBrains Mono", Consolas, monospace', 'text-wrap': 'none', 'z-compound-depth': 'top',
        },
      },
      //언어별 파일 노드 테두리 색상 (함수 뷰)
      { selector: 'node[type="file"][language="typescript"]', style: { 'border-color': '#3574F0', 'color': '#8FB2F5' } },
      { selector: 'node[type="file"][language="cpp"]', style: { 'border-color': '#3FA8B5', 'color': '#86C9D2' } },
      { selector: 'node[type="file"][language="csharp"]', style: { 'border-color': '#5FB865', 'color': '#A3D6A6' } },
      { selector: 'node[type="file"][language="html"]', style: { 'border-color': '#4A9A50', 'color': '#7FC784' } },
      { selector: 'node[type="file"][language="css"]', style: { 'border-color': '#8466C0', 'color': '#A58BD6' } },
      { selector: 'node[type="file"][language="javascript"]', style: { 'border-color': '#B8862F', 'color': '#E3C06B' } },
      //접힌 노드
      { selector: 'node.collapsed', style: { 'border-style': 'dashed', 'border-opacity': 0.5 } },
      //마우스 올렸을 때 효과
      { selector: 'node[type="function"]:active', style: { 'overlay-color': '#548AF7', 'overlay-opacity': 0.08 } },

      /* ── 함수 뷰 엣지 스타일 ── */

      //엣지 기본 (함수 뷰에서는 기본 숨김)
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': '#548AF7',
          'line-opacity': 0,
          'target-arrow-color': '#548AF7',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.9,
          'curve-style': 'bezier',
          'display': 'none',
        },
      },
      //엣지 라벨 (참조 횟수)
      {
        selector: 'edge[refCount > 1]',
        style: {
          'label': 'data(refCount)', 'font-size': '36px', 'color': '#A8ABB2',
          'text-background-color': '#1E1F22', 'text-background-opacity': 1,
          'text-background-padding': '3px', 'text-background-shape': 'roundrectangle', 'font-weight': 'bold',
        },
      },
      //변수 참조 엣지
      { selector: 'edge[edgeType="variable-ref"]', style: { 'line-color': '#4FA8A0', 'line-style': 'dashed', 'target-arrow-color': '#4FA8A0', 'width': 1.5, 'line-opacity': 0.6 } },
      //상속 엣지
      { selector: 'edge[edgeType="inheritance"]', style: { 'line-color': '#A58BD6', 'line-style': 'dashed', 'target-arrow-color': '#A58BD6', 'target-arrow-shape': 'triangle-backcurve', 'width': 2, 'line-opacity': 0.7 } },
      //웹 관계 엣지
      { selector: 'edge[edgeType="script-ref"], edge[edgeType="style-ref"]', style: { 'line-color': '#5FB865', 'line-style': 'dashed', 'target-arrow-color': '#5FB865', 'width': 1.5, 'line-opacity': 0.6 } },
      { selector: 'edge[edgeType="dom-access"]', style: { 'line-color': '#D98A4E', 'line-style': 'dashed', 'target-arrow-color': '#D98A4E', 'width': 1.5, 'line-opacity': 0.6 } },
      { selector: 'edge[edgeType="css-target"]', style: { 'line-color': '#A58BD6', 'line-style': 'dashed', 'target-arrow-color': '#A58BD6', 'width': 1.5, 'line-opacity': 0.5 } },
      { selector: 'edge[edgeType="event-binding"]', style: { 'line-color': '#C77DAD', 'line-style': 'dashed', 'target-arrow-color': '#C77DAD', 'width': 1.5, 'line-opacity': 0.6 } },
      { selector: 'edge[edgeType="js-import"], edge[edgeType="css-import"]', style: { 'line-color': '#C9A94B', 'line-style': 'dashed', 'target-arrow-color': '#C9A94B', 'width': 1.5, 'line-opacity': 0.5 } },
      { selector: 'edge[edgeType="css-var"]', style: { 'line-color': '#B06CC0', 'line-style': 'dashed', 'target-arrow-color': '#B06CC0', 'width': 1.5, 'line-opacity': 0.5 } },
      //순환 참조 엣지
      { selector: 'edge.cycle-edge', style: { 'line-color': '#E06666', 'target-arrow-color': '#E06666', 'width': 2.5, 'line-opacity': 0.9 } },
      //미리보기 모드에서 제거될 엣지
      { selector: 'edge.preview-removed', style: { 'line-color': '#E06666', 'line-style': 'dashed', 'line-opacity': 0.3, 'target-arrow-color': '#E06666', 'width': 1 } },

      //함수 뷰에서 선택한 함수의 연결선 — 공통 edge 규칙(line-opacity: 0)보다 뒤에 있어야 선이 보인다
      {
        selector: 'edge.highlighted[type != "aggregated"]',
        style: {
          'line-color': '#D6A547',
          'target-arrow-color': '#D6A547',
          'width': 2.5,
          'line-opacity': 1,
          'z-index': 10,
        },
      },
      //함수 뷰 디밍 — 관련 없는 박스는 어둡게만 하고 구조는 보이게 둔다 (파일 뷰의 0.06보다 진하게)
      {
        selector: 'node.dimmed[type != "file-node"]',
        style: {
          'opacity': 0.3,
          'text-opacity': 0.6,
        },
      },

      /* ── 파일 뷰 엣지 스타일 ── */
      //주의: 함수 뷰의 공통 edge 규칙(display: none) 뒤에 선언해야 집약 엣지가 보인다.

      //옵시디언 스타일: 기본은 가늘고 은은한 중립색 곡선, 호버 시에만 관계 색상으로 살아난다.
      //집약 엣지 — 기본 표시
      {
        selector: 'edge[type="aggregated"]',
        style: {
          'display': 'element',
          'curve-style': 'unbundled-bezier',
          //방향 기준 거리라 A→B, B→A 엣지가 서로 반대쪽으로 휘어 겹치지 않는다.
          'control-point-distances': [18],
          'control-point-weights': [0.5],
          'width': 'mapData(refCount, 1, 20, 0.8, 2.2)',
          'line-color': '#5A5D63',
          'line-style': 'solid',
          'line-cap': 'round',
          'line-opacity': 1,
          'opacity': 0.5,
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#5A5D63',
          'arrow-scale': 0.45,
          'label': '',
          'overlay-opacity': 0,
          'transition-property': 'line-color, target-arrow-color, width, opacity, arrow-scale',
          'transition-duration': '0.2s',
          'transition-timing-function': 'ease-out',
        },
      },
      //엣지 하이라이트 — 연결선만 관계 색상으로 밝게
      {
        selector: 'edge[type="aggregated"].highlighted',
        style: {
          'line-color': 'data(edgeColor)',
          'target-arrow-color': 'data(edgeColor)',
          'width': 'mapData(refCount, 1, 20, 1.6, 3.2)',
          'opacity': 0.95,
          'arrow-scale': 0.7,
          'z-index': 999,
        },
      },
      //순환 참조를 이루는 엣지 — 붉게 (codeEffects.js)
      {
        selector: 'edge[type="aggregated"].diag-cycle-edge',
        style: {
          'line-color': '#E06666',
          'target-arrow-color': '#E06666',
          'opacity': 0.8,
        },
      },
      //호출 방향 입자 — 강조된 엣지 위를 캡슐 모양 점이 흐른다 (codeEffects.js가 line-dash-offset을 움직임)
      {
        selector: 'edge[type="aggregated"].edge-flow',
        style: {
          'line-style': 'dashed',
          'line-dash-pattern': [4, 8],
          'line-cap': 'round',
        },
      },
      //엣지 디밍 — 거의 안 보이게
      {
        selector: 'edge[type="aggregated"].dimmed',
        style: {
          'opacity': 0.04,
        },
      },


      /* ══════════════════════════════════════════════
         시맨틱 줌 LOD 스타일 (Phase 2)
         ══════════════════════════════════════════════ */

      //LOD-point (zoom < 0.3): 작은 도트, 라벨 없음
      {
        selector: 'node[type="file-node"].lod-point',
        style: {
          //모델 좌표 크기를 유지해야 축소 시에도 점이 보인다 (줌 0.25 → 화면상 3~10px)
          'label': '',
        },
      },
      {
        selector: 'edge[type="aggregated"].lod-point',
        style: {
          'display': 'none',
        },
      },

      //LOD-circle (0.3~0.7): 중간 원, 짧은 파일명, 주요 엣지만
      {
        selector: 'node[type="file-node"].lod-circle',
        style: {
          'label': 'data(shortLabel)',
          'font-size': 10,
        },
      },
      {
        selector: 'edge[type="aggregated"].lod-circle',
        style: {
          'display': 'none',
        },
      },
      {
        selector: 'edge[type="aggregated"].lod-circle[refCount >= 3]',
        style: {
          'display': 'element',
          'label': '',
        },
      },

      //LOD-card (zoom > 1.5): 카드형, 상세 라벨, 엣지 refCount 표시
      {
        selector: 'node[type="file-node"].lod-card',
        style: {
          'shape': 'roundrectangle',
          'width': 'mapData(funcCount, 0, 30, 100, 160)',
          'height': 'mapData(funcCount, 0, 30, 50, 80)',
          'label': 'data(detailLabel)',
          'text-valign': 'center',
          'text-halign': 'center',
          'text-wrap': 'wrap',
          'text-max-width': '140px',
          'font-size': 11,
          'text-margin-y': 0,
          'color': '#C9CCD1',
          'background-color': '#151922',
          'background-opacity': 0.95,
          'border-width': 1.5,
          'border-color': 'data(color)',
          'border-opacity': 0.7,
        },
      },
      {
        selector: 'edge[type="aggregated"].lod-card',
        style: {
          'label': 'data(refCount)',
          'font-size': 8,
          'color': '#8A93A6',
          'text-background-color': '#1E1F22',
          'text-background-opacity': 0.6,
          'text-background-padding': 2,
          'text-background-shape': 'roundrectangle',
        },
      },

      /* ── 로컬 그래프 스타일 (Phase 2) ── */
      {
        selector: '.local-graph-hidden',
        style: {
          'display': 'none',
        },
      },
      {
        selector: '.local-graph-center',
        style: {
          'border-width': 2.5,
          'border-color': '#548AF7',
          'border-opacity': 1,
          'color': '#DFE1E5',
          'z-index': 999,
        },
      },
    ],
    layout: { name: 'preset' },
    wheelSensitivity: 0.3,
    minZoom: 0.05,
    maxZoom: 5,
  });

  return cy;
}

/* ══════════════════════════════════════════════════════════════════
   Phase 1: 파일 노드 기반 플랫 그래프 (기본 뷰)
   ══════════════════════════════════════════════════════════════════ */

function renderGraph(data) {
  if (!cy) return;

  graphData = data;
  currentViewMode = 'file';

  if (typeof stopForceSim === 'function') stopForceSim();
  if (typeof stopCodeEffects === 'function') stopCodeEffects();
  cy.elements().remove();

  //Step 1: 파일 정보 수집 및 함수 매핑
  const fileNodeMap = new Map();
  const funcToFileNode = new Map();

  for (const node of data.nodes) {
    if (node.data.type === 'file') {
      fileNodeMap.set(node.data.id, {
        ...node.data,
        functions: [],
        funcCount: 0,
      });
    }
  }

  for (const node of data.nodes) {
    if (LEAF_TYPES.has(node.data.type) && node.data.parent) {
      funcToFileNode.set(node.data.id, node.data.parent);
      const fileInfo = fileNodeMap.get(node.data.parent);
      if (fileInfo) {
        fileInfo.functions.push({
          name: node.data.label || node.data.qualifiedName,
          type: node.data.type,
          id: node.data.id,
          code: node.data.code,
          filePath: node.data.filePath,
          qualifiedName: node.data.qualifiedName,
          //코드 뷰어 줄 강조와 복잡도 글로우(codeEffects.js) 계산에 쓴다
          startLine: node.data.startLine,
          endLine: node.data.endLine,
          inboundRefCount: node.data.inboundRefCount || 0,
          outboundRefCount: node.data.outboundRefCount || 0,
        });
        fileInfo.funcCount++;
      }
    }
  }

  //Step 2: 모든 엣지를 수집하고 파일 쌍으로 집약
  const allEdges = [];
  for (const edge of data.edges) {
    allEdges.push({ source: edge.source, target: edge.target, edgeType: 'call', references: edge.references });
  }
  if (data.inheritanceEdges) {
    for (const edge of data.inheritanceEdges) {
      allEdges.push({ source: edge.source, target: edge.target, edgeType: 'inheritance', references: edge.references });
    }
  }
  if (data.variableEdges) {
    for (const edge of data.variableEdges) {
      allEdges.push({ source: edge.source, target: edge.target, edgeType: 'variable-ref', references: edge.references });
    }
  }
  if (data.webEdges) {
    for (const edge of data.webEdges) {
      allEdges.push({ source: edge.source, target: edge.target, edgeType: edge.type, references: edge.references });
    }
  }

  //경로 → 파일 노드 ID 매핑 (같은 경로에 언어별 파일 노드가 여러 개일 수 있음. 예: index.html__html, index.html__javascript)
  const pathToFileNodes = new Map();
  for (const [fileId, fileInfo] of fileNodeMap) {
    const p = fileInfo.fullPath || fileInfo.label;
    if (!pathToFileNodes.has(p)) pathToFileNodes.set(p, []);
    pathToFileNodes.get(p).push(fileId);
  }

  //엣지 끝점(함수/클래스/변수/파일 경로)을 파일 노드 ID로 변환
  //상속(models.ts::User), import/script-ref(index.html) 엣지는 함수 노드가 아니므로 경로로 찾는다.
  function resolveFileNode(id) {
    if (funcToFileNode.has(id)) return funcToFileNode.get(id);
    if (fileNodeMap.has(id)) return id;
    const p = String(id).split('::')[0];
    const candidates = pathToFileNodes.get(p);
    if (!candidates) return null;
    if (candidates.length === 1) return candidates[0];
    const lang = EXT_TO_LANG[p.split('.').pop().toLowerCase()];
    return candidates.find(c => fileNodeMap.get(c).language === lang) || candidates[0];
  }

  const fileEdgeMap = new Map();

  for (const edge of allEdges) {
    const srcFile = resolveFileNode(edge.source);
    const tgtFile = resolveFileNode(edge.target);
    if (!srcFile || !tgtFile || srcFile === tgtFile) continue;
    if (!fileNodeMap.has(srcFile) || !fileNodeMap.has(tgtFile)) continue;

    const key = `${srcFile}->${tgtFile}`;
    if (!fileEdgeMap.has(key)) {
      fileEdgeMap.set(key, {
        source: srcFile,
        target: tgtFile,
        refCount: 0,
        functionEdges: [],
        types: {},
      });
    }
    const info = fileEdgeMap.get(key);
    const refs = edge.references ? edge.references.length : 1;
    info.refCount += refs;
    info.functionEdges.push(edge);
    info.types[edge.edgeType] = (info.types[edge.edgeType] || 0) + refs;
  }

  //Step 3: 연결된 파일 결정 (엣지가 있는 파일만 표시)
  const connectedFiles = new Set();
  for (const [, edgeInfo] of fileEdgeMap) {
    connectedFiles.add(edgeInfo.source);
    connectedFiles.add(edgeInfo.target);
  }

  //연결이 없어도 파일이 1개인 경우는 표시
  if (connectedFiles.size === 0) {
    for (const [fileId] of fileNodeMap) {
      connectedFiles.add(fileId);
    }
  }

  //Step 4: 파일 노드 엘리먼트 생성
  const elements = [];
  const funcCounts = Array.from(fileNodeMap.values())
    .filter(f => connectedFiles.has(f.id))
    .map(f => f.funcCount);
  const maxFuncCount = Math.max(1, ...funcCounts);

  for (const [fileId, fileInfo] of fileNodeMap) {
    if (!connectedFiles.has(fileId)) continue;

    const lang = fileInfo.language || 'python';
    const colors = LANG_COLORS[lang] || LANG_COLORS.python;
    const funcCount = fileInfo.funcCount;

    //크기: 함수 수에 비례 (min 14, max 42). 옵시디언처럼 작은 원으로, 제곱근으로 완만하게 키운다.
    const size = 14 + Math.sqrt(funcCount / maxFuncCount) * 28;

    //함수를 inbound 참조 순으로 정렬
    fileInfo.functions.sort((a, b) => (b.inboundRefCount || 0) - (a.inboundRefCount || 0));

    const fileName = fileInfo.label || fileId.replace('file__', '');
    const shortName = fileName.replace(/\.[^.]+$/, '');

    elements.push({
      data: {
        id: fileId,
        label: fileName,
        shortLabel: shortName,
        fullLabel: fileName,
        detailLabel: `${fileName}\n함수 ${funcCount}개`,
        type: 'file-node',
        language: lang,
        fullPath: fileInfo.fullPath,
        color: colors.bg,
        borderColor: colors.border,
        funcCount: funcCount,
        functions: fileInfo.functions,
        couplingScore: fileInfo.couplingScore || 0,
        size: size,
      },
    });
  }

  //Step 5: 집약 엣지 생성
  const maxRefCount = Math.max(1, ...Array.from(fileEdgeMap.values()).map(e => e.refCount));

  for (const [key, edgeInfo] of fileEdgeMap) {
    //지배적 엣지 타입 결정
    let dominantType = 'call';
    let maxCount = 0;
    for (const [type, count] of Object.entries(edgeInfo.types)) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    const edgeColor = EDGE_TYPE_COLORS[dominantType] || '#548AF7';
    const width = Math.max(1, Math.min(5, 1 + (edgeInfo.refCount / maxRefCount) * 4));

    elements.push({
      data: {
        id: `agg__${key}`,
        source: edgeInfo.source,
        target: edgeInfo.target,
        type: 'aggregated',
        refCount: edgeInfo.refCount,
        edgeType: dominantType,
        edgeColor: edgeColor,
        width: width,
        functionEdges: edgeInfo.functionEdges,
        typeBreakdown: edgeInfo.types,
      },
    });
  }

  cy.add(elements);

  //Step 6: 레이아웃 실행
  //옵시디언 스타일 실시간 물리(d3-force, forceSim.js)를 우선 사용하고, 불러오지 못했으면 fcose 정적 레이아웃
  const fileCount = elements.filter(e => e.data.type === 'file-node').length;
  if (typeof isForceSimAvailable === 'function' && isForceSimAvailable()) {
    runForceLayout();
  } else {
    //옵시디언 스타일: 짧은 링크 + 약한 척력 + 강한 중심 인력 → 둥글고 촘촘한 군집
    const nodeRepulsion = Math.max(2500, Math.min(8000, fileCount * 60));

    cy.layout({
      name: 'fcose',
      animate: false,
      fit: true,
      padding: 40,
      //라벨 폭(최대 140px)까지 간격에 넣으면 노드가 멀어진다. 옵시디언처럼 원 크기만 고려한다.
      nodeDimensionsIncludeLabels: false,
      idealEdgeLength: function (edge) {
        const refCount = edge.data('refCount') || 1;
        return Math.max(60, 90 - refCount * 3);
      },
      nodeRepulsion: nodeRepulsion,
      edgeElasticity: 0.45,
      gravity: 0.5,
      gravityRange: 3.8,
      quality: 'default',
      randomize: true,
      numIter: 1500,
      nodeSeparation: 60,
      avoidOverlap: true,
    }).run();

    //노드가 적으면 fit이 과하게 확대해 카드(LOD) 단계로 넘어가므로 기본 배율로 제한
    if (cy.zoom() > 1.2) {
      cy.zoom(1.2);
      cy.center();
    }
  }

  //범례 표시
  const legendPanel = document.getElementById('legend-panel');
  if (legendPanel) legendPanel.classList.remove('hidden');

  console.log(`[renderGraph] 파일 노드 뷰: ${fileCount}개 파일, ${fileEdgeMap.size}개 엣지`);

  setupSemanticZoom();
  if (typeof initMinimap === 'function') initMinimap();
  if (typeof applyCodeEffects === 'function') applyCodeEffects(data);

  return cy;
}

/* ══════════════════════════════════════════════════════════════════
   함수 뷰 (기존 renderGraph 보존)
   ══════════════════════════════════════════════════════════════════ */

function renderFunctionView(data) {
  if (!cy) return;
  if (typeof stopForceSim === 'function') stopForceSim();
  if (typeof stopCodeEffects === 'function') stopCodeEffects();

  teardownSemanticZoom();
  if (typeof destroyMinimap === 'function') destroyMinimap();

  graphData = data;
  currentViewMode = 'function';

  cy.elements().remove();

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

  //유지할 노드 ID 결정
  const keptIds = new Set();
  for (const node of data.nodes) {
    if (LEAF_TYPES.has(node.data.type) && connectedIds.has(node.data.id)) {
      keptIds.add(node.data.id);
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const node of data.nodes) {
      if (keptIds.has(node.data.id) && node.data.parent) {
        keptIds.add(node.data.parent);
      }
    }
  }

  //노드 추가
  const containerTypes = new Set(['file', 'tier', 'lang']);
  const elements = [];
  for (const node of data.nodes) {
    if (LEAF_TYPES.has(node.data.type) && !connectedIds.has(node.data.id)) continue;
    if (containerTypes.has(node.data.type) && !keptIds.has(node.data.id)) continue;
    elements.push(node);
  }

  //엣지 추가
  const addedNodeIds = new Set(elements.filter(e => e.data && !e.data.source).map(e => e.data.id));
  for (const edge of data.edges) {
    if (!addedNodeIds.has(edge.source) || !addedNodeIds.has(edge.target)) continue;
    elements.push({
      data: {
        id: `${edge.source}->${edge.target}`,
        source: edge.source, target: edge.target,
        refCount: edge.references.length,
        references: edge.references, edgeType: 'call',
      },
    });
  }
  if (data.inheritanceEdges) {
    for (const edge of data.inheritanceEdges) {
      if (addedNodeIds.has(edge.source) && addedNodeIds.has(edge.target)) {
        elements.push({ data: { id: `inherit__${edge.source}->${edge.target}`, source: edge.source, target: edge.target, edgeType: 'inheritance' } });
      }
    }
  }
  if (data.variableEdges) {
    for (const edge of data.variableEdges) {
      if (addedNodeIds.has(edge.source) && addedNodeIds.has(edge.target)) {
        elements.push({ data: { id: `varref__${edge.source}->${edge.target}`, source: edge.source, target: edge.target, edgeType: 'variable-ref', refCount: edge.references.length, references: edge.references } });
      }
    }
  }
  if (data.webEdges) {
    for (const edge of data.webEdges) {
      if (addedNodeIds.has(edge.source) && addedNodeIds.has(edge.target)) {
        elements.push({ data: { id: `web__${edge.source}->${edge.target}__${edge.type}`, source: edge.source, target: edge.target, edgeType: edge.type, refCount: edge.references ? edge.references.length : 1, references: edge.references } });
      }
    }
  }

  cy.add(elements);

  //순환 참조 엣지 마킹
  if (data.cycleEdgeIds) {
    for (const edgeId of data.cycleEdgeIds) {
      const edge = cy.getElementById(edgeId);
      if (edge.length) edge.addClass('cycle-edge');
    }
  }

  //최상위 컨테이너 ID 목록 생성
  const sortedTiers = data.tiers ? [...data.tiers].sort((a, b) => a - b) : [];
  const containerIds = sortedTiers.map(t => `tier__${t}`);
  if (data.langs) {
    const langOrder = ['html', 'css', 'javascript'];
    for (const lang of langOrder) {
      if (data.langs.includes(lang)) containerIds.push(`lang__${lang}`);
    }
  }

  //fcose 레이아웃 + 컨테이너 재배치
  cy.layout({
    name: 'fcose',
    animate: false, fit: false, padding: 30,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 80, nodeRepulsion: 6000, edgeElasticity: 0.3,
    nestingFactor: 0.4, gravity: 0.3, gravityRange: 2.0,
    quality: 'default', randomize: true, numIter: 800,
    nodeSeparation: 120, avoidOverlap: true,
    stop: function () {
      arrangeContainers(containerIds);
    },
  }).run();

  const legendPanel = document.getElementById('legend-panel');
  if (legendPanel) legendPanel.classList.remove('hidden');
  return cy;
}

/* ══════════════════════════════════════════════════════════════════
   패키지 뷰 (기존 유지)
   ══════════════════════════════════════════════════════════════════ */

function renderPackageView(data) {
  if (!cy || !data) return;
  if (typeof stopForceSim === 'function') stopForceSim();
  if (typeof stopCodeEffects === 'function') stopCodeEffects();
  currentViewMode = 'package';

  cy.elements().remove();
  const elements = [];

  if (data.packageNodes) {
    for (const node of data.packageNodes) elements.push(node);
  }

  const fileSet = new Set();
  for (const node of data.nodes) {
    if (node.data.type === 'file') {
      const filePath = node.data.fullPath;
      if (fileSet.has(filePath)) continue;
      fileSet.add(filePath);
      const dir = filePath.split('/').slice(0, -1).join('/') || '.';
      elements.push({
        data: {
          id: `pkgfile__${filePath}`, label: filePath.split('/').pop(),
          type: 'file', fullPath: filePath, parent: `pkg__${dir}`,
          couplingScore: node.data.couplingScore || 0,
        },
      });
    }
  }

  const fileEdgeSet = new Set();
  for (const edge of data.edges) {
    const sf = edge.source.split('::')[0];
    const tf = edge.target.split('::')[0];
    if (sf === tf) continue;
    const key = `${sf}->${tf}`;
    if (fileEdgeSet.has(key)) continue;
    fileEdgeSet.add(key);
    elements.push({ data: { id: `pkgedge__${key}`, source: `pkgfile__${sf}`, target: `pkgfile__${tf}`, edgeType: 'call' } });
  }

  cy.add(elements);

  cy.layout({
    name: 'fcose', animate: false, fit: true, padding: 60,
    nodeDimensionsIncludeLabels: true, idealEdgeLength: 100,
    nodeRepulsion: 6000, quality: 'default', randomize: true, numIter: 2000,
  }).run();
}

/* ══════════════════════════════════════════════════════════════════
   컨테이너 배치 (함수 뷰 전용)
   ══════════════════════════════════════════════════════════════════ */

function arrangeContainers(containerIds) {
  if (!containerIds || containerIds.length === 0) return;

  const containerGap = 166;
  const subTierGap = 120;
  const fileGap = 80;
  const fnGap = 8;

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
        rowX = 0; rowY += rowMaxH + fnGap; rowMaxH = 0;
      }
      item.node.position({ x: rowX + item.w / 2, y: rowY + item.h / 2 });
      rowX += item.w + fnGap;
      rowMaxH = Math.max(rowMaxH, item.h);
    }

    const bb = leafNodes.boundingBox();
    return { leafNodes, bb, w: bb.w, h: bb.h };
  }

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
      if (col >= cols) { gridX = 0; gridY += rowMaxH + gap; rowMaxH = 0; col = 0; }
    }

    const bb = allLeafNodes.boundingBox();
    return { leafNodes: allLeafNodes, bb, w: bb.w, h: bb.h };
  }

  function arrangeInternals(containerNode) {
    const children = containerNode.children();
    if (children.length === 0) return null;
    const firstChildType = children[0].data('type');

    if (firstChildType === 'tier') {
      const subBlocks = [];
      children.forEach(subTier => {
        const result = arrangeInternals(subTier);
        if (result) subBlocks.push(result);
      });
      return gridLayout(subBlocks, subTierGap);
    } else {
      const fileBlocks = [];
      children.forEach(fileNode => {
        const result = arrangeLeafNodes(fileNode);
        if (result) fileBlocks.push(result);
      });
      return gridLayout(fileBlocks, fileGap);
    }
  }

  const containerInfo = [];
  for (const containerId of containerIds) {
    const containerNode = cy.getElementById(containerId);
    if (!containerNode.length) continue;
    if (containerNode.descendants().length === 0) continue;
    const result = arrangeInternals(containerNode);
    if (!result) continue;
    containerInfo.push({ containerId, leafNodes: result.leafNodes, bb: result.bb });
  }

  if (containerInfo.length === 0) return;

  const maxW = Math.max(...containerInfo.map(t => t.bb.w));
  const targetWidth = Math.max(maxW + containerGap, 2500);

  const rows = [[]];
  let rowW = 0;
  for (const info of containerInfo) {
    if (rowW > 0 && rowW + info.bb.w > targetWidth) { rows.push([]); rowW = 0; }
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

  cy.fit(undefined, 20);

  const allLeaves = cy.nodes('[type="function"], [type="variable"], [type="js-function"], [type="ts-function"], [type="cpp-function"], [type="csharp-function"], [type="css-variable"], [type="html-element"], [type="css-selector"]');
  const nodeCount = allLeaves.length;
  const zoomLevel = nodeCount <= 10 ? 1.2 : nodeCount <= 30 ? 0.9 : nodeCount <= 80 ? 0.7 : 0.5;
  const firstLeaf = cy.nodes('[type="function"], [type="js-function"], [type="ts-function"], [type="cpp-function"], [type="csharp-function"]')[0];
  if (firstLeaf) {
    cy.zoom({ level: zoomLevel, position: firstLeaf.position() });
    cy.center(firstLeaf);
  }
}

/* ══════════════════════════════════════════════════════════════════
   파일 상세 뷰 (기존 유지)
   ══════════════════════════════════════════════════════════════════ */

function renderFileDetailView(data, filePath) {
  if (!cy || !data) return;
  if (typeof stopForceSim === 'function') stopForceSim();
  if (typeof stopCodeEffects === 'function') stopCodeEffects();
  currentViewMode = 'file-detail';

  cy.elements().remove();
  const elements = [];

  const fileNodeIds = new Set();
  for (const node of data.nodes) {
    if (LEAF_TYPES.has(node.data.type) && node.data.filePath === filePath) {
      fileNodeIds.add(node.data.id);
      elements.push({ data: { ...node.data, parent: undefined } });
    }
  }

  const stubIds = new Set();
  const allEdges = [...(data.edges || []), ...(data.variableEdges || [])];

  for (const edge of allEdges) {
    const srcIn = fileNodeIds.has(edge.source);
    const tgtIn = fileNodeIds.has(edge.target);

    if (srcIn && !tgtIn && !stubIds.has(edge.target)) {
      stubIds.add(edge.target);
      const name = edge.target.split('::').pop();
      const file = edge.target.split('::')[0];
      elements.push({ data: { id: edge.target, label: name, type: 'function', filePath: file, qualifiedName: name, isStub: true } });
    }
    if (tgtIn && !srcIn && !stubIds.has(edge.source)) {
      stubIds.add(edge.source);
      const name = edge.source.split('::').pop();
      const file = edge.source.split('::')[0];
      elements.push({ data: { id: edge.source, label: name, type: 'function', filePath: file, qualifiedName: name, isStub: true } });
    }
  }

  const allNodeIds = new Set([...fileNodeIds, ...stubIds]);
  for (const edge of data.edges) {
    if (allNodeIds.has(edge.source) && allNodeIds.has(edge.target)) {
      elements.push({ data: { id: `${edge.source}->${edge.target}`, source: edge.source, target: edge.target, refCount: edge.references.length, references: edge.references, edgeType: 'call' } });
    }
  }
  if (data.variableEdges) {
    for (const edge of data.variableEdges) {
      if (allNodeIds.has(edge.source) && allNodeIds.has(edge.target)) {
        elements.push({ data: { id: `varref__${edge.source}->${edge.target}`, source: edge.source, target: edge.target, edgeType: 'variable-ref', refCount: edge.references.length, references: edge.references } });
      }
    }
  }

  cy.add(elements);

  cy.nodes('[?isStub]').style({ 'opacity': 0.5, 'border-style': 'dashed' });
  cy.edges().style({ 'display': 'element', 'line-opacity': 0.6 });

  cy.layout({
    name: 'fcose', animate: false, fit: true, padding: 60,
    nodeDimensionsIncludeLabels: true, idealEdgeLength: 80,
    nodeRepulsion: 5000, quality: 'default', randomize: true, numIter: 1000,
  }).run();

  document.getElementById('back-to-package-btn').classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════════════
   시맨틱 줌 (Phase 2)
   ══════════════════════════════════════════════════════════════════ */

//물리 레이아웃의 원 간격(약 60px)에 맞춘 기준. 배치가 넓어 화면 맞춤 배율이 낮으므로 기준도 낮게 둔다.
const LOD_STAGES = [
  { name: 'point',  maxZoom: 0.18, cls: 'lod-point'  },
  { name: 'circle', maxZoom: 0.42, cls: 'lod-circle' },
  { name: 'normal', maxZoom: 1.5,  cls: null          },
  { name: 'card',   maxZoom: Infinity, cls: 'lod-card' },
];

let _lodStageIndex = 2;
let _lodZoomHandler = null;
let _lodDebounceTimer = null;

function setupSemanticZoom() {
  if (!cy) return;

  if (!_lodZoomHandler) {
    _lodZoomHandler = function () {
      //라벨 페이드는 줌하는 동안 연속적으로, LOD 단계 전환은 debounce
      updateLabelFade();
      clearTimeout(_lodDebounceTimer);
      _lodDebounceTimer = setTimeout(onZoomChange, 100);
    };
    cy.on('zoom', _lodZoomHandler);
  }

  //다시 렌더링된 경우에도 새 요소에 현재 단계가 적용되도록 강제로 재계산
  _lodStageIndex = -1;
  _labelFadeBucket = -1;
  onZoomChange();
  updateLabelFade();
}

//옵시디언의 Text fade threshold: 줌 0.18~0.45 구간에서 라벨이 서서히 나타난다
//스타일 transition(0.2s)이 단계 사이를 보간하므로 연속적으로 보인다.
const LABEL_FADE_MIN_ZOOM = 0.18;
const LABEL_FADE_MAX_ZOOM = 0.45;
const LABEL_FADE_STEPS = 5;
const LABEL_FADE_CLASSES = 'label-fade-0 label-fade-1 label-fade-2 label-fade-3 label-fade-4';
let _labelFadeBucket = -1;

function updateLabelFade() {
  if (!cy) return;
  const t = (cy.zoom() - LABEL_FADE_MIN_ZOOM) / (LABEL_FADE_MAX_ZOOM - LABEL_FADE_MIN_ZOOM);
  const bucket = Math.round(Math.min(1, Math.max(0, t)) * LABEL_FADE_STEPS);
  if (bucket === _labelFadeBucket) return;
  _labelFadeBucket = bucket;

  cy.batch(() => {
    const nodes = cy.nodes('[type="file-node"]');
    nodes.removeClass(LABEL_FADE_CLASSES);
    if (bucket < LABEL_FADE_STEPS) nodes.addClass('label-fade-' + bucket);
  });
}

function teardownSemanticZoom() {
  if (!cy || !_lodZoomHandler) return;
  cy.off('zoom', _lodZoomHandler);
  _lodZoomHandler = null;
  clearTimeout(_lodDebounceTimer);

  //모든 LOD 클래스 제거
  const allCls = LOD_STAGES.filter(s => s.cls).map(s => s.cls);
  cy.batch(() => {
    cy.elements().removeClass(allCls.join(' ') + ' ' + LABEL_FADE_CLASSES);
  });
  _lodStageIndex = 2;
  _labelFadeBucket = -1;
}

function onZoomChange() {
  if (!cy) return;
  const zoom = cy.zoom();

  let newIndex = LOD_STAGES.length - 1;
  for (let i = 0; i < LOD_STAGES.length; i++) {
    if (zoom < LOD_STAGES[i].maxZoom) {
      newIndex = i;
      break;
    }
  }

  if (newIndex !== _lodStageIndex) {
    applyLodStage(newIndex);
    _lodStageIndex = newIndex;
  }
}

function applyLodStage(index) {
  if (!cy) return;
  const allCls = LOD_STAGES.filter(s => s.cls).map(s => s.cls);
  const newCls = LOD_STAGES[index].cls;

  cy.batch(() => {
    cy.elements().removeClass(allCls.join(' '));
    if (newCls) {
      cy.nodes('[type="file-node"]').addClass(newCls);
      cy.edges('[type="aggregated"]').addClass(newCls);
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   노드 하이라이트 / 해제
   ══════════════════════════════════════════════════════════════════ */

function highlightNode(nodeId) {
  if (!cy) return;
  cy.nodes().removeClass('highlighted dimmed hover-focus neighbor-highlight');
  cy.edges().removeClass('highlighted dimmed');

  if (currentViewMode === 'file') {
    //파일 뷰: 포커스 디밍 방식
    const node = cy.getElementById(nodeId);
    if (!node.length) return;

    const neighborhood = node.closedNeighborhood();
    const connectedEdges = node.connectedEdges();

    cy.elements().not(neighborhood).addClass('dimmed');
    neighborhood.removeClass('dimmed');
    neighborhood.addClass('neighbor-highlight');
    connectedEdges.addClass('highlighted');
    connectedEdges.removeClass('dimmed');
    node.addClass('hover-focus');
  } else {
    //함수 뷰: 기존 방식
    if (typeof edgesVisible !== 'undefined' && edgesVisible) {
      cy.edges().style({ 'display': 'element', 'line-opacity': 0.3 });
    } else {
      cy.edges().style('display', 'none');
    }

    const node = cy.getElementById(nodeId);
    if (node.length) {
      node.addClass('highlighted');
      const connectedEdges = node.connectedEdges();
      const neighborNodes = node.neighborhood('node');
      connectedEdges.style('display', 'element');
      connectedEdges.addClass('highlighted');

      const ancestors = node.ancestors();
      const keepVisible = node.union(neighborNodes).union(ancestors);
      let neighborAncestors = cy.collection();
      neighborNodes.forEach(n => { neighborAncestors = neighborAncestors.union(n.ancestors()); });
      dimNodesExcept(keepVisible.union(neighborAncestors));
    }
  }
}

//keep에 없는 노드를 흐리게 한다.
//compound 노드는 부모 불투명도가 자식에 곱해지므로, 부모가 이미 흐려진 노드는 다시 흐리지 않는다
//(겹겹이 흐려져 박스가 아예 안 보이는 것을 막는다)
function dimNodesExcept(keep) {
  const toDim = cy.nodes().not(keep);
  toDim.filter(n => {
    const parent = n.parent();
    return !(parent.nonempty() && toDim.contains(parent));
  }).addClass('dimmed');
}

//엣지 타입 → 사용자에게 보여줄 한국어 이름
const EDGE_TYPE_LABELS = {
  'call': '함수 호출',
  'variable-ref': '변수 참조',
  'inheritance': '상속',
  'script-ref': '스크립트 포함',
  'style-ref': '스타일 포함',
  'dom-access': 'DOM 접근',
  'css-target': 'CSS 적용',
  'event-binding': '이벤트 연결',
  'js-import': 'JS 임포트',
  'css-import': 'CSS 임포트',
  'css-var': 'CSS 변수',
};

function clearHighlights() {
  if (!cy) return;
  cy.nodes().removeClass('highlighted dimmed hover-focus neighbor-highlight');
  cy.edges().removeClass('highlighted dimmed');

  if (currentViewMode !== 'file') {
    if (typeof edgesVisible !== 'undefined' && edgesVisible) {
      cy.edges().style({ 'display': 'element', 'line-opacity': 0.3 });
    } else {
      cy.edges().style('display', 'none');
    }
  }
}
