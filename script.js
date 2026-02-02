// State
let treeData = [];
let nodeId = 0;
let dragSource = null;
let selectedId = null;

// DOM
const bankList = document.getElementById('bankList');
const treeList = document.getElementById('treeList');
const emptyState = document.getElementById('emptyState');
const createForm = document.getElementById('createForm');
const nodeNameInput = document.getElementById('nodeName');
const clearBtn = document.getElementById('clearBtn');
const expandBtn = document.getElementById('expandBtn');
const collapseBtn = document.getElementById('collapseBtn');
const canvas = document.getElementById('canvas');

// Default bank items
const DEFAULTS = ['CEO', 'Engineering', 'Design', 'Marketing', 'Sales'];

// TreeNode class
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

// Find node by id
function findNode(id, list = treeData) {
  for (const n of list) {
    if (n.id === id) return n;
    const found = findNode(id, n.children);
    if (found) return found;
  }
  return null;
}

// Get siblings array
function getSiblings(node) {
  return node.parent ? node.parent.children : treeData;
}

// Render
function render() {
  treeList.innerHTML = '';
  emptyState.classList.toggle('hidden', treeData.length > 0);
  
  treeData.forEach((node, i) => {
    renderNode(node, treeList, 0);
  });
  
  // Root drop zone
  const rootZone = document.createElement('div');
  rootZone.className = 'root-drop-zone';
  rootZone.id = 'rootDropZone';
  treeList.appendChild(rootZone);
}

function renderNode(node, container, depth) {
  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node-wrapper';
  wrapper.dataset.nodeId = node.id;
  wrapper.dataset.depth = depth;
  
  // Card
  const card = document.createElement('div');
  card.className = 'tree-card';
  card.draggable = true;
  card.dataset.nodeId = node.id;
  
  if (selectedId === node.id) {
    card.classList.add('selected');
  }
  
  // Toggle
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tree-card-toggle';
  
  if (node.children.length > 0) {
    toggle.innerHTML = node.collapsed
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    toggle.onclick = (e) => {
      e.stopPropagation();
      node.collapsed = !node.collapsed;
      render();
    };
  } else {
    toggle.className += ' leaf';
    toggle.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>';
  }
  
  // Name
  const name = document.createElement('span');
  name.className = 'tree-card-name';
  name.textContent = node.name;
  
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
  del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  del.onclick = (e) => {
    e.stopPropagation();
    node.remove();
    if (selectedId === node.id) selectedId = null;
    render();
  };
  
  card.append(toggle, name);
  if (count) card.appendChild(count);
  card.appendChild(del);
  
  // Card events
  card.onclick = () => {
    selectedId = node.id;
    render();
  };
  
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
  
  // Drop ghost (appears below card)
  const ghost = document.createElement('div');
  ghost.className = 'drop-ghost';
  ghost.dataset.targetId = node.id;
  wrapper.appendChild(ghost);
  
  // Children
  if (node.children.length > 0) {
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    if (node.collapsed) childContainer.classList.add('collapsed');
    
    node.children.forEach((child) => {
      renderNode(child, childContainer, depth + 1);
    });
    
    wrapper.appendChild(childContainer);
  }
  
  container.appendChild(wrapper);
}

// Clear all ghosts
function clearGhosts() {
  document.querySelectorAll('.drop-ghost').forEach(g => {
    g.classList.remove('visible', 'child-level');
    g.textContent = '';
  });
  document.getElementById('rootDropZone')?.classList.remove('active');
}

// Drag over handling
document.addEventListener('dragover', (e) => {
  if (!dragSource) return;
  e.preventDefault();
  
  clearGhosts();
  
  // Check if over a card
  const card = e.target.closest('.tree-card');
  
  if (card) {
    const targetId = parseInt(card.dataset.nodeId);
    const targetNode = findNode(targetId);
    
    if (!targetNode) return;
    
    // Can't drop on self or descendants
    if (dragSource.type === 'tree') {
      if (dragSource.node.id === targetId) return;
      if (targetNode.isDescendantOf(dragSource.node)) return;
    }
    
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    // Find the ghost for this card
    const wrapper = card.closest('.tree-node-wrapper');
    const ghost = wrapper.querySelector('.drop-ghost');
    
    if (ghost) {
      ghost.classList.add('visible');
      
      // Left 1/3 = sibling, Right 2/3 = child
      if (x < width / 3) {
        ghost.classList.remove('child-level');
        ghost.textContent = 'Insert as sibling';
        ghost.dataset.dropType = 'sibling';
      } else {
        ghost.classList.add('child-level');
        ghost.textContent = 'Insert as child';
        ghost.dataset.dropType = 'child';
      }
    }
    
    return;
  }
  
  // Check if over canvas but not over a card
  const isOverCanvas = e.target.closest('.tree-canvas');
  if (isOverCanvas) {
    const rootZone = document.getElementById('rootDropZone');
    if (rootZone) rootZone.classList.add('active');
  }
});

// Drop handling
document.addEventListener('drop', (e) => {
  if (!dragSource) return;
  e.preventDefault();
  
  // Find visible ghost
  const visibleGhost = document.querySelector('.drop-ghost.visible');
  
  if (visibleGhost) {
    const targetId = parseInt(visibleGhost.dataset.targetId);
    const dropType = visibleGhost.dataset.dropType;
    const targetNode = findNode(targetId);
    
    if (targetNode) {
      let newNode;
      
      if (dragSource.type === 'bank') {
        newNode = new TreeNode(dragSource.name);
      } else {
        // Validate
        if (dragSource.node.id === targetId) {
          clearGhosts();
          dragSource = null;
          return;
        }
        if (targetNode.isDescendantOf(dragSource.node)) {
          clearGhosts();
          dragSource = null;
          return;
        }
        newNode = dragSource.node;
        newNode.remove();
      }
      
      if (dropType === 'child') {
        targetNode.collapsed = false;
        targetNode.addChild(newNode, 0);
      } else {
        // Sibling - insert after target
        const siblings = getSiblings(targetNode);
        const idx = siblings.indexOf(targetNode);
        if (targetNode.parent) {
          targetNode.parent.addChild(newNode, idx + 1);
        } else {
          newNode.parent = null;
          treeData.splice(idx + 1, 0, newNode);
        }
      }
      
      clearGhosts();
      dragSource = null;
      render();
      return;
    }
  }
  
  // Root drop zone
  const rootZone = document.getElementById('rootDropZone');
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
    
    clearGhosts();
    dragSource = null;
    render();
    return;
  }
  
  clearGhosts();
  dragSource = null;
});

// Bank item
function createBankItem(name) {
  const item = document.createElement('div');
  item.className = 'bank-item';
  item.draggable = true;
  
  const grip = document.createElement('span');
  grip.className = 'bank-item-grip';
  grip.innerHTML = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="7" r="1.5"/><circle cx="8" cy="7" r="1.5"/><circle cx="2" cy="12" r="1.5"/><circle cx="8" cy="12" r="1.5"/></svg>';
  
  const nameEl = document.createElement('span');
  nameEl.className = 'bank-item-name';
  nameEl.textContent = name;
  
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'bank-item-delete';
  del.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
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
  if (!confirm('Clear entire tree?')) return;
  treeData = [];
  selectedId = null;
  render();
};

expandBtn.onclick = () => {
  const expandAll = (nodes) => {
    nodes.forEach(n => {
      n.collapsed = false;
      expandAll(n.children);
    });
  };
  expandAll(treeData);
  render();
};

collapseBtn.onclick = () => {
  const collapseAll = (nodes) => {
    nodes.forEach(n => {
      if (n.children.length) n.collapsed = true;
      collapseAll(n.children);
    });
  };
  collapseAll(treeData);
  render();
};

// Keyboard
document.onkeydown = (e) => {
  if (e.target.tagName === 'INPUT') return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
    const node = findNode(selectedId);
    if (node) {
      node.remove();
      selectedId = null;
      render();
    }
  }
};

// Click outside
canvas.onclick = (e) => {
  if (!e.target.closest('.tree-card')) {
    selectedId = null;
    render();
  }
};

// Init
DEFAULTS.forEach(n => createBankItem(n));
render();
