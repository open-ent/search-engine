import type { SearchResult } from './api';
import { dateLocale } from './locale';

/** Fonctions pures du moteur de recherche (testables sans DOM applicatif). */

/** Taille minimale d'un mot recherché (cf. conf backend `search-word-min-size`). */
export const MIN_WORD = 4;
/** Longueur d'aperçu d'une description avant troncature. */
export const DESCRIPTION_MAX = 140;

/** Retire les balises HTML d'une chaîne (texte brut). */
export function stripTags(html?: string): string {
  if (!html) return '';
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

/** Aperçu tronqué (texte brut) d'une description HTML. */
export function preview(html?: string): string {
  const text = stripTags(html);
  return text.length >= DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX)}…` : text;
}

/** Formate une date ISO en `jj/mm/aaaa` (fr), ou chaîne vide si invalide. */
export function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Vrai si la requête contient au moins un mot d'au moins MIN_WORD caractères. */
export function isValidQuery(words: string): boolean {
  return words
    .trim()
    .split(/\s+/)
    .some((w) => w.length >= MIN_WORD);
}

/** Clé de session des types décochés (équivalent de `storedSearchFilter` de l'ancienne interface). */
export const DESELECTED_KEY = 'searchengine.deselected';

/** Types décochés mémorisés pour la session (vide si rien, ou si le stockage est indisponible ou illisible). */
export function readDeselected(storage?: Pick<Storage, 'getItem'>): Set<string> {
  try {
    const raw = storage?.getItem(DESELECTED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Mémorise les types décochés pour la session ; sans effet si le stockage est indisponible. */
export function writeDeselected(storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined, deselected: Set<string>): void {
  try {
    if (deselected.size === 0) storage?.removeItem(DESELECTED_KEY);
    else storage?.setItem(DESELECTED_KEY, JSON.stringify([...deselected]));
  } catch {
    // Mode privé ou quota : le choix de filtres n'est qu'une commodité.
  }
}

/** Résultats du plus récemment modifié au plus ancien (comme l'ancienne interface) ; sans date, en dernier, ordre conservé. */
export function sortByModifiedDesc(results: SearchResult[]): SearchResult[] {
  const time = (r: SearchResult) => {
    const t = r.modified?.$date ? new Date(r.modified.$date).getTime() : NaN;
    return Number.isNaN(t) ? null : t;
  };
  return results
    .map((r, i) => ({ r, i, t: time(r) }))
    .sort((a, b) => (a.t === null && b.t === null ? a.i - b.i : a.t === null ? 1 : b.t === null ? -1 : b.t - a.t || a.i - b.i))
    .map((x) => x.r);
}
