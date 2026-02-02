// State
let treeData = [];
let nodeIdCounter = 0;
let dragSource = null; // { type: 'bank' | 'tree', name?: string, node?: TreeNode }
let selectedNodeId = null;

// DOM Elements
const bankList = document.getElementById('bankList');
const canvas = document.getElementById('canvas');
const treeContainer = document.getElementById('treeContainer');
const canvasEmpty = document.getElementById('canvasEmpty');
const createForm = document.getElementById('createForm');
const nodeNameInput = document.getElementById('nodeName');
const clearBtn = document.getElementById('clearCanvas');
const expandAllBtn = document.getElementById('expandAll');
const collapseAllBtn = document.getElementById('collapseAll');

// Default items
const DEFAULT_ITEMS = ['CEO', 'Engineering', 'Design', 'Marketing', 'Sales'];

// Tree Node Class
class TreeNode {
  constructor(name) {
    this.id = nodeIdCounter++;
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
    const idx = this.children.indexOf(node);
    if (idx > -1) {
      this.children.splice(idx, 1);
      node.parent = null;
    }
  }

  isDescendantOf(node) {
    let current = this.parent;
    while (current) {
      if (current === node) return true;
      current = current.parent;
    }
    return false;
  }

  remove() {
    if (this.parent) {
      this.parent.removeChild(this);
    } else {
      const idx = treeData.indexOf(this);
      if (idx > -1) treeData.splice(idx, 1);
    }
  }
}

// Find node by ID
function findNode(id, nodes = treeData) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(id, node.children);
    if (found) return found;
  }
  return null;
}

// Insert node at position
function insertNode(node, targetNode, position) {
  // Remove from current position
  node.remove();
  
  if (position === 'child') {
    targetNode.addChild(node, 0);
    targetNode.collapsed = false;
  } else if (position === 'before') {
    const parent = targetNode.parent;
    const siblings = parent ? parent.children : treeData;
    const idx = siblings.indexOf(targetNode);
    if (parent) {
      parent.addChild(node, idx);
    } else {
      treeData.splice(idx, 0, node);
      node.parent = null;
    }
  } else if (position === 'after') {
    const parent = targetNode.parent;
    const siblings = parent ? parent.children : treeData;
    const idx = siblings.indexOf(targetNode);
    if (parent) {
      parent.addChild(node, idx + 1);
    } else {
      treeData.splice(idx + 1, 0, node);
      node.parent = null;
    }
  }
}

// Add to root
function addToRoot(node, index = -1) {
  node.remove();
  node.parent = null;
  if (index >= 0) {
    treeData.splice(index, 0, node);
  } else {
    treeData.push(node);
  }
}

// Render
function render() {
  treeContainer.innerHTML = '';
  canvasEmpty.classList.toggle('hidden', treeData.length > 0);
  
  if (treeData.length === 0) return;
  
  treeData.forEach((node, idx) => {
    renderNode(node, treeContainer, 0, [], idx === treeData.length - 1);
  });
  
  // Add root drop zone at the end
  const rootDropZone = document.createElement('div');
  rootDropZone.className = 'root-drop-zone';
  rootDropZone.dataset.dropTarget = 'root';
  treeContainer.appendChild(rootDropZone);
}

function renderNode(node, container, depth, lineFlags, isLast) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'tree-node';
  nodeEl.dataset.nodeId = node.id;
  
  const row = document.createElement('div');
  row.className = 'tree-node-row';
  row.draggable = true;
  row.dataset.nodeId = node.id;
  
  if (selectedNodeId === node.id) {
    row.classList.add('selected');
  }
  
  // Indent
  const indent = document.createElement('div');
  indent.className = 'tree-node-indent';
  
  for (let i = 0; i < depth; i++) {
    const unit = document.createElement('div');
    unit.className = 'tree-indent-unit';
    if (!lineFlags[i]) {
      unit.classList.add('no-line');
    }
    indent.appendChild(unit);
  }
  
  // Connector line
  if (depth > 0) {
    const connector = document.createElement('div');
    connector.className = 'tree-node-connector';
    row.appendChild(connector);
  }
  
  // Toggle button
  const toggle = document.createElement('button');
  toggle.className = 'tree-node-toggle';
  toggle.type = 'button';
  
  if (node.children.length > 0) {
    toggle.innerHTML = node.collapsed
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      node.collapsed = !node.collapsed;
      render();
    });
  } else {
    toggle.classList.add('leaf');
    toggle.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>';
  }
  
  // Content
  const content = document.createElement('div');
  content.className = 'tree-node-content';
  
  const name = document.createElement('span');
  name.className = 'tree-node-name';
  name.textContent = node.name;
  
  content.appendChild(name);
  
  if (node.children.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'tree-node-badge';
    badge.textContent = node.children.length;
    content.appendChild(badge);
  }
  
  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'tree-node-delete';
  deleteBtn.type = 'button';
  deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    node.remove();
    if (selectedNodeId === node.id) selectedNodeId = null;
    render();
  });
  
  content.appendChild(deleteBtn);
  
  row.append(indent, toggle, content);
  nodeEl.appendChild(row);
  
  // Row events
  row.addEventListener('click', () => {
    selectedNodeId = node.id;
    render();
  });
  
  row.addEventListener('dragstart', handleDragStart);
  row.addEventListener('dragend', handleDragEnd);
  row.addEventListener('dragover', handleDragOver);
  row.addEventListener('dragleave', handleDragLeave);
  row.addEventListener('drop', handleDrop);
  
  // Children
  if (node.children.length > 0) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-node-children';
    if (node.collapsed) {
      childrenContainer.classList.add('collapsed');
    }
    
    node.children.forEach((child, idx) => {
      const newLineFlags = [...lineFlags, !isLast];
      renderNode(child, childrenContainer, depth + 1, newLineFlags, idx === node.children.length - 1);
    });
    
    nodeEl.appendChild(childrenContainer);
  }
  
  container.appendChild(nodeEl);
}

// Drag & Drop Handlers
function handleDragStart(e) {
  const nodeId = parseInt(e.currentTarget.dataset.nodeId);
  const node = findNode(nodeId);
  if (!node) return;
  
  dragSource = { type: 'tree', node };
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'tree-node');
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  clearDropTargets();
  dragSource = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (!dragSource) return;
  
  const row = e.currentTarget;
  const nodeId = parseInt(row.dataset.nodeId);
  const targetNode = findNode(nodeId);
  
  if (!targetNode) return;
  
  // Can't drop on self or descendants
  if (dragSource.type === 'tree') {
    if (dragSource.node === targetNode) return;
    if (targetNode.isDescendantOf(dragSource.node)) return;
  }
  
  clearDropTargets();
  
  const rect = row.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const height = rect.height;
  
  // Determine drop position based on vertical position
  if (y < height * 0.25) {
    row.classList.add('drop-target-before');
    row.dataset.dropPosition = 'before';
  } else if (y > height * 0.75) {
    row.classList.add('drop-target-after');
    row.dataset.dropPosition = 'after';
  } else {
    row.classList.add('drop-target-child');
    row.dataset.dropPosition = 'child';
  }
  
  e.dataTransfer.dropEffect = 'move';
}

function handleDragLeave(e) {
  const row = e.currentTarget;
  if (!row.contains(e.relatedTarget)) {
    row.classList.remove('drop-target-before', 'drop-target-after', 'drop-target-child');
    delete row.dataset.dropPosition;
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const row = e.currentTarget;
  const nodeId = parseInt(row.dataset.nodeId);
  const targetNode = findNode(nodeId);
  const position = row.dataset.dropPosition;
  
  if (!targetNode || !position || !dragSource) return;
  
  let nodeToInsert;
  
  if (dragSource.type === 'bank') {
    nodeToInsert = new TreeNode(dragSource.name);
  } else {
    // Can't drop on self or descendants
    if (dragSource.node === targetNode) return;
    if (targetNode.isDescendantOf(dragSource.node)) return;
    nodeToInsert = dragSource.node;
  }
  
  insertNode(nodeToInsert, targetNode, position);
  clearDropTargets();
  dragSource = null;
  render();
}

function clearDropTargets() {
  document.querySelectorAll('.drop-target-before, .drop-target-after, .drop-target-child').forEach(el => {
    el.classList.remove('drop-target-before', 'drop-target-after', 'drop-target-child');
    delete el.dataset.dropPosition;
  });
  document.querySelectorAll('.root-drop-zone.active').forEach(el => {
    el.classList.remove('active');
  });
}

// Canvas drop (for empty or root drop zone)
canvas.addEventListener('dragover', (e) => {
  if (!dragSource) return;
  
  const isOverNode = e.target.closest('.tree-node-row');
  const rootZone = e.target.closest('.root-drop-zone');
  
  if (!isOverNode || rootZone) {
    e.preventDefault();
    clearDropTargets();
    const zone = document.querySelector('.root-drop-zone');
    if (zone) zone.classList.add('active');
    canvas.classList.add('drag-over');
  }
});

canvas.addEventListener('dragleave', (e) => {
  if (!canvas.contains(e.relatedTarget)) {
    canvas.classList.remove('drag-over');
    clearDropTargets();
  }
});

canvas.addEventListener('drop', (e) => {
  const isOverNode = e.target.closest('.tree-node-row');
  if (isOverNode) return; // Let node handle it
  
  e.preventDefault();
  canvas.classList.remove('drag-over');
  
  if (!dragSource) return;
  
  let node;
  if (dragSource.type === 'bank') {
    node = new TreeNode(dragSource.name);
  } else {
    node = dragSource.node;
  }
  
  addToRoot(node);
  clearDropTargets();
  dragSource = null;
  render();
});

// Bank Item Creation
function createBankItem(name) {
  const item = document.createElement('div');
  item.className = 'bank-item';
  item.draggable = true;
  
  const icon = document.createElement('span');
  icon.className = 'bank-item-icon';
  icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="12" cy="18" r="2"/></svg>';
  
  const nameSpan = document.createElement('span');
  nameSpan.className = 'bank-item-name';
  nameSpan.textContent = name;
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'bank-item-delete';
  deleteBtn.type = 'button';
  deleteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    item.remove();
  });
  
  item.append(icon, nameSpan, deleteBtn);
  
  item.addEventListener('dragstart', (e) => {
    dragSource = { type: 'bank', name };
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', 'bank-item');
  });
  
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    dragSource = null;
  });
  
  bankList.appendChild(item);
}

// Form submission
createForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nodeNameInput.value.trim();
  if (!name) return;
  createBankItem(name);
  nodeNameInput.value = '';
  nodeNameInput.focus();
});

// Action buttons
clearBtn.addEventListener('click', () => {
  if (treeData.length === 0) return;
  if (!confirm('Clear the entire tree?')) return;
  treeData = [];
  selectedNodeId = null;
  render();
});

expandAllBtn.addEventListener('click', () => {
  function expand(nodes) {
    nodes.forEach(n => {
      n.collapsed = false;
      expand(n.children);
    });
  }
  expand(treeData);
  render();
});

collapseAllBtn.addEventListener('click', () => {
  function collapse(nodes) {
    nodes.forEach(n => {
      if (n.children.length > 0) n.collapsed = true;
      collapse(n.children);
    });
  }
  collapse(treeData);
  render();
});

// Keyboard delete
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId !== null) {
    const node = findNode(selectedNodeId);
    if (node) {
      node.remove();
      selectedNodeId = null;
      render();
    }
  }
});

// Click outside to deselect
canvas.addEventListener('click', (e) => {
  if (!e.target.closest('.tree-node-row')) {
    selectedNodeId = null;
    render();
  }
});

// Initialize
DEFAULT_ITEMS.forEach(name => createBankItem(name));
render();
