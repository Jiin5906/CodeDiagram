//파일 트리 탐색기 코드
//분석된 파일 목록에서 디렉토리 트리를 구축하고 패널에 표시한다.

//확장자별 아이콘 매핑 — 이모지 대신 짧은 글자 표식, 색은 그래프의 언어 색(LANG_COLORS)과 같다
const fileIcons = {
  '.py': { icon: 'py', color: LANG_COLORS.python.bg },
  '.js': { icon: 'js', color: LANG_COLORS.javascript.bg },
  '.ts': { icon: 'ts', color: LANG_COLORS.typescript.bg },
  '.tsx': { icon: 'tsx', color: LANG_COLORS.typescript.bg },
  '.html': { icon: '<>', color: LANG_COLORS.html.bg },
  '.htm': { icon: '<>', color: LANG_COLORS.html.bg },
  '.css': { icon: '{}', color: LANG_COLORS.css.bg },
  '.cpp': { icon: 'c++', color: LANG_COLORS.cpp.bg },
  '.cc': { icon: 'c++', color: LANG_COLORS.cpp.bg },
  '.h': { icon: 'h', color: LANG_COLORS.cpp.bg },
  '.hpp': { icon: 'h', color: LANG_COLORS.cpp.bg },
  '.cs': { icon: 'c#', color: LANG_COLORS.csharp.bg },
  '.java': { icon: 'jv', color: LANG_COLORS.java.bg },
};

//현재 선택된 파일 경로
let activeFilePath = null;

function buildFileTree(data) {
  const panel = document.getElementById('file-tree-content');
  if (!panel || !data) return;

  panel.textContent = '';

  //파일 경로 수집 (중복 제거) + 함수 카운트
  const filePaths = new Set();
  const fileFuncCounts = {};
  for (const node of data.nodes) {
    if (node.data.type === 'file' && node.data.fullPath) {
      filePaths.add(node.data.fullPath);
    }
    //함수 노드의 파일별 카운트
    const funcTypes = ['function', 'js-function', 'ts-function', 'cpp-function', 'csharp-function'];
    if (funcTypes.includes(node.data.type) && node.data.filePath) {
      fileFuncCounts[node.data.filePath] = (fileFuncCounts[node.data.filePath] || 0) + 1;
    }
  }

  if (filePaths.size === 0) return;

  //트리 구조 구축
  const tree = {};
  for (const fp of filePaths) {
    const parts = fp.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        //파일
        if (!current._files) current._files = [];
        current._files.push({ name: part, fullPath: fp });
      } else {
        //디렉토리
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  }

  //DOM 생성
  function renderTree(obj, container, depth) {
    //디렉토리 먼저
    const dirs = Object.keys(obj)
      .filter((k) => k !== '_files')
      .sort();
    for (const dir of dirs) {
      const dirEl = document.createElement('div');
      dirEl.className = 'tree-dir';

      const dirHeader = document.createElement('div');
      dirHeader.className = 'tree-dir-header';
      dirHeader.style.paddingLeft = `${depth * 16 + 8}px`;
      dirHeader.textContent = dir;
      dirHeader.addEventListener('click', () => {
        dirEl.classList.toggle('collapsed');
      });

      const dirContent = document.createElement('div');
      dirContent.className = 'tree-dir-content';

      dirEl.appendChild(dirHeader);
      dirEl.appendChild(dirContent);
      container.appendChild(dirEl);

      renderTree(obj[dir], dirContent, depth + 1);
    }

    //파일
    if (obj._files) {
      for (const file of obj._files.sort((a, b) => a.name.localeCompare(b.name))) {
        const fileEl = document.createElement('div');
        fileEl.className = 'tree-item';
        fileEl.style.paddingLeft = `${depth * 16 + 8}px`;
        fileEl.dataset.filePath = file.fullPath;

        //아이콘
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        const iconInfo = fileIcons[ext];
        const iconSpan = document.createElement('span');
        iconSpan.className = 'tree-file-icon';
        if (iconInfo) {
          iconSpan.textContent = iconInfo.icon;
          iconSpan.style.color = iconInfo.color;
        } else {
          iconSpan.textContent = '·';
        }

        //파일명
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tree-file-name';
        nameSpan.textContent = file.name;

        //함수 개수 배지
        const funcCount = fileFuncCounts[file.fullPath] || 0;
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'tree-func-badge';
        if (funcCount > 0) {
          badgeSpan.textContent = funcCount;
        }

        fileEl.appendChild(iconSpan);
        fileEl.appendChild(nameSpan);
        if (funcCount > 0) fileEl.appendChild(badgeSpan);

        //클릭 → 그래프 포커스
        fileEl.addEventListener('click', () => {
          focusFileNode(file.fullPath);
          setActiveTreeItem(fileEl);
        });

        //더블클릭 → 파일 상세 뷰
        fileEl.addEventListener('dblclick', () => {
          if (typeof renderFileDetailView === 'function' && graphData) {
            renderFileDetailView(graphData, file.fullPath);
            setupInteractions();
          }
        });

        //드래그 앤 드롭
        fileEl.draggable = true;
        fileEl.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', file.fullPath);
          fileEl.classList.add('dragging');
        });
        fileEl.addEventListener('dragend', () => {
          fileEl.classList.remove('dragging');
          document
            .querySelectorAll('.tree-item.drop-target')
            .forEach((el) => el.classList.remove('drop-target'));
        });
        fileEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          fileEl.classList.add('drop-target');
        });
        fileEl.addEventListener('dragleave', () => {
          fileEl.classList.remove('drop-target');
        });
        fileEl.addEventListener('drop', (e) => {
          e.preventDefault();
          fileEl.classList.remove('drop-target');
          const draggedPath = e.dataTransfer.getData('text/plain');
          if (draggedPath && draggedPath !== file.fullPath) {
            reorderTreeItems(draggedPath, file.fullPath, container);
          }
        });

        container.appendChild(fileEl);
      }
    }
  }

  renderTree(tree, panel, 0);
}

//활성 파일 항목 토글
function setActiveTreeItem(fileEl) {
  document.querySelectorAll('.tree-item.active').forEach((el) => el.classList.remove('active'));
  fileEl.classList.add('active');
  activeFilePath = fileEl.dataset.filePath;
}

//드래그 앤 드롭으로 파일 순서 변경
function reorderTreeItems(draggedPath, targetPath, container) {
  const items = Array.from(container.querySelectorAll('.tree-item'));
  const draggedEl = items.find((el) => el.dataset.filePath === draggedPath);
  const targetEl = items.find((el) => el.dataset.filePath === targetPath);
  if (!draggedEl || !targetEl || draggedEl.parentNode !== targetEl.parentNode) return;

  const parent = targetEl.parentNode;
  parent.insertBefore(draggedEl, targetEl);
}

function focusFileNode(filePath) {
  if (!cy) return;

  //뷰 모드에 따라 적절한 노드 타입으로 검색
  const selector = currentViewMode === 'file' ? '[type="file-node"]' : '[type="file"]';
  const fileNodes = cy.nodes(selector).filter((n) => n.data('fullPath') === filePath);
  if (fileNodes.length === 0) return;

  const target = fileNodes[0];

  //선택 하이라이트 — 검색 하이라이트는 유지된 채 겹쳐진다
  highlightNode(target);

  //카메라 이동
  cy.animate(
    {
      center: { eles: target },
      zoom: currentViewMode === 'file' ? 1.5 : 2,
    },
    { duration: 400, easing: 'ease-out-cubic' },
  );
}

let fileTreeListenersBound = false;

function setupFileTree() {
  if (fileTreeListenersBound) return;
  fileTreeListenersBound = true;

  const toggleBtn = document.getElementById('file-tree-toggle');
  const panel = document.getElementById('file-tree-panel');
  const closeBtn = document.getElementById('file-tree-close');

  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    //패널 전환 후 그래프 리사이즈 + 화면 맞춤
    setTimeout(() => {
      if (cy) {
        cy.resize();
        cy.fit(undefined, 30);
      }
    }, 310);
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panel.classList.add('collapsed');
      setTimeout(() => {
        if (cy) {
          cy.resize();
          cy.fit(undefined, 30);
        }
      }, 310);
    });
  }
}
