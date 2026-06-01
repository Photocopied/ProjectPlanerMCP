// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';

export function generateId(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function sanitizeName(name: string, entityLabel: string = 'Name'): string {
  if (name.length === 0) {
    throw new Error(`${entityLabel} must not be empty`);
  }
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (cleaned.length === 0) {
    throw new Error(`${entityLabel} "${name}" sanitizes to an empty string`);
  }
  return cleaned;
}

export function timestampedFilename(prefix: string, name: string): string {
  const safe = sanitizeName(name);
  const ts = now().replace(/[:.]/g, '').replace('T', '-').slice(0, 15);
  return `${prefix}-${safe}-${ts}.json`;
}

export function tagColorFromName(name: string): string {
  const colors = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
    '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}