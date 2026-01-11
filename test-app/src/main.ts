import { OverlayScene } from '@blorkfield/overlay-core';

const canvas = document.getElementById('scene') as HTMLCanvasElement;

const WIDTH = 800;
const HEIGHT = 600;

canvas.width = WIDTH;
canvas.height = HEIGHT;

const scene = new OverlayScene(canvas, {
  bounds: {
    top: 0,
    bottom: HEIGHT,
    left: 0,
    right: WIDTH
  },
  gravity: 1,
  wrapHorizontal: true,
  debug: true,
  background: '#16213e'
});

// Spawn a ball entity
scene.spawnEntity({
  x: WIDTH / 2,
  y: 100,
  radius: 25,
  fillStyle: '#e94560'
});

// Add some obstacles to interact with
const obstacle1 = scene.addObstacle({
  x: 200,
  y: 400,
  width: 150,
  height: 20
});

const obstacle2 = scene.addObstacle({
  x: 600,
  y: 350,
  width: 150,
  height: 20
});

const obstacle3 = scene.addObstacle({
  x: 400,
  y: 250,
  width: 100,
  height: 20
});

// Track mouse position
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  scene.setMousePosition(x, y);
});

// Click to release obstacles (make them fall)
canvas.addEventListener('click', () => {
  scene.releaseObstacle(obstacle1);
  scene.releaseObstacle(obstacle2);
  scene.releaseObstacle(obstacle3);
  const info = document.getElementById('info');
  if (info) {
    info.textContent = 'Obstacles released!';
  }
});

// Log dynamic obstacle updates
scene.onUpdate((data) => {
  if (data.dynamicObstacles.length > 0) {
    // Obstacles are falling
  }
});

scene.start();

console.log('Overlay scene started!');
