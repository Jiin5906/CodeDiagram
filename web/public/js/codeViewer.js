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

//함수 목록용 이름: label에는 "(1↓ 2↑)"가 붙어 있으므로 배지와 겹치지 않게 순수 이름을 쓴다
function fnDisplayName(fn) {
  return fn.qualifiedName || String(fn.name || '').replace(/\s*\([\d↓↑ ]+\)$/, '');
}

//참조 배지: N↓ = 다른 코드가 이 함수를 부른 횟수, N↑ = 이 함수가 다른 함수를 부른 횟수.
//그래프 노드 라벨의 "(N↓ M↑)" 표기와 같은 규칙이다.
function appendRefBadges(parent, fn, className) {
  const inCount = fn.inboundRefCount || 0;
  const outCount = fn.outboundRefCount || 0;
  if (inCount > 0) {
    const el = document.createElement('span');
    el.className = className + ' ref-in';
    el.textContent = inCount + '↓';
    el.title = '다른 코드가 이 함수를 ' + inCount + '번 부릅니다';
    parent.appendChild(el);
  }
  if (outCount > 0) {
    const el = document.createElement('span');
    el.className = className + ' ref-out';
    el.textContent = outCount + '↑';
    el.title = '이 함수가 다른 함수를 ' + outCount + '번 부릅니다';
    parent.appendChild(el);
  }
}

//코드 뷰어의 "코드 보기" 버튼 상태
const _fullCodeCache = new Map(); // analysisId::path -> code
let _cvFilePath = null;      // 현재 보고 있는 파일 경로 (프로젝트 기준 상대 경로)
let _cvShowingFull = false;  // 전체 코드를 보고 있는지
let _cvLastPartial = null;   // 전체 코드 → 되돌아갈 때 보여줄 함수 코드

//options.keepFnList: 파일 클릭으로 연 함수 목록을 그대로 둔다
function showCodeViewer(nodeData, options) {
  const panel = document.getElementById('code-viewer-panel');
  const filename = document.getElementById('code-viewer-filename');
  const codeEl = document.getElementById('code-viewer-code');

  if (!panel || !codeEl) return;

  const code = nodeData.code;
  if (!code) return;

  const fnList = document.getElementById('code-viewer-fnlist');
  if (fnList) {
    if (!options || !options.keepFnList) {
      fnList.classList.add('hidden');
    } else if (options.fnIndex !== undefined) {
      //함수 목록에서 지금 보여주는 함수를 선택 표시
      fnList.querySelectorAll('.fn-list-item').forEach((el, i) => {
        el.classList.toggle('active', i === options.fnIndex);
      });
    }
  }

  //파일명 표시
  const name = nodeData.qualifiedName || nodeData.label || '';
  const file = nodeData.filePath || '';
  filename.textContent = file ? `${file} - ${name}` : name;
  filename.title = filename.textContent;

  _renderViewerCode(code, file, nodeData.startLine || 1);

  //함수 코드를 보여줄 때는 "코드 보기"로 전체 파일을 열 수 있게 한다
  if (!options || !options.isFullFile) {
    _cvLastPartial = { nodeData, options };
    _setFullCodeState(file, false);
  }

  _openCodeViewerPanel(panel);
}

//코드 + 줄번호를 코드 뷰어에 그린다
function _renderViewerCode(code, file, startLine) {
  const codeEl = document.getElementById('code-viewer-code');
  const content = document.getElementById('code-viewer-content');
  if (!codeEl || !content) return;

  //확장자에서 언어 판별
  const ext = file ? '.' + file.split('.').pop().toLowerCase() : '';
  const lang = langMap[ext] || '';

  //highlight.js로 코드 하이라이팅
  codeEl.removeAttribute('data-highlighted');
  codeEl.textContent = code;
  codeEl.className = lang ? `language-${lang}` : '';

  if (typeof hljs !== 'undefined') {
    hljs.highlightElement(codeEl);
  }

  //줄번호 오버레이 생성
  const lineNumbers = code.split('\n').map((_, i) => startLine + i).join('\n');
  let lineNumEl = content.querySelector('.code-line-numbers');
  if (!lineNumEl) {
    lineNumEl = document.createElement('div');
    lineNumEl.className = 'code-line-numbers';
    content.insertBefore(lineNumEl, content.firstChild);
  }
  lineNumEl.textContent = lineNumbers;
  content.scrollTop = 0;
  content.scrollLeft = 0;
  _clearViewerLineHighlight();
  _setViewerStatus('');
}

//지정한 줄 범위에 강조 띠를 깔고 그 위치로 스크롤한다.
//hljs가 코드를 다시 그리므로 줄 단위 span 대신 줄 높이로 위치를 계산해 오버레이를 둔다.
function _highlightViewerLines(startLine, endLine) {
  const content = document.getElementById('code-viewer-content');
  const codeEl = document.getElementById('code-viewer-code');
  if (!content || !codeEl || !startLine) return;
  _clearViewerLineHighlight();

  const style = getComputedStyle(codeEl);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const padTop = parseFloat(style.paddingTop) || 0;
  const lastLine = Math.max(startLine, endLine || startLine);

  const band = document.createElement('div');
  band.className = 'cv-line-highlight';
  //글자 크기가 화면 폭에 따라 바뀌므로(--code-font) px 대신 em으로 두어 창 크기가 바뀌어도 줄에 맞게 따라가게 한다
  const lineEm = lineHeight / (parseFloat(style.fontSize) || 13);
  band.style.top = `calc(${padTop}px + ${((startLine - 1) * lineEm).toFixed(4)}em)`;
  band.style.height = `${((lastLine - startLine + 1) * lineEm).toFixed(4)}em`;
  band.style.width = content.scrollWidth + 'px';
  content.appendChild(band);

  //시작 줄이 화면 위쪽 1/4 지점에 오도록 (범위가 짧으면 가운데 쯤)
  const target = padTop + (startLine - 1) * lineHeight - content.clientHeight * 0.25;
  content.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
}

function _clearViewerLineHighlight() {
  const content = document.getElementById('code-viewer-content');
  if (content) content.querySelectorAll('.cv-line-highlight').forEach(el => el.remove());
}

//진단 등에서 "이 파일의 몇 번째 줄"로 바로 이동한다.
//fnData가 있으면 "함수만 보기"로 그 함수 코드만 볼 수도 있게 한다.
async function showCodeAtLocation(filePath, startLine, endLine, name, fnData) {
  const panel = document.getElementById('code-viewer-panel');
  const filename = document.getElementById('code-viewer-filename');
  if (!panel || !filePath) return;

  const fnList = document.getElementById('code-viewer-fnlist');
  if (fnList) fnList.classList.add('hidden');
  _openCodeViewerPanel(panel);
  _setViewerStatus('코드를 불러오는 중...');

  let code;
  try {
    code = await fetchFileCode(filePath);
  } catch (err) {
    _setViewerStatus(err.message || '파일을 불러오지 못했습니다', true);
    return;
  }

  if (filename) {
    //에디터처럼 '파일:줄' 형식으로 표시하고 함수 이름은 뒤에 붙인다
    const where = startLine ? (startLine === endLine || !endLine ? `:${startLine}` : `:${startLine}-${endLine}`) : '';
    filename.textContent = filePath + where + (name ? '  ' + name : '');
    filename.title = filename.textContent;
  }
  _renderViewerCode(code || ' ', filePath, 1);

  _cvLastPartial = fnData && fnData.code
    ? { nodeData: { ...fnData, filePath, label: fnData.qualifiedName || fnData.name } }
    : null;
  if (_cvLastPartial) {
    _setFullCodeState(filePath, true);
  } else {
    //되돌아갈 함수 코드가 없으면 버튼을 숨긴다 (이미 전체 코드를 보고 있음)
    _setFullCodeState(null, false);
  }

  //패널이 열리는 중이면 폭이 바뀐 뒤에 강조 띠 너비가 맞도록 다음 프레임에 처리
  requestAnimationFrame(() => _highlightViewerLines(startLine, endLine));
}

function _openCodeViewerPanel(panel) {
  if (!panel.classList.contains('collapsed')) return;
  panel.classList.remove('collapsed');

  //그래프 리사이즈 + 화면 맞춤
  setTimeout(() => {
    if (typeof cy !== 'undefined' && cy) {
      cy.resize();
      cy.fit(undefined, 30);
    }
  }, 310);
}

function _setViewerStatus(message, isError) {
  const el = document.getElementById('code-viewer-status');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('hidden', !message);
  el.classList.toggle('error', !!isError);
}

//"코드 보기" 버튼 표시/라벨 갱신
function _setFullCodeState(filePath, showingFull) {
  _cvFilePath = filePath || null;
  _cvShowingFull = showingFull;
  const btn = document.getElementById('code-viewer-full-btn');
  if (!btn) return;
  const canFetch = !!(_cvFilePath && typeof graphData !== 'undefined' && graphData && graphData.analysisId);
  btn.classList.toggle('hidden', !canFetch);
  btn.classList.toggle('active', showingFull);
  btn.textContent = showingFull ? '함수만 보기' : '코드 보기';
  btn.title = showingFull ? '선택한 함수 코드로 돌아갑니다' : '이 파일의 전체 코드를 봅니다';
}

//파일 목록/함수 목록 헤더에서 파일 경로만 지정 (보여줄 함수 코드가 없을 때)
function setCodeViewerFile(filePath) {
  _cvLastPartial = null;
  _setFullCodeState(filePath, false);
}

//서버에서 파일 원본을 받아온다 (분석 id + 경로 기준으로 캐싱). 실패하면 에러를 던진다.
async function fetchFileCode(filePath) {
  if (!filePath || typeof graphData === 'undefined' || !graphData || !graphData.analysisId) {
    throw new Error('다시 분석한 뒤에 전체 코드를 볼 수 있습니다');
  }
  const key = graphData.analysisId + '::' + filePath;
  if (_fullCodeCache.has(key)) return _fullCodeCache.get(key);

  const params = new URLSearchParams({ id: graphData.analysisId, path: filePath });
  const res = await fetch('/api/file?' + params.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '파일을 불러오지 못했습니다');
  _fullCodeCache.set(key, data.code);
  return data.code;
}

//서버에서 파일 원본을 받아 전체 코드를 보여준다
async function showFullFileCode(filePath) {
  if (!filePath || typeof graphData === 'undefined' || !graphData || !graphData.analysisId) return;
  const panel = document.getElementById('code-viewer-panel');
  const filename = document.getElementById('code-viewer-filename');
  let code;
  _setViewerStatus('전체 코드를 불러오는 중...');
  try {
    code = await fetchFileCode(filePath);
  } catch (err) {
    _setViewerStatus(err.message || '파일을 불러오지 못했습니다', true);
    return;
  }

  if (filename) {
    filename.textContent = `${filePath} - 전체 코드`;
    filename.title = filename.textContent;
  }
  _renderViewerCode(code || ' ', filePath, 1);
  _setFullCodeState(filePath, true);
  //함수 목록에서 선택 표시 해제
  document.querySelectorAll('#code-viewer-fnlist .fn-list-item.active').forEach(el => el.classList.remove('active'));
  if (panel) _openCodeViewerPanel(panel);
}

//"코드 보기" 버튼: 전체 코드 ↔ 직전 함수 코드 전환
function toggleFullFileCode() {
  if (_cvShowingFull) {
    if (_cvLastPartial) {
      showCodeViewer(_cvLastPartial.nodeData, _cvLastPartial.options);
    }
    return;
  }
  showFullFileCode(_cvFilePath);
}

function hideCodeViewer() {
  const panel = document.getElementById('code-viewer-panel');
  if (!panel || panel.classList.contains('collapsed')) return;
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
  const fullBtn = document.getElementById('code-viewer-full-btn');
  if (fullBtn) {
    fullBtn.addEventListener('click', toggleFullFileCode);
  }
});
