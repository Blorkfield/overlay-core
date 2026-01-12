import { OverlayScene, EntityType, EffectEntityConfig, BurstEffectConfig, RainEffectConfig } from '@blorkfield/overlay-core';

// Elements
const sceneContainer = document.getElementById('scene-container') as HTMLDivElement;
const sceneWrapper = document.getElementById('scene-wrapper') as HTMLDivElement;
const btnFullscreen = document.getElementById('btn-fullscreen') as HTMLButtonElement;
const btnFixed = document.getElementById('btn-fixed') as HTMLButtonElement;
const inputWidth = document.getElementById('input-width') as HTMLInputElement;
const inputHeight = document.getElementById('input-height') as HTMLInputElement;
const btnApply = document.getElementById('btn-apply') as HTMLButtonElement;
const btnSpawnEntity = document.getElementById('btn-spawn-entity') as HTMLButtonElement;
const btnSpawnObstacle = document.getElementById('btn-spawn-obstacle') as HTMLButtonElement;
const btnSpawnFalling = document.getElementById('btn-spawn-falling') as HTMLButtonElement;
const btnReleaseGroup = document.getElementById('btn-release-group') as HTMLButtonElement;
const btnReleaseAll = document.getElementById('btn-release-all') as HTMLButtonElement;
const btnRemoveEntities = document.getElementById('btn-remove-entities') as HTMLButtonElement;
const btnRemoveObstacles = document.getElementById('btn-remove-obstacles') as HTMLButtonElement;
const btnRemoveAll = document.getElementById('btn-remove-all') as HTMLButtonElement;
const selectEntityImage = document.getElementById('select-entity-image') as HTMLSelectElement;
const selectEntityType = document.getElementById('select-entity-type') as HTMLSelectElement;
const statsEl = document.getElementById('stats') as HTMLDivElement;
const checkboxDebug = document.getElementById('checkbox-debug') as HTMLInputElement;

// Settings panel elements
const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
const settingsDragHandle = document.getElementById('settings-drag-handle') as HTMLDivElement;
const settingsCollapseBtn = document.getElementById('settings-collapse') as HTMLButtonElement;
const settingsContent = document.getElementById('settings-content') as HTMLDivElement;

// Entity panel elements
const entityPanel = document.getElementById('entity-panel') as HTMLDivElement;
const entityDragHandle = document.getElementById('entity-drag-handle') as HTMLDivElement;
const entityCollapseBtn = document.getElementById('entity-collapse') as HTMLButtonElement;
const entityContent = document.getElementById('entity-content') as HTMLDivElement;

// Effects panel elements
const effectsPanel = document.getElementById('effects-panel') as HTMLDivElement;
const effectsDragHandle = document.getElementById('effects-drag-handle') as HTMLDivElement;
const effectsCollapseBtn = document.getElementById('effects-collapse') as HTMLButtonElement;
const effectsContent = document.getElementById('effects-content') as HTMLDivElement;
const checkboxBurst = document.getElementById('checkbox-burst') as HTMLInputElement;
const checkboxRain = document.getElementById('checkbox-rain') as HTMLInputElement;
const burstInterval = document.getElementById('burst-interval') as HTMLInputElement;
const burstCount = document.getElementById('burst-count') as HTMLInputElement;
const burstForce = document.getElementById('burst-force') as HTMLInputElement;
const rainSpawnRate = document.getElementById('rain-spawn-rate') as HTMLInputElement;
const rainSpawnWidth = document.getElementById('rain-spawn-width') as HTMLInputElement;
const burstAddEntity = document.getElementById('burst-add-entity') as HTMLButtonElement;
const rainAddEntity = document.getElementById('rain-add-entity') as HTMLButtonElement;
const burstEntityList = document.getElementById('burst-entity-list') as HTMLDivElement;
const rainEntityList = document.getElementById('rain-entity-list') as HTMLDivElement;

// Available images for effects
const availableImages = [
  { value: '', label: 'Color (random)' },
  { value: '/bf_koban_512.png', label: 'bf_koban_512.png' },
  { value: '/test-bg.png', label: 'test-bg.png' }
];

// Available entity types
const availableEntityTypes: { value: EntityType; label: string }[] = [
  { value: 'GROUNDED_FOLLOW', label: 'Follow' },
  { value: 'GROUNDED_STATIC', label: 'Static' }
];

// Effect entity configs storage
interface EffectEntityUI {
  id: string;
  imageUrl: string;
  entityType: EntityType;
  probability: number;
  minScale: number;
  maxScale: number;
  baseRadius: number;
}

const burstEntities: EffectEntityUI[] = [];
const rainEntities: EffectEntityUI[] = [];

let scene: OverlayScene | null = null;
let canvas: HTMLCanvasElement | null = null;
let isFullscreen = true;

function getContainerSize(): { width: number; height: number } {
  return {
    width: sceneContainer.clientWidth,
    height: sceneContainer.clientHeight
  };
}

function createScene(width: number, height: number): void {
  // Cleanup existing scene
  if (scene) {
    scene.destroy();
  }
  if (canvas) {
    canvas.remove();
  }

  // Create canvas
  canvas = document.createElement('canvas');
  canvas.id = 'scene';
  canvas.width = width;
  canvas.height = height;
  sceneWrapper.insertBefore(canvas, sceneWrapper.firstChild);

  // Create scene
  scene = new OverlayScene(canvas, {
    bounds: { top: 0, bottom: height, left: 0, right: width },
    gravity: 1,
    wrapHorizontal: true,
    debug: false,
    background: '#16213e'
  });

  // Track mouse position
  canvas.addEventListener('mousemove', (e) => {
    if (!scene || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    scene.setMousePosition(x, y);
  });

  // Spawn initial entity
  scene.spawnEntity({
    x: width / 2,
    y: 100,
    radius: 25,
    fillStyle: '#e94560',
    tags: ['player']
  });

  // Add some initial obstacles with tags
  scene.addObstacle({
    x: width * 0.25,
    y: height * 0.66,
    width: 150,
    height: 20,
    tags: ['platforms', 'left']
  });

  scene.addObstacle({
    x: width * 0.75,
    y: height * 0.58,
    width: 150,
    height: 20,
    tags: ['platforms', 'right']
  });

  scene.addObstacle({
    x: width * 0.5,
    y: height * 0.42,
    width: 100,
    height: 20,
    tags: ['platforms', 'center']
  });

  // Update stats on each frame
  scene.onUpdate((data) => {
    const entityCount = data.entities.length;
    const obstacleCount = scene?.getObstacleIds().length ?? 0;
    statsEl.textContent = `Entities: ${entityCount} | Obstacles: ${obstacleCount}`;
  });

  scene.start();

  // Re-initialize effects with new scene
  updateBurstEffect();
  updateRainEffect();

  console.log('Overlay scene started!');
}

function setFullscreenMode(): void {
  isFullscreen = true;
  sceneContainer.classList.add('fullscreen');
  btnFullscreen.classList.add('active');
  btnFixed.classList.remove('active');
  inputWidth.disabled = true;
  inputHeight.disabled = true;
  btnApply.disabled = true;

  const size = getContainerSize();
  createScene(size.width, size.height);
}

function setFixedMode(): void {
  isFullscreen = false;
  sceneContainer.classList.remove('fullscreen');
  btnFixed.classList.add('active');
  btnFullscreen.classList.remove('active');
  inputWidth.disabled = false;
  inputHeight.disabled = false;
  btnApply.disabled = false;

  const width = parseInt(inputWidth.value) || 800;
  const height = parseInt(inputHeight.value) || 600;
  createScene(width, height);
}

function applySize(): void {
  if (isFullscreen) return;
  const width = parseInt(inputWidth.value) || 800;
  const height = parseInt(inputHeight.value) || 600;
  createScene(width, height);
}

async function spawnRandomEntity(): Promise<void> {
  if (!scene || !canvas) return;
  const x = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
  const y = Math.random() * canvas.height * 0.3 + 50;
  const colors = ['#e94560', '#4a90d9', '#4ae945', '#d9904a', '#9a4ad9'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const selectedImage = selectEntityImage.value;
  const selectedType = selectEntityType.value as EntityType;
  console.log('Spawning entity with image:', selectedImage || 'none', 'type:', selectedType);

  const config = {
    x,
    y,
    radius: 20 + Math.random() * 15,
    fillStyle: color,
    imageUrl: selectedImage || undefined,
    tags: ['spawned'],
    entityType: selectedType
  };

  // Use async for image entities (extracts shape from alpha), sync otherwise
  if (selectedImage) {
    await scene.spawnEntityAsync(config);
  } else {
    scene.spawnEntity(config);
  }
}

function spawnRandomObstacle(): void {
  if (!scene || !canvas) return;
  const x = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
  const y = Math.random() * canvas.height * 0.5 + canvas.height * 0.2;
  scene.addObstacle({
    x,
    y,
    width: 80 + Math.random() * 100,
    height: 15 + Math.random() * 10,
    tags: ['spawned-obstacle']
  });
}

function spawnFallingObstacle(): void {
  if (!scene || !canvas) return;
  const x = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
  const y = 50;
  scene.spawnFallingObstacle({
    x,
    y,
    width: 60 + Math.random() * 60,
    height: 15 + Math.random() * 10,
    tags: ['falling']
  });
}

// Event listeners
btnFullscreen.addEventListener('click', setFullscreenMode);
btnFixed.addEventListener('click', setFixedMode);
btnApply.addEventListener('click', applySize);
btnSpawnEntity.addEventListener('click', spawnRandomEntity);
btnSpawnObstacle.addEventListener('click', spawnRandomObstacle);
btnSpawnFalling.addEventListener('click', spawnFallingObstacle);

btnReleaseGroup.addEventListener('click', () => {
  scene?.releaseObstaclesByTag('platforms');
});

btnReleaseAll.addEventListener('click', () => {
  scene?.releaseAllObstacles();
});

btnRemoveEntities.addEventListener('click', () => {
  scene?.removeAllEntities();
});

btnRemoveObstacles.addEventListener('click', () => {
  scene?.removeAllObstacles();
});

btnRemoveAll.addEventListener('click', () => {
  scene?.removeAll();
});

checkboxDebug.addEventListener('change', () => {
  scene?.setDebug(checkboxDebug.checked);
});

// Handle window resize for fullscreen mode
window.addEventListener('resize', () => {
  if (isFullscreen && scene) {
    const size = getContainerSize();
    scene.resize(size.width, size.height);
  }
});

// ==================== PANEL LOGIC ====================

interface PanelState {
  panel: HTMLDivElement;
  dragHandle: HTMLDivElement;
  collapseBtn: HTMLButtonElement;
  content: HTMLDivElement;
  id: string;
  isCollapsed: boolean;
  snappedTo: string | null; // ID of panel this is snapped to on its right
  snappedFrom: string | null; // ID of panel snapped to this on its left
}

const SNAP_THRESHOLD = 50;
const PANEL_GAP = 0;
const PANEL_MARGIN = 16;
const ANCHOR_THRESHOLD = 80;

interface Anchor {
  id: string;
  getPosition: () => { x: number; y: number };
  indicator: HTMLDivElement;
}

interface DragState {
  grabbedPanel: PanelState;
  offsetX: number;
  offsetY: number;
  initialGroupPositions: Map<string, { x: number; y: number }>;
  movingPanels: PanelState[]; // Panels being moved (single if detach mode, group if group mode)
  mode: 'single' | 'group';
}

const panels: Map<string, PanelState> = new Map();
const anchors: Anchor[] = [];
let snapPreview: HTMLDivElement | null = null;
let activeDrag: DragState | null = null;

function createSnapPreview(): HTMLDivElement {
  const preview = document.createElement('div');
  preview.className = 'snap-preview';
  document.body.appendChild(preview);
  return preview;
}

// Get all panels connected to this one (the entire group)
function getConnectedGroup(startPanel: PanelState): PanelState[] {
  const group: PanelState[] = [];
  const visited = new Set<string>();

  // Traverse left
  let current: PanelState | undefined = startPanel;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    group.unshift(current);
    if (current.snappedFrom) {
      current = panels.get(current.snappedFrom);
    } else {
      break;
    }
  }

  // Traverse right (skip the start panel as it's already added)
  current = startPanel.snappedTo ? panels.get(startPanel.snappedTo) : undefined;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    group.push(current);
    if (current.snappedTo) {
      current = panels.get(current.snappedTo);
    } else {
      break;
    }
  }

  return group;
}

// Detach a panel from its group
function detachFromGroup(panel: PanelState): void {
  if (panel.snappedTo) {
    const rightPanel = panels.get(panel.snappedTo);
    if (rightPanel) {
      rightPanel.snappedFrom = null;
    }
    panel.snappedTo = null;
  }

  if (panel.snappedFrom) {
    const leftPanel = panels.get(panel.snappedFrom);
    if (leftPanel) {
      leftPanel.snappedTo = null;
    }
    panel.snappedFrom = null;
  }
}

function setupFloatingPanel(
  panel: HTMLDivElement,
  dragHandle: HTMLDivElement,
  collapseBtn: HTMLButtonElement,
  content: HTMLDivElement,
  id: string
) {
  const detachGrip = document.getElementById(`${id}-detach-grip`) as HTMLDivElement;

  const state: PanelState = {
    panel,
    dragHandle,
    collapseBtn,
    content,
    id,
    isCollapsed: true,
    snappedTo: null,
    snappedFrom: null
  };
  panels.set(id, state);

  collapseBtn.addEventListener('click', () => {
    state.isCollapsed = !state.isCollapsed;
    content.classList.toggle('collapsed', state.isCollapsed);
    collapseBtn.textContent = state.isCollapsed ? '+' : '−';
    updateSnappedPositions();
  });

  // Start drag handler - determines mode based on click target
  function startDrag(e: MouseEvent, mode: 'single' | 'group') {
    e.preventDefault();
    e.stopPropagation();

    const connectedPanels = getConnectedGroup(state);

    // Store initial positions
    const initialGroupPositions = new Map<string, { x: number; y: number }>();
    for (const p of connectedPanels) {
      const rect = p.panel.getBoundingClientRect();
      initialGroupPositions.set(p.id, { x: rect.left, y: rect.top });
    }

    let movingPanels: PanelState[];

    if (mode === 'single') {
      // Detach this panel from its group
      detachFromGroup(state);
      movingPanels = [state];
    } else {
      // Move entire group
      movingPanels = connectedPanels;
    }

    const rect = panel.getBoundingClientRect();

    activeDrag = {
      grabbedPanel: state,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      initialGroupPositions,
      movingPanels,
      mode
    };

    // Raise moving panels
    movingPanels.forEach(p => p.panel.style.zIndex = '1002');
    document.body.style.userSelect = 'none';
  }

  // Detach grip - drags only this panel
  detachGrip.addEventListener('mousedown', (e) => {
    startDrag(e, 'single');
  });

  // Main header area - drags entire group
  dragHandle.addEventListener('mousedown', (e) => {
    // Ignore if clicking on collapse button or detach grip
    if (e.target === collapseBtn || e.target === detachGrip) return;
    startDrag(e, 'group');
  });
}

function findSnapTarget(
  movingPanels: PanelState[],
  x: number,
  y: number
): { targetId: string; side: 'left' | 'right'; x: number; y: number } | null {
  const leftmostPanel = movingPanels[0];
  const rightmostPanel = movingPanels[movingPanels.length - 1];
  const leftmostRect = leftmostPanel.panel.getBoundingClientRect();
  const rightmostRect = rightmostPanel.panel.getBoundingClientRect();

  // Calculate total width of moving group
  let totalWidth = 0;
  for (const p of movingPanels) {
    totalWidth += p.panel.offsetWidth + PANEL_GAP;
  }
  totalWidth -= PANEL_GAP;

  const movingIds = new Set(movingPanels.map(p => p.id));

  for (const [id, targetState] of panels) {
    // Skip panels that are part of the moving group
    if (movingIds.has(id)) continue;

    const targetRect = targetState.panel.getBoundingClientRect();

    // Check if vertically aligned (within threshold)
    const verticalOverlap = Math.abs(y - targetRect.top) < SNAP_THRESHOLD * 2;
    if (!verticalOverlap) continue;

    // Check snap to left side of target (moving group goes to the left)
    // The rightmost panel of moving group attaches to target's left
    const snapToLeftX = targetRect.left - totalWidth - PANEL_GAP;
    if (Math.abs(x - snapToLeftX) < SNAP_THRESHOLD && !targetState.snappedFrom) {
      return { targetId: id, side: 'left', x: snapToLeftX, y: targetRect.top };
    }

    // Check snap to right side of target (moving group goes to the right)
    // The leftmost panel of moving group attaches to target's right
    const snapToRightX = targetRect.right + PANEL_GAP;
    if (Math.abs(x - snapToRightX) < SNAP_THRESHOLD && !targetState.snappedTo) {
      return { targetId: id, side: 'right', x: snapToRightX, y: targetRect.top };
    }
  }

  return null;
}

function updateSnapPreview(snapTarget: { targetId: string; side: 'left' | 'right'; x: number; y: number } | null): void {
  if (!snapPreview) {
    snapPreview = createSnapPreview();
  }

  if (snapTarget) {
    const targetState = panels.get(snapTarget.targetId);
    if (targetState) {
      const targetRect = targetState.panel.getBoundingClientRect();
      snapPreview.style.top = `${targetRect.top}px`;
      snapPreview.style.height = `${targetRect.height}px`;
      snapPreview.style.left = `${snapTarget.side === 'left' ? targetRect.left - 2 : targetRect.right - 2}px`;
      snapPreview.classList.add('visible');
    }
  } else {
    snapPreview.classList.remove('visible');
  }
}

function snapPanelsGroup(
  movingPanels: PanelState[],
  targetId: string,
  side: 'left' | 'right',
  x: number,
  y: number
): void {
  const targetState = panels.get(targetId);
  if (!targetState) return;

  const leftmostPanel = movingPanels[0];
  const rightmostPanel = movingPanels[movingPanels.length - 1];

  // Position all moving panels
  let currentX = x;
  for (const p of movingPanels) {
    p.panel.style.left = `${currentX}px`;
    p.panel.style.top = `${y}px`;
    currentX += p.panel.offsetWidth + PANEL_GAP;
  }

  // Establish snap relationship between group and target
  if (side === 'left') {
    // Moving group goes to the LEFT of target
    // Rightmost panel of group connects to target
    rightmostPanel.snappedTo = targetId;
    targetState.snappedFrom = rightmostPanel.id;
  } else {
    // Moving group goes to the RIGHT of target
    // Leftmost panel of group connects to target
    leftmostPanel.snappedFrom = targetId;
    targetState.snappedTo = leftmostPanel.id;
  }
}

function updateSnappedPositions(): void {
  // Find the rightmost panel (one with no snappedTo)
  let rightmost: PanelState | null = null;
  for (const state of panels.values()) {
    if (state.snappedTo === null && state.snappedFrom !== null) {
      rightmost = state;
      break;
    }
  }

  // Also check for chains starting from panels with snappedFrom
  if (!rightmost) {
    for (const state of panels.values()) {
      if (state.snappedFrom !== null) {
        rightmost = state;
        break;
      }
    }
  }

  if (!rightmost) return;

  // Traverse left and update positions
  let current: PanelState | null = rightmost;
  while (current && current.snappedFrom) {
    const leftPanel = panels.get(current.snappedFrom);
    if (!leftPanel) break;

    const currentRect = current.panel.getBoundingClientRect();
    leftPanel.panel.style.left = `${currentRect.left - leftPanel.panel.offsetWidth - PANEL_GAP}px`;
    leftPanel.panel.style.top = `${currentRect.top}px`;

    current = leftPanel;
  }
}

// Global mouse event handlers
document.addEventListener('mousemove', (e) => {
  if (!activeDrag) return;

  const { grabbedPanel, movingPanels, initialGroupPositions, mode } = activeDrag;
  const panel = grabbedPanel.panel;

  const x = e.clientX - activeDrag.offsetX;
  const y = e.clientY - activeDrag.offsetY;

  const maxX = window.innerWidth - panel.offsetWidth;
  const maxY = window.innerHeight - panel.offsetHeight;
  const clampedX = Math.max(0, Math.min(x, maxX));
  const clampedY = Math.max(0, Math.min(y, maxY));

  // Move the grabbed panel
  panel.style.left = `${clampedX}px`;
  panel.style.top = `${clampedY}px`;

  // If group mode, move other panels to maintain formation
  if (mode === 'group' && movingPanels.length > 1) {
    const grabbedInitialPos = initialGroupPositions.get(grabbedPanel.id)!;
    const deltaX = clampedX - grabbedInitialPos.x;
    const deltaY = clampedY - grabbedInitialPos.y;

    for (const p of movingPanels) {
      if (p === grabbedPanel) continue;
      const initialPos = initialGroupPositions.get(p.id)!;
      const newX = Math.max(0, Math.min(initialPos.x + deltaX, window.innerWidth - p.panel.offsetWidth));
      const newY = Math.max(0, Math.min(initialPos.y + deltaY, window.innerHeight - p.panel.offsetHeight));
      p.panel.style.left = `${newX}px`;
      p.panel.style.top = `${newY}px`;
    }
  }

  // Get leftmost position for panel-to-panel snap detection
  const leftmostRect = movingPanels[0].panel.getBoundingClientRect();

  // Check for snap targets (panel-to-panel)
  const snapTarget = findSnapTarget(movingPanels, leftmostRect.left, leftmostRect.top);
  updateSnapPreview(snapTarget);

  // Check for anchor targets (only if no panel snap target)
  const anchorResult = snapTarget ? null : findNearestAnchor(movingPanels);
  showAnchorIndicators(anchorResult?.anchor ?? null);
});

document.addEventListener('mouseup', () => {
  if (!activeDrag) return;

  const { movingPanels } = activeDrag;
  const leftmostRect = movingPanels[0].panel.getBoundingClientRect();

  // Check for snap targets (panel-to-panel)
  const snapTarget = findSnapTarget(movingPanels, leftmostRect.left, leftmostRect.top);
  if (snapTarget) {
    // Snap the group to the target panel
    snapPanelsGroup(movingPanels, snapTarget.targetId, snapTarget.side, snapTarget.x, snapTarget.y);
  } else {
    // Check anchor snap
    const anchorResult = findNearestAnchor(movingPanels);
    if (anchorResult) {
      // Apply the pre-calculated positions
      for (let i = 0; i < movingPanels.length; i++) {
        movingPanels[i].panel.style.left = `${anchorResult.positions[i].x}px`;
        movingPanels[i].panel.style.top = `${anchorResult.positions[i].y}px`;
      }
    }
  }

  updateSnapPreview(null);
  hideAnchorIndicators();
  movingPanels.forEach(p => p.panel.style.zIndex = '1000');
  activeDrag = null;
  document.body.style.userSelect = '';
});

// Initialize panels - position them in a row from upper right
function initializePanelPositions(): void {
  const panelOrder = ['effects', 'entity', 'settings']; // Right to left
  let rightEdge = window.innerWidth - PANEL_MARGIN;

  for (const id of panelOrder) {
    const state = panels.get(id);
    if (!state) continue;

    const width = state.panel.offsetWidth;
    state.panel.style.left = `${rightEdge - width}px`;
    state.panel.style.top = `${PANEL_MARGIN}px`;
    state.panel.style.right = 'auto';

    rightEdge -= width + PANEL_GAP;
  }

  // Set up snap relationships (settings -> entity -> effects)
  const settingsState = panels.get('settings');
  const entityState = panels.get('entity');
  const effectsState = panels.get('effects');

  if (settingsState && entityState) {
    settingsState.snappedTo = 'entity';
    entityState.snappedFrom = 'settings';
  }
  if (entityState && effectsState) {
    entityState.snappedTo = 'effects';
    effectsState.snappedFrom = 'entity';
  }
}

// ==================== ANCHOR SYSTEM ====================

function createAnchorIndicator(): HTMLDivElement {
  const indicator = document.createElement('div');
  indicator.className = 'anchor-indicator';
  document.body.appendChild(indicator);
  return indicator;
}

// Panel width constant for anchor positioning
const PANEL_WIDTH = 300;

function initializeAnchors(): void {
  // All anchors mark where the GRIP (left edge) of a panel will land
  // Panels extend to the right from the grip

  // Top-left corner
  anchors.push({
    id: 'top-left',
    getPosition: () => ({ x: PANEL_MARGIN, y: PANEL_MARGIN }),
    indicator: createAnchorIndicator()
  });

  // Top-right corner (offset so panel fits on screen)
  anchors.push({
    id: 'top-right',
    getPosition: () => ({ x: window.innerWidth - PANEL_MARGIN - PANEL_WIDTH, y: PANEL_MARGIN }),
    indicator: createAnchorIndicator()
  });

  // Bottom-left corner
  anchors.push({
    id: 'bottom-left',
    getPosition: () => ({ x: PANEL_MARGIN, y: window.innerHeight - PANEL_MARGIN }),
    indicator: createAnchorIndicator()
  });

  // Bottom-right corner
  anchors.push({
    id: 'bottom-right',
    getPosition: () => ({ x: window.innerWidth - PANEL_MARGIN - PANEL_WIDTH, y: window.innerHeight - PANEL_MARGIN }),
    indicator: createAnchorIndicator()
  });

  // Top-center
  anchors.push({
    id: 'top-center',
    getPosition: () => ({ x: (window.innerWidth - PANEL_WIDTH) / 2, y: PANEL_MARGIN }),
    indicator: createAnchorIndicator()
  });

  updateAnchorIndicators();
}

function updateAnchorIndicators(): void {
  for (const anchor of anchors) {
    const pos = anchor.getPosition();
    const indicator = anchor.indicator;

    // Anchor marks where grip (left edge) lands
    indicator.style.left = `${pos.x - 20}px`; // Center indicator on anchor point

    if (anchor.id.includes('bottom')) {
      indicator.style.top = `${pos.y - 40}px`;
    } else {
      indicator.style.top = `${pos.y}px`;
    }
  }
}

interface AnchorSnapResult {
  anchor: Anchor;
  dockPanelIndex: number; // Which panel in the group docks to the anchor
  positions: { x: number; y: number }[]; // Final positions for each panel
}

function findNearestAnchor(movingPanels: PanelState[]): AnchorSnapResult | null {
  let bestResult: AnchorSnapResult | null = null;
  let bestDist = Infinity;

  // Get the bounding box of the entire group (using grips/left edges)
  const firstRect = movingPanels[0].panel.getBoundingClientRect();
  const lastRect = movingPanels[movingPanels.length - 1].panel.getBoundingClientRect();
  const groupLeft = firstRect.left;
  const groupRight = lastRect.right;
  const groupTop = firstRect.top;
  const groupBottom = firstRect.bottom;

  for (const anchor of anchors) {
    const anchorPos = anchor.getPosition();

    // Check if ANY part of the group is near this anchor
    const nearGroup =
      anchorPos.x >= groupLeft - ANCHOR_THRESHOLD &&
      anchorPos.x <= groupRight + ANCHOR_THRESHOLD &&
      anchorPos.y >= groupTop - ANCHOR_THRESHOLD &&
      anchorPos.y <= groupBottom + ANCHOR_THRESHOLD;

    if (!nearGroup) continue;

    // Find which panel's GRIP (left edge) is closest to this anchor
    let closestPanelIdx = 0;
    let closestDist = Infinity;

    for (let i = 0; i < movingPanels.length; i++) {
      const rect = movingPanels[i].panel.getBoundingClientRect();

      // Distance from anchor to the GRIP (left edge) of this panel
      const gripX = rect.left;
      const gripY = rect.top;
      const dist = Math.sqrt(Math.pow(gripX - anchorPos.x, 2) + Math.pow(gripY - anchorPos.y, 2));

      if (dist < closestDist) {
        closestDist = dist;
        closestPanelIdx = i;
      }
    }

    // Calculate final positions with this panel's grip docking to anchor
    // Anchor point is where the grip (left edge) lands
    const anchorX = anchorPos.x;
    const anchorY = anchor.id.includes('bottom')
      ? anchorPos.y - movingPanels[closestPanelIdx].panel.offsetHeight
      : anchorPos.y;

    // Calculate positions for all panels
    const positions: { x: number; y: number }[] = [];

    // Find where leftmost panel would be (panels to left of docked one)
    let leftX = anchorX;
    for (let i = closestPanelIdx - 1; i >= 0; i--) {
      leftX -= movingPanels[i].panel.offsetWidth + PANEL_GAP;
    }

    // Fill in all positions left to right
    let currentX = leftX;
    for (let i = 0; i < movingPanels.length; i++) {
      positions.push({ x: currentX, y: anchorY });
      currentX += movingPanels[i].panel.offsetWidth + PANEL_GAP;
    }

    // Check if all panels fit on screen
    const leftmostX = positions[0].x;
    const rightmostX = positions[positions.length - 1].x + movingPanels[movingPanels.length - 1].panel.offsetWidth;

    if (leftmostX < 0 || rightmostX > window.innerWidth) {
      // Try to find a panel that WOULD fit
      for (let tryIdx = 0; tryIdx < movingPanels.length; tryIdx++) {
        const tryPositions: { x: number; y: number }[] = [];
        let tryLeftX = anchorX;
        for (let i = tryIdx - 1; i >= 0; i--) {
          tryLeftX -= movingPanels[i].panel.offsetWidth + PANEL_GAP;
        }

        let tryCurrentX = tryLeftX;
        for (let i = 0; i < movingPanels.length; i++) {
          tryPositions.push({ x: tryCurrentX, y: anchorY });
          tryCurrentX += movingPanels[i].panel.offsetWidth + PANEL_GAP;
        }

        const tryLeftmostX = tryPositions[0].x;
        const tryRightmostX = tryPositions[tryPositions.length - 1].x + movingPanels[movingPanels.length - 1].panel.offsetWidth;

        if (tryLeftmostX >= 0 && tryRightmostX <= window.innerWidth) {
          if (closestDist < bestDist) {
            bestDist = closestDist;
            bestResult = { anchor, dockPanelIndex: tryIdx, positions: tryPositions };
          }
          break;
        }
      }
      continue;
    }

    // This is a valid option
    if (closestDist < bestDist) {
      bestDist = closestDist;
      bestResult = { anchor, dockPanelIndex: closestPanelIdx, positions };
    }
  }

  return bestResult;
}

function showAnchorIndicators(activeAnchor: Anchor | null): void {
  for (const anchor of anchors) {
    if (activeAnchor === anchor) {
      anchor.indicator.classList.add('visible', 'active');
    } else if (activeDrag) {
      anchor.indicator.classList.add('visible');
      anchor.indicator.classList.remove('active');
    } else {
      anchor.indicator.classList.remove('visible', 'active');
    }
  }
}

function hideAnchorIndicators(): void {
  for (const anchor of anchors) {
    anchor.indicator.classList.remove('visible', 'active');
  }
}

setupFloatingPanel(settingsPanel, settingsDragHandle, settingsCollapseBtn, settingsContent, 'settings');
setupFloatingPanel(entityPanel, entityDragHandle, entityCollapseBtn, entityContent, 'entity');
setupFloatingPanel(effectsPanel, effectsDragHandle, effectsCollapseBtn, effectsContent, 'effects');

// Initialize positions and anchors after DOM is ready
requestAnimationFrame(() => {
  initializePanelPositions();
  initializeAnchors();
});

// Update anchor indicators on window resize
window.addEventListener('resize', updateAnchorIndicators);

// ==================== EFFECTS LOGIC ====================

// Convert UI entities to EffectEntityConfig[]
function uiToEffectEntities(uiEntities: EffectEntityUI[]): EffectEntityConfig[] {
  const colors = ['#e94560', '#4a90d9', '#4ae945', '#d9904a', '#9a4ad9'];
  return uiEntities.map((ui) => ({
    entityConfig: {
      fillStyle: colors[Math.floor(Math.random() * colors.length)],
      imageUrl: ui.imageUrl || undefined,
      tags: ['effect-spawned'],
      entityType: ui.entityType
    },
    probability: ui.probability,
    minScale: ui.minScale,
    maxScale: ui.maxScale,
    baseRadius: ui.baseRadius
  }));
}

// Update burst effect config
function updateBurstEffect(): void {
  if (!scene) return;

  const config: BurstEffectConfig = {
    id: 'burst',
    type: 'burst',
    enabled: checkboxBurst.checked,
    burstInterval: parseInt(burstInterval.value) || 2000,
    burstCount: parseInt(burstCount.value) || 8,
    burstForce: parseInt(burstForce.value) || 15,
    entityConfigs: uiToEffectEntities(burstEntities)
  };

  scene.setEffect(config);
  console.log('Burst effect updated:', config.enabled ? 'enabled' : 'disabled');
}

// Update rain effect config
function updateRainEffect(): void {
  if (!scene) return;

  const config: RainEffectConfig = {
    id: 'rain',
    type: 'rain',
    enabled: checkboxRain.checked,
    spawnRate: parseFloat(rainSpawnRate.value) || 5,
    spawnWidth: parseFloat(rainSpawnWidth.value) || 1,
    entityConfigs: uiToEffectEntities(rainEntities)
  };

  scene.setEffect(config);
  console.log('Rain effect updated:', config.enabled ? 'enabled' : 'disabled');
}

// Render entity list UI
function renderEntityList(
  container: HTMLDivElement,
  entities: EffectEntityUI[],
  onUpdate: () => void
): void {
  container.innerHTML = '';

  if (entities.length === 0) {
    container.innerHTML = '<div class="empty-message">No entity types added. Click "+ Add" to add one.</div>';
    return;
  }

  entities.forEach((entity, index) => {
    const item = document.createElement('div');
    item.className = 'entity-item';
    item.innerHTML = `
      <div class="entity-row entity-row-header">
        <span style="font-size:11px;color:#aaa">Entity ${index + 1}</span>
        <button class="remove-btn" data-index="${index}">Remove</button>
      </div>
      <div class="entity-row">
        <label>Image</label>
        <select class="entity-image" data-index="${index}">
          ${availableImages.map((img) => `<option value="${img.value}" ${entity.imageUrl === img.value ? 'selected' : ''}>${img.label}</option>`).join('')}
        </select>
      </div>
      <div class="entity-row">
        <label>Type</label>
        <select class="entity-type" data-index="${index}">
          ${availableEntityTypes.map((t) => `<option value="${t.value}" ${entity.entityType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="entity-row">
        <label>Scale</label>
        <input type="number" class="entity-min-scale" data-index="${index}" value="${entity.minScale}" min="0.1" step="0.1">
        <span style="color:#666">to</span>
        <input type="number" class="entity-max-scale" data-index="${index}" value="${entity.maxScale}" min="0.1" step="0.1">
      </div>
      <div class="entity-row">
        <label>Prob</label>
        <input type="number" class="entity-prob" data-index="${index}" value="${entity.probability}" min="0.1" step="0.1">
        <label style="margin-left:12px">Radius</label>
        <input type="number" class="entity-radius" data-index="${index}" value="${entity.baseRadius}" min="5">
      </div>
    `;
    container.appendChild(item);
  });

  // Event listeners for inputs
  container.querySelectorAll('.entity-image').forEach((select) => {
    select.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLSelectElement).dataset.index!);
      entities[idx].imageUrl = (e.target as HTMLSelectElement).value;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-type').forEach((select) => {
    select.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLSelectElement).dataset.index!);
      entities[idx].entityType = (e.target as HTMLSelectElement).value as EntityType;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-prob').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      entities[idx].probability = parseFloat((e.target as HTMLInputElement).value) || 1;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-min-scale').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      entities[idx].minScale = parseFloat((e.target as HTMLInputElement).value) || 0.5;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-max-scale').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      entities[idx].maxScale = parseFloat((e.target as HTMLInputElement).value) || 1.5;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-radius').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      entities[idx].baseRadius = parseInt((e.target as HTMLInputElement).value) || 20;
      onUpdate();
    });
  });

  container.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLButtonElement).dataset.index!);
      entities.splice(idx, 1);
      renderEntityList(container, entities, onUpdate);
      onUpdate();
    });
  });
}

// Add entity to effect
function addEffectEntity(entities: EffectEntityUI[], container: HTMLDivElement, onUpdate: () => void): void {
  entities.push({
    id: crypto.randomUUID(),
    imageUrl: '',
    entityType: 'GROUNDED_FOLLOW',
    probability: 1,
    minScale: 0.8,
    maxScale: 1.2,
    baseRadius: 20
  });
  renderEntityList(container, entities, onUpdate);
  onUpdate();
}

// Effect event listeners
checkboxBurst.addEventListener('change', updateBurstEffect);
burstInterval.addEventListener('change', updateBurstEffect);
burstCount.addEventListener('change', updateBurstEffect);
burstForce.addEventListener('change', updateBurstEffect);

checkboxRain.addEventListener('change', updateRainEffect);
rainSpawnRate.addEventListener('change', updateRainEffect);
rainSpawnWidth.addEventListener('change', updateRainEffect);

burstAddEntity.addEventListener('click', () => {
  addEffectEntity(burstEntities, burstEntityList, updateBurstEffect);
});

rainAddEntity.addEventListener('click', () => {
  addEffectEntity(rainEntities, rainEntityList, updateRainEffect);
});

// Initialize entity lists with empty state
renderEntityList(burstEntityList, burstEntities, updateBurstEffect);
renderEntityList(rainEntityList, rainEntities, updateRainEffect);

// Initialize effects after scene creation
function initializeEffects(): void {
  updateBurstEffect();
  updateRainEffect();
}

// Initialize in fullscreen mode
setFullscreenMode();
