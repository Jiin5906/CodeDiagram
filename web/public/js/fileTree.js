//파일 트리 탐색기 코드
//분석된 파일 목록에서 디렉토리 트리를 구축하고 패널에 표시한다.

//확장자별 아이콘 매핑
const fileIcons = {
  '.py': { icon: '\u{1F40D}', color: '#3b82f6' },
  '.js': { icon: 'JS', color: '#fbbf24' },
  '.ts': { icon: 'TS', color: '#3b82f6' },
  '.html': { icon: '\u{1F310}', color: '#4ade80' },
  '.css': { icon: '\u{1F3A8}', color: '#a78bfa' },
  '.cpp': { icon: 'C+', color: '#67e8f9' },
  '.cc': { icon: 'C+', color: '#67e8f9' },
  '.h': { icon: 'H', color: '#67e8f9' },
  '.hpp': { icon: 'H+', color: '#67e8f9' },
  '.cs': { icon: 'C#', color: '#86efac' },
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
    const dirs = Object.keys(obj).filter(k => k !== '_files').sort();
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
          iconSpan.textContent = '\u{1F4C4}';
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
          document.querySelectorAll('.tree-item.drop-target').forEach(el => el.classList.remove('drop-target'));
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
  document.querySelectorAll('.tree-item.active').forEach(el => el.classList.remove('active'));
  fileEl.classList.add('active');
  activeFilePath = fileEl.dataset.filePath;
}

//드래그 앤 드롭으로 파일 순서 변경
function reorderTreeItems(draggedPath, targetPath, container) {
  const items = Array.from(container.querySelectorAll('.tree-item'));
  const draggedEl = items.find(el => el.dataset.filePath === draggedPath);
  const targetEl = items.find(el => el.dataset.filePath === targetPath);
  if (!draggedEl || !targetEl || draggedEl.parentNode !== targetEl.parentNode) return;

  const parent = targetEl.parentNode;
  parent.insertBefore(draggedEl, targetEl);
}

function focusFileNode(filePath) {
  if (!cy) return;

  //해당 파일 노드 찾기
  const fileNodes = cy.nodes('[type="file"]').filter(n => n.data('fullPath') === filePath);
  if (fileNodes.length === 0) return;

  const target = fileNodes[0];

  //모든 하이라이트 초기화
  cy.nodes().removeClass('highlighted dimmed');
  cy.edges().removeClass('highlighted dimmed');

  //파일 노드 하이라이트
  target.addClass('highlighted');

  //자식 함수 노드도 함께 하이라이트
  const children = target.children();
  children.addClass('highlighted');

  //나머지 노드는 흐리게 (조상 제외)
  const ancestors = target.ancestors();
  const keepVisible = target.union(children).union(ancestors);
  cy.nodes().not(keepVisible).addClass('dimmed');

  //카메라 이동
  cy.animate({
    center: { eles: target },
    zoom: 2,
  }, { duration: 400 });
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
    //패널 전환 후 그래프 리사이즈
    setTimeout(() => {
      if (cy) cy.resize();
    }, 310);
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panel.classList.add('collapsed');
      setTimeout(() => {
        if (cy) cy.resize();
      }, 310);
    });
  }
}
