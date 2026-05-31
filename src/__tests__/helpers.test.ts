import { describe, it, expect } from 'vitest';
import { generateId, now, sanitizeName, timestampedFilename, tagColorFromName } from '../helpers.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(generateId()).toBeTruthy();
    expect(typeof generateId()).toBe('string');
  });

  it('returns unique values on each call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('produces a reasonably short alphanumeric string', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThanOrEqual(6);
    expect(id.length).toBeLessThanOrEqual(20);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

describe('now', () => {
  it('returns an ISO 8601 string ending in Z', () => {
    const ts = now();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('is monotonic — successive calls are non-decreasing', () => {
    const t1 = now();
    const t2 = now();
    expect(t1.localeCompare(t2)).toBeLessThanOrEqual(0);
  });
});

describe('sanitizeName', () => {
  it('passes through plain ASCII names unchanged', () => {
    expect(sanitizeName('hello')).toBe('hello');
    expect(sanitizeName('my-feature')).toBe('my-feature');
    expect(sanitizeName('test_123')).toBe('test_123');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeName('hello world')).toBe('hello_world');
    expect(sanitizeName('a b c')).toBe('a_b_c');
  });

  it('removes special characters', () => {
    expect(sanitizeName('hello!@#$')).toBe('hello');
    expect(sanitizeName('price$value')).toBe('price_value');
  });

  it('removes Unicode diacritics', () => {
    expect(sanitizeName('São Paulo')).toBe('Sao_Paulo');
    expect(sanitizeName('café')).toBe('cafe');
    expect(sanitizeName('jalapeño')).toBe('jalapeno');
  });

  it('strips leading and trailing underscores', () => {
    expect(sanitizeName('_hello_')).toBe('hello');
    expect(sanitizeName('___test___')).toBe('test');
  });

  it('collapses consecutive underscores to a single one', () => {
    expect(sanitizeName('a   b')).toBe('a_b');
    expect(sanitizeName('a___b')).toBe('a_b');
  });

  it('replaces emoji and other non-ASCII symbols with underscores (strip leading/trailing)', () => {
    expect(sanitizeName('hello🚀world')).toBe('hello_world');
    expect(sanitizeName('✨sparkle✨')).toBe('sparkle');
  });

  it('is idempotent — second pass produces same result', () => {
    const names = ['Hello World', 'São Paulo', 'test___123', '  leading'];
    for (const n of names) {
      expect(sanitizeName(sanitizeName(n))).toBe(sanitizeName(n));
    }
  });
});

describe('timestampedFilename', () => {
  it('starts with the given prefix', () => {
    const fn = timestampedFilename('plan', 'my-plan');
    expect(fn).toMatch(/^plan-/);
  });

  it('contains the sanitized name', () => {
    const fn = timestampedFilename('task', 'My Task');
    expect(fn).toContain('My_Task');
  });

  it('ends with .json', () => {
    expect(timestampedFilename('risk', 'test')).toMatch(/\.json$/);
  });

  it('includes a timestamp section without colons or dots', () => {
    const fn = timestampedFilename('feature', 'x');
    // The timestamp part: after name and before .json
    const match = fn.match(/^feature-x-(.+)\.json$/);
    expect(match).toBeTruthy();
    expect(match![1]).not.toContain(':');
    expect(match![1]).not.toContain('.');
  });
});

describe('tagColorFromName', () => {
  it('returns a valid hex color string', () => {
    const color = tagColorFromName('test');
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('is deterministic — same name always returns same color', () => {
    expect(tagColorFromName('alpha')).toBe(tagColorFromName('alpha'));
    expect(tagColorFromName('beta')).toBe(tagColorFromName('beta'));
  });

  it('returns one of the 20 predefined colors', () => {
    const predefined = [
      '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
      '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
      '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000',
      '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9',
    ];
    // Generate enough names to hit all buckets
    for (let i = 0; i < 50; i++) {
      expect(predefined).toContain(tagColorFromName(`name-${i}`));
    }
  });

  it('handles empty string gracefully', () => {
    const color = tagColorFromName('');
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});