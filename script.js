// Tree data structure
let treeData = [];
let nodeIdCounter = 0;
let draggedNode = null;
let draggedElement = null;
let dropIndicator = null;
let dropTarget = null;

const bankList = document.getElementById("bankList");
const canvas = document.getElementById("canvas");
const createForm = document.getElementById("createForm");
const nodeNameInput = document.getElementById("nodeName");
const formHint = document.getElementById("formHint");
const clearCanvasButton = document.getElementById("clearCanvas");
const canvasPlaceholder = canvas.querySelector(".canvas-placeholder");

const DEFAULT_BANK_ITEMS = [
  "Chief Executive Officer",
  "Operations",
  "Sales",
  "Engineering",
  "Human Resources",
];

const NAME_HINT_DEFAULT = "Names should be concise and descriptive.";
const NAME_HINT_ERROR = "Please enter a node name.";
const INDENT_WIDTH = 32; // Pixels per indent level
const CHILD_THRESHOLD = 24; // Drag threshold to become a child

// Tree node class
class TreeNode {
  constructor(name, id = null) {
    this.id = id !== null ? id : nodeIdCounter++;
    this.name = name;
    this.children = [];
    this.collapsed = false;
    this.parent = null;
  }

  addChild(node, index = null) {
    node.parent = this;
    if (index !== null && index >= 0 && index <= this.children.length) {
      this.children.splice(index, 0, node);
    } else {
      this.children.push(node);
    }
  }

  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index > -1) {
      this.children.splice(index, 1);
      node.parent = null;
    }
  }

  hasDescendant(node) {
    if (this.children.includes(node)) return true;
    return this.children.some(child => child.hasDescendant(node));
  }

  getDepth() {
    let depth = 0;
    let current = this.parent;
    while (current) {
      depth++;
      current = current.parent;
    }
    return depth;
  }
}

// Find node by ID in tree
function findNodeById(id, nodes = treeData) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(id, node.children);
    if (found) return found;
  }
  return null;
}

// Remove node from its current position
function removeNodeFromTree(node) {
  if (node.parent) {
    node.parent.removeChild(node);
  } else {
    const index = treeData.indexOf(node);
    if (index > -1) {
      treeData.splice(index, 1);
      node.parent = null;
    }
  }
}

// Insert node as sibling (before or after another node)
function insertAsSibling(node, targetNode, after = true) {
  removeNodeFromTree(node);
  
  if (targetNode.parent) {
    const siblings = targetNode.parent.children;
    const targetIndex = siblings.indexOf(targetNode);
    const insertIndex = after ? targetIndex + 1 : targetIndex;
    targetNode.parent.addChild(node, insertIndex);
  } else {
    const targetIndex = treeData.indexOf(targetNode);
    const insertIndex = after ? targetIndex + 1 : targetIndex;
    treeData.splice(insertIndex, 0, node);
    node.parent = null;
  }
}

// Insert node as child of target
function insertAsChild(node, targetNode, index = null) {
  // Prevent circular references
  if (node.hasDescendant(targetNode)) return false;
  
  removeNodeFromTree(node);
  targetNode.addChild(node, index);
  return true;
}

// Insert node at root level
function insertAtRoot(node, index = null) {
  removeNodeFromTree(node);
  node.parent = null;
  if (index !== null && index >= 0 && index <= treeData.length) {
    treeData.splice(index, 0, node);
  } else {
    treeData.push(node);
  }
}

// Update placeholder visibility
function updatePlaceholder() {
  canvasPlaceholder.style.display = treeData.length === 0 ? "flex" : "none";
}

// Set input error state
function setInputError(isError) {
  nodeNameInput.classList.toggle("input-error", isError);
  formHint.textContent = isError ? NAME_HINT_ERROR : NAME_HINT_DEFAULT;
}

// Create drop indicator element
function createDropIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "drop-indicator";
  indicator.style.display = "none";
  return indicator;
}

// Render the entire tree
function renderTree() {
  // Clear existing tree (keep placeholder)
  const existingTree = canvas.querySelector(".tree-container");
  if (existingTree) existingTree.remove();
  
  const existingSvg = canvas.querySelector(".tree-lines");
  if (existingSvg) existingSvg.remove();

  if (treeData.length === 0) {
    updatePlaceholder();
    return;
  }

  updatePlaceholder();

  // Create tree container
  const treeContainer = document.createElement("div");
  treeContainer.className = "tree-container";

  // Create SVG for lines
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("tree-lines");
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "0";

  // Render nodes recursively
  function renderNode(node, depth = 0, isLastChild = true, parentLines = []) {
    const nodeEl = document.createElement("div");
    nodeEl.className = "tree-node";
    nodeEl.dataset.nodeId = node.id;
    nodeEl.dataset.depth = depth;
    nodeEl.tabIndex = 0;
    nodeEl.draggable = true;
    nodeEl.setAttribute("role", "treeitem");
    nodeEl.setAttribute("aria-label", node.name);
    nodeEl.setAttribute("aria-expanded", !node.collapsed);

    // Indent wrapper
    const indentWrapper = document.createElement("div");
    indentWrapper.className = "node-indent";
    indentWrapper.style.width = `${depth * INDENT_WIDTH}px`;
    indentWrapper.style.minWidth = `${depth * INDENT_WIDTH}px`;

    // Line guides within indent
    for (let i = 0; i < depth; i++) {
      const guide = document.createElement("div");
      guide.className = "indent-guide";
      if (parentLines[i]) {
        guide.classList.add("has-line");
      }
      guide.style.left = `${i * INDENT_WIDTH + INDENT_WIDTH / 2}px`;
      indentWrapper.appendChild(guide);
    }

    // Toggle button for expandable nodes
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "node-toggle";
    
    if (node.children.length > 0) {
      toggleBtn.innerHTML = node.collapsed 
        ? '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>';
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        node.collapsed = !node.collapsed;
        renderTree();
      });
    } else {
      toggleBtn.classList.add("no-children");
      toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><circle fill="currentColor" cx="12" cy="12" r="3"/></svg>';
    }

    // Node content
    const content = document.createElement("div");
    content.className = "node-content";

    const title = document.createElement("span");
    title.className = "node-title";
    title.textContent = node.name;

    const childCount = document.createElement("span");
    childCount.className = "node-child-count";
    if (node.children.length > 0) {
      childCount.textContent = `(${node.children.length})`;
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "node-delete";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.setAttribute("aria-label", `Delete ${node.name}`);
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteNode(node);
    });

    content.append(title, childCount, deleteBtn);
    nodeEl.append(indentWrapper, toggleBtn, content);

    // Drag events
    nodeEl.addEventListener("dragstart", handleDragStart);
    nodeEl.addEventListener("dragend", handleDragEnd);
    nodeEl.addEventListener("dragover", handleDragOver);
    nodeEl.addEventListener("dragleave", handleDragLeave);
    nodeEl.addEventListener("drop", handleDrop);

    treeContainer.appendChild(nodeEl);

    // Render children if not collapsed
    if (!node.collapsed && node.children.length > 0) {
      node.children.forEach((child, index) => {
        const isLast = index === node.children.length - 1;
        const newParentLines = [...parentLines, !isLast];
        renderNode(child, depth + 1, isLast, newParentLines);
      });
    }
  }

  treeData.forEach((rootNode, index) => {
    const isLast = index === treeData.length - 1;
    renderNode(rootNode, 0, isLast, []);
  });

  canvas.appendChild(treeContainer);
  canvas.appendChild(svg);

  // Draw connecting lines after DOM is updated
  requestAnimationFrame(() => drawConnectingLines());
}

// Draw SVG connecting lines
function drawConnectingLines() {
  const svg = canvas.querySelector(".tree-lines");
  if (!svg) return;

  // Clear existing lines
  svg.innerHTML = "";

  const treeContainer = canvas.querySelector(".tree-container");
  if (!treeContainer) return;

  const containerRect = treeContainer.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const scrollTop = canvas.scrollTop;
  const scrollLeft = canvas.scrollLeft;

  // Process each node
  function processNode(node) {
    if (node.collapsed || node.children.length === 0) return;

    const parentEl = treeContainer.querySelector(`[data-node-id="${node.id}"]`);
    if (!parentEl) return;

    const parentRect = parentEl.getBoundingClientRect();
    const parentToggle = parentEl.querySelector(".node-toggle");
    const toggleRect = parentToggle ? parentToggle.getBoundingClientRect() : parentRect;

    // Start point (below parent's toggle)
    const startX = toggleRect.left - canvasRect.left + toggleRect.width / 2 + scrollLeft;
    const startY = parentRect.bottom - canvasRect.top + scrollTop;

    node.children.forEach((child, index) => {
      const childEl = treeContainer.querySelector(`[data-node-id="${child.id}"]`);
      if (!childEl) return;

      const childRect = childEl.getBoundingClientRect();
      const childToggle = childEl.querySelector(".node-toggle");
      const childToggleRect = childToggle ? childToggle.getBoundingClientRect() : childRect;

      // End point (left of child's toggle)
      const endX = childToggleRect.left - canvasRect.left + childToggleRect.width / 2 + scrollLeft;
      const endY = childRect.top - canvasRect.top + childRect.height / 2 + scrollTop;

      // Create path
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      
      // L-shaped connector: vertical then horizontal
      const cornerY = endY;
      const d = `M ${startX} ${startY} L ${startX} ${cornerY} L ${endX} ${cornerY}`;
      
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#c9d6ea");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");

      svg.appendChild(path);

      // Process grandchildren
      processNode(child);
    });
  }

  treeData.forEach(rootNode => processNode(rootNode));
}

// Drag and drop handlers
function handleDragStart(e) {
  const nodeEl = e.currentTarget;
  const nodeId = parseInt(nodeEl.dataset.nodeId);
  draggedNode = findNodeById(nodeId);
  draggedElement = nodeEl;
  
  nodeEl.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", nodeId.toString());

  // Create drop indicator
  dropIndicator = createDropIndicator();
  canvas.querySelector(".tree-container")?.appendChild(dropIndicator);
}

function handleDragEnd(e) {
  if (draggedElement) {
    draggedElement.classList.remove("dragging");
  }
  
  // Remove all drag-over states
  canvas.querySelectorAll(".tree-node").forEach(el => {
    el.classList.remove("drag-over", "drag-over-child", "drag-over-sibling");
  });
  
  if (dropIndicator) {
    dropIndicator.remove();
    dropIndicator = null;
  }
  
  draggedNode = null;
  draggedElement = null;
  dropTarget = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";

  const nodeEl = e.currentTarget;
  const nodeId = parseInt(nodeEl.dataset.nodeId);
  const targetNode = findNodeById(nodeId);

  if (!draggedNode || !targetNode || draggedNode === targetNode) return;
  if (draggedNode.hasDescendant(targetNode)) return;

  const rect = nodeEl.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const nodeDepth = parseInt(nodeEl.dataset.depth);

  // Clear previous states
  canvas.querySelectorAll(".tree-node").forEach(el => {
    el.classList.remove("drag-over", "drag-over-child", "drag-over-sibling");
  });

  // Determine drop position based on mouse position
  const verticalThird = rect.height / 3;
  const indentThreshold = CHILD_THRESHOLD;

  // Calculate indent level based on mouse X position
  const effectiveX = mouseX - (nodeDepth * INDENT_WIDTH);

  if (mouseY < verticalThird) {
    // Top third - insert as sibling before
    nodeEl.classList.add("drag-over-sibling");
    dropTarget = { type: "sibling-before", node: targetNode };
    showDropIndicator(nodeEl, "before", nodeDepth);
  } else if (mouseY > rect.height - verticalThird) {
    // Bottom third
    if (effectiveX > indentThreshold && !targetNode.collapsed) {
      // Indent - insert as child
      nodeEl.classList.add("drag-over-child");
      dropTarget = { type: "child", node: targetNode };
      showDropIndicator(nodeEl, "child", nodeDepth + 1);
    } else {
      // No indent - insert as sibling after
      nodeEl.classList.add("drag-over-sibling");
      dropTarget = { type: "sibling-after", node: targetNode };
      showDropIndicator(nodeEl, "after", nodeDepth);
    }
  } else {
    // Middle - insert as child
    if (effectiveX > indentThreshold) {
      nodeEl.classList.add("drag-over-child");
      dropTarget = { type: "child", node: targetNode };
      showDropIndicator(nodeEl, "child", nodeDepth + 1);
    } else {
      nodeEl.classList.add("drag-over-sibling");
      dropTarget = { type: "sibling-after", node: targetNode };
      showDropIndicator(nodeEl, "after", nodeDepth);
    }
  }
}

function showDropIndicator(nodeEl, position, depth) {
  if (!dropIndicator) return;

  const rect = nodeEl.getBoundingClientRect();
  const containerRect = canvas.querySelector(".tree-container").getBoundingClientRect();
  
  dropIndicator.style.display = "block";
  dropIndicator.style.left = `${depth * INDENT_WIDTH + 40}px`;
  dropIndicator.style.width = `calc(100% - ${depth * INDENT_WIDTH + 60}px)`;

  if (position === "before") {
    dropIndicator.style.top = `${rect.top - containerRect.top - 2}px`;
  } else if (position === "after" || position === "child") {
    dropIndicator.style.top = `${rect.bottom - containerRect.top - 2}px`;
  }
}

function handleDragLeave(e) {
  const nodeEl = e.currentTarget;
  if (!nodeEl.contains(e.relatedTarget)) {
    nodeEl.classList.remove("drag-over", "drag-over-child", "drag-over-sibling");
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  if (!draggedNode || !dropTarget) return;

  const { type, node: targetNode } = dropTarget;

  switch (type) {
    case "sibling-before":
      insertAsSibling(draggedNode, targetNode, false);
      break;
    case "sibling-after":
      insertAsSibling(draggedNode, targetNode, true);
      break;
    case "child":
      insertAsChild(draggedNode, targetNode, 0);
      // Auto-expand parent when adding child
      targetNode.collapsed = false;
      break;
  }

  renderTree();
}

// Handle drop on canvas (for root level)
function handleCanvasDragOver(e) {
  // Only handle if not over a node
  if (e.target === canvas || e.target.classList.contains("tree-container") || e.target.classList.contains("canvas-placeholder")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    canvas.classList.add("is-drop-target");
  }
}

function handleCanvasDragLeave(e) {
  if (!canvas.contains(e.relatedTarget) || e.relatedTarget === null) {
    canvas.classList.remove("is-drop-target");
  }
}

function handleCanvasDrop(e) {
  // Check if we're dropping on the canvas background (not on a node)
  if (e.target !== canvas && !e.target.classList.contains("tree-container") && !e.target.classList.contains("canvas-placeholder")) {
    return;
  }

  e.preventDefault();
  canvas.classList.remove("is-drop-target");

  const name = e.dataTransfer.getData("text/plain").trim();
  if (!name) return;

  // Check if it's a bank item (name) or a tree node (id)
  const nodeId = parseInt(name);
  if (!isNaN(nodeId) && draggedNode) {
    // Moving existing node to root
    insertAtRoot(draggedNode);
  } else {
    // New node from bank
    const newNode = new TreeNode(name);
    treeData.push(newNode);
  }

  renderTree();
}

// Delete a node and its children
function deleteNode(node) {
  removeNodeFromTree(node);
  renderTree();
}

// Add item to the bank
function addBankItem(name) {
  const item = document.createElement("div");
  item.className = "bank-item";
  item.draggable = true;
  item.dataset.name = name;

  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "drag";

  const label = document.createElement("span");
  label.className = "bank-name";
  label.textContent = name;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "bank-delete";
  removeButton.textContent = "Remove";
  removeButton.setAttribute("aria-label", `Remove ${name}`);

  removeButton.addEventListener("click", () => {
    item.remove();
  });

  item.addEventListener("dragstart", (event) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", name);
    item.classList.add("dragging");
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
  });

  item.append(handle, label, removeButton);
  bankList.appendChild(item);
}

// Expand all nodes
function expandAll() {
  function expand(nodes) {
    nodes.forEach(node => {
      node.collapsed = false;
      expand(node.children);
    });
  }
  expand(treeData);
  renderTree();
}

// Collapse all nodes
function collapseAll() {
  function collapse(nodes) {
    nodes.forEach(node => {
      if (node.children.length > 0) {
        node.collapsed = true;
      }
      collapse(node.children);
    });
  }
  collapse(treeData);
  renderTree();
}

// Event listeners
createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nodeNameInput.value.trim();
  if (!name) {
    setInputError(true);
    nodeNameInput.focus();
    return;
  }
  addBankItem(name);
  nodeNameInput.value = "";
  setInputError(false);
  nodeNameInput.focus();
});

nodeNameInput.addEventListener("input", () => {
  if (nodeNameInput.value.trim()) {
    setInputError(false);
  }
});

canvas.addEventListener("dragover", handleCanvasDragOver);
canvas.addEventListener("dragleave", handleCanvasDragLeave);
canvas.addEventListener("drop", handleCanvasDrop);

clearCanvasButton.addEventListener("click", () => {
  if (treeData.length === 0) return;
  const shouldClear = window.confirm("Clear all nodes from the canvas?");
  if (!shouldClear) return;
  treeData = [];
  renderTree();
});

// Handle keyboard delete
document.addEventListener("keydown", (event) => {
  const activeElement = document.activeElement;
  if (activeElement && activeElement.classList.contains("tree-node")) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const nodeId = parseInt(activeElement.dataset.nodeId);
      const node = findNodeById(nodeId);
      if (node) deleteNode(node);
    }
  }
});

// Redraw lines on scroll
canvas.addEventListener("scroll", () => {
  requestAnimationFrame(drawConnectingLines);
});

// Redraw lines on window resize
window.addEventListener("resize", () => {
  requestAnimationFrame(drawConnectingLines);
});

// Expand/Collapse all buttons
const expandAllButton = document.getElementById("expandAll");
const collapseAllButton = document.getElementById("collapseAll");

expandAllButton.addEventListener("click", expandAll);
collapseAllButton.addEventListener("click", collapseAll);

// Initialize
DEFAULT_BANK_ITEMS.forEach((name) => addBankItem(name));
updatePlaceholder();
