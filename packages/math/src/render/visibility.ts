import type { MathEntity, RuntimeValue } from "../types.js";

/**
 * Resolve presentation visibility without changing construction/evaluation.
 * Compound conditions belong in `boolean.expression`; presentation references
 * exactly one boolean entity.
 */
export function isEntityVisible(
  entity: MathEntity,
  valueOf: (entityId: string) => RuntimeValue | undefined
): boolean {
  if (entity.visible === false) return false;
  if (!entity.visibleWhen) return true;
  return valueOf(entity.visibleWhen) === true;
}
