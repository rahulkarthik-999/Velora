import { describe, expect, it } from 'vitest';
import { formatDuration, formatMemory } from './format';

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65_400)).toBe('01:05');
  });

  it('adds hours when needed', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });

  it('clamps negative values', () => {
    expect(formatDuration(-5_000)).toBe('00:00');
  });
});

describe('formatMemory', () => {
  it('switches to GB at 1024 MB', () => {
    expect(formatMemory(512)).toBe('512 MB');
    expect(formatMemory(16_384)).toBe('16.0 GB');
  });
});
