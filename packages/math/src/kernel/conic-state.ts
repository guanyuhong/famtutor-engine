/** Algebraic conic state is distinct from a defined geometric object.
 * It retains only classification and half-axis, never screen/world coordinates.
 * GeoGebra's Radius reads this state even when its conic is undefined.
 */
import type { ConstructionNode } from '../types.js';
export interface ConicAxisState {
  classification: 'circle' | 'point' | 'empty';
  halfAxis: number | null;
}
export function readConicAxisState(node: ConstructionNode | undefined): ConicAxisState | undefined {
  const state = node?.params?.conicAxisState;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return undefined;
  if (!['circle', 'point', 'empty'].includes(String(state.classification))) return undefined;
  const halfAxis = state.halfAxis;
  if (state.classification === 'empty') return {classification: 'empty', halfAxis: null};
  if (typeof halfAxis !== 'number' || !Number.isFinite(halfAxis) || halfAxis < 0) return undefined;
  if (state.classification === 'point' && halfAxis !== 0) return undefined;
  return {classification: state.classification as 'circle' | 'point', halfAxis};
}
export function retainedConicRadius(node: ConstructionNode | undefined): number | undefined {
  const state = readConicAxisState(node);
  return state && state.classification !== 'empty' && state.halfAxis !== null ? state.halfAxis : undefined;
}
