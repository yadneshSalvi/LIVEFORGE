import type { SurfaceMotion } from "./contracts";

export const SURFACE_MOTION_LIMITS = {
  minTravel: 20,
  maxTravel: 240,
  minSpeed: 0.3,
  maxSpeed: 2.5,
  minX: 0,
  maxX: 2500,
} as const;

/** Absolute simulation time makes refresh, replay and saved continuation identical. */
export function surfaceMotionX(
  anchorX: number,
  motion: SurfaceMotion,
  tick: number,
): number {
  const distance = Math.abs(motion.travel),
    period = (distance * 2) / motion.speed,
    // Reduce the clock before multiplication, preserving precision in long shows.
    phase = (tick % period) * motion.speed,
    offset = Math.max(
      0,
      Math.min(distance, phase <= distance ? phase : distance * 2 - phase),
    );
  return anchorX + Math.sign(motion.travel) * offset;
}
