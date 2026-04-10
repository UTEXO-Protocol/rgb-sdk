export function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null
  );
}

export function isBare(): boolean {
  return typeof globalThis !== 'undefined' && !!(globalThis as any).Bare;
}

export function isBrowser(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.document !== 'undefined'
  );
}

export type Environment = 'node' | 'bare' | 'browser' | 'unknown';

export function getEnvironment(): Environment {
  // Bare check MUST come first — Bare also exposes some Node-like globals
  if (isBare()) return 'bare';
  if (isNode()) return 'node';
  if (isBrowser()) return 'browser';
  return 'unknown';
}
