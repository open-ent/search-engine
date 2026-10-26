import { describe, expect, test } from 'vitest';

import type { SearchResult } from './api';
import {
  DESCRIPTION_MAX,
  DESELECTED_KEY,
  formatDate,
  isValidQuery,
  preview,
  readDeselected,
  sortByModifiedDesc,
  stripTags,
  writeDeselected,
} from './utils';

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
  describe('filtres mémorisés pour la session', () => {
    const memoire = () => {
      const m = new Map<string, string>();
      return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        removeItem: (k: string) => void m.delete(k),
      };
    };
    test('relit ce qui a été écrit', () => {
      const st = memoire();
      writeDeselected(st, new Set(['BlogSearchingEvents', 'WikiSearchingEvents']));
      expect([...readDeselected(st)].sort()).toEqual(['BlogSearchingEvents', 'WikiSearchingEvents']);
    });
    test('rien de décoché : la clé est retirée', () => {
      const st = memoire();
      writeDeselected(st, new Set(['A']));
      writeDeselected(st, new Set());
      expect(st.getItem(DESELECTED_KEY)).toBeNull();
      expect(readDeselected(st).size).toBe(0);
    });
    test('contenu illisible, stockage absent ou en échec : aucun filtre, sans erreur', () => {
      expect(readDeselected({ getItem: () => '{pas du json' }).size).toBe(0);
      expect(readDeselected({ getItem: () => '"texte"' }).size).toBe(0);
      expect(readDeselected(undefined).size).toBe(0);
      expect(() => writeDeselected({ setItem: () => { throw new Error('quota'); }, removeItem: () => undefined }, new Set(['A']))).not.toThrow();
    });
  });

  describe('sortByModifiedDesc', () => {
    const r = (title: string, date?: string): SearchResult => ({ title, url: `/${title}`, app: 'blog', modified: date ? { $date: date } : undefined });
    test('du plus récent au plus ancien', () => {
      const out = sortByModifiedDesc([r('a', '2026-01-01T00:00:00Z'), r('b', '2026-03-01T00:00:00Z'), r('c', '2026-02-01T00:00:00Z')]);
      expect(out.map((x) => x.title)).toEqual(['b', 'c', 'a']);
    });
    test('sans date ou date invalide : en dernier, ordre conservé', () => {
      const out = sortByModifiedDesc([r('x'), r('a', '2026-01-01T00:00:00Z'), r('y', 'pas une date'), r('b', '2026-02-01T00:00:00Z')]);
      expect(out.map((x) => x.title)).toEqual(['b', 'a', 'x', 'y']);
    });
    test('ne modifie pas le tableau d\'origine', () => {
      const src = [r('a', '2026-01-01T00:00:00Z'), r('b', '2026-02-01T00:00:00Z')];
      sortByModifiedDesc(src);
      expect(src.map((x) => x.title)).toEqual(['a', 'b']);
    });
  });
});
