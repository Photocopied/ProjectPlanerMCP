import { describe, it, expect } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  asRecord,
  getString,
  getOptionalString,
  getStringArray,
  getOptionalNumber,
  getBoolean,
  getOptionalEnum,
  getNumber,
  textResponse,
  textContentResponse,
} from '../server.js';

// ---------------------------------------------------------------------------
// asRecord
// ---------------------------------------------------------------------------

describe('asRecord', () => {
  it('converts an object to Record<string, unknown>', () => {
    const r = asRecord({ a: 1, b: 'hello' });
    expect(r.a).toBe(1);
    expect(r.b).toBe('hello');
  });

  it('throws for null', () => {
    expect(() => asRecord(null)).toThrow(McpError);
  });

  it('throws for non-object types', () => {
    expect(() => asRecord('string')).toThrow(McpError);
    expect(() => asRecord(42)).toThrow(McpError);
    expect(() => asRecord(undefined)).toThrow(McpError);
  });
});

// ---------------------------------------------------------------------------
// getString
// ---------------------------------------------------------------------------

describe('getString', () => {
  const args = { name: 'test-value', empty: '' };

  it('returns the string value for an existing key', () => {
    expect(getString(args, 'name')).toBe('test-value');
  });

  it('throws if the key is missing', () => {
    expect(() => getString(args, 'missing')).toThrow(McpError);
  });

  it('throws if the value is an empty string', () => {
    expect(() => getString(args, 'empty')).toThrow(McpError);
  });

  it('throws if the value is not a string', () => {
    expect(() => getString({ x: 42 }, 'x')).toThrow(McpError);
  });
});

// ---------------------------------------------------------------------------
// getOptionalString
// ---------------------------------------------------------------------------

describe('getOptionalString', () => {
  it('returns the string when present', () => {
    expect(getOptionalString({ x: 'hello' }, 'x')).toBe('hello');
  });

  it('returns undefined when key is missing', () => {
    expect(getOptionalString({}, 'x')).toBeUndefined();
  });

  it('returns undefined when value is not a string', () => {
    expect(getOptionalString({ x: 42 }, 'x')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getStringArray
// ---------------------------------------------------------------------------

describe('getStringArray', () => {
  it('returns an array of strings when present', () => {
    expect(getStringArray({ x: ['a', 'b'] }, 'x')).toEqual(['a', 'b']);
  });

  it('returns empty array when key is missing', () => {
    expect(getStringArray({}, 'x')).toEqual([]);
  });

  it('throws when values are not strings', () => {
    expect(() => getStringArray({ x: [1, 2] }, 'x')).toThrow(McpError);
  });

  it('throws when value is not an array', () => {
    expect(() => getStringArray({ x: 'not-array' }, 'x')).toThrow(McpError);
  });
});

// ---------------------------------------------------------------------------
// getOptionalNumber
// ---------------------------------------------------------------------------

describe('getOptionalNumber', () => {
  it('returns the number when present', () => {
    expect(getOptionalNumber({ x: 42 }, 'x')).toBe(42);
  });

  it('returns undefined when key is missing', () => {
    expect(getOptionalNumber({}, 'x')).toBeUndefined();
  });

  it('throws when value is not a number', () => {
    expect(() => getOptionalNumber({ x: 'string' }, 'x')).toThrow(McpError);
  });
});

// ---------------------------------------------------------------------------
// getBoolean
// ---------------------------------------------------------------------------

describe('getBoolean', () => {
  it('returns true when present and true', () => {
    expect(getBoolean({ x: true }, 'x')).toBe(true);
  });

  it('returns false when present and false', () => {
    expect(getBoolean({ x: false }, 'x')).toBe(false);
  });

  it('returns undefined when key is missing', () => {
    expect(getBoolean({}, 'x')).toBeUndefined();
  });

  it('throws when value is not a boolean', () => {
    expect(() => getBoolean({ x: 'true' }, 'x')).toThrow(McpError);
  });
});

// ---------------------------------------------------------------------------
// getOptionalEnum
// ---------------------------------------------------------------------------

describe('getOptionalEnum', () => {
  const valid = ['active', 'archived'] as const;

  it('returns the value when it matches a valid option', () => {
    expect(getOptionalEnum({ status: 'active' }, 'status', valid)).toBe('active');
  });

  it('returns undefined when key is missing', () => {
    expect(getOptionalEnum({}, 'status', valid)).toBeUndefined();
  });

  it('throws when value is not in the valid list', () => {
    expect(() => getOptionalEnum({ status: 'invalid' }, 'status', valid)).toThrow(McpError);
  });
});

// ---------------------------------------------------------------------------
// getNumber
// ---------------------------------------------------------------------------

describe('getNumber', () => {
  it('returns the number when within range', () => {
    expect(getNumber({ x: 3 }, 'x', 1, 5)).toBe(3);
  });

  it('throws when below minimum', () => {
    expect(() => getNumber({ x: 0 }, 'x', 1, 5)).toThrow(McpError);
  });

  it('throws when above maximum', () => {
    expect(() => getNumber({ x: 6 }, 'x', 1, 5)).toThrow(McpError);
  });

  it('throws when not an integer', () => {
    expect(() => getNumber({ x: 2.5 }, 'x', 1, 5)).toThrow(McpError);
  });

  it('throws when not a number', () => {
    expect(() => getNumber({ x: 'three' }, 'x', 1, 5)).toThrow(McpError);
  });
});

// ---------------------------------------------------------------------------
// textResponse / textContentResponse
// ---------------------------------------------------------------------------

describe('textResponse', () => {
  it('wraps data in MCP content array with JSON string', () => {
    const result = textResponse({ id: 'abc', name: 'test' });
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
    // Should be parseable JSON
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe('test');
  });

  it('formats JSON with indentation', () => {
    const result = textResponse({ a: 1 });
    expect(result.content[0].text).toContain('\n');
  });

  it('handles simple values', () => {
    const result = textResponse({ deleted: true });
    expect(JSON.parse(result.content[0].text).deleted).toBe(true);
  });
});

describe('textContentResponse', () => {
  it('wraps plain text in MCP content array', () => {
    const result = textContentResponse('hello world');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('hello world');
  });
});