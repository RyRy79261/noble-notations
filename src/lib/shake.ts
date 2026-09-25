'use client';

/**
 * Shake the phone, and the report sheet opens.
 *
 * Ported from Intake Tracker (`packages/core/src/shake-detector.ts` and
 * `apps/web/src/hooks/use-shake-gesture.ts`), where it has been in daily use.
 * The detector is a pure state machine so it can be driven by synthetic
 * samples in a test; the hook is the only part that touches `window`.
 *
 * **It reads the MAGNITUDE of acceleration, not an axis.** Tilting the phone
 * moves gravity from one axis to another and leaves the magnitude near
 * 9.8 m/s², so reading a recipe while turning the phone never registers;
 * only real movement does. And it needs several jolts inside a short window,
 * so one bump, or a phone put down on the counter, does not open anything.
 */
import { useEffect, useRef } from 'react';

export interface ShakeSample {
  x: number;
  y: number;
  z: number;
}

export interface ShakeDetectorConfig {
  /** Change in magnitude (m/s²) between two samples that counts as a jolt. */
  threshold: number;
  /** Jolts inside the window that make a shake. */
  requiredJolts: number;
  /** The window the jolts must fall in. */
  windowMs: number;
  /** The shortest gap between two shakes. */
  cooldownMs: number;
}

export const DEFAULT_SHAKE: ShakeDetectorConfig = {
  threshold: 8,
  requiredJolts: 3,
  windowMs: 800,
  cooldownMs: 3000,
};

function magnitude(s: ShakeSample): number {
  return Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
}

/** Feed it samples; it answers true on the sample that completes a shake. */
export function createShakeDetector(config: ShakeDetectorConfig) {
  let last: number | null = null;
  let lastShakeAt = Number.NEGATIVE_INFINITY;
  let jolts: number[] = [];

  return {
    process(sample: ShakeSample, now: number): boolean {
      const mag = magnitude(sample);
      if (last !== null && Math.abs(mag - last) > config.threshold) {
        jolts.push(now);
      }
      last = mag;
      jolts = jolts.filter((t) => now - t <= config.windowMs);
      if (
        jolts.length >= config.requiredJolts &&
        now - lastShakeAt >= config.cooldownMs
      ) {
        lastShakeAt = now;
        jolts = [];
        return true;
      }
      return false;
    },
  };
}

type MotionWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/**
 * iOS 13 and later sends no `devicemotion` events until the page asks, and
 * it may only ask inside a tap. Everywhere else motion needs no prompt.
 */
export function motionPermissionNeeded(): boolean {
  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined')
    return false;
  return (
    typeof (DeviceMotionEvent as MotionWithPermission).requestPermission ===
    'function'
  );
}

export async function requestMotionPermission(): Promise<boolean> {
  if (typeof DeviceMotionEvent === 'undefined') return false;
  const request = (DeviceMotionEvent as MotionWithPermission).requestPermission;
  if (typeof request !== 'function') return true;
  try {
    return (await request()) === 'granted';
  } catch {
    return false;
  }
}

/** Calls `onShake` when the device is shaken, while `enabled`. */
export function useShakeGesture({
  enabled,
  onShake,
  config = DEFAULT_SHAKE,
}: {
  enabled: boolean;
  onShake: () => void;
  config?: ShakeDetectorConfig;
}) {
  const onShakeRef = useRef(onShake);
  useEffect(() => {
    onShakeRef.current = onShake;
  }, [onShake]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const detector = createShakeDetector(config);
    // Sixty milliseconds between samples. A phone sends them at 60 Hz or
    // more, and every one of them would otherwise run the detector.
    const THROTTLE_MS = 60;
    let lastSampleAt = 0;

    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const now = Date.now();
      if (now - lastSampleAt < THROTTLE_MS) return;
      lastSampleAt = now;
      if (detector.process({ x: a.x, y: a.y, z: a.z }, now)) {
        onShakeRef.current();
      }
    };

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [enabled, config]);
}
