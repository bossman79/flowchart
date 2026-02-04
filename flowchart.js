'use strict';

const state = {
  layers: [],
  connections: [],
  selected: null,
  nextId: 1,
  nextConnectionId: 1,
  zoom: 1,
  layerDrag: null
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const MIN_NODE_WIDTH = 150;
const MIN_NODE_HEIGHT = 90;
const MIN_SHAPE_SIZE = 60;
const MIN_TEXTBOX_WIDTH = 100;
const MIN_TEXTBOX_HEIGHT = 40;
const DEFAULT_NODE_COLOR = '#22304d';
const DEFAULT_SHAPE_COLOR = '#2a3b60';

let baseWidth = 2200;
let baseHeight = 1400;

const flowCanvasScroll = document.getElementById('flowCanvasScroll');
const flowCanvas = document.getElementById('flowCanvas');
const flowStage = document.getElementById('flowStage');
const flowSvg = document.getElementById('flowSvg');
const connectionLayer = document.getElementById('connectionLayer');
const calloutLayer = document.getElementById('calloutLayer');
const previewPath = document.getElementById('previewPath');
const elementsLayer = document.getElementById('elementsLayer');
const flowEmptyState = document.getElementById('flowEmptyState');
const flowZoomLevel = document.getElementById('flowZoomLevel');
const propertiesPanel = document.getElementById('propertiesPanel');
const layersList = document.getElementById('layersList');
const flowImportFile = document.getElementById('flowImportFile');

const elementEls = new Map();
const connectionEls = new Map();
const calloutPathEls = new Map();

let dragState = null;
let resizeState = null;
let connectionDrag = null;
let calloutArrowDrag = null;

const validPoints = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];
const pointPositions = {
  'top': { x: 0.5, y: 0 },
  'top-right': { x: 1, y: 0 },
  'right': { x: 1, y: 0.5 },
  'bottom-right': { x: 1, y: 1 },
  'bottom': { x: 0.5, y: 1 },
  'bottom-left': { x: 0, y: 1 },
  'left': { x: 0, y: 0.5 },
  'top-left': { x: 0, y: 0 }
};
const pointDirections = {
  'top': { x: 0, y: -1 },
  'top-right': { x: 0.7, y: -0.7 },
  'right': { x: 1, y: 0 },
  'bottom-right': { x: 0.7, y: 0.7 },
  'bottom': { x: 0, y: 1 },
  'bottom-left': { x: -0.7, y: 0.7 },
  'left': { x: -1, y: 0 },
  'top-left': { x: -0.7, y: -0.7 }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateCanvasSize() {
  if (!flowStage || !flowCanvas) return;
  flowStage.style.width = `${baseWidth}px`;
  flowStage.style.height = `${baseHeight}px`;
  flowCanvas.style.width = `${baseWidth * state.zoom}px`;
  flowCanvas.style.height = `${baseHeight * state.zoom}px`;
}

function updateZoom() {
  if (!flowStage) return;
  flowStage.style.transformOrigin = '0 0';
  flowStage.style.transform = `scale(${state.zoom})`;
  if (flowZoomLevel) {
    flowZoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
  }
  updateCanvasSize();
}

function ensureCanvasBounds() {
  let maxX = 0;
  let maxY = 0;

  state.layers.forEach((layer) => {
    maxX = Math.max(maxX, layer.x + layer.width);
    maxY = Math.max(maxY, layer.y + layer.height);
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
  if (!flowCanvasScroll) return { x: baseWidth / 2, y: baseHeight / 2 };
  const centerX = (flowCanvasScroll.scrollLeft + flowCanvasScroll.clientWidth / 2) / state.zoom;
  const centerY = (flowCanvasScroll.scrollTop + flowCanvasScroll.clientHeight / 2) / state.zoom;
  return { x: centerX, y: centerY };
}

function updateEmptyState() {
  if (!flowEmptyState) return;
  const hasContent = state.layers.length > 0;
  flowEmptyState.style.display = hasContent ? 'none' : 'flex';
}

function normalizeColor(value, fallback) {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value;
  }
  return fallback;
}

function createLayer(type, options = {}) {
  const center = getViewportCenter();
  const layer = {
    id: state.nextId++,
    type,
    x: options.x ?? center.x - (options.width || 180) / 2,
    y: options.y ?? center.y - (options.height || 110) / 2,
    width: options.width || (type === 'textbox' ? 200 : type === 'shape' ? 120 : 180),
    height: options.height || (type === 'textbox' ? 60 : type === 'shape' ? 120 : 110),
    text: options.text || (type === 'node' ? 'New Step' : type === 'textbox' ? 'Text' : type === 'shape' ? '' : 'Note'),
    color: options.color || (type === 'shape' ? DEFAULT_SHAPE_COLOR : DEFAULT_NODE_COLOR),
    locked: false,
    visible: true,
    zIndex: state.layers.length
  };

  if (type === 'callout') {
    layer.target = options.target || { x: center.x + 140, y: center.y };
  }

  state.layers.push(layer);
  ensureElementNode(layer);
  updateElementNode(layer);
  setSelection({ type: 'layer', id: layer.id });
  ensureCanvasBounds();
  renderConnections();
  renderCalloutArrows();
  renderLayers();
  updateEmptyState();
  return layer;
}

function findLayer(id) {
  return state.layers.find((l) => l.id === id);
}

function ensureElementNode(layer) {
  if (elementEls.has(layer.id)) return elementEls.get(layer.id);

  const el = document.createElement('div');
  el.className = `flow-element flow-${layer.type}`;
  el.dataset.layerId = layer.id;
  el.dataset.type = layer.type;

  if (layer.type === 'node') {
    setupNodeElement(el, layer);
  } else if (layer.type === 'shape') {
    setupShapeElement(el, layer);
  } else if (layer.type === 'textbox') {
    setupTextboxElement(el, layer);
  } else if (layer.type === 'callout') {
    setupCalloutElement(el, layer);
  }

  elementEls.set(layer.id, el);
  if (elementsLayer) elementsLayer.appendChild(el);
  return el;
}

function setupNodeElement(el, layer) {
  const text = document.createElement('div');
  text.className = 'node-text';
  text.textContent = layer.text;
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (layer.locked) return;
    startTextEditing(layer, el, text);
  });

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (layer.locked) return;
    if (e.target.closest('.resize-handle') || e.target.closest('.connection-point')) return;
    if (el.classList.contains('editing')) return;
    e.preventDefault();
    setSelection({ type: 'layer', id: layer.id });
    startDrag(layer, e);
  });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    setSelection({ type: 'layer', id: layer.id });
  });

  validPoints.forEach((point) => {
    const pt = document.createElement('div');
    pt.className = `connection-point point-${point}`;
    pt.dataset.point = point;
    pt.dataset.layerId = layer.id;
    pt.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (layer.locked) return;
      startConnectionDrag(layer.id, point, e);
    });
    el.appendChild(pt);
  });

  const handle = document.createElement('div');
  handle.className = 'resize-handle handle-br';
  handle.dataset.handle = 'br';
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (layer.locked) return;
    startResize(layer, 'br', e);
  });
  el.appendChild(handle);

  el.appendChild(text);
}

function setupShapeElement(el, layer) {
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (layer.locked) return;
    if (e.target.closest('.resize-handle')) return;
    e.preventDefault();
    setSelection({ type: 'layer', id: layer.id });
    startDrag(layer, e);
  });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    setSelection({ type: 'layer', id: layer.id });
  });

  const handle = document.createElement('div');
  handle.className = 'resize-handle handle-br';
  handle.dataset.handle = 'br';
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (layer.locked) return;
    startResize(layer, 'br', e);
  });
  el.appendChild(handle);
}

function setupTextboxElement(el, layer) {
  const text = document.createElement('div');
  text.className = 'textbox-text';
  text.textContent = layer.text;
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (layer.locked) return;
    startTextEditing(layer, el, text);
  });

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (layer.locked) return;
    if (e.target.closest('.resize-handle')) return;
    if (el.classList.contains('editing')) return;
    e.preventDefault();
    setSelection({ type: 'layer', id: layer.id });
    startDrag(layer, e);
  });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    setSelection({ type: 'layer', id: layer.id });
  });

  const handle = document.createElement('div');
  handle.className = 'resize-handle handle-br';
  handle.dataset.handle = 'br';
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (layer.locked) return;
    startResize(layer, 'br', e);
  });
  el.appendChild(handle);

  el.appendChild(text);
}

function setupCalloutElement(el, layer) {
  const header = document.createElement('div');
  header.className = 'callout-header';
  header.textContent = 'Callout';
  header.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (layer.locked) return;
    setSelection({ type: 'layer', id: layer.id });
    startDrag(layer, e);
  });

  const text = document.createElement('div');
  text.className = 'callout-text';
  text.textContent = layer.text;
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (layer.locked) return;
    startTextEditing(layer, el, text);
  });

  const anchor = document.createElement('div');
  anchor.className = 'callout-anchor';
  anchor.title = 'Drag to attach arrow';
  anchor.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (layer.locked) return;
    startCalloutArrowDrag(layer, e);
  });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    setSelection({ type: 'layer', id: layer.id });
  });

  el.appendChild(header);
  el.appendChild(text);
  el.appendChild(anchor);
}

function updateElementNode(layer) {
  const el = elementEls.get(layer.id);
  if (!el) return;

  el.style.left = `${layer.x}px`;
  el.style.top = `${layer.y}px`;
  el.style.width = `${layer.width}px`;
  el.style.height = `${layer.height}px`;
  el.style.zIndex = layer.zIndex;
  el.style.display = layer.visible ? 'block' : 'none';

  if (layer.type === 'node' || layer.type === 'shape') {
    el.style.setProperty('--element-color', layer.color);
  }

  if (layer.locked) {
    el.classList.add('locked');
  } else {
    el.classList.remove('locked');
  }

  const textEl = el.querySelector('.node-text, .textbox-text, .callout-text');
  if (textEl && !el.classList.contains('editing')) {
    textEl.textContent = layer.text;
  }
}

function startTextEditing(layer, nodeEl, textEl) {
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
      layer.text = nextText;
    }
    textEl.textContent = layer.text;
    renderLayers();
  };

  textEl.onblur = () => finish(false);
  textEl.onkeydown = (e) => {
    if (e.key === 'Enter' && layer.type !== 'textbox') {
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

function startDrag(layer, event) {
  const start = getStagePoint(event.clientX, event.clientY);
  dragState = {
    id: layer.id,
    offsetX: start.x - layer.x,
    offsetY: start.y - layer.y
  };
  const el = elementEls.get(layer.id);
  if (el) el.classList.add('dragging');
  document.addEventListener('mousemove', handleDrag);
  document.addEventListener('mouseup', stopDrag);
}

function handleDrag(event) {
  if (!dragState) return;
  const layer = findLayer(dragState.id);
  if (!layer || layer.locked) return;
  const point = getStagePoint(event.clientX, event.clientY);
  layer.x = Math.max(0, point.x - dragState.offsetX);
  layer.y = Math.max(0, point.y - dragState.offsetY);
  updateElementNode(layer);
  renderConnections();
  renderCalloutArrows();
  ensureCanvasBounds();
}

function stopDrag() {
  if (!dragState) return;
  const el = elementEls.get(dragState.id);
  if (el) el.classList.remove('dragging');
  dragState = null;
  document.removeEventListener('mousemove', handleDrag);
  document.removeEventListener('mouseup', stopDrag);
}

function startResize(layer, handle, event) {
  const start = getStagePoint(event.clientX, event.clientY);
  resizeState = {
    id: layer.id,
    handle,
    startX: start.x,
    startY: start.y,
    startWidth: layer.width,
    startHeight: layer.height
  };
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
}

function handleResize(event) {
  if (!resizeState) return;
  const layer = findLayer(resizeState.id);
  if (!layer || layer.locked) return;
  const point = getStagePoint(event.clientX, event.clientY);
  const deltaX = point.x - resizeState.startX;
  const deltaY = point.y - resizeState.startY;

  const minSize = layer.type === 'shape' ? MIN_SHAPE_SIZE : layer.type === 'textbox' ? MIN_TEXTBOX_WIDTH : MIN_NODE_WIDTH;
  const minHeight = layer.type === 'textbox' ? MIN_TEXTBOX_HEIGHT : layer.type === 'shape' ? MIN_SHAPE_SIZE : MIN_NODE_HEIGHT;

  layer.width = clamp(resizeState.startWidth + deltaX, minSize, 900);
  layer.height = clamp(resizeState.startHeight + deltaY, minHeight, 700);

  updateElementNode(layer);
  renderConnections();
  renderCalloutArrows();
  ensureCanvasBounds();
}

function stopResize() {
  resizeState = null;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
}

function getConnectionPoint(layer, point) {
  const pos = pointPositions[point] || pointPositions.right;
  return {
    x: layer.x + layer.width * pos.x,
    y: layer.y + layer.height * pos.y
  };
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

  if (connectionLayer) connectionLayer.appendChild(path);
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
    const fromLayer = findLayer(connection.from.layerId);
    const toLayer = findLayer(connection.to.layerId);
    if (!fromLayer || !toLayer || fromLayer.type !== 'node' || toLayer.type !== 'node') return;

    const path = ensureConnectionElement(connection);
    const start = getConnectionPoint(fromLayer, connection.from.point);
    const end = getConnectionPoint(toLayer, connection.to.point);
    const startDir = pointDirections[connection.from.point] || pointDirections.right;
    const endDir = pointDirections[connection.to.point] || pointDirections.left;
    path.setAttribute('d', buildCurve(start, end, startDir, endDir));
  });

  updateSelectedClasses();
}

function startConnectionDrag(layerId, point, event) {
  connectionDrag = {
    from: { layerId, point }
  };
  if (previewPath) {
    previewPath.style.display = 'block';
    previewPath.setAttribute('marker-end', 'url(#arrowhead)');
  }
  handleConnectionDrag(event);
  document.addEventListener('mousemove', handleConnectionDrag);
  document.addEventListener('mouseup', stopConnectionDrag);
}

function handleConnectionDrag(event) {
  if (!connectionDrag) return;
  const fromLayer = findLayer(connectionDrag.from.layerId);
  if (!fromLayer || !previewPath) return;
  const start = getConnectionPoint(fromLayer, connectionDrag.from.point);
  const end = getStagePoint(event.clientX, event.clientY);
  const startDir = pointDirections[connectionDrag.from.point] || pointDirections.right;
  const endDir = { x: 0, y: 0 };
  previewPath.setAttribute('d', buildCurve(start, end, startDir, endDir));
}

function stopConnectionDrag(event) {
  if (!connectionDrag) return;
  const target = event.target.closest('.connection-point');
  if (target) {
    const toLayerId = parseInt(target.dataset.layerId, 10);
    const toPoint = target.dataset.point;
    if (Number.isFinite(toLayerId) && validPoints.includes(toPoint)) {
      addConnection(connectionDrag.from, { layerId: toLayerId, point: toPoint });
    }
  }

  connectionDrag = null;
  if (previewPath) {
    previewPath.style.display = 'none';
  }
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

function startCalloutArrowDrag(layer, event) {
  calloutArrowDrag = { id: layer.id };
  if (previewPath) {
    previewPath.style.display = 'block';
    previewPath.setAttribute('marker-end', 'url(#calloutArrow)');
  }
  handleCalloutArrowDrag(event);
  document.addEventListener('mousemove', handleCalloutArrowDrag);
  document.addEventListener('mouseup', stopCalloutArrowDrag);
}

function handleCalloutArrowDrag(event) {
  if (!calloutArrowDrag) return;
  const layer = findLayer(calloutArrowDrag.id);
  if (!layer || !previewPath) return;
  const start = getCalloutAnchor(layer);
  const end = getStagePoint(event.clientX, event.clientY);
  previewPath.setAttribute('d', buildCurve(start, end, { x: 1, y: 0 }, { x: 0, y: 0 }));
}

function stopCalloutArrowDrag(event) {
  if (!calloutArrowDrag) return;
  const layer = findLayer(calloutArrowDrag.id);
  if (!layer) return;

  const target = event.target.closest('.connection-point');
  if (target) {
    const layerId = parseInt(target.dataset.layerId, 10);
    const point = target.dataset.point;
    if (Number.isFinite(layerId) && validPoints.includes(point)) {
      layer.target = { layerId, point };
    }
  } else {
    const dropPoint = getStagePoint(event.clientX, event.clientY);
    layer.target = { x: dropPoint.x, y: dropPoint.y };
  }

  calloutArrowDrag = null;
  if (previewPath) {
    previewPath.style.display = 'none';
    previewPath.setAttribute('marker-end', 'url(#arrowhead)');
  }
  renderCalloutArrows();
  document.removeEventListener('mousemove', handleCalloutArrowDrag);
  document.removeEventListener('mouseup', stopCalloutArrowDrag);
}

function getCalloutAnchor(layer) {
  return {
    x: layer.x + layer.width,
    y: layer.y + layer.height / 2
  };
}

function getCalloutTarget(layer) {
  if (layer.target && typeof layer.target.layerId === 'number') {
    const targetLayer = findLayer(layer.target.layerId);
    if (targetLayer && targetLayer.type === 'node') {
      return getConnectionPoint(targetLayer, layer.target.point);
    }
  }
  if (layer.target && Number.isFinite(layer.target.x) && Number.isFinite(layer.target.y)) {
    return { x: layer.target.x, y: layer.target.y };
  }
  return {
    x: layer.x + layer.width + 120,
    y: layer.y + layer.height / 2
  };
}

function ensureCalloutPath(layer) {
  if (calloutPathEls.has(layer.id)) return calloutPathEls.get(layer.id);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('callout-arrow');
  path.setAttribute('marker-end', 'url(#calloutArrow)');
  if (calloutLayer) calloutLayer.appendChild(path);
  calloutPathEls.set(layer.id, path);
  return path;
}

function renderCalloutArrows() {
  const calloutIds = new Set(state.layers.filter(l => l.type === 'callout').map(l => l.id));
  calloutPathEls.forEach((el, id) => {
    if (!calloutIds.has(id)) {
      el.remove();
      calloutPathEls.delete(id);
    }
  });

  state.layers.forEach((layer) => {
    if (layer.type !== 'callout') return;
    const path = ensureCalloutPath(layer);
    const start = getCalloutAnchor(layer);
    const end = getCalloutTarget(layer);
    const curve = buildCurve(start, end, { x: 1, y: 0 }, { x: -1, y: 0 });
    path.setAttribute('d', curve);
  });
}

function renderAll() {
  const activeIds = new Set(state.layers.map((l) => l.id));
  elementEls.forEach((el, id) => {
    if (!activeIds.has(id)) {
      el.remove();
      elementEls.delete(id);
    }
  });

  state.layers.forEach((layer) => {
    ensureElementNode(layer);
    updateElementNode(layer);
  });

  ensureCanvasBounds();
  renderConnections();
  renderCalloutArrows();
  updateSelectedClasses();
  renderLayers();
  updateEmptyState();
}

function setSelection(selection) {
  state.selected = selection;
  updateSelectedClasses();
  renderProperties();
  renderLayers();
}

function updateSelectedClasses() {
  elementEls.forEach((el, id) => {
    const selected = state.selected && state.selected.type === 'layer' && state.selected.id === id;
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
    info.textContent = 'Select an element to edit its properties.';
    propertiesPanel.appendChild(info);
    return;
  }

  if (state.selected.type === 'layer') {
    const layer = findLayer(state.selected.id);
    if (!layer) return;

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = layer.type.charAt(0).toUpperCase() + layer.type.slice(1);

    const rows = [];

    if (layer.type === 'node' || layer.type === 'shape') {
      rows.push(createColorRow('Fill color', layer.color, (value) => {
        layer.color = value;
        updateElementNode(layer);
      }));
    }

    rows.push(createSizeRow(layer.width, layer.height, (w, h) => {
      layer.width = w;
      layer.height = h;
      updateElementNode(layer);
      renderConnections();
      renderCalloutArrows();
      ensureCanvasBounds();
    }));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-sm btn-danger';
    deleteBtn.textContent = `Delete ${layer.type}`;
    deleteBtn.onclick = () => removeSelected();

    propertiesPanel.append(title, ...rows, deleteBtn);
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

function createSizeRow(width, height, onChange) {
  const row = document.createElement('div');
  row.className = 'properties-row';
  const label = document.createElement('label');
  label.textContent = 'Size';
  const inline = document.createElement('div');
  inline.className = 'row-inline';

  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = 60;
  widthInput.value = Math.round(width);

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = 40;
  heightInput.value = Math.round(height);

  const update = () => {
    const nextWidth = clamp(parseFloat(widthInput.value) || 60, 60, 900);
    const nextHeight = clamp(parseFloat(heightInput.value) || 40, 40, 700);
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

function renderLayers() {
  if (!layersList) return;
  layersList.innerHTML = '';

  const sortedLayers = [...state.layers].sort((a, b) => b.zIndex - a.zIndex);

  sortedLayers.forEach((layer) => {
    const item = document.createElement('div');
    item.className = 'layer-item';
    item.dataset.layerId = layer.id;
    item.draggable = true;

    if (state.selected && state.selected.type === 'layer' && state.selected.id === layer.id) {
      item.classList.add('selected');
    }

    const icon = document.createElement('div');
    icon.className = 'layer-icon';
    icon.innerHTML = getLayerIcon(layer.type);

    const name = document.createElement('div');
    name.className = 'layer-name';
    name.textContent = layer.text || layer.type;

    const actions = document.createElement('div');
    actions.className = 'layer-actions';

    const visibilityBtn = document.createElement('button');
    visibilityBtn.className = 'layer-action-btn';
    visibilityBtn.innerHTML = layer.visible
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    visibilityBtn.title = layer.visible ? 'Hide' : 'Show';
    visibilityBtn.onclick = (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      updateElementNode(layer);
      renderLayers();
    };

    const lockBtn = document.createElement('button');
    lockBtn.className = 'layer-action-btn';
    lockBtn.innerHTML = layer.locked
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>';
    lockBtn.title = layer.locked ? 'Unlock' : 'Lock';
    lockBtn.onclick = (e) => {
      e.stopPropagation();
      layer.locked = !layer.locked;
      updateElementNode(layer);
      renderLayers();
    };

    actions.append(visibilityBtn, lockBtn);

    item.append(icon, name, actions);

    item.onclick = () => {
      setSelection({ type: 'layer', id: layer.id });
    };

    item.ondragstart = (e) => {
      state.layerDrag = { id: layer.id, index: sortedLayers.indexOf(layer) };
      e.dataTransfer.effectAllowed = 'move';
    };

    item.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    };

    item.ondrop = (e) => {
      e.preventDefault();
      if (!state.layerDrag) return;
      const dragLayer = findLayer(state.layerDrag.id);
      const dropLayer = layer;
      if (!dragLayer || dragLayer.id === dropLayer.id) return;

      const dragIndex = sortedLayers.indexOf(dragLayer);
      const dropIndex = sortedLayers.indexOf(dropLayer);

      sortedLayers.splice(dragIndex, 1);
      sortedLayers.splice(dropIndex, 0, dragLayer);

      sortedLayers.forEach((l, idx) => {
        l.zIndex = sortedLayers.length - idx - 1;
      });

      state.layerDrag = null;
      renderAll();
    };

    item.ondragend = () => {
      state.layerDrag = null;
    };

    layersList.appendChild(item);
  });
}

function getLayerIcon(type) {
  switch (type) {
    case 'node':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
    case 'shape':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16"/></svg>';
    case 'textbox':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>';
    case 'callout':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
    default:
      return '';
  }
}

function removeSelected() {
  if (!state.selected) return;
  if (state.selected.type === 'layer') {
    removeLayer(state.selected.id);
  } else if (state.selected.type === 'connection') {
    removeConnection(state.selected.id);
  }
  setSelection(null);
  renderAll();
}

function removeLayer(layerId) {
  const layer = findLayer(layerId);
  if (!layer) return;

  if (layer.type === 'node') {
    state.layers.forEach((l) => {
      if (l.type === 'callout' && l.target && l.target.layerId === layerId) {
        l.target = getConnectionPoint(layer, l.target.point);
      }
    });

    state.connections = state.connections.filter(
      (c) => c.from.layerId !== layerId && c.to.layerId !== layerId
    );
  }

  state.layers = state.layers.filter((l) => l.id !== layerId);
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
    version: 2,
    baseSize: { width: baseWidth, height: baseHeight },
    zoom: state.zoom,
    scroll: {
      left: flowCanvasScroll ? flowCanvasScroll.scrollLeft : 0,
      top: flowCanvasScroll ? flowCanvasScroll.scrollTop : 0
    },
    layers: state.layers,
    connections: state.connections,
    nextId: state.nextId,
    nextConnectionId: state.nextConnectionId
  };

  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadJson(`flowchart-${dateStamp}.json`, JSON.stringify(payload, null, 2));
}

function importFlowchart(data) {
  state.layers = data.layers || [];
  state.connections = data.connections || [];
  state.nextId = data.nextId || 1;
  state.nextConnectionId = data.nextConnectionId || 1;

  baseWidth = data.baseSize?.width || baseWidth;
  baseHeight = data.baseSize?.height || baseHeight;
  state.zoom = clamp(data.zoom || 1, ZOOM_MIN, ZOOM_MAX);
  updateZoom();
  renderAll();

  if (data.scroll && flowCanvasScroll) {
    requestAnimationFrame(() => {
      flowCanvasScroll.scrollLeft = data.scroll.left || 0;
      flowCanvasScroll.scrollTop = data.scroll.top || 0;
    });
  }
}

function setupMenuBar() {
  const menuTriggers = document.querySelectorAll('.menu-trigger');
  let activeMenu = null;

  menuTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuName = trigger.dataset.menu;
      const dropdown = document.getElementById(`menu${menuName.charAt(0).toUpperCase() + menuName.slice(1)}`);

      if (activeMenu && activeMenu !== dropdown) {
        activeMenu.classList.remove('active');
      }

      if (dropdown) {
        const isActive = dropdown.classList.toggle('active');
        activeMenu = isActive ? dropdown : null;
      }
    });
  });

  document.addEventListener('click', () => {
    if (activeMenu) {
      activeMenu.classList.remove('active');
      activeMenu = null;
    }
  });

  document.getElementById('menuNew')?.addEventListener('click', () => {
    if (confirm('Clear everything and start fresh?')) {
      state.layers = [];
      state.connections = [];
      state.selected = null;
      state.nextId = 1;
      state.nextConnectionId = 1;
      renderAll();
    }
  });

  document.getElementById('menuImport')?.addEventListener('click', () => {
    flowImportFile?.click();
  });

  document.getElementById('menuExport')?.addEventListener('click', () => {
    if (!state.layers.length) {
      alert('Nothing to export yet.');
      return;
    }
    exportFlowchart();
  });

  document.getElementById('menuDelete')?.addEventListener('click', () => {
    removeSelected();
  });

  document.getElementById('menuDuplicate')?.addEventListener('click', () => {
    if (state.selected && state.selected.type === 'layer') {
      const layer = findLayer(state.selected.id);
      if (layer) {
        const copy = {
          ...layer,
          id: state.nextId++,
          x: layer.x + 20,
          y: layer.y + 20,
          zIndex: state.layers.length
        };
        state.layers.push(copy);
        setSelection({ type: 'layer', id: copy.id });
        renderAll();
      }
    }
  });

  document.getElementById('menuAddNode')?.addEventListener('click', () => {
    createLayer('node');
  });

  document.getElementById('menuAddShape')?.addEventListener('click', () => {
    createLayer('shape');
  });

  document.getElementById('menuAddTextbox')?.addEventListener('click', () => {
    createLayer('textbox');
  });

  document.getElementById('menuAddCallout')?.addEventListener('click', () => {
    createLayer('callout');
  });

  document.getElementById('menuZoomIn')?.addEventListener('click', () => {
    state.zoom = clamp(state.zoom + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    updateZoom();
  });

  document.getElementById('menuZoomOut')?.addEventListener('click', () => {
    state.zoom = clamp(state.zoom - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    updateZoom();
  });

  document.getElementById('menuZoomReset')?.addEventListener('click', () => {
    state.zoom = 1;
    updateZoom();
  });

  const gridToggle = document.getElementById('menuGridToggle');
  if (gridToggle && flowCanvas) {
    gridToggle.addEventListener('change', () => {
      flowCanvas.classList.toggle('grid-on', gridToggle.checked);
    });
    flowCanvas.classList.toggle('grid-on', gridToggle.checked);
  }
}

if (flowImportFile) {
  flowImportFile.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !data.layers) {
        throw new Error('Invalid flowchart file.');
      }
      importFlowchart(data);
    } catch (err) {
      alert(err.message || 'Import failed.');
    } finally {
      flowImportFile.value = '';
    }
  });
}

if (flowStage) {
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
}

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!target) return;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  ) {
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    removeSelected();
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
    event.preventDefault();
    state.zoom = clamp(state.zoom + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    updateZoom();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === '-') {
    event.preventDefault();
    state.zoom = clamp(state.zoom - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    updateZoom();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === '0') {
    event.preventDefault();
    state.zoom = 1;
    updateZoom();
  }
});

setupMenuBar();
updateZoom();
renderAll();
