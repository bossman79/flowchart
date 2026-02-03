const state = {
  nodes: [],
  connections: [],
  callouts: [],
  selected: null,
  nextNodeId: 1,
  nextConnectionId: 1,
  nextCalloutId: 1,
  zoom: 1
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const MIN_NODE_WIDTH = 150;
const MIN_NODE_HEIGHT = 90;
const MIN_CALLOUT_WIDTH = 180;
const MIN_CALLOUT_HEIGHT = 100;
const DEFAULT_NODE_COLOR = '#22304d';
const DEFAULT_CALLOUT_COLOR = '#21355a';

let baseWidth = 2200;
let baseHeight = 1400;

const flowSidebar = document.getElementById('flowSidebar');
const flowSidebarToggle = document.getElementById('flowSidebarToggle');
const addNodeBtn = document.getElementById('addNodeBtn');
const addCalloutBtn = document.getElementById('addCalloutBtn');
const propertiesPanel = document.getElementById('propertiesPanel');
const flowStatus = document.getElementById('flowStatus');
const flowImportBtn = document.getElementById('flowImportBtn');
const flowImportFile = document.getElementById('flowImportFile');
const flowExportBtn = document.getElementById('flowExportBtn');
const gridToggle = document.getElementById('gridToggle');

const flowCanvasScroll = document.getElementById('flowCanvasScroll');
const flowCanvas = document.getElementById('flowCanvas');
const flowStage = document.getElementById('flowStage');
const flowSvg = document.getElementById('flowSvg');
const connectionLayer = document.getElementById('connectionLayer');
const calloutLayer = document.getElementById('calloutLayer');
const previewPath = document.getElementById('previewPath');
const nodesLayer = document.getElementById('flowNodes');
const calloutsLayer = document.getElementById('flowCallouts');
const flowEmptyState = document.getElementById('flowEmptyState');

const flowZoomIn = document.getElementById('flowZoomIn');
const flowZoomOut = document.getElementById('flowZoomOut');
const flowZoomReset = document.getElementById('flowZoomReset');
const flowZoomLevel = document.getElementById('flowZoomLevel');

const nodeEls = new Map();
const calloutEls = new Map();
const connectionEls = new Map();
const calloutPathEls = new Map();

let dragState = null;
let resizeState = null;
let connectionDrag = null;
let calloutDrag = null;
let calloutArrowDrag = null;

const validPoints = ['top', 'right', 'bottom', 'left'];
const pointDirections = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};

function setStatus(message, type = '') {
  if (!flowStatus) return;
  flowStatus.textContent = message;
  flowStatus.classList.remove('success', 'error');
  if (type) flowStatus.classList.add(type);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateCanvasSize() {
  flowStage.style.width = `${baseWidth}px`;
  flowStage.style.height = `${baseHeight}px`;
  flowCanvas.style.width = `${baseWidth * state.zoom}px`;
  flowCanvas.style.height = `${baseHeight * state.zoom}px`;
}

function updateZoom() {
  flowStage.style.transform = `scale(${state.zoom})`;
  flowZoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
  updateCanvasSize();
}

function ensureCanvasBounds() {
  let maxX = 0;
  let maxY = 0;

  state.nodes.forEach((node) => {
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  });

  state.callouts.forEach((callout) => {
    maxX = Math.max(maxX, callout.x + callout.width);
    maxY = Math.max(maxY, callout.y + callout.height);
  });

  const padding = 240;
  baseWidth = Math.max(baseWidth, maxX + padding, 1200);
  baseHeight = Math.max(baseHeight, maxY + padding, 800);
  updateCanvasSize();
}

function getStagePoint(clientX, clientY) {
  const rect = flowStage.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / state.zoom,
    y: (clientY - rect.top) / state.zoom
  };
}

function getViewportCenter() {
  const centerX = (flowCanvasScroll.scrollLeft + flowCanvasScroll.clientWidth / 2) / state.zoom;
  const centerY = (flowCanvasScroll.scrollTop + flowCanvasScroll.clientHeight / 2) / state.zoom;
  return { x: centerX, y: centerY };
}

function updateEmptyState() {
  if (!flowEmptyState) return;
  flowEmptyState.style.display = state.nodes.length ? 'none' : 'flex';
}

function normalizeColor(value, fallback) {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value;
  }
  return fallback;
}

function ensureNodeElement(node) {
  if (nodeEls.has(node.id)) return nodeEls.get(node.id);

  const el = document.createElement('div');
  el.className = 'flow-node';
  el.dataset.nodeId = node.id;

  const text = document.createElement('div');
  text.className = 'node-text';
  text.textContent = node.text;
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startNodeEditing(node, el, text);
  });

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.resize-handle') || e.target.closest('.connection-point')) return;
    if (e.target.classList.contains('node-text')) return;
    if (el.classList.contains('editing')) return;
    setSelection({ type: 'node', id: node.id });
    startNodeDrag(node, e);
  });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    setSelection({ type: 'node', id: node.id });
  });

  validPoints.forEach((point) => {
    const pt = document.createElement('div');
    pt.className = `connection-point point-${point}`;
    pt.dataset.point = point;
    pt.dataset.nodeId = node.id;
    pt.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      startConnectionDrag(node.id, point, e);
    });
    el.appendChild(pt);
  });

  const handles = [
    { className: 'resize-handle handle-r', handle: 'r' },
    { className: 'resize-handle handle-b', handle: 'b' },
    { className: 'resize-handle handle-br', handle: 'br' }
  ];

  handles.forEach((config) => {
    const handle = document.createElement('div');
    handle.className = config.className;
    handle.dataset.handle = config.handle;
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      startNodeResize(node, config.handle, e);
    });
    el.appendChild(handle);
  });

  el.appendChild(text);
  nodeEls.set(node.id, el);
  nodesLayer.appendChild(el);
  return el;
}

function updateNodeElement(node) {
  const el = nodeEls.get(node.id);
  if (!el) return;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.width}px`;
  el.style.height = `${node.height}px`;
  el.style.setProperty('--node-color', node.color);

  const textEl = el.querySelector('.node-text');
  if (textEl && !el.classList.contains('editing')) {
    textEl.textContent = node.text;
  }
}

function createNode(options = {}) {
  const center = getViewportCenter();
  const width = options.width || 180;
  const height = options.height || 110;
  const node = {
    id: state.nextNodeId++,
    x: options.x ?? center.x - width / 2,
    y: options.y ?? center.y - height / 2,
    width,
    height,
    text: options.text || 'New Step',
    color: options.color || DEFAULT_NODE_COLOR
  };

  state.nodes.push(node);
  ensureNodeElement(node);
  updateNodeElement(node);
  setSelection({ type: 'node', id: node.id });
  ensureCanvasBounds();
  renderConnections();
  renderCalloutArrows();
  updateEmptyState();
  return node;
}

function startNodeEditing(node, nodeEl, textEl) {
  nodeEl.classList.add('editing');
  textEl.contentEditable = 'true';
  textEl.classList.add('editable');
  textEl.focus();

  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = (cancel) => {
    textEl.contentEditable = 'false';
    textEl.classList.remove('editable');
    nodeEl.classList.remove('editing');
    const nextText = textEl.textContent.trim();
    if (!cancel && nextText) {
      node.text = nextText;
    }
    textEl.textContent = node.text;
  };

  textEl.onblur = () => finish(false);
  textEl.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      textEl.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      finish(true);
      textEl.blur();
    }
  };
}

function startNodeDrag(node, event) {
  const start = getStagePoint(event.clientX, event.clientY);
  dragState = {
    id: node.id,
    offsetX: start.x - node.x,
    offsetY: start.y - node.y
  };
  const el = nodeEls.get(node.id);
  if (el) el.classList.add('dragging');
  document.addEventListener('mousemove', handleNodeDrag);
  document.addEventListener('mouseup', stopNodeDrag);
}

function handleNodeDrag(event) {
  if (!dragState) return;
  const node = findNode(dragState.id);
  if (!node) return;
  const point = getStagePoint(event.clientX, event.clientY);
  node.x = Math.max(0, point.x - dragState.offsetX);
  node.y = Math.max(0, point.y - dragState.offsetY);
  updateNodeElement(node);
  renderConnections();
  renderCalloutArrows();
  ensureCanvasBounds();
}

function stopNodeDrag() {
  if (!dragState) return;
  const el = nodeEls.get(dragState.id);
  if (el) el.classList.remove('dragging');
  dragState = null;
  document.removeEventListener('mousemove', handleNodeDrag);
  document.removeEventListener('mouseup', stopNodeDrag);
}

function startNodeResize(node, handle, event) {
  const start = getStagePoint(event.clientX, event.clientY);
  resizeState = {
    id: node.id,
    handle,
    startX: start.x,
    startY: start.y,
    startWidth: node.width,
    startHeight: node.height
  };
  document.addEventListener('mousemove', handleNodeResize);
  document.addEventListener('mouseup', stopNodeResize);
}

function handleNodeResize(event) {
  if (!resizeState) return;
  const node = findNode(resizeState.id);
  if (!node) return;
  const point = getStagePoint(event.clientX, event.clientY);
  const deltaX = point.x - resizeState.startX;
  const deltaY = point.y - resizeState.startY;

  if (resizeState.handle === 'r' || resizeState.handle === 'br') {
    node.width = clamp(resizeState.startWidth + deltaX, MIN_NODE_WIDTH, 900);
  }
  if (resizeState.handle === 'b' || resizeState.handle === 'br') {
    node.height = clamp(resizeState.startHeight + deltaY, MIN_NODE_HEIGHT, 700);
  }

  updateNodeElement(node);
  renderConnections();
  renderCalloutArrows();
  ensureCanvasBounds();
}

function stopNodeResize() {
  resizeState = null;
  document.removeEventListener('mousemove', handleNodeResize);
  document.removeEventListener('mouseup', stopNodeResize);
}

function getConnectionPoint(node, point) {
  const x = node.x;
  const y = node.y;
  const w = node.width;
  const h = node.height;

  switch (point) {
    case 'top':
      return { x: x + w / 2, y };
    case 'right':
      return { x: x + w, y: y + h / 2 };
    case 'bottom':
      return { x: x + w / 2, y: y + h };
    case 'left':
      return { x, y: y + h / 2 };
    default:
      return { x: x + w / 2, y: y + h / 2 };
  }
}

function buildCurve(start, end, startDir, endDir) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const curve = clamp(distance * 0.35, 60, 160);
  const c1 = {
    x: start.x + startDir.x * curve,
    y: start.y + startDir.y * curve
  };
  const c2 = {
    x: end.x + endDir.x * curve,
    y: end.y + endDir.y * curve
  };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

function ensureConnectionElement(connection) {
  if (connectionEls.has(connection.id)) return connectionEls.get(connection.id);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('flow-connection');
  path.dataset.connectionId = connection.id;
  path.setAttribute('marker-end', 'url(#arrowhead)');
  path.addEventListener('click', (e) => {
    e.stopPropagation();
    setSelection({ type: 'connection', id: connection.id });
  });

  connectionLayer.appendChild(path);
  connectionEls.set(connection.id, path);
  return path;
}

function renderConnections() {
  const activeIds = new Set(state.connections.map((c) => c.id));
  connectionEls.forEach((el, id) => {
    if (!activeIds.has(id)) {
      el.remove();
      connectionEls.delete(id);
    }
  });

  state.connections.forEach((connection) => {
    const fromNode = findNode(connection.from.nodeId);
    const toNode = findNode(connection.to.nodeId);
    if (!fromNode || !toNode) return;

    const path = ensureConnectionElement(connection);
    const start = getConnectionPoint(fromNode, connection.from.point);
    const end = getConnectionPoint(toNode, connection.to.point);
    const startDir = pointDirections[connection.from.point] || pointDirections.right;
    const endDir = pointDirections[connection.to.point] || pointDirections.left;
    path.setAttribute('d', buildCurve(start, end, startDir, endDir));
  });

  updateSelectedClasses();
}

function startConnectionDrag(nodeId, point, event) {
  connectionDrag = {
    from: { nodeId, point }
  };
  previewPath.style.display = 'block';
  previewPath.setAttribute('marker-end', 'url(#arrowhead)');
  handleConnectionDrag(event);
  document.addEventListener('mousemove', handleConnectionDrag);
  document.addEventListener('mouseup', stopConnectionDrag);
}

function handleConnectionDrag(event) {
  if (!connectionDrag) return;
  const fromNode = findNode(connectionDrag.from.nodeId);
  if (!fromNode) return;
  const start = getConnectionPoint(fromNode, connectionDrag.from.point);
  const end = getStagePoint(event.clientX, event.clientY);
  const startDir = pointDirections[connectionDrag.from.point] || pointDirections.right;
  const endDir = { x: 0, y: 0 };
  previewPath.setAttribute('d', buildCurve(start, end, startDir, endDir));
}

function stopConnectionDrag(event) {
  if (!connectionDrag) return;
  const target = event.target.closest('.connection-point');
  if (target) {
    const toNodeId = parseInt(target.dataset.nodeId, 10);
    const toPoint = target.dataset.point;
    if (Number.isFinite(toNodeId) && validPoints.includes(toPoint)) {
      addConnection(connectionDrag.from, { nodeId: toNodeId, point: toPoint });
    }
  }

  connectionDrag = null;
  previewPath.style.display = 'none';
  document.removeEventListener('mousemove', handleConnectionDrag);
  document.removeEventListener('mouseup', stopConnectionDrag);
}

function addConnection(from, to) {
  if (!from || !to) return;
  state.connections.push({
    id: state.nextConnectionId++,
    from,
    to
  });
  renderConnections();
}

function removeConnection(connectionId) {
  const idx = state.connections.findIndex((c) => c.id === connectionId);
  if (idx === -1) return;
  state.connections.splice(idx, 1);
  const el = connectionEls.get(connectionId);
  if (el) {
    el.remove();
    connectionEls.delete(connectionId);
  }
}

function ensureCalloutElement(callout) {
  if (calloutEls.has(callout.id)) return calloutEls.get(callout.id);

  const el = document.createElement('div');
  el.className = 'flow-callout';
  el.dataset.calloutId = callout.id;

  const header = document.createElement('div');
  header.className = 'callout-header';
  header.textContent = 'Callout';
  header.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    setSelection({ type: 'callout', id: callout.id });
    startCalloutDrag(callout, e);
  });

  const text = document.createElement('div');
  text.className = 'callout-text';
  text.textContent = callout.text;
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startCalloutEditing(callout, el, text);
  });

  const anchor = document.createElement('div');
  anchor.className = 'callout-anchor';
  anchor.title = 'Drag to attach arrow';
  anchor.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    startCalloutArrowDrag(callout, e);
  });

  el.appendChild(header);
  el.appendChild(text);
  el.appendChild(anchor);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    setSelection({ type: 'callout', id: callout.id });
  });

  calloutEls.set(callout.id, el);
  calloutsLayer.appendChild(el);
  return el;
}

function updateCalloutElement(callout) {
  const el = calloutEls.get(callout.id);
  if (!el) return;
  el.style.left = `${callout.x}px`;
  el.style.top = `${callout.y}px`;
  el.style.width = `${callout.width}px`;
  el.style.height = `${callout.height}px`;
  el.style.setProperty('--callout-color', callout.color);

  const textEl = el.querySelector('.callout-text');
  if (textEl && !el.classList.contains('editing')) {
    textEl.textContent = callout.text;
  }
}

function createCallout(options = {}) {
  const center = getViewportCenter();
  const width = options.width || 220;
  const height = options.height || 130;
  const callout = {
    id: state.nextCalloutId++,
    x: options.x ?? center.x - width / 2,
    y: options.y ?? center.y - height / 2,
    width,
    height,
    text: options.text || 'Add a note or clarification.',
    color: options.color || DEFAULT_CALLOUT_COLOR,
    target: options.target || {
      x: center.x + width / 2 + 140,
      y: center.y
    }
  };

  state.callouts.push(callout);
  ensureCalloutElement(callout);
  updateCalloutElement(callout);
  setSelection({ type: 'callout', id: callout.id });
  ensureCanvasBounds();
  renderCalloutArrows();
  return callout;
}

function startCalloutEditing(callout, calloutEl, textEl) {
  calloutEl.classList.add('editing');
  textEl.contentEditable = 'true';
  textEl.classList.add('editable');
  textEl.focus();

  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = (cancel) => {
    textEl.contentEditable = 'false';
    textEl.classList.remove('editable');
    calloutEl.classList.remove('editing');
    const nextText = textEl.textContent.trim();
    if (!cancel && nextText) {
      callout.text = nextText;
    }
    textEl.textContent = callout.text;
  };

  textEl.onblur = () => finish(false);
  textEl.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      textEl.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      finish(true);
      textEl.blur();
    }
  };
}

function startCalloutDrag(callout, event) {
  const start = getStagePoint(event.clientX, event.clientY);
  calloutDrag = {
    id: callout.id,
    offsetX: start.x - callout.x,
    offsetY: start.y - callout.y
  };
  document.addEventListener('mousemove', handleCalloutDrag);
  document.addEventListener('mouseup', stopCalloutDrag);
}

function handleCalloutDrag(event) {
  if (!calloutDrag) return;
  const callout = findCallout(calloutDrag.id);
  if (!callout) return;
  const point = getStagePoint(event.clientX, event.clientY);
  callout.x = Math.max(0, point.x - calloutDrag.offsetX);
  callout.y = Math.max(0, point.y - calloutDrag.offsetY);
  updateCalloutElement(callout);
  renderCalloutArrows();
  ensureCanvasBounds();
}

function stopCalloutDrag() {
  calloutDrag = null;
  document.removeEventListener('mousemove', handleCalloutDrag);
  document.removeEventListener('mouseup', stopCalloutDrag);
}

function startCalloutArrowDrag(callout, event) {
  calloutArrowDrag = { id: callout.id };
  previewPath.style.display = 'block';
  previewPath.setAttribute('marker-end', 'url(#calloutArrow)');
  handleCalloutArrowDrag(event);
  document.addEventListener('mousemove', handleCalloutArrowDrag);
  document.addEventListener('mouseup', stopCalloutArrowDrag);
}

function handleCalloutArrowDrag(event) {
  if (!calloutArrowDrag) return;
  const callout = findCallout(calloutArrowDrag.id);
  if (!callout) return;
  const start = getCalloutAnchor(callout);
  const end = getStagePoint(event.clientX, event.clientY);
  previewPath.setAttribute('d', buildCurve(start, end, { x: 1, y: 0 }, { x: 0, y: 0 }));
}

function stopCalloutArrowDrag(event) {
  if (!calloutArrowDrag) return;
  const callout = findCallout(calloutArrowDrag.id);
  if (!callout) return;

  const target = event.target.closest('.connection-point');
  if (target) {
    const nodeId = parseInt(target.dataset.nodeId, 10);
    const point = target.dataset.point;
    if (Number.isFinite(nodeId) && validPoints.includes(point)) {
      callout.target = { nodeId, point };
    }
  } else {
    const dropPoint = getStagePoint(event.clientX, event.clientY);
    callout.target = { x: dropPoint.x, y: dropPoint.y };
  }

  calloutArrowDrag = null;
  previewPath.style.display = 'none';
  previewPath.setAttribute('marker-end', 'url(#arrowhead)');
  renderCalloutArrows();
  document.removeEventListener('mousemove', handleCalloutArrowDrag);
  document.removeEventListener('mouseup', stopCalloutArrowDrag);
}

function getCalloutAnchor(callout) {
  return {
    x: callout.x + callout.width,
    y: callout.y + callout.height / 2
  };
}

function getCalloutTarget(callout) {
  if (callout.target && typeof callout.target.nodeId === 'number') {
    const node = findNode(callout.target.nodeId);
    if (node) {
      return getConnectionPoint(node, callout.target.point);
    }
  }
  if (callout.target && Number.isFinite(callout.target.x) && Number.isFinite(callout.target.y)) {
    return { x: callout.target.x, y: callout.target.y };
  }
  return {
    x: callout.x + callout.width + 120,
    y: callout.y + callout.height / 2
  };
}

function ensureCalloutPath(callout) {
  if (calloutPathEls.has(callout.id)) return calloutPathEls.get(callout.id);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('callout-arrow');
  path.setAttribute('marker-end', 'url(#calloutArrow)');
  calloutLayer.appendChild(path);
  calloutPathEls.set(callout.id, path);
  return path;
}

function renderCalloutArrows() {
  const activeIds = new Set(state.callouts.map((c) => c.id));
  calloutPathEls.forEach((el, id) => {
    if (!activeIds.has(id)) {
      el.remove();
      calloutPathEls.delete(id);
    }
  });

  state.callouts.forEach((callout) => {
    const path = ensureCalloutPath(callout);
    const start = getCalloutAnchor(callout);
    const end = getCalloutTarget(callout);
    const curve = buildCurve(start, end, { x: 1, y: 0 }, { x: -1, y: 0 });
    path.setAttribute('d', curve);
  });
}

function renderAll() {
  const activeNodeIds = new Set(state.nodes.map((n) => n.id));
  nodeEls.forEach((el, id) => {
    if (!activeNodeIds.has(id)) {
      el.remove();
      nodeEls.delete(id);
    }
  });

  state.nodes.forEach((node) => {
    ensureNodeElement(node);
    updateNodeElement(node);
  });

  const activeCalloutIds = new Set(state.callouts.map((c) => c.id));
  calloutEls.forEach((el, id) => {
    if (!activeCalloutIds.has(id)) {
      el.remove();
      calloutEls.delete(id);
    }
  });

  state.callouts.forEach((callout) => {
    ensureCalloutElement(callout);
    updateCalloutElement(callout);
  });

  ensureCanvasBounds();
  renderConnections();
  renderCalloutArrows();
  updateSelectedClasses();
  updateEmptyState();
}

function setSelection(selection) {
  state.selected = selection;
  updateSelectedClasses();
  renderProperties();
}

function updateSelectedClasses() {
  nodeEls.forEach((el, id) => {
    const selected = state.selected && state.selected.type === 'node' && state.selected.id === id;
    el.classList.toggle('selected', Boolean(selected));
  });

  calloutEls.forEach((el, id) => {
    const selected = state.selected && state.selected.type === 'callout' && state.selected.id === id;
    el.classList.toggle('selected', Boolean(selected));
  });

  connectionEls.forEach((el, id) => {
    const selected = state.selected && state.selected.type === 'connection' && state.selected.id === id;
    el.classList.toggle('selected', Boolean(selected));
  });
}

function renderProperties() {
  if (!propertiesPanel) return;
  propertiesPanel.innerHTML = '';

  if (!state.selected) {
    const info = document.createElement('p');
    info.className = 'properties-muted';
    info.textContent = 'Select a node, connector, or callout to edit its details.';
    propertiesPanel.appendChild(info);
    return;
  }

  if (state.selected.type === 'node') {
    const node = findNode(state.selected.id);
    if (!node) return;

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Node';

    const colorRow = createColorRow('Fill color', node.color, (value) => {
      node.color = value;
      updateNodeElement(node);
    });

    const sizeRow = createSizeRow(node.width, node.height, MIN_NODE_WIDTH, MIN_NODE_HEIGHT, (w, h) => {
      node.width = w;
      node.height = h;
      updateNodeElement(node);
      renderConnections();
      renderCalloutArrows();
      ensureCanvasBounds();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-sm btn-danger';
    deleteBtn.textContent = 'Delete node';
    deleteBtn.onclick = () => removeSelected();

    propertiesPanel.append(title, colorRow, sizeRow, deleteBtn);
    return;
  }

  if (state.selected.type === 'callout') {
    const callout = findCallout(state.selected.id);
    if (!callout) return;

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Callout';

    const colorRow = createColorRow('Fill color', callout.color, (value) => {
      callout.color = value;
      updateCalloutElement(callout);
    });

    const sizeRow = createSizeRow(callout.width, callout.height, MIN_CALLOUT_WIDTH, MIN_CALLOUT_HEIGHT, (w, h) => {
      callout.width = w;
      callout.height = h;
      updateCalloutElement(callout);
      renderCalloutArrows();
      ensureCanvasBounds();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-sm btn-danger';
    deleteBtn.textContent = 'Delete callout';
    deleteBtn.onclick = () => removeSelected();

    propertiesPanel.append(title, colorRow, sizeRow, deleteBtn);
    return;
  }

  if (state.selected.type === 'connection') {
    const connection = state.connections.find((c) => c.id === state.selected.id);
    if (!connection) return;

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Connector';

    const info = document.createElement('p');
    info.className = 'properties-muted';
    info.textContent = `From ${connection.from.point} to ${connection.to.point}.`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-sm btn-danger';
    deleteBtn.textContent = 'Delete connector';
    deleteBtn.onclick = () => removeSelected();

    propertiesPanel.append(title, info, deleteBtn);
  }
}

function createColorRow(labelText, value, onChange) {
  const row = document.createElement('div');
  row.className = 'properties-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = normalizeColor(value, DEFAULT_NODE_COLOR);
  input.addEventListener('input', () => onChange(input.value));
  row.append(label, input);
  return row;
}

function createSizeRow(width, height, minWidth, minHeight, onChange) {
  const row = document.createElement('div');
  row.className = 'properties-row';
  const label = document.createElement('label');
  label.textContent = 'Size';
  const inline = document.createElement('div');
  inline.className = 'row-inline';

  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = minWidth;
  widthInput.value = Math.round(width);

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = minHeight;
  heightInput.value = Math.round(height);

  const update = () => {
    const nextWidth = clamp(parseFloat(widthInput.value) || minWidth, minWidth, 900);
    const nextHeight = clamp(parseFloat(heightInput.value) || minHeight, minHeight, 700);
    widthInput.value = Math.round(nextWidth);
    heightInput.value = Math.round(nextHeight);
    onChange(nextWidth, nextHeight);
  };

  widthInput.addEventListener('change', update);
  heightInput.addEventListener('change', update);

  inline.append(widthInput, heightInput);
  row.append(label, inline);
  return row;
}

function removeSelected() {
  if (!state.selected) return;
  if (state.selected.type === 'node') {
    removeNode(state.selected.id);
  } else if (state.selected.type === 'callout') {
    removeCallout(state.selected.id);
  } else if (state.selected.type === 'connection') {
    removeConnection(state.selected.id);
  }
  setSelection(null);
  renderAll();
}

function removeNode(nodeId) {
  const node = findNode(nodeId);
  if (!node) return;

  state.callouts.forEach((callout) => {
    if (callout.target && callout.target.nodeId === nodeId) {
      callout.target = getConnectionPoint(node, callout.target.point);
    }
  });

  state.nodes = state.nodes.filter((n) => n.id !== nodeId);
  state.connections = state.connections.filter(
    (c) => c.from.nodeId !== nodeId && c.to.nodeId !== nodeId
  );
}

function removeCallout(calloutId) {
  state.callouts = state.callouts.filter((c) => c.id !== calloutId);
}

function findNode(id) {
  return state.nodes.find((n) => n.id === id);
}

function findCallout(id) {
  return state.callouts.find((c) => c.id === id);
}

function downloadJson(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportFlowchart() {
  const payload = {
    version: 1,
    baseSize: { width: baseWidth, height: baseHeight },
    zoom: state.zoom,
    scroll: {
      left: flowCanvasScroll.scrollLeft,
      top: flowCanvasScroll.scrollTop
    },
    nodes: state.nodes,
    connections: state.connections,
    callouts: state.callouts,
    nextIds: {
      node: state.nextNodeId,
      connection: state.nextConnectionId,
      callout: state.nextCalloutId
    }
  };

  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadJson(`flowchart-${dateStamp}.json`, JSON.stringify(payload, null, 2));
  setStatus('Flowchart exported.', 'success');
}

function sanitizeNodes(rawNodes) {
  if (!Array.isArray(rawNodes)) return [];
  return rawNodes.map((raw) => ({
    id: Number.isFinite(raw.id) ? raw.id : state.nextNodeId++,
    x: Number.isFinite(raw.x) ? raw.x : 0,
    y: Number.isFinite(raw.y) ? raw.y : 0,
    width: clamp(Number(raw.width) || 180, MIN_NODE_WIDTH, 900),
    height: clamp(Number(raw.height) || 110, MIN_NODE_HEIGHT, 700),
    text: String(raw.text || 'Node'),
    color: normalizeColor(raw.color, DEFAULT_NODE_COLOR)
  }));
}

function sanitizeConnections(rawConnections, nodes) {
  if (!Array.isArray(rawConnections)) return [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  return rawConnections
    .map((raw) => ({
      id: Number.isFinite(raw.id) ? raw.id : state.nextConnectionId++,
      from: raw.from || {},
      to: raw.to || {}
    }))
    .filter((conn) => (
      Number.isFinite(conn.from.nodeId) &&
      Number.isFinite(conn.to.nodeId) &&
      nodeIds.has(conn.from.nodeId) &&
      nodeIds.has(conn.to.nodeId) &&
      validPoints.includes(conn.from.point) &&
      validPoints.includes(conn.to.point)
    ));
}

function sanitizeCallouts(rawCallouts) {
  if (!Array.isArray(rawCallouts)) return [];
  return rawCallouts.map((raw) => ({
    id: Number.isFinite(raw.id) ? raw.id : state.nextCalloutId++,
    x: Number.isFinite(raw.x) ? raw.x : 0,
    y: Number.isFinite(raw.y) ? raw.y : 0,
    width: clamp(Number(raw.width) || 220, MIN_CALLOUT_WIDTH, 900),
    height: clamp(Number(raw.height) || 130, MIN_CALLOUT_HEIGHT, 700),
    text: String(raw.text || 'Callout'),
    color: normalizeColor(raw.color, DEFAULT_CALLOUT_COLOR),
    target: raw.target || {}
  }));
}

function importFlowchart(data) {
  const nodes = sanitizeNodes(data.nodes);
  const connections = sanitizeConnections(data.connections, nodes);
  const callouts = sanitizeCallouts(data.callouts);

  state.nodes = nodes;
  state.connections = connections;
  state.callouts = callouts;

  state.nextNodeId = data.nextIds?.node || (Math.max(0, ...nodes.map((n) => n.id)) + 1);
  state.nextConnectionId = data.nextIds?.connection || (Math.max(0, ...connections.map((c) => c.id)) + 1);
  state.nextCalloutId = data.nextIds?.callout || (Math.max(0, ...callouts.map((c) => c.id)) + 1);

  baseWidth = data.baseSize?.width || baseWidth;
  baseHeight = data.baseSize?.height || baseHeight;
  state.zoom = clamp(data.zoom || 1, ZOOM_MIN, ZOOM_MAX);
  updateZoom();
  renderAll();

  if (data.scroll) {
    requestAnimationFrame(() => {
      flowCanvasScroll.scrollLeft = data.scroll.left || 0;
      flowCanvasScroll.scrollTop = data.scroll.top || 0;
    });
  }

  setStatus('Flowchart imported.', 'success');
}

flowSidebarToggle.addEventListener('click', () => {
  flowSidebar.classList.toggle('collapsed');
});

addNodeBtn.addEventListener('click', () => {
  createNode();
});

addCalloutBtn.addEventListener('click', () => {
  createCallout();
});

gridToggle.addEventListener('change', () => {
  flowCanvas.classList.toggle('grid-on', gridToggle.checked);
});

flowZoomIn.addEventListener('click', () => {
  state.zoom = clamp(state.zoom + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
  updateZoom();
});

flowZoomOut.addEventListener('click', () => {
  state.zoom = clamp(state.zoom - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
  updateZoom();
});

flowZoomReset.addEventListener('click', () => {
  state.zoom = 1;
  updateZoom();
});

flowExportBtn.addEventListener('click', () => {
  if (!state.nodes.length && !state.callouts.length) {
    setStatus('Nothing to export yet.', 'error');
    return;
  }
  exportFlowchart();
});

flowImportBtn.addEventListener('click', () => {
  flowImportFile.click();
});

flowImportFile.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  setStatus(`Loading ${file.name}...`);
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !data.nodes) {
      throw new Error('Invalid flowchart file.');
    }
    importFlowchart(data);
  } catch (err) {
    setStatus(err.message || 'Import failed.', 'error');
  } finally {
    flowImportFile.value = '';
  }
});

flowStage.addEventListener('mousedown', (event) => {
  if (
    event.target === flowStage ||
    event.target === flowCanvas ||
    event.target === flowSvg ||
    event.target === connectionLayer ||
    event.target === calloutLayer
  ) {
    setSelection(null);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    removeSelected();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === '=') {
    event.preventDefault();
    flowZoomIn.click();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === '-') {
    event.preventDefault();
    flowZoomOut.click();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === '0') {
    event.preventDefault();
    flowZoomReset.click();
  }
});

updateZoom();
flowCanvas.classList.toggle('grid-on', gridToggle.checked);
renderAll();
