/**
 * Tag constants for object behavior.
 * Use these instead of magic strings.
 */

/** Object is dynamic and affected by gravity */
export const TAG_FALLING = 'falling' as const;

/** Object follows mouse position when grounded (walks toward mouse) */
export const TAG_FOLLOW_WINDOW = 'follow_window' as const;

/** Object can be grabbed and moved with mouse */
export const TAG_GRABABLE = 'grabable' as const;

/** Object uses its own gravity vector instead of the scene gravity (set via gravityOverride in ObjectConfig) */
export const TAG_GRAVITY_OVERRIDE = 'gravity_override' as const;

/**
 * All available tags as a const object for destructuring.
 * @example
 * const { FALLING, GRABABLE } = TAGS;
 * scene.spawnObject({ tags: [FALLING, GRABABLE], ... });
 */
export const TAGS = {
  FALLING: TAG_FALLING,
  FOLLOW_WINDOW: TAG_FOLLOW_WINDOW,
  GRABABLE: TAG_GRABABLE,
  GRAVITY_OVERRIDE: TAG_GRAVITY_OVERRIDE,
} as const;

/** Type for valid tag values */
export type Tag = typeof TAGS[keyof typeof TAGS];
