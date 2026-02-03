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

  const points = ['top', 'right', 'bottom', 'left'];
  points.forEach((point) => {
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
  const next = getStagePoint(event.clientX, event.clientY);
  node.x = Math.max(0, next.x - dragState.offsetX);
  node.y = Math.max(0, next.y - dragState.offsetY);
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
    startHeight: node.height,
    startNodeX: node.x,
    startNodeY: node.y
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
  input.value = normalizeColor(value);
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

function normalizeColor(value, fallback = DEFAULT_NODE_COLOR) {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value;
  }
  return fallback;
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
const DEFAULT_CONNECTION_COLOR = '#7bb0ff';
const VALID_POINTS = ['top', 'right', 'bottom', 'left'];

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
const calloutArrowEls = new Map();

let dragState = null;
let resizeState = null;
let connectionDrag = null;
let calloutDrag = null;
let calloutArrowDrag = null;

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
  const padding = 240;
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

  baseWidth = Math.max(1200, maxX + padding);
  baseHeight = Math.max(800, maxY + padding);
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
  return {
    x: (flowCanvasScroll.scrollLeft + flowCanvasScroll.clientWidth / 2) / state.zoom,
    y: (flowCanvasScroll.scrollTop + flowCanvasScroll.clientHeight / 2) / state.zoom
  };
}

function updateEmptyState() {
  const hasContent = state.nodes.length > 0 || state.callouts.length > 0;
  flowEmptyState.style.display = hasContent ? 'none' : 'flex';
}

function createNode(options = {}) {
  const center = getViewportCenter();
  const width = options.width || 180;
  const height = options.height || 110;
  const node = {
    id: options.id || state.nextNodeId++,
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

function ensureNodeElement(node) {
  if (nodeEls.has(node.id)) return nodeEls.get(node.id);
  const el = document.createElement('div');
  el.className = 'flow-node';
  el.dataset.nodeId = String(node.id);

  const textEl = document.createElement('div');
  textEl.className = 'node-text';
  textEl.textContent = node.text;
  textEl.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    enableNodeEditing(node, el, textEl);
  });

  el.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.resize-handle')) return;
    if (event.target.closest('.connection-point')) return;
    if (el.classList.contains('editing')) return;
    event.preventDefault();
    setSelection({ type: 'node', id: node.id });
    startNodeDrag(node, event);
  });

  el.addEventListener('click', (event) => {
    if (event.target.closest('.connection-point')) return;
    if (event.target.closest('.resize-handle')) return;
    setSelection({ type: 'node', id: node.id });
  });

  const points = ['top', 'right', 'bottom', 'left'];
  points.forEach((point) => {
    const pt = document.createElement('div');
    pt.className = `connection-point point-${point}`;
    pt.dataset.nodeId = String(node.id);
    pt.dataset.point = point;
    pt.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      event.preventDefault();
      startConnectionDrag(node.id, point, event);
    });
    el.appendChild(pt);
  });

  const handles = [
    { cls: 'handle-r', handle: 'r' },
    { cls: 'handle-b', handle: 'b' },
    { cls: 'handle-br', handle: 'br' }
  ];

  handles.forEach((info) => {
    const handle = document.createElement('div');
    handle.className = `resize-handle ${info.cls}`;
    handle.dataset.handle = info.handle;
    handle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      event.preventDefault();
      startNodeResize(node, info.handle, event);
    });
    el.appendChild(handle);
  });

  el.appendChild(textEl);
  nodeEls.set(node.id, el);
  nodesLayer.appendChild(el);
  return el;
}

function enableNodeEditing(node, nodeEl, textEl) {
  nodeEl.classList.add('editing');
  textEl.contentEditable = 'true';
  textEl.classList.add('editable');
  textEl.focus();

  const range = document.createRange();
  range.selectNodeContents(textEl);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const finish = (cancelled) => {
    textEl.contentEditable = 'false';
    textEl.classList.remove('editable');
    nodeEl.classList.remove('editing');
    if (cancelled) {
      textEl.textContent = node.text;
      return;
    }
    const next = textEl.textContent.trim();
    node.text = next || node.text;
    textEl.textContent = node.text;
  };

  textEl.onblur = () => finish(false);
  textEl.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      textEl.blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(true);
      textEl.blur();
    }
  };
}

function startNodeDrag(node, event) {
  const point = getStagePoint(event.clientX, event.clientY);
  dragState = {
    nodeId: node.id,
    offsetX: point.x - node.x,
    offsetY: point.y - node.y
  };
  const el = nodeEls.get(node.id);
  if (el) el.classList.add('dragging');
  document.addEventListener('mousemove', handleNodeDrag);
  document.addEventListener('mouseup', endNodeDrag);
}

function handleNodeDrag(event) {
  if (!dragState) return;
  const node = state.nodes.find((item) => item.id === dragState.nodeId);
  if (!node) return;
  const point = getStagePoint(event.clientX, event.clientY);
  node.x = Math.max(0, point.x - dragState.offsetX);
  node.y = Math.max(0, point.y - dragState.offsetY);
  updateNodeElement(node);
  renderConnections();
  renderCalloutArrows();
  ensureCanvasBounds();
}

function endNodeDrag() {
  if (!dragState) return;
  const el = nodeEls.get(dragState.nodeId);
  if (el) el.classList.remove('dragging');
  dragState = null;
  document.removeEventListener('mousemove', handleNodeDrag);
  document.removeEventListener('mouseup', endNodeDrag);
}

function startNodeResize(node, handle, event) {
  const point = getStagePoint(event.clientX, event.clientY);
  resizeState = {
    nodeId: node.id,
    handle,
    startX: point.x,
    startY: point.y,
    startWidth: node.width,
    startHeight: node.height
  };
  document.addEventListener('mousemove', handleNodeResize);
  document.addEventListener('mouseup', endNodeResize);
}

function handleNodeResize(event) {
  if (!resizeState) return;
  const node = state.nodes.find((item) => item.id === resizeState.nodeId);
  if (!node) return;
  const point = getStagePoint(event.clientX, event.clientY);
  const deltaX = point.x - resizeState.startX;
  const deltaY = point.y - resizeState.startY;

  if (resizeState.handle === 'r' || resizeState.handle === 'br') {
    node.width = clamp(resizeState.startWidth + deltaX, MIN_NODE_WIDTH, 720);
  }
  if (resizeState.handle === 'b' || resizeState.handle === 'br') {
    node.height = clamp(resizeState.startHeight + deltaY, MIN_NODE_HEIGHT, 520);
  }
  updateNodeElement(node);
  renderConnections();
  renderCalloutArrows();
  ensureCanvasBounds();
}

function endNodeResize() {
  resizeState = null;
  document.removeEventListener('mousemove', handleNodeResize);
  document.removeEventListener('mouseup', endNodeResize);
}

function getPointPosition(node, point) {
  switch (point) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 };
    default:
      return { x: node.x, y: node.y };
  }
}

function getPointDirection(point) {
  switch (point) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

function buildCurve(start, end, startDir, endDir) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const offset = clamp(distance * 0.35, 60, 160);
  const c1 = {
    x: start.x + startDir.x * offset,
    y: start.y + startDir.y * offset
  };
  const c2 = {
    x: end.x + endDir.x * offset,
    y: end.y + endDir.y * offset
  };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

function renderConnections() {
  const activeIds = new Set();
  state.connections.forEach((connection) => {
    activeIds.add(connection.id);
    const path = ensureConnectionElement(connection);
    const fromNode = state.nodes.find((node) => node.id === connection.from.nodeId);
    const toNode = state.nodes.find((node) => node.id === connection.to.nodeId);
    if (!fromNode || !toNode) return;
    const start = getPointPosition(fromNode, connection.from.point);
    const end = getPointPosition(toNode, connection.to.point);
    const pathData = buildCurve(start, end, getPointDirection(connection.from.point), getPointDirection(connection.to.point));
    path.setAttribute('d', pathData);
  });

  connectionEls.forEach((el, id) => {
    if (!activeIds.has(id)) {
      el.remove();
      connectionEls.delete(id);
    }
  });
}

function ensureConnectionElement(connection) {
  if (connectionEls.has(connection.id)) return connectionEls.get(connection.id);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('flow-connection');
  path.dataset.connectionId = String(connection.id);
  path.setAttribute('marker-end', 'url(#arrowhead)');
  path.setAttribute('stroke', connection.color || DEFAULT_CONNECTION_COLOR);
  path.addEventListener('click', (event) => {
    event.stopPropagation();
    setSelection({ type: 'connection', id: connection.id });
  });
  connectionLayer.appendChild(path);
  connectionEls.set(connection.id, path);
  return path;
}

function startConnectionDrag(nodeId, point, event) {
  connectionDrag = { from: { nodeId, point } };
  previewPath.style.display = 'block';
  document.addEventListener('mousemove', handleConnectionDrag);
  document.addEventListener('mouseup', endConnectionDrag);
  handleConnectionDrag(event);
}

function handleConnectionDrag(event) {
  if (!connectionDrag) return;
  const fromNode = state.nodes.find((node) => node.id === connectionDrag.from.nodeId);
  if (!fromNode) return;
  const start = getPointPosition(fromNode, connectionDrag.from.point);
  const end = getStagePoint(event.clientX, event.clientY);
  const pathData = buildCurve(start, end, getPointDirection(connectionDrag.from.point), { x: 0, y: 0 });
  previewPath.setAttribute('d', pathData);
}

function endConnectionDrag(event) {
  if (!connectionDrag) return;
  const target = event.target.closest('.connection-point');
  if (target) {
    const targetId = Number(target.dataset.nodeId);
    const targetPoint = target.dataset.point;
    if (Number.isFinite(targetId) && VALID_POINTS.includes(targetPoint)) {
      if (!(targetId === connectionDrag.from.nodeId && targetPoint === connectionDrag.from.point)) {
        state.connections.push({
          id: state.nextConnectionId++,
          from: { ...connectionDrag.from },
          to: { nodeId: targetId, point: targetPoint },
          color: DEFAULT_CONNECTION_COLOR
        });
      }
    }
  }
  previewPath.style.display = 'none';
  connectionDrag = null;
  renderConnections();
  document.removeEventListener('mousemove', handleConnectionDrag);
  document.removeEventListener('mouseup', endConnectionDrag);
}

function createCallout(options = {}) {
  const center = getViewportCenter();
  const width = options.width || 220;
  const height = options.height || 120;
  const callout = {
    id: options.id || state.nextCalloutId++,
    x: options.x ?? center.x - width / 2,
    y: options.y ?? center.y - height / 2,
    width,
    height,
    text: options.text || 'Add your comment here.',
    color: options.color || DEFAULT_CALLOUT_COLOR,
    target: options.target || { x: center.x + 160, y: center.y }
  };
  state.callouts.push(callout);
  ensureCalloutElement(callout);
  updateCalloutElement(callout);
  setSelection({ type: 'callout', id: callout.id });
  renderCalloutArrows();
  ensureCanvasBounds();
  updateEmptyState();
  return callout;
}

function ensureCalloutElement(callout) {
  if (calloutEls.has(callout.id)) return calloutEls.get(callout.id);
  const el = document.createElement('div');
  el.className = 'flow-callout';
  el.dataset.calloutId = String(callout.id);

  const header = document.createElement('div');
  header.className = 'callout-header';
  header.textContent = 'Callout';
  header.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    event.preventDefault();
    setSelection({ type: 'callout', id: callout.id });
    startCalloutDrag(callout, event);
  });

  const textEl = document.createElement('div');
  textEl.className = 'callout-text';
  textEl.textContent = callout.text;
  textEl.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    enableCalloutEditing(callout, el, textEl);
  });

  const anchor = document.createElement('div');
  anchor.className = 'callout-anchor';
  anchor.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    event.preventDefault();
    startCalloutArrowDrag(callout, event);
  });

  el.addEventListener('click', () => {
    setSelection({ type: 'callout', id: callout.id });
  });

  el.append(header, textEl, anchor);
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

function enableCalloutEditing(callout, el, textEl) {
  el.classList.add('editing');
  textEl.contentEditable = 'true';
  textEl.focus();

  const range = document.createRange();
  range.selectNodeContents(textEl);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const finish = (cancelled) => {
    textEl.contentEditable = 'false';
    el.classList.remove('editing');
    if (cancelled) {
      textEl.textContent = callout.text;
      return;
    }
    const next = textEl.textContent.trim();
    callout.text = next || callout.text;
    textEl.textContent = callout.text;
  };

  textEl.onblur = () => finish(false);
  textEl.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      textEl.blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(true);
      textEl.blur();
    }
  };
}

function startCalloutDrag(callout, event) {
  const point = getStagePoint(event.clientX, event.clientY);
  calloutDrag = {
    calloutId: callout.id,
    offsetX: point.x - callout.x,
    offsetY: point.y - callout.y
  };
  document.addEventListener('mousemove', handleCalloutDrag);
  document.addEventListener('mouseup', endCalloutDrag);
}

function handleCalloutDrag(event) {
  if (!calloutDrag) return;
  const callout = state.callouts.find((item) => item.id === calloutDrag.calloutId);
  if (!callout) return;
  const point = getStagePoint(event.clientX, event.clientY);
  callout.x = Math.max(0, point.x - calloutDrag.offsetX);
  callout.y = Math.max(0, point.y - calloutDrag.offsetY);
  updateCalloutElement(callout);
  renderCalloutArrows();
  ensureCanvasBounds();
}

function endCalloutDrag() {
  calloutDrag = null;
  document.removeEventListener('mousemove', handleCalloutDrag);
  document.removeEventListener('mouseup', endCalloutDrag);
}

function startCalloutArrowDrag(callout, event) {
  calloutArrowDrag = {
    calloutId: callout.id
  };
  previewPath.style.display = 'block';
  previewPath.setAttribute('marker-end', 'url(#calloutArrow)');
  document.addEventListener('mousemove', handleCalloutArrowDrag);
  document.addEventListener('mouseup', endCalloutArrowDrag);
  handleCalloutArrowDrag(event);
}

function handleCalloutArrowDrag(event) {
  if (!calloutArrowDrag) return;
  const callout = state.callouts.find((item) => item.id === calloutArrowDrag.calloutId);
  if (!callout) return;
  const start = getCalloutAnchor(callout);
  const end = getStagePoint(event.clientX, event.clientY);
  const pathData = buildCurve(start, end, { x: 1, y: 0 }, { x: 0, y: 0 });
  previewPath.setAttribute('d', pathData);
}

function endCalloutArrowDrag(event) {
  if (!calloutArrowDrag) return;
  const callout = state.callouts.find((item) => item.id === calloutArrowDrag.calloutId);
  if (!callout) return;
  const target = event.target.closest('.connection-point');
  if (target) {
    const targetId = Number(target.dataset.nodeId);
    const targetPoint = target.dataset.point;
    if (Number.isFinite(targetId) && VALID_POINTS.includes(targetPoint)) {
      callout.target = { nodeId: targetId, point: targetPoint };
    }
  } else {
    const point = getStagePoint(event.clientX, event.clientY);
    callout.target = { x: point.x, y: point.y };
  }
  previewPath.style.display = 'none';
  previewPath.setAttribute('marker-end', 'url(#arrowhead)');
  calloutArrowDrag = null;
  renderCalloutArrows();
  document.removeEventListener('mousemove', handleCalloutArrowDrag);
  document.removeEventListener('mouseup', endCalloutArrowDrag);
}

function getCalloutAnchor(callout) {
  return {
    x: callout.x + callout.width,
    y: callout.y + callout.height / 2
  };
}

function renderCalloutArrows() {
  const active = new Set();
  state.callouts.forEach((callout) => {
    active.add(callout.id);
    let path = calloutArrowEls.get(callout.id);
    if (!path) {
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('flow-connection', 'callout-arrow');
      path.setAttribute('marker-end', 'url(#calloutArrow)');
      calloutLayer.appendChild(path);
      calloutArrowEls.set(callout.id, path);
    }
    const start = getCalloutAnchor(callout);
    let end = callout.target;
    if (callout.target && callout.target.nodeId) {
      const node = state.nodes.find((item) => item.id === callout.target.nodeId);
      if (node) {
        end = getPointPosition(node, callout.target.point);
      }
    }
    if (!end) return;
    const pathData = buildCurve(start, end, { x: 1, y: 0 }, { x: 0, y: 0 });
    path.setAttribute('d', pathData);
  });

  calloutArrowEls.forEach((el, id) => {
    if (!active.has(id)) {
      el.remove();
      calloutArrowEls.delete(id);
    }
  });
}

function setSelection(selection) {
  state.selected = selection;
  updateSelectionStyles();
  renderProperties();
}

function updateSelectionStyles() {
  nodeEls.forEach((el, id) => {
    const isSelected = state.selected && state.selected.type === 'node' && state.selected.id === id;
    el.classList.toggle('selected', Boolean(isSelected));
  });
  calloutEls.forEach((el, id) => {
    const isSelected = state.selected && state.selected.type === 'callout' && state.selected.id === id;
    el.classList.toggle('selected', Boolean(isSelected));
  });
  connectionEls.forEach((el, id) => {
    const isSelected = state.selected && state.selected.type === 'connection' && state.selected.id === id;
    el.classList.toggle('selected', Boolean(isSelected));
  });
}

function renderProperties() {
  propertiesPanel.innerHTML = '';
  if (!state.selected) {
    const hint = document.createElement('p');
    hint.className = 'properties-muted';
    hint.textContent = 'Select a node, connector, or callout to edit its details.';
    propertiesPanel.appendChild(hint);
    return;
  }

  if (state.selected.type === 'node') {
    const node = state.nodes.find((item) => item.id === state.selected.id);
    if (!node) return;
    propertiesPanel.appendChild(createPanelTitle('Node Settings'));
    propertiesPanel.appendChild(createColorControl('Node color', node.color, (value) => {
      node.color = value;
      updateNodeElement(node);
    }));
    propertiesPanel.appendChild(createSizeControls(node.width, node.height, (width, height) => {
      node.width = clamp(width, MIN_NODE_WIDTH, 720);
      node.height = clamp(height, MIN_NODE_HEIGHT, 520);
      updateNodeElement(node);
      renderConnections();
      renderCalloutArrows();
      ensureCanvasBounds();
    }));
    propertiesPanel.appendChild(createDeleteButton('Delete node'));
    return;
  }

  if (state.selected.type === 'callout') {
    const callout = state.callouts.find((item) => item.id === state.selected.id);
    if (!callout) return;
    propertiesPanel.appendChild(createPanelTitle('Callout Settings'));
    propertiesPanel.appendChild(createColorControl('Callout color', callout.color, (value) => {
      callout.color = value;
      updateCalloutElement(callout);
    }));
    propertiesPanel.appendChild(createSizeControls(callout.width, callout.height, (width, height) => {
      callout.width = clamp(width, MIN_CALLOUT_WIDTH, 720);
      callout.height = clamp(height, MIN_CALLOUT_HEIGHT, 520);
      updateCalloutElement(callout);
      renderCalloutArrows();
      ensureCanvasBounds();
    }));
    propertiesPanel.appendChild(createDeleteButton('Delete callout'));
    return;
  }

  if (state.selected.type === 'connection') {
    const connection = state.connections.find((item) => item.id === state.selected.id);
    if (!connection) return;
    propertiesPanel.appendChild(createPanelTitle('Connector'));
    const fromText = `${connection.from.nodeId}:${connection.from.point}`;
    const toText = `${connection.to.nodeId}:${connection.to.point}`;
    const detail = document.createElement('p');
    detail.className = 'properties-muted';
    detail.textContent = `From ${fromText} to ${toText}.`;
    propertiesPanel.appendChild(detail);
    propertiesPanel.appendChild(createDeleteButton('Delete connector'));
  }
}

function createPanelTitle(text) {
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = text;
  return title;
}

function createColorControl(labelText, value, onChange) {
  const row = document.createElement('div');
  row.className = 'properties-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = value;
  input.addEventListener('input', () => onChange(input.value));
  row.append(label, input);
  return row;
}

function createSizeControls(width, height, onChange) {
  const row = document.createElement('div');
  row.className = 'properties-row';
  const label = document.createElement('label');
  label.textContent = 'Size';
  const inline = document.createElement('div');
  inline.className = 'row-inline';
  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = '120';
  widthInput.value = Math.round(width);
  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = '80';
  heightInput.value = Math.round(height);
  const handler = () => {
    const nextWidth = Number(widthInput.value) || width;
    const nextHeight = Number(heightInput.value) || height;
    onChange(nextWidth, nextHeight);
  };
  widthInput.addEventListener('change', handler);
  heightInput.addEventListener('change', handler);
  inline.append(widthInput, heightInput);
  row.append(label, inline);
  return row;
}

function createDeleteButton(labelText) {
  const row = document.createElement('div');
  row.className = 'properties-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm btn-danger';
  button.textContent = labelText;
  button.addEventListener('click', () => deleteSelection());
  row.appendChild(button);
  return row;
}

function deleteSelection() {
  if (!state.selected) return;
  if (state.selected.type === 'node') {
    deleteNode(state.selected.id);
  } else if (state.selected.type === 'callout') {
    deleteCallout(state.selected.id);
  } else if (state.selected.type === 'connection') {
    deleteConnection(state.selected.id);
  }
  setSelection(null);
  renderConnections();
  renderCalloutArrows();
  updateEmptyState();
}

function deleteNode(nodeId) {
  const nodeIndex = state.nodes.findIndex((node) => node.id === nodeId);
  if (nodeIndex === -1) return;
  const node = state.nodes[nodeIndex];
  state.nodes.splice(nodeIndex, 1);
  const el = nodeEls.get(nodeId);
  if (el) {
    el.remove();
    nodeEls.delete(nodeId);
  }

  state.connections = state.connections.filter((connection) => {
    return connection.from.nodeId !== nodeId && connection.to.nodeId !== nodeId;
  });

  state.callouts.forEach((callout) => {
    if (callout.target && callout.target.nodeId === nodeId) {
      callout.target = getPointPosition(node, callout.target.point);
    }
  });
}

function deleteConnection(connectionId) {
  state.connections = state.connections.filter((connection) => connection.id !== connectionId);
  const el = connectionEls.get(connectionId);
  if (el) {
    el.remove();
    connectionEls.delete(connectionId);
  }
}

function deleteCallout(calloutId) {
  const index = state.callouts.findIndex((callout) => callout.id === calloutId);
  if (index === -1) return;
  state.callouts.splice(index, 1);
  const el = calloutEls.get(calloutId);
  if (el) {
    el.remove();
    calloutEls.delete(calloutId);
  }
  const arrow = calloutArrowEls.get(calloutId);
  if (arrow) {
    arrow.remove();
    calloutArrowEls.delete(calloutId);
  }
}

function sanitizeNode(raw) {
  const width = clamp(Number(raw.width) || 180, MIN_NODE_WIDTH, 720);
  const height = clamp(Number(raw.height) || 110, MIN_NODE_HEIGHT, 520);
  return {
    id: Number(raw.id) || state.nextNodeId++,
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    width,
    height,
    text: String(raw.text || 'Node'),
    color: raw.color || DEFAULT_NODE_COLOR
  };
}

function sanitizeCallout(raw) {
  const width = clamp(Number(raw.width) || 220, MIN_CALLOUT_WIDTH, 720);
  const height = clamp(Number(raw.height) || 120, MIN_CALLOUT_HEIGHT, 520);
  return {
    id: Number(raw.id) || state.nextCalloutId++,
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    width,
    height,
    text: String(raw.text || 'Callout'),
    color: raw.color || DEFAULT_CALLOUT_COLOR,
    target: raw.target || null
  };
}

function sanitizeConnection(raw) {
  if (!raw || !raw.from || !raw.to) return null;
  const fromId = Number(raw.from.nodeId);
  const toId = Number(raw.to.nodeId);
  if (!Number.isFinite(fromId) || !Number.isFinite(toId)) return null;
  if (!VALID_POINTS.includes(raw.from.point) || !VALID_POINTS.includes(raw.to.point)) return null;
  return {
    id: Number(raw.id) || state.nextConnectionId++,
    from: { nodeId: fromId, point: raw.from.point },
    to: { nodeId: toId, point: raw.to.point },
    color: raw.color || DEFAULT_CONNECTION_COLOR
  };
}

function loadState(payload) {
  state.nodes = [];
  state.connections = [];
  state.callouts = [];
  nodeEls.forEach((el) => el.remove());
  calloutEls.forEach((el) => el.remove());
  connectionEls.forEach((el) => el.remove());
  calloutArrowEls.forEach((el) => el.remove());
  nodeEls.clear();
  calloutEls.clear();
  connectionEls.clear();
  calloutArrowEls.clear();

  state.nextNodeId = 1;
  state.nextConnectionId = 1;
  state.nextCalloutId = 1;

  if (payload.baseSize) {
    baseWidth = Number(payload.baseSize.width) || baseWidth;
    baseHeight = Number(payload.baseSize.height) || baseHeight;
  }

  if (Array.isArray(payload.nodes)) {
    payload.nodes.forEach((raw) => {
      const node = sanitizeNode(raw);
      state.nodes.push(node);
    });
  }

  if (Array.isArray(payload.callouts)) {
    payload.callouts.forEach((raw) => {
      const callout = sanitizeCallout(raw);
      if (callout.target && callout.target.nodeId) {
        if (!VALID_POINTS.includes(callout.target.point)) {
          callout.target = null;
        }
      }
      state.callouts.push(callout);
    });
  }

  if (Array.isArray(payload.connections)) {
    payload.connections.forEach((raw) => {
      const connection = sanitizeConnection(raw);
      if (connection) state.connections.push(connection);
    });
  }

  state.nodes.forEach((node) => {
    state.nextNodeId = Math.max(state.nextNodeId, node.id + 1);
    ensureNodeElement(node);
    updateNodeElement(node);
  });

  state.callouts.forEach((callout) => {
    state.nextCalloutId = Math.max(state.nextCalloutId, callout.id + 1);
    ensureCalloutElement(callout);
    updateCalloutElement(callout);
  });

  state.connections.forEach((connection) => {
    state.nextConnectionId = Math.max(state.nextConnectionId, connection.id + 1);
    ensureConnectionElement(connection);
  });

  ensureCanvasBounds();
  renderConnections();
  renderCalloutArrows();
  updateEmptyState();
  updateSelectionStyles();

  if (typeof payload.zoom === 'number') {
    state.zoom = clamp(payload.zoom, ZOOM_MIN, ZOOM_MAX);
  }
  updateZoom();

  if (payload.scroll) {
    requestAnimationFrame(() => {
      flowCanvasScroll.scrollLeft = Number(payload.scroll.left) || 0;
      flowCanvasScroll.scrollTop = Number(payload.scroll.top) || 0;
    });
  }
}

function exportState() {
  if (!state.nodes.length && !state.callouts.length) {
    setStatus('Nothing to export yet.', 'error');
    return;
  }
  const payload = {
    version: 1,
    baseSize: { width: baseWidth, height: baseHeight },
    zoom: state.zoom,
    scroll: { left: flowCanvasScroll.scrollLeft, top: flowCanvasScroll.scrollTop },
    nodes: state.nodes,
    connections: state.connections,
    callouts: state.callouts
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `flowchart-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus('Flowchart exported.', 'success');
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      loadState(payload);
      setStatus('Flowchart imported successfully.', 'success');
    } catch (error) {
      setStatus('Import failed. Please check the file.', 'error');
    }
  };
  reader.readAsText(file);
}

flowSidebarToggle.addEventListener('click', () => {
  flowSidebar.classList.toggle('collapsed');
});

addNodeBtn.addEventListener('click', () => createNode());
addCalloutBtn.addEventListener('click', () => createCallout());

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

flowExportBtn.addEventListener('click', exportState);

flowImportBtn.addEventListener('click', () => {
  flowImportFile.click();
});

flowImportFile.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) handleImportFile(file);
  flowImportFile.value = '';
});

flowStage.addEventListener('mousedown', (event) => {
  const isBackground =
    event.target === flowStage ||
    event.target === flowCanvas ||
    event.target === flowSvg ||
    event.target === connectionLayer ||
    event.target === calloutLayer;
  if (isBackground) {
    setSelection(null);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target.tagName === 'INPUT' || event.target.contentEditable === 'true') return;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    deleteSelection();
  }
});

updateZoom();
updateEmptyState();
