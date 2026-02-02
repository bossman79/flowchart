// State
let treeData = [];
let nodeId = 0;
let dragSource = null;
let selectedId = null;
let zoom = 1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

// Child threshold: drag past this % from left edge = child
const CHILD_THRESHOLD = 0.2; // 20% from left = easier to make child

// DOM
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const bankToggle = document.getElementById('bankToggle');
const bankList = document.getElementById('bankList');
const treeList = document.getElementById('treeList');
const emptyState = document.getElementById('emptyState');
const createForm = document.getElementById('createForm');
const nodeNameInput = document.getElementById('nodeName');
const clearBtn = document.getElementById('clearBtn');
const expandBtn = document.getElementById('expandBtn');
const collapseBtn = document.getElementById('collapseBtn');
const canvas = document.getElementById('canvas');
const canvasScroll = document.getElementById('canvasScroll');
const zoomIn = document.getElementById('zoomIn');
const zoomOut = document.getElementById('zoomOut');
const zoomReset = document.getElementById('zoomReset');
const zoomLevel = document.getElementById('zoomLevel');

// Defaults
const DEFAULTS = ['CEO', 'Engineering', 'Design', 'Marketing', 'Sales'];

// TreeNode
class TreeNode {
  constructor(name) {
    this.id = nodeId++;
    this.name = name;
    this.children = [];
    this.collapsed = false;
    this.parent = null;
  }

  addChild(node, index = -1) {
    node.parent = this;
    if (index >= 0 && index <= this.children.length) {
      this.children.splice(index, 0, node);
    } else {
      this.children.push(node);
    }
  }

  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i > -1) {
      this.children.splice(i, 1);
      node.parent = null;
    }
  }

  remove() {
    if (this.parent) {
      this.parent.removeChild(this);
    } else {
      const i = treeData.indexOf(this);
      if (i > -1) treeData.splice(i, 1);
    }
  }

  isDescendantOf(node) {
    let p = this.parent;
    while (p) {
      if (p === node) return true;
      p = p.parent;
    }
    return false;
  }
}

// Find node
function findNode(id, list = treeData) {
  for (const n of list) {
    if (n.id === id) return n;
    const found = findNode(id, n.children);
    if (found) return found;
  }
  return null;
}

// Get siblings
function getSiblings(node) {
  return node.parent ? node.parent.children : treeData;
}

// Render
function render() {
  treeList.innerHTML = '';
  emptyState.classList.toggle('hidden', treeData.length > 0);
  
  treeData.forEach(node => {
    renderNode(node, treeList, 0);
  });
  
  // Root drop zone at bottom
  const rootZone = document.createElement('div');
  rootZone.className = 'root-drop-zone';
  rootZone.id = 'rootDropZone';
  treeList.appendChild(rootZone);
  
  updateZoom();
}

function renderNode(node, container, depth) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node-wrapper';
  wrapper.dataset.nodeId = node.id;
  wrapper.dataset.depth = depth;
  
  // Card
  const card = document.createElement('div');
  card.className = 'tree-card';
  card.draggable = true;
  card.dataset.nodeId = node.id;
  
  if (selectedId === node.id) card.classList.add('selected');
  
  // Toggle
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tree-card-toggle';
  
  if (node.children.length > 0) {
    toggle.innerHTML = node.collapsed
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    toggle.onclick = (e) => {
      e.stopPropagation();
      node.collapsed = !node.collapsed;
      render();
    };
  } else {
    toggle.className += ' leaf';
    toggle.innerHTML = '<svg width="6" height="6" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>';
  }
  
  // Name (editable)
  const name = document.createElement('span');
  name.className = 'tree-card-name';
  name.textContent = node.name;
  name.onclick = (e) => {
    e.stopPropagation();
    startEditing(name, node);
  };
  
  // Count
  let count = null;
  if (node.children.length > 0) {
    count = document.createElement('span');
    count.className = 'tree-card-count';
    count.textContent = node.children.length;
  }
  
  // Delete
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'tree-card-delete';
  del.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  del.onclick = (e) => {
    e.stopPropagation();
    node.remove();
    if (selectedId === node.id) selectedId = null;
    render();
  };
  
  card.append(toggle, name);
  if (count) card.appendChild(count);
  card.appendChild(del);
  
  // Select on click
  card.onclick = (e) => {
    if (e.target.classList.contains('tree-card-name')) return;
    selectedId = node.id;
    render();
  };
  
  // Drag
  card.ondragstart = (e) => {
    dragSource = { type: 'tree', node };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };
  
  card.ondragend = () => {
    card.classList.remove('dragging');
    dragSource = null;
    clearGhosts();
  };
  
  wrapper.appendChild(card);
  
  // Ghost
  const ghost = document.createElement('div');
  ghost.className = 'drop-ghost';
  ghost.dataset.targetId = node.id;
  wrapper.appendChild(ghost);
  
  // Children
  if (node.children.length > 0) {
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    if (node.collapsed) childContainer.classList.add('collapsed');
    
    node.children.forEach(child => {
      renderNode(child, childContainer, depth + 1);
    });
    
    wrapper.appendChild(childContainer);
  }
  
  container.appendChild(wrapper);
}

// Inline editing
function startEditing(nameEl, node) {
  nameEl.contentEditable = true;
  nameEl.classList.add('editing');
  nameEl.focus();
  
  // Select all text
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  
  const finishEditing = () => {
    nameEl.contentEditable = false;
    nameEl.classList.remove('editing');
    const newName = nameEl.textContent.trim();
    if (newName && newName !== node.name) {
      node.name = newName;
    } else {
      nameEl.textContent = node.name;
    }
  };
  
  nameEl.onblur = finishEditing;
  nameEl.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameEl.blur();
    } else if (e.key === 'Escape') {
      nameEl.textContent = node.name;
      nameEl.blur();
    }
  };
}

// Clear ghosts
function clearGhosts() {
  document.querySelectorAll('.drop-ghost').forEach(g => {
    g.classList.remove('visible', 'as-child');
    g.textContent = '';
  });
  document.getElementById('rootDropZone')?.classList.remove('active');
}

// Drag over
document.addEventListener('dragover', (e) => {
  if (!dragSource) return;
  e.preventDefault();
  
  clearGhosts();
  
  const card = e.target.closest('.tree-card');
  const rootZone = e.target.closest('.root-drop-zone');
  
  if (card) {
    const targetId = parseInt(card.dataset.nodeId);
    const targetNode = findNode(targetId);
    
    if (!targetNode) return;
    
    // Validate
    if (dragSource.type === 'tree') {
      if (dragSource.node.id === targetId) return;
      if (targetNode.isDescendantOf(dragSource.node)) return;
    }
    
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    
    const wrapper = card.closest('.tree-node-wrapper');
    const ghost = wrapper?.querySelector('.drop-ghost');
    
    if (ghost) {
      ghost.classList.add('visible');
      
      // Left portion = sibling, rest = child
      if (pct < CHILD_THRESHOLD) {
        ghost.classList.remove('as-child');
        ghost.textContent = 'Add as sibling';
        ghost.dataset.dropType = 'sibling';
      } else {
        ghost.classList.add('as-child');
        ghost.textContent = 'Add as child';
        ghost.dataset.dropType = 'child';
      }
    }
  } else if (rootZone) {
    rootZone.classList.add('active');
  }
});

// Drop
document.addEventListener('drop', (e) => {
  if (!dragSource) return;
  e.preventDefault();
  
  const visibleGhost = document.querySelector('.drop-ghost.visible');
  const rootZone = document.getElementById('rootDropZone');
  
  if (visibleGhost) {
    const targetId = parseInt(visibleGhost.dataset.targetId);
    const dropType = visibleGhost.dataset.dropType;
    const targetNode = findNode(targetId);
    
    if (targetNode) {
      let newNode;
      
      if (dragSource.type === 'bank') {
        newNode = new TreeNode(dragSource.name);
      } else {
        if (dragSource.node.id === targetId) return cleanup();
        if (targetNode.isDescendantOf(dragSource.node)) return cleanup();
        newNode = dragSource.node;
        newNode.remove();
      }
      
      if (dropType === 'child') {
        targetNode.collapsed = false;
        targetNode.addChild(newNode, 0);
      } else {
        const siblings = getSiblings(targetNode);
        const idx = siblings.indexOf(targetNode);
        if (targetNode.parent) {
          targetNode.parent.addChild(newNode, idx + 1);
        } else {
          newNode.parent = null;
          treeData.splice(idx + 1, 0, newNode);
        }
      }
      
      cleanup();
      render();
      return;
    }
  }
  
  if (rootZone?.classList.contains('active')) {
    let newNode;
    if (dragSource.type === 'bank') {
      newNode = new TreeNode(dragSource.name);
    } else {
      newNode = dragSource.node;
      newNode.remove();
    }
    newNode.parent = null;
    treeData.push(newNode);
    cleanup();
    render();
    return;
  }
  
  cleanup();
  
  function cleanup() {
    clearGhosts();
    dragSource = null;
  }
});

// Bank item
function createBankItem(name) {
  const item = document.createElement('div');
  item.className = 'bank-item';
  item.draggable = true;
  
  const grip = document.createElement('span');
  grip.className = 'bank-item-grip';
  grip.innerHTML = '<svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="6" cy="2" r="1.5"/><circle cx="2" cy="6" r="1.5"/><circle cx="6" cy="6" r="1.5"/><circle cx="2" cy="10" r="1.5"/><circle cx="6" cy="10" r="1.5"/></svg>';
  
  const nameEl = document.createElement('span');
  nameEl.className = 'bank-item-name';
  nameEl.textContent = name;
  
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'bank-item-delete';
  del.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  del.onclick = (e) => {
    e.stopPropagation();
    item.remove();
  };
  
  item.append(grip, nameEl, del);
  
  item.ondragstart = (e) => {
    dragSource = { type: 'bank', name };
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', '');
  };
  
  item.ondragend = () => {
    item.classList.remove('dragging');
    dragSource = null;
    clearGhosts();
  };
  
  bankList.appendChild(item);
}

// Sidebar toggle
sidebarToggle.onclick = () => {
  sidebar.classList.toggle('collapsed');
};

// Bank toggle
bankToggle.onclick = () => {
  bankToggle.classList.toggle('collapsed');
  bankList.classList.toggle('collapsed');
};

// Form
createForm.onsubmit = (e) => {
  e.preventDefault();
  const name = nodeNameInput.value.trim();
  if (!name) return;
  createBankItem(name);
  nodeNameInput.value = '';
  nodeNameInput.focus();
};

// Actions
clearBtn.onclick = () => {
  if (treeData.length === 0) return;
  if (!confirm('Clear the entire tree?')) return;
  treeData = [];
  selectedId = null;
  render();
};

expandBtn.onclick = () => {
  const expand = (nodes) => nodes.forEach(n => {
    n.collapsed = false;
    expand(n.children);
  });
  expand(treeData);
  render();
};

collapseBtn.onclick = () => {
  const collapse = (nodes) => nodes.forEach(n => {
    if (n.children.length) n.collapsed = true;
    collapse(n.children);
  });
  collapse(treeData);
  render();
};

// Zoom
function updateZoom() {
  canvas.style.transform = `scale(${zoom})`;
  zoomLevel.textContent = Math.round(zoom * 100) + '%';
  
  // Adjust canvas size for scrolling
  canvas.style.minWidth = (100 / zoom) + '%';
  canvas.style.minHeight = (100 / zoom) + '%';
}

zoomIn.onclick = () => {
  zoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP);
  updateZoom();
};

zoomOut.onclick = () => {
  zoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP);
  updateZoom();
};

zoomReset.onclick = () => {
  zoom = 1;
  updateZoom();
};

// Keyboard
document.onkeydown = (e) => {
  if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;
  
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
    const node = findNode(selectedId);
    if (node) {
      node.remove();
      selectedId = null;
      render();
    }
  }
  
  // Zoom shortcuts
  if ((e.ctrlKey || e.metaKey) && e.key === '=') {
    e.preventDefault();
    zoomIn.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    e.preventDefault();
    zoomOut.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    e.preventDefault();
    zoomReset.click();
  }
};

// Click outside to deselect
canvasScroll.onclick = (e) => {
  if (!e.target.closest('.tree-card') && !e.target.closest('.root-drop-zone')) {
    selectedId = null;
    render();
  }
};

// Init
DEFAULTS.forEach(n => createBankItem(n));
render();
