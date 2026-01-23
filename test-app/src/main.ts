import { OverlayScene, EffectObjectConfig, BurstEffectConfig, RainEffectConfig, StreamEffectConfig, setLogLevel } from '@blorkfield/overlay-core';

// Set default log level to 'debug' for development (change to 'warn' for quieter output)
setLogLevel('debug');
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
const selectReleaseTag = document.getElementById('select-release-tag') as HTMLSelectElement;
const btnReleaseTag = document.getElementById('btn-release-tag') as HTMLButtonElement;
const btnReleaseAll = document.getElementById('btn-release-all') as HTMLButtonElement;
const btnRemoveEntities = document.getElementById('btn-remove-entities') as HTMLButtonElement;
const btnRemoveObstacles = document.getElementById('btn-remove-obstacles') as HTMLButtonElement;
const btnRemoveAll = document.getElementById('btn-remove-all') as HTMLButtonElement;
const selectEntityImage = document.getElementById('select-entity-image') as HTMLSelectElement;
const inputEntityTtl = document.getElementById('input-entity-ttl') as HTMLInputElement;
const inputSpawnX = document.getElementById('input-spawn-x') as HTMLInputElement;
const selectXUnit = document.getElementById('select-x-unit') as HTMLSelectElement;
const inputSpawnY = document.getElementById('input-spawn-y') as HTMLInputElement;
const selectYUnit = document.getElementById('select-y-unit') as HTMLSelectElement;
const tagsAvailable = document.getElementById('tags-available') as HTMLSelectElement;
const tagsSelected = document.getElementById('tags-selected') as HTMLSelectElement;
const btnTagAdd = document.getElementById('btn-tag-add') as HTMLButtonElement;
const btnTagRemove = document.getElementById('btn-tag-remove') as HTMLButtonElement;
const statsEl = document.getElementById('stats') as HTMLDivElement;
const checkboxDebug = document.getElementById('checkbox-debug') as HTMLInputElement;
const selectLogLevel = document.getElementById('select-log-level') as HTMLSelectElement;

// Text obstacle elements
const inputTextObstacle = document.getElementById('input-text-obstacle') as HTMLInputElement;
const selectFont = document.getElementById('select-font') as HTMLSelectElement;
const inputLetterSize = document.getElementById('input-letter-size') as HTMLInputElement;
const inputLetterSpacing = document.getElementById('input-letter-spacing') as HTMLInputElement;
const inputLetterColor = document.getElementById('input-letter-color') as HTMLInputElement;
const inputLineSpacing = document.getElementById('input-line-spacing') as HTMLInputElement;
const inputTextOriginX = document.getElementById('input-text-origin-x') as HTMLInputElement;
const selectTextXUnit = document.getElementById('select-text-x-unit') as HTMLSelectElement;
const inputTextOriginY = document.getElementById('input-text-origin-y') as HTMLInputElement;
const selectTextYUnit = document.getElementById('select-text-y-unit') as HTMLSelectElement;
const textTagsAvailable = document.getElementById('text-tags-available') as HTMLSelectElement;
const textTagsSelected = document.getElementById('text-tags-selected') as HTMLSelectElement;
const btnTextTagAdd = document.getElementById('btn-text-tag-add') as HTMLButtonElement;
const btnTextTagRemove = document.getElementById('btn-text-tag-remove') as HTMLButtonElement;
const btnSpawnText = document.getElementById('btn-spawn-text') as HTMLButtonElement;

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
const checkboxStream = document.getElementById('checkbox-stream') as HTMLInputElement;
const streamOriginX = document.getElementById('stream-origin-x') as HTMLInputElement;
const streamOriginY = document.getElementById('stream-origin-y') as HTMLInputElement;
const streamDirection = document.getElementById('stream-direction') as HTMLInputElement;
const streamSpawnRate = document.getElementById('stream-spawn-rate') as HTMLInputElement;
const streamForce = document.getElementById('stream-force') as HTMLInputElement;
const streamConeAngle = document.getElementById('stream-cone-angle') as HTMLInputElement;
const burstAddEntity = document.getElementById('burst-add-entity') as HTMLButtonElement;
const rainAddEntity = document.getElementById('rain-add-entity') as HTMLButtonElement;
const streamAddEntity = document.getElementById('stream-add-entity') as HTMLButtonElement;
const burstEntityList = document.getElementById('burst-entity-list') as HTMLDivElement;
const rainEntityList = document.getElementById('rain-entity-list') as HTMLDivElement;
const streamEntityList = document.getElementById('stream-entity-list') as HTMLDivElement;

// Available images for effects
const availableImages = [
  { value: '', label: 'Color (random)' },
  { value: '/bf_koban_512.png', label: 'bf_koban_512.png' }
];

// Available behavior modes for spawned objects
const availableBehaviorModes: { value: string; label: string }[] = [
  { value: 'follow', label: 'Follow' },
  { value: 'no-follow', label: 'No Follow' }
];

// Available tags for entity spawning
const spawnableTags = ['falling', 'follow', 'grabable'];
let selectedSpawnTags: string[] = [];

// Available tags for text obstacle spawning
const textSpawnableTags = ['falling', 'follow', 'grabable', 'text-obstacle'];
let selectedTextTags: string[] = [];

// Effect object configs storage
interface EffectObjectUI {
  id: string;
  imageUrl: string;
  behaviorMode: string;
  probability: number;
  minScale: number;
  maxScale: number;
  baseRadius: number;
  ttl?: number;
  weight?: number;
}

const burstEntities: EffectObjectUI[] = [];
const rainEntities: EffectObjectUI[] = [];
const streamEntities: EffectObjectUI[] = [];

let scene: OverlayScene | null = null;
let canvas: HTMLCanvasElement | null = null;
let isFullscreen = true;

function getContainerSize(): { width: number; height: number } {
  return {
    width: sceneContainer.clientWidth,
    height: sceneContainer.clientHeight
  };
}

async function createScene(width: number, height: number): Promise<void> {
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
    background: '#16213e',
    floorConfig: {
      segments: 5,        // Divide floor into 5 segments
      threshold: 100,     // Each segment collapses when weighted pressure reaches 100
      thickness: 15,      // Collision thickness (prevents tunneling at high forces)
      visibleThickness: 3, // Only show 3px, rest extends below canvas
      color: ['#3a4a6a', '#4a5a7a', '#3a4a6a', '#4a5a7a', '#3a4a6a'],  // Alternating colors
      minIntegrity: 3,    // If fewer than 3 segments remain, all collapse
      segmentWidths: [0.1, 0.2, 0.4, 0.2, 0.1]  // Variable widths (small, medium, large, medium, small)
    },
    despawnBelowFloor: 1.0  // Despawn objects 100% of container height below floor
  });

  // Track mouse position
  canvas.addEventListener('mousemove', (e) => {
    if (!scene || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    scene.setMousePosition(x, y);
  });

  // Update stats on each frame
  scene.onUpdate((data) => {
    const dynamicCount = data.objects.length;
    const totalCount = scene?.getObjectIds().length ?? 0;
    statsEl.textContent = `Dynamic: ${dynamicCount} | Total: ${totalCount}`;
  });

  scene.start();

  // Initialize fonts and populate dropdown
  await scene.initializeFonts();
  populateFontDropdown();

  // Add title text - centered at 50% x
  const centerX = width * 0.5;
  const titleY = height * 0.25;

  // "@blorkfield/overlay-core" title using Roboto (supports @ and / characters)
  // Colors from blorkfield-site: muted blue for @blorkfield, gold for /, accent blue for overlay-core
  const mutedBlue = '#565f89';
  const accentGold = '#e0af68';
  const accentBlue = '#7aa2f7';

  // Build per-character color array: @blorkfield (0-10), / (11), overlay-core (12-23)
  const titleText = '@blorkfield/overlay-core';
  const titleColors = titleText.split('').map((_, i) => {
    if (i <= 10) return mutedBlue;      // @blorkfield
    if (i === 11) return accentGold;    // /
    return accentBlue;                   // overlay-core
  });

  const robotoFont = scene.getAvailableFonts().find(f => f.name === 'Roboto');
  const titleResult = await scene.addTTFTextObstacles({
    text: titleText,
    x: centerX,
    y: titleY,
    align: 'center',
    fontSize: 50,
    fontUrl: robotoFont!.fontUrl!,
    fillColors: titleColors,
    tags: ['title-text'],
    pressureThreshold: { value: 9 },
    weight: { value: 10 },
    shadow: { opacity: 0.3 },
    clickToFall: { clicks: 2 }
  });
  console.log('Title text created:', titleResult.stringTag, titleResult.wordTags);

  // Add a simple circle with follow tag
  scene.spawnObject({
    x: centerX,
    y: titleResult.bounds.bottom + 100,
    radius: 30,
    fillStyle: '#4a90d9',
    tags: ['falling', 'follow', 'grabable']
  });
  console.log('Follow circle spawned');

  // Re-initialize effects with new scene
  updateBurstEffect();
  updateRainEffect();
  updateStreamEffect();

  console.log('Overlay scene started!');
}

function populateFontDropdown(): void {
  if (!scene) return;

  const fonts = scene.getAvailableFonts();

  // Clear existing options
  selectFont.innerHTML = '';

  if (fonts.length === 0) {
    // Fallback if no fonts found
    const option = document.createElement('option');
    option.value = 'handwritten';
    option.textContent = 'handwritten';
    selectFont.appendChild(option);
    return;
  }

  // Add options for each available font
  fonts.forEach((font, index) => {
    const option = document.createElement('option');
    option.value = font.name;
    option.textContent = font.name;
    selectFont.appendChild(option);
  });
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

// Tag picker functions
function renderTagPicker(): void {
  // Render available tags (those not selected)
  tagsAvailable.innerHTML = '';
  spawnableTags
    .filter(tag => !selectedSpawnTags.includes(tag))
    .forEach(tag => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      tagsAvailable.appendChild(option);
    });

  // Render selected tags
  tagsSelected.innerHTML = '';
  selectedSpawnTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    tagsSelected.appendChild(option);
  });
}

function moveTagsToSelected(): void {
  const selected = Array.from(tagsAvailable.selectedOptions).map(opt => opt.value);
  selectedSpawnTags.push(...selected);
  renderTagPicker();
}

function moveTagsToAvailable(): void {
  const selected = Array.from(tagsSelected.selectedOptions).map(opt => opt.value);
  selectedSpawnTags = selectedSpawnTags.filter(tag => !selected.includes(tag));
  renderTagPicker();
}

// Initialize tag picker
renderTagPicker();

// Tag picker event listeners
btnTagAdd.addEventListener('click', moveTagsToSelected);
btnTagRemove.addEventListener('click', moveTagsToAvailable);

// Text tag picker functions
function renderTextTagPicker(): void {
  // Render available tags (those not selected)
  textTagsAvailable.innerHTML = '';
  textSpawnableTags
    .filter(tag => !selectedTextTags.includes(tag))
    .forEach(tag => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      textTagsAvailable.appendChild(option);
    });

  // Render selected tags
  textTagsSelected.innerHTML = '';
  selectedTextTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    textTagsSelected.appendChild(option);
  });
}

function moveTextTagsToSelected(): void {
  const selected = Array.from(textTagsAvailable.selectedOptions).map(opt => opt.value);
  selectedTextTags.push(...selected);
  renderTextTagPicker();
}

function moveTextTagsToAvailable(): void {
  const selected = Array.from(textTagsSelected.selectedOptions).map(opt => opt.value);
  selectedTextTags = selectedTextTags.filter(tag => !selected.includes(tag));
  renderTextTagPicker();
}

// Initialize text tag picker
renderTextTagPicker();

// Text tag picker event listeners
btnTextTagAdd.addEventListener('click', moveTextTagsToSelected);
btnTextTagRemove.addEventListener('click', moveTextTagsToAvailable);

async function spawnRandomEntity(): Promise<void> {
  if (!scene || !canvas) return;

  // Calculate spawn position based on unit type (each axis can have its own unit)
  const inputX = parseFloat(inputSpawnX.value) || 50;
  const inputY = parseFloat(inputSpawnY.value) || 50;
  const x = selectXUnit.value === 'percent' ? (inputX / 100) * canvas.width : inputX;
  const y = selectYUnit.value === 'percent' ? (inputY / 100) * canvas.height : inputY;

  const colors = ['#e94560', '#4a90d9', '#4ae945', '#d9904a', '#9a4ad9'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const selectedImage = selectEntityImage.value;
  const ttlValue = inputEntityTtl.value ? parseInt(inputEntityTtl.value) : undefined;

  // Use selected tags from picker
  const tags = [...selectedSpawnTags];
  console.log('Spawning object at:', { x, y }, 'image:', selectedImage || 'none', 'tags:', tags, 'ttl:', ttlValue ?? '∞');

  const config = {
    x,
    y,
    radius: 20 + Math.random() * 15,
    fillStyle: color,
    imageUrl: selectedImage || undefined,
    tags,
    ttl: ttlValue
  };

  // Use async for image objects (extracts shape from alpha), sync otherwise
  if (selectedImage) {
    await scene.spawnObjectAsync(config);
  } else {
    scene.spawnObject(config);
  }
}

// Event listeners
btnFullscreen.addEventListener('click', setFullscreenMode);
btnFixed.addEventListener('click', setFixedMode);
btnApply.addEventListener('click', applySize);
btnSpawnEntity.addEventListener('click', spawnRandomEntity);

// Populate tag dropdown with current scene tags
function populateTagDropdown(): void {
  if (!scene) return;

  const currentValue = selectReleaseTag.value;
  const tags = scene.getAllTags();

  selectReleaseTag.innerHTML = '<option value="">-- Select Tag --</option>';
  tags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    selectReleaseTag.appendChild(option);
  });

  // Restore selection if it still exists
  if (tags.includes(currentValue)) {
    selectReleaseTag.value = currentValue;
  }
}

// Refresh dropdown when clicked/focused
selectReleaseTag.addEventListener('focus', populateTagDropdown);
selectReleaseTag.addEventListener('click', populateTagDropdown);

btnReleaseTag.addEventListener('click', () => {
  const tag = selectReleaseTag.value;
  if (tag) {
    scene?.releaseObjectsByTag(tag);
  }
});

btnReleaseAll.addEventListener('click', () => {
  scene?.releaseAllObjects();
});

btnRemoveEntities.addEventListener('click', () => {
  scene?.removeObjectsByTag('falling');
});

btnRemoveObstacles.addEventListener('click', () => {
  // Remove static objects (those without 'falling' tag)
  const allIds = scene?.getObjectIds() ?? [];
  const dynamicIds = scene?.getObjectIdsByTag('falling') ?? [];
  const staticIds = allIds.filter(id => !dynamicIds.includes(id));
  scene?.removeObjects(staticIds);
});

btnRemoveAll.addEventListener('click', () => {
  scene?.removeAll();
});

checkboxDebug.addEventListener('change', () => {
  scene?.setDebug(checkboxDebug.checked);
});

selectLogLevel.addEventListener('change', () => {
  setLogLevel(selectLogLevel.value as 'warn' | 'info' | 'debug');
  console.log('Log level set to:', selectLogLevel.value);
});

// ==================== TEXT OBSTACLE LOGIC ====================

async function spawnTextObstacle(): Promise<void> {
  if (!scene || !canvas) return;

  const text = inputTextObstacle.value.trim();
  if (!text) return;

  const fontName = selectFont.value;
  const letterSize = parseInt(inputLetterSize.value) || 60;
  const letterSpacing = parseInt(inputLetterSpacing.value);
  const letterColor = inputLetterColor.value.trim() || undefined;
  const lineSpacing = parseInt(inputLineSpacing.value) || 30;

  // Find the selected font info
  const fonts = scene.getAvailableFonts();
  const selectedFont = fonts.find(f => f.name === fontName);

  // Calculate position based on unit type (each axis can have its own unit)
  const inputX = parseFloat(inputTextOriginX.value) || 50;
  const inputY = parseFloat(inputTextOriginY.value) || 50;
  const startX = selectTextXUnit.value === 'percent' ? (inputX / 100) * canvas.width : inputX;
  const y = selectTextYUnit.value === 'percent' ? (inputY / 100) * canvas.height : inputY;

  // Use selected tags from picker - determine static from 'falling' tag
  const tags = [...selectedTextTags];
  const isStatic = !tags.includes('falling');

  console.log('Spawning text at:', { x: startX, y }, 'tags:', tags, 'isStatic:', isStatic);

  let result;

  if (selectedFont?.type === 'ttf' && selectedFont.fontUrl) {
    // Use TTF text obstacles for TrueType fonts
    result = await scene.addTTFTextObstacles({
      text,
      x: startX,
      y,
      fontSize: letterSize,
      fontUrl: selectedFont.fontUrl,
      isStatic,
      tags,
      fillColor: letterColor || '#6495ED',
      lineHeight: (letterSize + lineSpacing)
    });
  } else {
    // Use PNG-based text obstacles
    result = await scene.addTextObstacles({
      text,
      x: startX,
      y,
      letterSize,
      letterSpacing,
      fontName,
      isStatic,
      tags,
      letterColor,
      lineHeight: (letterSize + lineSpacing)
    });
  }

  console.log('Created text obstacle:', { text, fontName, letterColor, stringTag: result.stringTag, wordTags: result.wordTags, letterIds: result.letterIds });
}

btnSpawnText.addEventListener('click', spawnTextObstacle);

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
function uiToEffectObjects(uiObjects: EffectObjectUI[]): EffectObjectConfig[] {
  const colors = ['#e94560', '#4a90d9', '#4ae945', '#d9904a', '#9a4ad9'];
  return uiObjects.map((ui) => {
    // Build tags based on behavior mode
    const tags = ['effect-spawned', 'grabable'];
    if (ui.behaviorMode === 'follow') {
      tags.push('follow');
    }
    return {
      objectConfig: {
        fillStyle: colors[Math.floor(Math.random() * colors.length)],
        imageUrl: ui.imageUrl || undefined,
        tags,
        ttl: ui.ttl,
        weight: ui.weight
      },
      probability: ui.probability,
      minScale: ui.minScale,
      maxScale: ui.maxScale,
      baseRadius: ui.baseRadius
    };
  });
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
    objectConfigs: uiToEffectObjects(burstEntities)
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
    objectConfigs: uiToEffectObjects(rainEntities)
  };

  scene.setEffect(config);
  console.log('Rain effect updated:', config.enabled ? 'enabled' : 'disabled');
}

// Update stream effect config
function updateStreamEffect(): void {
  if (!scene || !canvas) return;

  // Convert origin percentages to pixels
  const originXPercent = parseFloat(streamOriginX.value) || 50;
  const originYPercent = parseFloat(streamOriginY.value) || 0;
  const originX = (originXPercent / 100) * canvas.width;
  const originY = (originYPercent / 100) * canvas.height;

  // Convert direction angle (degrees) to direction vector
  // 0° = right, 90° = down, 180° = left, 270° = up
  const directionDeg = parseFloat(streamDirection.value) || 90;
  const directionRad = (directionDeg * Math.PI) / 180;
  const directionX = Math.cos(directionRad);
  const directionY = Math.sin(directionRad);

  // Convert cone angle degrees to radians
  const coneAngleDeg = parseFloat(streamConeAngle.value) || 15;
  const coneAngleRad = (coneAngleDeg * Math.PI) / 180;

  const config: StreamEffectConfig = {
    id: 'stream',
    type: 'stream',
    enabled: checkboxStream.checked,
    origin: { x: originX, y: originY },
    direction: { x: directionX, y: directionY },
    spawnRate: parseFloat(streamSpawnRate.value) || 10,
    force: parseFloat(streamForce.value) || 15,
    coneAngle: coneAngleRad,
    objectConfigs: uiToEffectObjects(streamEntities)
  };

  scene.setEffect(config);
  console.log('Stream effect updated:', config.enabled ? 'enabled' : 'disabled');
}

// Render object list UI for effects
function renderObjectList(
  container: HTMLDivElement,
  objects: EffectObjectUI[],
  onUpdate: () => void
): void {
  container.innerHTML = '';

  if (objects.length === 0) {
    container.innerHTML = '<div class="empty-message">No object types added. Click "+ Add" to add one.</div>';
    return;
  }

  objects.forEach((obj, index) => {
    const item = document.createElement('div');
    item.className = 'entity-item';
    item.innerHTML = `
      <div class="entity-row entity-row-header">
        <span style="font-size:11px;color:#aaa">Object ${index + 1}</span>
        <button class="remove-btn" data-index="${index}">Remove</button>
      </div>
      <div class="entity-row">
        <label>Image</label>
        <select class="entity-image" data-index="${index}">
          ${availableImages.map((img) => `<option value="${img.value}" ${obj.imageUrl === img.value ? 'selected' : ''}>${img.label}</option>`).join('')}
        </select>
      </div>
      <div class="entity-row">
        <label>Behavior</label>
        <select class="entity-type" data-index="${index}">
          ${availableBehaviorModes.map((t) => `<option value="${t.value}" ${obj.behaviorMode === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="entity-row">
        <label>Scale</label>
        <input type="number" class="entity-min-scale" data-index="${index}" value="${obj.minScale}" min="0.1" step="0.1">
        <span style="color:#666">to</span>
        <input type="number" class="entity-max-scale" data-index="${index}" value="${obj.maxScale}" min="0.1" step="0.1">
      </div>
      <div class="entity-row">
        <label>Prob</label>
        <input type="number" class="entity-prob" data-index="${index}" value="${obj.probability}" min="0.1" step="0.1">
        <label style="margin-left:12px">Radius</label>
        <input type="number" class="entity-radius" data-index="${index}" value="${obj.baseRadius}" min="5">
      </div>
      <div class="entity-row">
        <label>TTL (ms)</label>
        <input type="number" class="entity-ttl" data-index="${index}" value="${obj.ttl ?? ''}" placeholder="∞" min="0" step="100">
        <label style="margin-left:12px">Weight</label>
        <input type="number" class="entity-weight" data-index="${index}" value="${obj.weight ?? ''}" placeholder="1" min="1" step="1">
      </div>
    `;
    container.appendChild(item);
  });

  // Event listeners for inputs
  container.querySelectorAll('.entity-image').forEach((select) => {
    select.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLSelectElement).dataset.index!);
      objects[idx].imageUrl = (e.target as HTMLSelectElement).value;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-type').forEach((select) => {
    select.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLSelectElement).dataset.index!);
      objects[idx].behaviorMode = (e.target as HTMLSelectElement).value;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-prob').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      objects[idx].probability = parseFloat((e.target as HTMLInputElement).value) || 1;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-min-scale').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      objects[idx].minScale = parseFloat((e.target as HTMLInputElement).value) || 0.5;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-max-scale').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      objects[idx].maxScale = parseFloat((e.target as HTMLInputElement).value) || 1.5;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-radius').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      objects[idx].baseRadius = parseInt((e.target as HTMLInputElement).value) || 20;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-ttl').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      const value = (e.target as HTMLInputElement).value;
      objects[idx].ttl = value ? parseInt(value) : undefined;
      onUpdate();
    });
  });

  container.querySelectorAll('.entity-weight').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      const value = (e.target as HTMLInputElement).value;
      objects[idx].weight = value ? parseInt(value) : undefined;
      onUpdate();
    });
  });

  container.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLButtonElement).dataset.index!);
      objects.splice(idx, 1);
      renderObjectList(container, objects, onUpdate);
      onUpdate();
    });
  });
}

// Add object to effect
function addEffectObject(objects: EffectObjectUI[], container: HTMLDivElement, onUpdate: () => void): void {
  objects.push({
    id: crypto.randomUUID(),
    imageUrl: '',
    behaviorMode: 'follow',
    probability: 1,
    minScale: 0.8,
    maxScale: 1.2,
    baseRadius: 20
  });
  renderObjectList(container, objects, onUpdate);
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

checkboxStream.addEventListener('change', updateStreamEffect);
streamOriginX.addEventListener('change', updateStreamEffect);
streamOriginY.addEventListener('change', updateStreamEffect);
streamDirection.addEventListener('change', updateStreamEffect);
streamSpawnRate.addEventListener('change', updateStreamEffect);
streamForce.addEventListener('change', updateStreamEffect);
streamConeAngle.addEventListener('change', updateStreamEffect);

burstAddEntity.addEventListener('click', () => {
  addEffectObject(burstEntities, burstEntityList, updateBurstEffect);
});

rainAddEntity.addEventListener('click', () => {
  addEffectObject(rainEntities, rainEntityList, updateRainEffect);
});

streamAddEntity.addEventListener('click', () => {
  addEffectObject(streamEntities, streamEntityList, updateStreamEffect);
});

// Initialize object lists with empty state
renderObjectList(burstEntityList, burstEntities, updateBurstEffect);
renderObjectList(rainEntityList, rainEntities, updateRainEffect);
renderObjectList(streamEntityList, streamEntities, updateStreamEffect);

// Initialize effects after scene creation
function initializeEffects(): void {
  updateBurstEffect();
  updateRainEffect();
  updateStreamEffect();
}

// Initialize in fullscreen mode
setFullscreenMode();
