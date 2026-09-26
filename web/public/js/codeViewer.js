//소스코드 뷰어 — 노드 클릭 시 코드를 신택스 하이라이팅하여 사이드 패널에 표시한다.

//파일 확장자에서 highlight.js 언어 이름으로 매핑
const langMap = {
  '.py': 'python',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.html': 'xml',
  '.htm': 'xml',
  '.css': 'css',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
};

function showCodeViewer(nodeData) {
  const panel = document.getElementById('code-viewer-panel');
  const filename = document.getElementById('code-viewer-filename');
  const codeEl = document.getElementById('code-viewer-code');

  if (!panel || !codeEl) return;

  const code = nodeData.code;
  if (!code) return;

  //파일명 표시
  const name = nodeData.qualifiedName || nodeData.label || '';
  const file = nodeData.filePath || '';
  filename.textContent = file ? `${file} - ${name}` : name;

  //확장자에서 언어 판별
  const ext = file ? '.' + file.split('.').pop().toLowerCase() : '';
  const lang = langMap[ext] || '';

  //줄번호 + 코드 생성
  const lines = code.split('\n');
  const startLine = nodeData.startLine || 1;

  //highlight.js로 코드 하이라이팅
  codeEl.textContent = code;
  codeEl.className = lang ? `language-${lang}` : '';

  if (typeof hljs !== 'undefined') {
    hljs.highlightElement(codeEl);
  }

  //줄번호 오버레이 생성
  const lineNumbers = lines.map((_, i) => startLine + i).join('\n');
  let lineNumEl = panel.querySelector('.code-line-numbers');
  if (!lineNumEl) {
    lineNumEl = document.createElement('div');
    lineNumEl.className = 'code-line-numbers';
    const content = document.getElementById('code-viewer-content');
    content.insertBefore(lineNumEl, content.firstChild);
  }
  lineNumEl.textContent = lineNumbers;

  //패널 열기
  panel.classList.remove('collapsed');

  //그래프 리사이즈 + 화면 맞춤
  setTimeout(() => {
    if (typeof cy !== 'undefined' && cy) {
      cy.resize();
      cy.fit(undefined, 30);
    }
  }, 310);
}

function hideCodeViewer() {
  const panel = document.getElementById('code-viewer-panel');
  if (!panel) return;
  panel.classList.add('collapsed');
  setTimeout(() => {
    if (typeof cy !== 'undefined' && cy) {
      cy.resize();
      cy.fit(undefined, 30);
    }
  }, 310);
}

/* ══════════════════════════════════════════════════
   캔버스 카드 내 코드 뷰어 (Phase 3)
   ══════════════════════════════════════════════════ */

function showCodeInCard(cardElement, nodeData) {
  const codeArea = cardElement.querySelector('.canvas-card-code');
  if (!codeArea) return;

  const code = nodeData.code;
  if (!code) return;

  const file = nodeData.filePath || nodeData.fullPath || '';
  const ext = file ? '.' + file.split('.').pop().toLowerCase() : '';
  const lang = langMap[ext] || '';

  const lines = code.split('\n');
  const startLine = nodeData.startLine || 1;

  //줄번호
  const lineNumEl = codeArea.querySelector('.code-line-numbers');
  if (lineNumEl) {
    lineNumEl.textContent = lines.map((_, i) => startLine + i).join('\n');
  }

  //코드 렌더링 (줄 단위 span 래핑)
  const codeEl = codeArea.querySelector('code');
  if (!codeEl) return;

  //코드를 줄 단위 span으로 래핑하여 DOM 조작으로 구성
  codeEl.textContent = '';
  lines.forEach((line, i) => {
    if (i > 0) codeEl.appendChild(document.createTextNode('\n'));
    const span = document.createElement('span');
    span.className = 'code-line';
    span.dataset.line = String(startLine + i);
    span.textContent = line || ' ';
    codeEl.appendChild(span);
  });

  //highlight.js로 각 줄 하이라이팅
  codeEl.className = lang ? `language-${lang}` : '';
  if (typeof hljs !== 'undefined') {
    hljs.highlightElement(codeEl);
  }
}

function highlightLines(cardElement, startLine, endLine) {
  clearLineHighlights(cardElement);

  const codeArea = cardElement.querySelector('.canvas-card-code');
  if (!codeArea) return;

  const lines = codeArea.querySelectorAll('.code-line');
  let firstHighlighted = null;

  lines.forEach(span => {
    const lineNum = parseInt(span.dataset.line, 10);
    if (lineNum >= startLine && lineNum <= endLine) {
      span.classList.add('line-highlighted');
      if (!firstHighlighted) firstHighlighted = span;
    }
  });

  //하이라이트된 줄로 스크롤
  if (firstHighlighted) {
    firstHighlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearLineHighlights(cardElement) {
  const codeArea = cardElement.querySelector('.canvas-card-code');
  if (!codeArea) return;
  codeArea.querySelectorAll('.line-highlighted').forEach(el => {
    el.classList.remove('line-highlighted');
  });
}

//코드 뷰어 닫기 버튼 이벤트
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('code-viewer-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideCodeViewer);
  }
});
