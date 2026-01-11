import Matter from 'matter-js';
import type { Bounds } from './types';

const MOUSE_FORCE = 0.001;

export function applyMouseForce(entity: Matter.Body, mouseX: number, grounded: boolean): void {
  if (!grounded) return;
  const direction = Math.sign(mouseX - entity.position.x);
  Matter.Body.applyForce(entity, entity.position, { x: MOUSE_FORCE * direction, y: 0 });
}

export function wrapHorizontal(entity: Matter.Body, bounds: Bounds): void {
  if (entity.position.x < bounds.left) {
    Matter.Body.setPosition(entity, { x: bounds.right, y: entity.position.y });
  } else if (entity.position.x > bounds.right) {
    Matter.Body.setPosition(entity, { x: bounds.left, y: entity.position.y });
  }
}

export function isGrounded(entity: Matter.Body, groundY: number, threshold: number = 5): boolean {
  return entity.position.y >= groundY - threshold - 20; // 20 = approximate radius buffer
}
