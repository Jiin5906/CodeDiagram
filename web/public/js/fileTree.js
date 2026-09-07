//파일 트리 탐색기 코드
//분석된 파일 목록에서 디렉토리 트리를 구축하고 패널에 표시한다.

function buildFileTree(data) {
  const panel = document.getElementById('file-tree-content');
  if (!panel || !data) return;

  panel.textContent = '';

  //파일 경로 수집 (중복 제거)
  const filePaths = new Set();
  for (const node of data.nodes) {
    if (node.data.type === 'file' && node.data.fullPath) {
      filePaths.add(node.data.fullPath);
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
        fileEl.textContent = file.name;
        fileEl.addEventListener('click', () => {
          focusFileNode(file.fullPath);
        });
        container.appendChild(fileEl);
      }
    }
  }

  renderTree(tree, panel, 0);
}

function focusFileNode(filePath) {
  if (!cy) return;

  //해당 파일 노드 찾기
  const fileNodes = cy.nodes('[type="file"]').filter(n => n.data('fullPath') === filePath);
  if (fileNodes.length === 0) return;

  const target = fileNodes[0];

  //하이라이트
  cy.nodes().removeClass('highlighted dimmed');
  target.addClass('highlighted');

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
