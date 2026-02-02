// State
let treeData = [];
let nodeId = 0;
let dragSource = null;
let selectedId = null;
let zoom = 1;
let repositionDrag = null; // For dragging left edge to reposition

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
const INDENT_SIZE = 28;

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
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const importStatus = document.getElementById('importStatus');
const exportBtn = document.getElementById('exportBtn');
const levelTintToggle = document.getElementById('levelTintToggle');

const DEFAULTS = ['CEO', 'Engineering', 'Design', 'Marketing', 'Sales'];
const LEVEL_COLORS = [
  '#1c2d4f',
  '#22355b',
  '#283c67',
  '#2f4474',
  '#374c81',
  '#40548f',
  '#4a5d9e'
];

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
  
  getDepth() {
    let d = 0, p = this.parent;
    while (p) { d++; p = p.parent; }
    return d;
  }
  
  getPreviousSibling() {
    const siblings = this.parent ? this.parent.children : treeData;
    const idx = siblings.indexOf(this);
    return idx > 0 ? siblings[idx - 1] : null;
  }
  
  getVisibleNodeAbove() {
    // Get the node visually above this one
    const prev = this.getPreviousSibling();
    if (prev) {
      // Get the last visible descendant of prev
      let node = prev;
      while (node.children.length > 0 && !node.collapsed) {
        node = node.children[node.children.length - 1];
      }
      return node;
    }
    return this.parent;
  }
}

function findNode(id, list = treeData) {
  for (const n of list) {
    if (n.id === id) return n;
    const found = findNode(id, n.children);
    if (found) return found;
  }
  return null;
}

function getSiblings(node) {
  return node.parent ? node.parent.children : treeData;
}

// Get flat list of visible nodes
function getVisibleNodes(nodes = treeData, list = []) {
  for (const node of nodes) {
    list.push(node);
    if (!node.collapsed && node.children.length) {
      getVisibleNodes(node.children, list);
    }
  }
  return list;
}

// Render
function render() {
  treeList.innerHTML = '';
  
  const isEmpty = treeData.length === 0;
  emptyState.classList.toggle('hidden', !isEmpty);
  
  treeData.forEach(node => renderNode(node, treeList, 0));
  
  // Root drop zone
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
  wrapper.style.setProperty('--depth', depth);
  if (depth > 0) wrapper.classList.add('has-parent');
  wrapper.classList.add(`depth-${Math.min(depth, LEVEL_COLORS.length - 1)}`);
  
  const card = document.createElement('div');
  card.className = 'tree-card';
  card.dataset.nodeId = node.id;
  card.dataset.depth = depth;
  card.style.marginLeft = (depth * INDENT_SIZE) + 'px';
  card.style.setProperty('--depth', depth);
  card.classList.add(`depth-${Math.min(depth, LEVEL_COLORS.length - 1)}`);
  
  if (selectedId === node.id) card.classList.add('selected');
  
  // Left edge drag handle for repositioning
  const dragHandle = document.createElement('div');
  dragHandle.className = 'tree-card-handle';
  dragHandle.title = 'Drag left/right to change hierarchy';
  dragHandle.innerHTML = '<svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/></svg>';
  
  // Handle mousedown for reposition dragging
  dragHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startRepositionDrag(node, card, e);
  });
  
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
  
  // Name (click to edit)
  const name = document.createElement('span');
  name.className = 'tree-card-name';
  name.textContent = node.name;
  name.onclick = (e) => {
    e.stopPropagation();
    startEditing(name, node);
  };
  
  // Count badge
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
  del.onmousedown = (e) => e.stopPropagation();

  // Quick add child
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'tree-card-add';
  addBtn.title = 'Add child node';
  addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
  addBtn.onclick = (e) => {
    e.stopPropagation();
    addChildNode(node);
  };
  addBtn.onmousedown = (e) => e.stopPropagation();

  const actions = document.createElement('div');
  actions.className = 'tree-card-actions';
  actions.append(addBtn, del);
  
  // Card content wrapper (draggable for moving between cards)
  const content = document.createElement('div');
  content.className = 'tree-card-content';
  content.draggable = true;
  
  content.ondragstart = (e) => {
    dragSource = { type: 'tree', node };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };
  
  content.ondragend = () => {
    card.classList.remove('dragging');
    dragSource = null;
    clearDropStates();
  };
  
  content.append(toggle, name);
  if (count) content.appendChild(count);
  
  card.append(dragHandle, content, actions);
  
  // Select on click
  card.onclick = () => {
    selectedId = node.id;
    render();
  };
  
  wrapper.appendChild(card);
  
  // Drop zone below this card
  const dropZone = document.createElement('div');
  dropZone.className = 'drop-zone';
  dropZone.dataset.targetId = node.id;
  wrapper.appendChild(dropZone);
  
  // Children
  if (node.children.length > 0) {
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    if (node.collapsed) childContainer.classList.add('collapsed');
    
    node.children.forEach(child => renderNode(child, childContainer, depth + 1));
    wrapper.appendChild(childContainer);
  }
  
  container.appendChild(wrapper);
}

function addChildNode(parentNode) {
  const newNode = new TreeNode('New Node');
  parentNode.collapsed = false;
  parentNode.addChild(newNode, 0);
  selectedId = newNode.id;
  render();
  requestAnimationFrame(() => {
    const nameEl = document.querySelector(`.tree-card[data-node-id="${newNode.id}"] .tree-card-name`);
    if (nameEl) startEditing(nameEl, newNode);
  });
}

// Reposition drag (drag left edge to change hierarchy)
function startRepositionDrag(node, cardEl, startEvent) {
  const startX = startEvent.clientX;
  const startDepth = node.getDepth();
  const startMargin = startDepth * INDENT_SIZE;
  
  repositionDrag = { node, cardEl, startX, startDepth, startMargin };
  cardEl.classList.add('repositioning');
  document.body.style.cursor = 'ew-resize';
  
  // Create preview element
  const preview = document.createElement('div');
  preview.className = 'reposition-preview';
  preview.id = 'repositionPreview';
  cardEl.parentElement.insertBefore(preview, cardEl.nextSibling);
  
  document.addEventListener('mousemove', handleRepositionMove);
  document.addEventListener('mouseup', handleRepositionEnd);
}

function handleRepositionMove(e) {
  if (!repositionDrag) return;
  
  const { node, cardEl, startX, startDepth, startMargin } = repositionDrag;
  const deltaX = e.clientX - startX;
  const newMargin = Math.max(0, startMargin + deltaX);
  const newDepth = Math.round(newMargin / INDENT_SIZE);
  
  // Clamp depth based on what's possible
  const nodeAbove = node.getVisibleNodeAbove();
  const maxDepth = nodeAbove ? nodeAbove.getDepth() + 1 : 0;
  const clampedDepth = Math.min(newDepth, maxDepth);
  
  // Update visual
  cardEl.style.marginLeft = (clampedDepth * INDENT_SIZE) + 'px';
  
  // Update preview
  const preview = document.getElementById('repositionPreview');
  if (preview) {
    preview.style.marginLeft = (clampedDepth * INDENT_SIZE) + 'px';
    
    if (clampedDepth > startDepth) {
      preview.textContent = 'Become child';
      preview.className = 'reposition-preview as-child';
    } else if (clampedDepth < startDepth) {
      preview.textContent = 'Move up hierarchy';
      preview.className = 'reposition-preview as-parent';
    } else {
      preview.textContent = '';
      preview.className = 'reposition-preview';
    }
  }
  
  repositionDrag.targetDepth = clampedDepth;
}

function handleRepositionEnd(e) {
  if (!repositionDrag) return;
  
  const { node, cardEl, startDepth, targetDepth } = repositionDrag;
  
  document.removeEventListener('mousemove', handleRepositionMove);
  document.removeEventListener('mouseup', handleRepositionEnd);
  document.body.style.cursor = '';
  
  const preview = document.getElementById('repositionPreview');
  if (preview) preview.remove();
  
  cardEl.classList.remove('repositioning');
  
  if (targetDepth !== undefined && targetDepth !== startDepth) {
    applyRepositionDepthChange(node, startDepth, targetDepth);
  }
  
  repositionDrag = null;
  render();
}

function applyRepositionDepthChange(node, oldDepth, newDepth) {
  const nodeAbove = node.getVisibleNodeAbove();
  
  if (newDepth > oldDepth && nodeAbove) {
    // Moving right = become child of node above
    node.remove();
    nodeAbove.collapsed = false;
    nodeAbove.addChild(node);
  } else if (newDepth < oldDepth && node.parent) {
    // Moving left = move up in hierarchy
    const levelsUp = oldDepth - newDepth;
    let targetParent = node.parent;
    
    for (let i = 0; i < levelsUp; i++) {
      if (!targetParent) break;
      
      const grandparent = targetParent.parent;
      const siblings = grandparent ? grandparent.children : treeData;
      const parentIdx = siblings.indexOf(targetParent);
      
      node.remove();
      
      if (grandparent) {
        grandparent.addChild(node, parentIdx + 1);
      } else {
        node.parent = null;
        treeData.splice(parentIdx + 1, 0, node);
      }
      
      targetParent = grandparent;
    }
  }
}

// Inline editing
function startEditing(nameEl, node) {
  nameEl.contentEditable = true;
  nameEl.classList.add('editing');
  nameEl.focus();
  
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  
  const finish = () => {
    nameEl.contentEditable = false;
    nameEl.classList.remove('editing');
    const newName = nameEl.textContent.trim();
    if (newName && newName !== node.name) {
      node.name = newName;
    } else {
      nameEl.textContent = node.name;
    }
  };
  
  nameEl.onblur = finish;
  nameEl.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    else if (e.key === 'Escape') { nameEl.textContent = node.name; nameEl.blur(); }
  };
}

// Clear all drop states
function clearDropStates() {
  document.querySelectorAll('.drop-zone').forEach(z => {
    z.classList.remove('active', 'as-child');
    z.textContent = '';
  });
  document.getElementById('rootDropZone')?.classList.remove('active');
  canvas.classList.remove('drop-active');
}

// Drag over for new items
canvasScroll.addEventListener('dragover', (e) => {
  if (!dragSource) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = dragSource.type === 'bank' ? 'copy' : 'move';
  
  clearDropStates();
  
  // Find the card we're over
  const card = e.target.closest('.tree-card');
  
  if (card && !card.classList.contains('dragging')) {
    const targetId = parseInt(card.dataset.nodeId);
    const targetNode = findNode(targetId);
    
    if (!targetNode) return;
    if (dragSource.type === 'tree' && dragSource.node.id === targetId) return;
    if (dragSource.type === 'tree' && targetNode.isDescendantOf(dragSource.node)) return;
    
    // Find drop zone for this card
    const wrapper = card.closest('.tree-node-wrapper');
    const dropZone = wrapper?.querySelector('.drop-zone');
    
    if (dropZone) {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = x / rect.width;
      
      dropZone.classList.add('active');
      
      // Very left edge (< 15%) = sibling, otherwise = child
      if (pct < 0.15) {
        dropZone.classList.remove('as-child');
        dropZone.textContent = 'Add as sibling below';
        dropZone.dataset.dropType = 'sibling';
      } else {
        dropZone.classList.add('as-child');
        dropZone.textContent = 'Add as child';
        dropZone.dataset.dropType = 'child';
      }
    }
  } else {
    // Not over a card - show root drop
    const rootZone = document.getElementById('rootDropZone');
    if (rootZone && !e.target.closest('.tree-card')) {
      rootZone.classList.add('active');
    }
    if (treeData.length === 0) {
      canvas.classList.add('drop-active');
    }
  }
});

canvasScroll.addEventListener('dragleave', (e) => {
  if (!canvasScroll.contains(e.relatedTarget)) {
    clearDropStates();
  }
});

// Drop
canvasScroll.addEventListener('drop', (e) => {
  if (!dragSource) return;
  e.preventDefault();
  e.stopPropagation();
  
  const activeZone = document.querySelector('.drop-zone.active');
  const rootZone = document.getElementById('rootDropZone');
  const isCanvasActive = canvas.classList.contains('drop-active');
  
  if (activeZone) {
    const targetId = parseInt(activeZone.dataset.targetId);
    const dropType = activeZone.dataset.dropType;
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
        // Sibling below
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
  
  // Root drop
  if (rootZone?.classList.contains('active') || isCanvasActive) {
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
    clearDropStates();
    dragSource = null;
  }
});

// Bank item
function createBankItem(name) {
  const item = document.createElement('div');
  item.className = 'bank-item';
  item.draggable = true;
  
  const nameEl = document.createElement('span');
  nameEl.className = 'bank-item-name';
  nameEl.textContent = name;
  
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'bank-item-delete';
  del.innerHTML = '×';
  del.onclick = (e) => { e.stopPropagation(); item.remove(); };
  
  item.append(nameEl, del);
  
  item.ondragstart = (e) => {
    dragSource = { type: 'bank', name };
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', '');
  };
  
  item.ondragend = () => {
    item.classList.remove('dragging');
    dragSource = null;
    clearDropStates();
  };
  
  bankList.appendChild(item);
}

// Sidebar toggle
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// Bank toggle
bankToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const bankSection = bankToggle.closest('.bank-section');
  bankSection.classList.toggle('collapsed');
  bankToggle.classList.toggle('collapsed');
});

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
  const expand = (nodes) => nodes.forEach(n => { n.collapsed = false; expand(n.children); });
  expand(treeData);
  render();
};

collapseBtn.onclick = () => {
  const collapse = (nodes) => nodes.forEach(n => { if (n.children.length) n.collapsed = true; collapse(n.children); });
  collapse(treeData);
  render();
};

// Import
function setImportStatus(message, type = '') {
  if (!importStatus) return;
  importStatus.textContent = message;
  importStatus.classList.remove('success', 'error');
  if (type) importStatus.classList.add(type);
}

function sheetToRows(workbook) {
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const worksheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      if (row.some(cell => String(cell).trim() !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some(cell => String(cell).trim() !== '')) {
    rows.push(row);
  }

  return rows;
}

async function parseImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    const text = await file.text();
    if (window.XLSX) {
      const workbook = XLSX.read(text, { type: 'string' });
      return sheetToRows(workbook);
    }
    return parseCsvRows(text);
  }

  if (ext === 'xlsx' || ext === 'xls') {
    if (!window.XLSX) {
      throw new Error('XLSX parser not available.');
    }
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    return sheetToRows(workbook);
  }

  throw new Error('Unsupported file type.');
}

function getLevelIndexes(headerRow) {
  const indexes = [];
  headerRow.forEach((header, idx) => {
    const label = String(header || '').trim();
    if (/^level\s*\d+/i.test(label)) {
      indexes.push(idx);
    }
  });

  if (indexes.length > 0) return indexes;

  const fallback = [];
  headerRow.forEach((header, idx) => {
    const label = String(header || '').trim().toLowerCase();
    if (!label || label === 'type') return;
    fallback.push(idx);
  });

  if (fallback.length > 0) return fallback;

  return [0, 1, 2, 3];
}

function buildTreeFromRows(rows) {
  if (!rows.length) return [];

  const headerRow = rows[0] || [];
  const headerLabels = headerRow.map(cell => String(cell || '').trim());
  const hasLevelHeaders = headerLabels.some(label => /^level\s*\d+/i.test(label));
  const levelIndexes = getLevelIndexes(headerLabels);
  const startRow = hasLevelHeaders ? 1 : 0;

  const roots = [];
  const current = new Array(levelIndexes.length).fill('');

  const addPath = (path) => {
    let list = roots;
    let parent = null;
    path.forEach(name => {
      let node = list.find(n => n.name === name);
      if (!node) {
        node = new TreeNode(name);
        if (parent) {
          parent.addChild(node);
        } else {
          node.parent = null;
          roots.push(node);
        }
      }
      parent = node;
      list = node.children;
    });
  };

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i] || [];
    let rowHasValue = false;

    levelIndexes.forEach((colIndex, levelIdx) => {
      const value = String(row[colIndex] || '').trim();
      if (value) {
        rowHasValue = true;
        current[levelIdx] = value;
        for (let j = levelIdx + 1; j < current.length; j++) {
          current[j] = '';
        }
      }
    });

    if (!rowHasValue) continue;

    const path = [];
    for (let j = 0; j < current.length; j++) {
      if (!current[j]) break;
      path.push(current[j]);
    }

    if (path.length) addPath(path);
  }

  return roots;
}

function countNodes(nodes) {
  let count = 0;
  nodes.forEach(node => {
    count += 1;
    if (node.children.length) count += countNodes(node.children);
  });
  return count;
}

if (importBtn && importFile) {
  importBtn.onclick = () => importFile.click();
  importFile.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const previousNodeId = nodeId;
    setImportStatus(`Loading ${file.name}...`);

    try {
      const rows = await parseImportFile(file);
      nodeId = 0;
      const nextTree = buildTreeFromRows(rows);
      if (!nextTree.length) {
        setImportStatus('No nodes found in the import file.', 'error');
        nodeId = previousNodeId;
        importFile.value = '';
        return;
      }

      if (!confirm('Replace the current tree with the imported hierarchy?')) {
        setImportStatus('Import canceled.');
        nodeId = previousNodeId;
        importFile.value = '';
        return;
      }

      treeData = nextTree;
      selectedId = null;
      render();

      setImportStatus(`Imported ${countNodes(treeData)} nodes from ${file.name}.`, 'success');
    } catch (err) {
      nodeId = previousNodeId;
      setImportStatus(err.message || 'Import failed.', 'error');
    } finally {
      importFile.value = '';
    }
  };
}

function getMaxDepth(nodes, depth = 0) {
  let maxDepth = depth;
  nodes.forEach(node => {
    maxDepth = Math.max(maxDepth, depth);
    if (node.children.length) {
      maxDepth = Math.max(maxDepth, getMaxDepth(node.children, depth + 1));
    }
  });
  return maxDepth;
}

function buildExportRows(nodes, path = [], rows = []) {
  nodes.forEach(node => {
    const nextPath = [...path, node.name];
    const depth = nextPath.length - 1;
    rows.push({
      path: nextPath,
      depth,
      color: LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)]
    });
    if (node.children.length) {
      buildExportRows(node.children, nextPath, rows);
    }
  });
  return rows;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

if (exportBtn) {
  exportBtn.onclick = () => {
    if (!treeData.length) {
      setImportStatus('Nothing to export yet.', 'error');
      return;
    }

    const maxDepth = getMaxDepth(treeData, 0);
    const rows = buildExportRows(treeData);
    const headers = [];
    for (let i = 0; i <= maxDepth; i++) {
      headers.push(`Level ${i}`);
    }
    headers.push('Depth', 'Level Color');

    const lines = [headers.map(csvEscape).join(',')];
    rows.forEach(row => {
      const line = [];
      for (let i = 0; i <= maxDepth; i++) {
        line.push(row.path[i] || '');
      }
      line.push(row.depth, row.color);
      lines.push(line.map(csvEscape).join(','));
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`tree-export-${dateStamp}.csv`, lines.join('\n'));
    setImportStatus(`Exported ${rows.length} rows with level colors.`, 'success');
  };
}

if (levelTintToggle) {
  document.body.classList.toggle('level-coloring', levelTintToggle.checked);
  levelTintToggle.addEventListener('change', () => {
    document.body.classList.toggle('level-coloring', levelTintToggle.checked);
  });
}

// Zoom
function updateZoom() {
  canvas.style.transform = `scale(${zoom})`;
  zoomLevel.textContent = Math.round(zoom * 100) + '%';
  canvas.style.minWidth = (100 / zoom) + '%';
  canvas.style.minHeight = (100 / zoom) + '%';
}

zoomIn.onclick = () => { zoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP); updateZoom(); };
zoomOut.onclick = () => { zoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP); updateZoom(); };
zoomReset.onclick = () => { zoom = 1; updateZoom(); };

// Keyboard
document.onkeydown = (e) => {
  if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;
  
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
    const node = findNode(selectedId);
    if (node) { node.remove(); selectedId = null; render(); }
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); zoomIn.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomReset.click(); }
};

// Click outside
canvasScroll.onclick = (e) => {
  if (!e.target.closest('.tree-card') && !e.target.closest('.root-drop-zone')) {
    selectedId = null;
    render();
  }
};

// Init
DEFAULTS.forEach(n => createBankItem(n));
render();
