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
  '.java': 'java',
};

//함수 목록용 이름: label에는 "(1↓ 2↑)"가 붙어 있으므로 배지와 겹치지 않게 순수 이름을 쓴다
function fnDisplayName(fn) {
  return fn.qualifiedName || String(fn.name || '').replace(/\s*\([\d↓↑ ]+\)$/, '');
}

//참조 배지: N↓ = 이 함수를 호출하는 함수 수(inDegree), N↑ = 이 함수가 호출하는 함수 수(outDegree).
//같은 함수를 여러 번 호출해도 1로 센다. 그래프 노드 라벨의 "(N↓ M↑)" 표기와 같은 규칙이다.
function appendRefBadges(parent, fn, className) {
  const inCount = fn.inDegree || 0;
  const outCount = fn.outDegree || 0;
  if (inCount > 0) {
    const el = document.createElement('span');
    el.className = className + ' ref-in';
    el.textContent = inCount + '↓';
    el.title = inCount + '개 함수가 이 함수를 호출합니다';
    parent.appendChild(el);
  }
  if (outCount > 0) {
    const el = document.createElement('span');
    el.className = className + ' ref-out';
    el.textContent = outCount + '↑';
    el.title = '이 함수가 ' + outCount + '개 함수를 호출합니다';
    parent.appendChild(el);
  }
}

//서버에서 받은 파일 원본 캐시
const _fullCodeCache = new Map(); // analysisId::path -> code
//빠르게 여러 곳을 클릭했을 때 늦게 도착한 이전 파일이 화면을 덮어쓰지 않도록 하는 순번
let _cvSeq = 0;
//지금 화면에 그려진 파일 (같은 파일 안에서 이동할 때는 다시 하이라이팅하지 않고 스크롤만 한다)
let _cvRenderedFile = null;
let _cvRenderedCode = null;

//함수/노드 코드를 보여준다. 파일 원본을 받을 수 있으면 파일 전체를 띄우고 해당 범위를 강조해 스크롤한다.
//(함수 코드만 따로 보여주던 방식 → 앞뒤 코드도 함께 보이도록 통일)
//options.keepFnList: 파일 클릭으로 연 함수 목록을 그대로 둔다
function showCodeViewer(nodeData, options) {
  const panel = document.getElementById('code-viewer-panel');
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

  const name = nodeData.qualifiedName || nodeData.label || '';
  const file = nodeData.filePath || '';
  const startLine = nodeData.startLine || 1;
  const endLine = nodeData.endLine || startLine + code.split('\n').length - 1;

  _openCodeViewerPanel(panel);
  _loadViewerLocation(file, nodeData.startLine ? startLine : 0, endLine, name, { code, startLine });
}

//파일 전체를 불러와 [startLine, endLine]을 강조한다.
//파일을 받을 수 없으면 fallback 코드 조각(함수 코드)만 보여준다.
async function _loadViewerLocation(filePath, startLine, endLine, name, fallback) {
  const filename = document.getElementById('code-viewer-filename');
  const seq = ++_cvSeq;

  const setTitle = () => {
    if (!filename) return;
    //에디터처럼 '파일:줄' 형식으로 표시하고 이름은 뒤에 붙인다
    const where = startLine
      ? startLine === endLine || !endLine
        ? `:${startLine}`
        : `:${startLine}-${endLine}`
      : '';
    filename.textContent = (filePath || '') + where + (name ? '  ' + name : '');
    filename.title = filename.textContent;
  };

  const canFetch = !!(
    filePath &&
    typeof graphData !== 'undefined' &&
    graphData &&
    graphData.analysisId
  );
  if (canFetch) {
    const cached = _fullCodeCache.get(graphData.analysisId + '::' + filePath);
    if (!cached) _setViewerStatus('코드를 불러오는 중...');
    try {
      const code = cached !== undefined ? cached : await fetchFileCode(filePath);
      if (seq !== _cvSeq) return;
      setTitle();
      if (_cvRenderedFile === filePath && _cvRenderedCode === code) {
        _clearViewerLineHighlight();
        _setViewerStatus('');
      } else {
        _renderViewerCode(code || ' ', filePath, 1);
        _cvRenderedFile = filePath;
        _cvRenderedCode = code;
      }
      //패널이 열리는 중이면 폭이 바뀐 뒤에 강조 띠 너비가 맞도록 다음 프레임에 처리
      if (startLine) requestAnimationFrame(() => _highlightViewerLines(startLine, endLine));
      return;
    } catch (err) {
      if (seq !== _cvSeq) return;
      if (!fallback) {
        _setViewerStatus(err.message || '파일을 불러오지 못했습니다', true);
        return;
      }
    }
  }

  if (!fallback) return;
  setTitle();
  _renderViewerCode(fallback.code, filePath, fallback.startLine || 1);
  _cvRenderedFile = null;
  _cvRenderedCode = null;
  if (canFetch) _setViewerStatus('파일 전체를 불러오지 못해 해당 코드만 보여줍니다', true);
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
  const lineNumbers = code
    .split('\n')
    .map((_, i) => startLine + i)
    .join('\n');
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
  if (content) content.querySelectorAll('.cv-line-highlight').forEach((el) => el.remove());
}

//진단·참조 목록 등에서 "이 파일의 몇 번째 줄"로 바로 이동한다.
//options.keepList: 코드 위의 목록(참조 목록 등)을 그대로 둔다
function showCodeAtLocation(filePath, startLine, endLine, name, options) {
  const panel = document.getElementById('code-viewer-panel');
  if (!panel || !filePath) return;

  if (!options || !options.keepList) {
    const fnList = document.getElementById('code-viewer-fnlist');
    if (fnList) fnList.classList.add('hidden');
  }
  hideViewerExplain();
  _openCodeViewerPanel(panel);
  _loadViewerLocation(filePath, startLine, endLine || startLine, name, null);
}

function _openCodeViewerPanel(panel) {
  //파일 노드 위에 떠 있던 함수 미리보기가 코드 창을 가리지 않게 먼저 닫는다
  if (typeof hideFunctionPreview === 'function') hideFunctionPreview();
  if (typeof hideEdgePreview === 'function') hideEdgePreview();
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

//서버에서 파일 원본을 받아 전체 코드를 보여준다 (함수가 없는 파일 등)
function showFullFileCode(filePath) {
  const panel = document.getElementById('code-viewer-panel');
  if (!panel || !filePath) return;
  _openCodeViewerPanel(panel);
  _loadViewerLocation(filePath, 0, 0, '전체 코드', null);
}

function hideCodeViewer() {
  const panel = document.getElementById('code-viewer-panel');
  if (!panel || panel.classList.contains('collapsed')) return;
  hideViewerExplain();
  panel.classList.add('collapsed');
  setTimeout(() => {
    if (typeof cy !== 'undefined' && cy) {
      cy.resize();
      cy.fit(undefined, 30);
    }
  }, 310);
}

/* ── 코드 뷰어 내 AI 해설 영역 ── */

//해설 영역을 비우고 보여준다. 내용을 채울 본문 요소를 돌려준다.
function showViewerExplain(titleText = 'AI 해설') {
  const box = document.getElementById('code-viewer-explain');
  const body = document.getElementById('cv-explain-body');
  if (!box || !body) return null;
  const titleEl = box.querySelector('.cv-explain-title');
  if (titleEl) titleEl.textContent = titleText;
  const toggleBtn = document.getElementById('cv-explain-toggle');
  box.classList.remove('hidden', 'collapsed');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
  body.textContent = '';
  return body;
}

function hideViewerExplain() {
  const box = document.getElementById('code-viewer-explain');
  if (box) box.classList.add('hidden');
}

/* ── 코드 뷰어 너비 조절 ──
   너비를 px가 아닌 화면 너비 비율로 저장해 창 크기가 바뀌어도 같은 비율을 유지한다 */

const CV_RATIO_KEY = 'codediagram-code-ratio';
const CV_RATIO_MIN = 0.18;
const CV_RATIO_MAX = 0.6;

function _applyCodeViewerRatio(ratio) {
  const root = document.documentElement;
  if (ratio) {
    root.style.setProperty('--panel-code-ratio', (ratio * 100).toFixed(2) + 'vw');
  } else {
    root.style.removeProperty('--panel-code-ratio');
  }
}

function _setupCodeViewerResizer() {
  const panel = document.getElementById('code-viewer-panel');
  const handle = document.getElementById('code-viewer-resizer');
  if (!panel || !handle) return;

  try {
    const saved = parseFloat(localStorage.getItem(CV_RATIO_KEY));
    if (saved >= CV_RATIO_MIN && saved <= CV_RATIO_MAX) _applyCodeViewerRatio(saved);
  } catch (e) {
    /* noop */
  }

  let dragging = false;
  let rafId = 0;
  let lastRatio = null;

  const resizeGraph = () => {
    rafId = 0;
    if (typeof cy !== 'undefined' && cy) cy.resize();
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    panel.classList.add('resizing');
    document.body.classList.add('cv-resizing');
    e.preventDefault();
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const right = panel.getBoundingClientRect().right;
    const ratio = Math.min(
      CV_RATIO_MAX,
      Math.max(CV_RATIO_MIN, (right - e.clientX) / window.innerWidth),
    );
    lastRatio = ratio;
    _applyCodeViewerRatio(ratio);
    if (!rafId) rafId = requestAnimationFrame(resizeGraph);
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('resizing');
    document.body.classList.remove('cv-resizing');
    if (lastRatio) {
      try {
        localStorage.setItem(CV_RATIO_KEY, String(lastRatio));
      } catch (e) {
        /* noop */
      }
    }
    resizeGraph();
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  //더블클릭: 기본 비율로 되돌린다
  handle.addEventListener('dblclick', () => {
    lastRatio = null;
    _applyCodeViewerRatio(null);
    try {
      localStorage.removeItem(CV_RATIO_KEY);
    } catch (e) {
      /* noop */
    }
    resizeGraph();
  });
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

  lines.forEach((span) => {
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
  codeArea.querySelectorAll('.line-highlighted').forEach((el) => {
    el.classList.remove('line-highlighted');
  });
}

//코드 뷰어 닫기 버튼 이벤트
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('code-viewer-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideCodeViewer);
  }
  //AI 해설 접기/펼치기
  const explainToggle = document.getElementById('cv-explain-toggle');
  if (explainToggle) {
    explainToggle.addEventListener('click', () => {
      const box = document.getElementById('code-viewer-explain');
      const collapsed = box.classList.toggle('collapsed');
      explainToggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }
  _setupCodeViewerResizer();
});
