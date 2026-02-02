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

let selectedNode = null;
let dragState = null;
let zIndexCounter = 1;

const NAME_HINT_DEFAULT = "Names should be concise and descriptive.";
const NAME_HINT_ERROR = "Please enter a node name.";

function updatePlaceholder() {
  const hasNodes = canvas.querySelectorAll(".tree-node").length > 0;
  canvasPlaceholder.style.display = hasNodes ? "none" : "flex";
}

function setInputError(isError) {
  nodeNameInput.classList.toggle("input-error", isError);
  formHint.textContent = isError ? NAME_HINT_ERROR : NAME_HINT_DEFAULT;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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

function deselectNode() {
  if (!selectedNode) {
    return;
  }
  selectedNode.classList.remove("selected");
  selectedNode = null;
}

function selectNode(node) {
  if (selectedNode && selectedNode !== node) {
    selectedNode.classList.remove("selected");
  }
  selectedNode = node;
  if (selectedNode) {
    selectedNode.classList.add("selected");
    selectedNode.style.zIndex = String(zIndexCounter++);
  }
}

function deleteNode(node) {
  if (!node) {
    return;
  }
  node.remove();
  if (selectedNode === node) {
    selectedNode = null;
  }
  updatePlaceholder();
}

function createCanvasNode(name, x, y) {
  const node = document.createElement("div");
  node.className = "tree-node";
  node.tabIndex = 0;
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", name);

  const title = document.createElement("span");
  title.className = "node-title";
  title.textContent = name;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "node-delete";
  deleteButton.textContent = "X";
  deleteButton.setAttribute("aria-label", `Delete ${name}`);

  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteNode(node);
  });

  node.append(title, deleteButton);
  canvas.appendChild(node);

  const canvasRect = canvas.getBoundingClientRect();
  const width = node.offsetWidth / 2;
  const height = node.offsetHeight / 2;
  const clampedX = clamp(x, width, canvasRect.width - width);
  const clampedY = clamp(y, height, canvasRect.height - height);
  node.style.left = `${clampedX}px`;
  node.style.top = `${clampedY}px`;
  node.style.zIndex = String(zIndexCounter++);

  node.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    if (event.target.closest(".node-delete")) {
      return;
    }
    selectNode(node);
    const nodeRect = node.getBoundingClientRect();
    dragState = {
      node,
      pointerId: event.pointerId,
      offsetX: event.clientX - (nodeRect.left + nodeRect.width / 2),
      offsetY: event.clientY - (nodeRect.top + nodeRect.height / 2),
      halfWidth: node.offsetWidth / 2,
      halfHeight: node.offsetHeight / 2,
    };

    node.setPointerCapture(event.pointerId);
    node.addEventListener("pointermove", handlePointerMove);
    node.addEventListener("pointerup", handlePointerUp);
    node.addEventListener("pointercancel", handlePointerUp);
  });

  node.addEventListener("click", () => {
    selectNode(node);
  });

  updatePlaceholder();
}

function handlePointerMove(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }
  const canvasRect = canvas.getBoundingClientRect();
  const x = event.clientX - canvasRect.left - dragState.offsetX;
  const y = event.clientY - canvasRect.top - dragState.offsetY;
  const clampedX = clamp(x, dragState.halfWidth, canvasRect.width - dragState.halfWidth);
  const clampedY = clamp(
    y,
    dragState.halfHeight,
    canvasRect.height - dragState.halfHeight
  );

  dragState.node.style.left = `${clampedX}px`;
  dragState.node.style.top = `${clampedY}px`;
}

function handlePointerUp(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }
  dragState.node.releasePointerCapture(event.pointerId);
  dragState.node.removeEventListener("pointermove", handlePointerMove);
  dragState.node.removeEventListener("pointerup", handlePointerUp);
  dragState.node.removeEventListener("pointercancel", handlePointerUp);
  dragState = null;
}

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

canvas.addEventListener("dragover", (event) => {
  event.preventDefault();
  canvas.classList.add("is-drop-target");
  event.dataTransfer.dropEffect = "copy";
});

canvas.addEventListener("dragleave", (event) => {
  if (event.target === canvas) {
    canvas.classList.remove("is-drop-target");
  }
});

canvas.addEventListener("drop", (event) => {
  event.preventDefault();
  canvas.classList.remove("is-drop-target");
  const name = event.dataTransfer.getData("text/plain").trim();
  if (!name) {
    return;
  }
  const canvasRect = canvas.getBoundingClientRect();
  const x = event.clientX - canvasRect.left;
  const y = event.clientY - canvasRect.top;
  createCanvasNode(name, x, y);
});

canvas.addEventListener("click", (event) => {
  if (event.target === canvas) {
    deselectNode();
  }
});

document.addEventListener("keydown", (event) => {
  if (!selectedNode) {
    return;
  }
  const activeElement = document.activeElement;
  if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteNode(selectedNode);
  }
});

clearCanvasButton.addEventListener("click", () => {
  const nodes = canvas.querySelectorAll(".tree-node");
  if (nodes.length === 0) {
    return;
  }
  const shouldClear = window.confirm("Clear all nodes from the canvas?");
  if (!shouldClear) {
    return;
  }
  nodes.forEach((node) => node.remove());
  deselectNode();
  updatePlaceholder();
});

DEFAULT_BANK_ITEMS.forEach((name) => addBankItem(name));
updatePlaceholder();
