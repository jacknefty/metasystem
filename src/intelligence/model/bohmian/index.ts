/**
 * Bohmian Module
 *
 * Wave/particle dynamics for intelligent dispatch.
 */

export * from './types.js';
export * from './wave.js';
export * from './evolution.js';
export * from './measurement.js';
export * from './learning.js';
export { getBohmianState, updateBohmianState, computeConfiguration, computeMass } from './state.js';
export { getS4Field } from './field.js';

export function isBohmianEnabled(): boolean {
  return process.env.BOHMIAN_ENABLED === 'true';
}
