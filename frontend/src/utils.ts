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
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Vrai si la requête contient au moins un mot d'au moins MIN_WORD caractères. */
export function isValidQuery(words: string): boolean {
  return words
    .trim()
    .split(/\s+/)
    .some((w) => w.length >= MIN_WORD);
}
