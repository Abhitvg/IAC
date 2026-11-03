/**
 * Claim Normalizer & Chronology Validator
 * Validates dates, normalizes metrics, and detects chronological contradictions.
 */

import { ChronologyAlert } from './types';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9, sept: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export interface NormalizedDate {
  raw: string;
  year: number;
  month: number;
  isCurrent: boolean;
  isValid: boolean;
}

export function parseDateString(dateStr: string): NormalizedDate | null {
  if (!dateStr || !dateStr.trim()) return null;
  const s = dateStr.trim().toLowerCase();

  if (s === 'present' || s === 'current' || s === 'now' || s === 'ongoing') {
    const now = new Date();
    return {
      raw: dateStr,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      isCurrent: true,
      isValid: true,
    };
  }

  // Matches "YYYY-MM" or "YYYY/MM"
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    if (m >= 1 && m <= 12) {
      return { raw: dateStr, year: y, month: m, isCurrent: false, isValid: true };
    }
  }

  // Matches "Month YYYY" or "Mon YYYY" e.g. "Aug 2021", "September 2022"
  const monYearMatch = s.match(/^([a-z]+)[,\s]+(\d{4})$/i);
  if (monYearMatch) {
    const mName = monYearMatch[1].toLowerCase();
    const y = parseInt(monYearMatch[2], 10);
    const m = MONTHS[mName];
    if (m) {
      return { raw: dateStr, year: y, month: m, isCurrent: false, isValid: true };
    }
  }

  // Matches just year "YYYY"
  const yearMatch = s.match(/^(\d{4})$/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    return { raw: dateStr, year: y, month: 1, isCurrent: false, isValid: true };
  }

  return { raw: dateStr, year: 0, month: 0, isCurrent: false, isValid: false };
}

export function calculateDurationMonths(start?: string, end?: string): number | undefined {
  if (!start) return undefined;
  const pStart = parseDateString(start);
  if (!pStart || !pStart.isValid) return undefined;

  const pEnd = end ? parseDateString(end) : { year: new Date().getFullYear(), month: new Date().getMonth() + 1, isValid: true, isCurrent: true, raw: 'Present' };
  if (!pEnd || !pEnd.isValid) return undefined;

  const totalMonths = (pEnd.year - pStart.year) * 12 + (pEnd.month - pStart.month) + 1;
  return totalMonths > 0 ? totalMonths : undefined;
}

export function validateChronology(
  records: Array<{ id: string; title: string; startDate?: string; endDate?: string; isCurrent?: boolean }>
): ChronologyAlert[] {
  const alerts: ChronologyAlert[] = [];
  const parsed = records.map((r) => ({
    ...r,
    start: r.startDate ? parseDateString(r.startDate) : null,
    end: r.endDate ? parseDateString(r.endDate) : (r.isCurrent ? parseDateString('Present') : null),
  }));

  const currentYear = new Date().getFullYear();

  for (const item of parsed) {
    if (item.start && item.end && item.start.isValid && item.end.isValid) {
      if (item.start.year > item.end.year || (item.start.year === item.end.year && item.start.month > item.end.month)) {
        alerts.push({
          type: 'impossible_dates',
          severity: 'error',
          message: `End date (${item.endDate}) precedes start date (${item.startDate}) for "${item.title}".`,
          recordIds: [item.id],
        });
      }
      if (item.start.year > currentYear + 1) {
        alerts.push({
          type: 'future_date',
          severity: 'warning',
          message: `Start date (${item.startDate}) is in the future for "${item.title}".`,
          recordIds: [item.id],
        });
      }
    }
  }

  // Detect overlapping employment records
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i];
      const b = parsed[j];
      if (a.start && a.end && b.start && b.end && a.start.isValid && a.end.isValid && b.start.isValid && b.end.isValid) {
        const aStart = a.start.year * 12 + a.start.month;
        const aEnd = a.end.year * 12 + a.end.month;
        const bStart = b.start.year * 12 + b.start.month;
        const bEnd = b.end.year * 12 + b.end.month;

        // Overlap if each starts before the other ends
        if (aStart < bEnd && bStart < aEnd) {
          alerts.push({
            type: 'overlap',
            severity: 'info',
            message: `Overlapping employment detected between "${a.title}" and "${b.title}".`,
            recordIds: [a.id, b.id],
          });
        }
      }
    }
  }

  return alerts;
}

export function extractExplicitMetrics(text: string): string[] {
  const metrics: string[] = [];
  const patterns: RegExp[] = [
    /\b\d+(?:\.\d+)?%/g,
    /\b\d+(?:\.\d+)?\s*(?:x|times|fold)\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:ms|s|seconds|minutes|hours)\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:qps|rps|tps)\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:k|m|b|million|billion)\s*(?:users|events|records|qps|rps|requests|stars)?\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:tb|gb|pb|mb)\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:users|events|records|stars|contributors)\b/gi,
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const val = match[0].trim();
      if (!metrics.includes(val) && val.length > 1) {
        metrics.push(val);
      }
    }
  }

  return metrics;
}
