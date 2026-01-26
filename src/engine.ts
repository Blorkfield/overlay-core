import Matter from 'matter-js';
import type { OverlaySceneConfig } from './types';

export function createEngine(gravity: number): Matter.Engine {
  const engine = Matter.Engine.create();
  engine.gravity.y = gravity;
  return engine;
}

export function createRender(
  engine: Matter.Engine,
  canvas: HTMLCanvasElement,
  config: OverlaySceneConfig
): Matter.Render {
  const render = Matter.Render.create({
    canvas,
    engine,
    options: {
      width: config.bounds.right - config.bounds.left,
      height: config.bounds.bottom - config.bounds.top,
      wireframes: config.debug ?? false,
      background: config.background?.color ?? 'transparent'
    }
  });
  return render;
}
