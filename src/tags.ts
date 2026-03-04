/**
 * Tag constants for object behavior.
 * Use these instead of magic strings.
 */

/** Object is static (not affected by gravity). Without this tag, objects are dynamic by default. */
export const TAG_STATIC = 'static' as const;

/** Object follows mouse position when grounded (walks toward mouse) */
export const TAG_FOLLOW_WINDOW = 'follow_window' as const;

/** Object can be grabbed and moved with mouse */
export const TAG_GRABABLE = 'grabable' as const;

/** Object uses its own gravity vector instead of the scene gravity (set via gravityOverride in ObjectConfig) */
export const TAG_GRAVITY_OVERRIDE = 'gravity_override' as const;

/** Multiplies movement speed for follow_window and future movement behaviors. Negative values cause the object to run away from its target. */
export const TAG_SPEED_OVERRIDE = 'speed_override' as const;

/**
 * All available tags as a const object for destructuring.
 * @example
 * const { STATIC, GRABABLE } = TAGS;
 * scene.spawnObject({ tags: [GRABABLE], ... }); // dynamic by default
 * scene.spawnObject({ tags: [STATIC], ... }); // static obstacle
 */
export const TAGS = {
  STATIC: TAG_STATIC,
  FOLLOW_WINDOW: TAG_FOLLOW_WINDOW,
  GRABABLE: TAG_GRABABLE,
  GRAVITY_OVERRIDE: TAG_GRAVITY_OVERRIDE,
  SPEED_OVERRIDE: TAG_SPEED_OVERRIDE,
} as const;

/** Type for valid tag values */
export type Tag = typeof TAGS[keyof typeof TAGS];
