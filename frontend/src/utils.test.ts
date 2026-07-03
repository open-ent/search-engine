import { describe, expect, test } from 'vitest';

import { DESCRIPTION_MAX, formatDate, isValidQuery, preview, stripTags } from './utils';

describe('search-engine utils (migration React CCTP 51C)', () => {
  describe('isValidQuery', () => {
    test('accepte un mot ≥ 4 caractères', () => {
      expect(isValidQuery('test')).toBe(true);
      expect(isValidQuery('  ressource  ')).toBe(true);
      expect(isValidQuery('ab cdef')).toBe(true); // un mot long suffit
    });
    test('refuse si aucun mot ≥ 4 caractères', () => {
      expect(isValidQuery('NR')).toBe(false);
      expect(isValidQuery('a b c')).toBe(false);
      expect(isValidQuery('')).toBe(false);
    });
  });

  describe('stripTags', () => {
    test('retire les balises et garde le texte', () => {
      expect(stripTags('<p>bonjour <b>monde</b></p>')).toBe('bonjour monde');
      expect(stripTags(undefined)).toBe('');
    });
  });

  describe('preview', () => {
    test('tronque au-delà de DESCRIPTION_MAX', () => {
      const long = 'a'.repeat(DESCRIPTION_MAX + 20);
      const p = preview(long);
      expect(p.endsWith('…')).toBe(true);
      expect(p.length).toBe(DESCRIPTION_MAX + 1); // 140 chars + ellipsis
    });
    test('ne tronque pas une courte description', () => {
      expect(preview('<em>court</em>')).toBe('court');
    });
  });

  describe('formatDate', () => {
    test('formate une date ISO en jj/mm/aaaa', () => {
      expect(formatDate('2026-07-02T10:00:00.000Z')).toMatch(/^\d{2}\/\d{2}\/2026$/);
    });
    test('chaîne vide si invalide ou absente', () => {
      expect(formatDate(undefined)).toBe('');
      expect(formatDate('pas une date')).toBe('');
    });
  });
});
