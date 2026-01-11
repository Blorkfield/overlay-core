import { OverlayScene } from '@blorkfield/overlay-core';

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
const statsEl = document.getElementById('stats') as HTMLDivElement;

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
    debug: true,
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

function spawnRandomEntity(): void {
  if (!scene || !canvas) return;
  const x = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
  const y = Math.random() * canvas.height * 0.3 + 50;
  const colors = ['#e94560', '#4a90d9', '#4ae945', '#d9904a', '#9a4ad9'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  scene.spawnEntity({
    x,
    y,
    radius: 20 + Math.random() * 15,
    fillStyle: color,
    tags: ['spawned']
  });
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

// Handle window resize for fullscreen mode
window.addEventListener('resize', () => {
  if (isFullscreen && scene) {
    const size = getContainerSize();
    scene.resize(size.width, size.height);
  }
});

// Initialize in fullscreen mode
setFullscreenMode();
