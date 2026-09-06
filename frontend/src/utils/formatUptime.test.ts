import { describe, expect, it } from 'vitest';
import { formatUptime } from './formatUptime';

describe('formatUptime', () => {
  it('returns Unavailable when uptime is null', () => {
    expect(formatUptime(null)).toBe('Unavailable');
  });

  it('formats zero seconds correctly', () => {
    expect(formatUptime(0)).toBe('00:00:00');
  });

  it('formats seconds correctly', () => {
    expect(formatUptime(45)).toBe('00:00:45');
  });

  it('formats minutes and seconds correctly', () => {
    expect(formatUptime(125)).toBe('00:02:05');
  });

  it('formats hours, minutes and seconds correctly', () => {
    expect(formatUptime(3661)).toBe('01:01:01');
  });

  it('formats large uptime values correctly', () => {
    expect(formatUptime(90061)).toBe('25:01:01');
  });
});