import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Neutralize spreadsheet formula triggers (`=`, `+`, `-`, `@`, tab, CR)
 * matching verified TESDA Connect batch forwarding safety rules.
 */
export function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const raw = String(value);
  const trimmedLeading = raw.replace(/^[ \t\r\n]+/, '');
  const dangerousStart = /^[=+\-@\t\r]/.test(trimmedLeading) || /^[=+\-@\t\r]/.test(raw);
  const safe = dangerousStart ? `'${raw}` : raw;

  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }

  return safe;
}

export function formatShortDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return 'Not available';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * Safely convert unknown JSON or database fields into strings without falling back to
 * Object's default `[object Object]` stringification.
 */
export function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}
