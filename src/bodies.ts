import Matter from 'matter-js';
import type { Bounds, EntityConfig, ObstacleConfig } from './types';

const BOUNDARY_THICKNESS = 50;

export function createBoundaries(bounds: Bounds): Matter.Body[] {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const options = { isStatic: true, render: { visible: false } };
  return [
    // Ground
    Matter.Bodies.rectangle(
      bounds.left + width / 2,
      bounds.bottom + BOUNDARY_THICKNESS / 2,
      width,
      BOUNDARY_THICKNESS,
      { ...options, label: 'ground' }
    ),
    // Ceiling
    Matter.Bodies.rectangle(
      bounds.left + width / 2,
      bounds.top - BOUNDARY_THICKNESS / 2,
      width,
      BOUNDARY_THICKNESS,
      { ...options, label: 'ceiling' }
    ),
    // Left wall
    Matter.Bodies.rectangle(
      bounds.left - BOUNDARY_THICKNESS / 2,
      bounds.top + height / 2,
      BOUNDARY_THICKNESS,
      height,
      { ...options, label: 'leftWall' }
    ),
    // Right wall
    Matter.Bodies.rectangle(
      bounds.right + BOUNDARY_THICKNESS / 2,
      bounds.top + height / 2,
      BOUNDARY_THICKNESS,
      height,
      { ...options, label: 'rightWall' }
    )
  ];
}

export function createEntity(id: string, config: EntityConfig): Matter.Body {
  return Matter.Bodies.circle(config.x, config.y, config.radius, {
    restitution: 0.3,
    friction: 0.1,
    frictionAir: 0.01,
    label: `entity:${id}`,
    render: {
      fillStyle: config.fillStyle ?? '#ff0000'
    }
  });
}

export function createObstacle(id: string, config: ObstacleConfig, isStatic: boolean = true): Matter.Body {
  return Matter.Bodies.rectangle(config.x, config.y, config.width, config.height, {
    isStatic,
    label: `obstacle:${id}`,
    render: {
      visible: true,
      fillStyle: '#4a4a6a'
    }
  });
}
