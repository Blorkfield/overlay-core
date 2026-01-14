import { OverlayScene, EntityType, EffectEntityConfig, BurstEffectConfig, RainEffectConfig } from '@blorkfield/overlay-core';
import { TabManager } from '@blorkfield/blork-tabs';
import '@blorkfield/blork-tabs/styles.css';

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

// ==================== PANEL LOGIC (using blork-tabs) ====================

// Initialize TabManager with existing DOM elements
const tabManager = new TabManager({
  snapThreshold: 50,
  panelGap: 0,
  panelMargin: 16,
  anchorThreshold: 80,
  defaultPanelWidth: 300,
  initializeDefaultAnchors: true,
  classPrefix: 'blork-tabs',
});

// Register existing panels with the TabManager
tabManager.registerPanel('settings', settingsPanel, {
  dragHandle: settingsDragHandle,
  collapseButton: settingsCollapseBtn,
  contentWrapper: settingsContent,
  detachGrip: document.getElementById('settings-detach-grip') as HTMLDivElement,
  startCollapsed: true,
});

tabManager.registerPanel('entity', entityPanel, {
  dragHandle: entityDragHandle,
  collapseButton: entityCollapseBtn,
  contentWrapper: entityContent,
  detachGrip: document.getElementById('entity-detach-grip') as HTMLDivElement,
  startCollapsed: true,
});

tabManager.registerPanel('effects', effectsPanel, {
  dragHandle: effectsDragHandle,
  collapseButton: effectsCollapseBtn,
  contentWrapper: effectsContent,
  detachGrip: document.getElementById('effects-detach-grip') as HTMLDivElement,
  startCollapsed: true,
});

// Initialize positions and snap chain after DOM is ready
requestAnimationFrame(() => {
  // Position panels from right edge (effects, entity, settings order)
  tabManager.positionPanelsFromRight(['effects', 'entity', 'settings']);

  // Create snap chain: settings -> entity -> effects (left to right)
  tabManager.createSnapChain(['settings', 'entity', 'effects']);
});

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
