/**
 * Locale de formatage des dates et des heures, alignée sur la langue de la session ENT.
 *
 * Le module formatait ses dates avec `'fr-FR'` en dur : une session anglaise lisait
 * « Lundi 12 » et « 16 nov. » au-dessus d'une interface traduite. La langue vient de
 * `useEdificeClient().currentLanguage` (la préférence du compte, pas l'`Accept-Language`
 * du navigateur) et est posée par le composant racine avant le rendu des écrans. Les
 * fonctions de formatage étant pures et appelées hors composant, elles lisent la locale
 * courante à l'appel plutôt que de la recevoir en paramètre.
 *
 * Copie du modèle de `modules/calendar/frontend/src/locale.ts` : la mutualiser dans
 * `@open-ent/react` supposerait d'en publier une version, ce qui déborde du périmètre.
 */

/**
 * Locale complète par code de langue ENT. Hors anglais américain, les dates restent au
 * format jour/mois : « en-GB » évite qu'un 11/12 soit lu « 12 novembre » par un lecteur
 * anglophone alors que le reste des données (établissements, créneaux) est européen.
 */
const LOCALE_BY_LANGUAGE: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
};

export const DEFAULT_LOCALE = 'fr-FR';

let current = DEFAULT_LOCALE;

/**
 * Fixe la locale à partir du code de langue de la session (« fr », « en »…). Une langue
 * vide ou absente laisse la locale précédente : la session n'est pas encore chargée.
 */
export function setLanguage(language?: string | null): void {
  const code = String(language ?? '').trim();
  if (!code) return;
  // Un code déjà régionalisé (« pt-BR ») est repris tel quel plutôt que ramené à sa table.
  current = code.includes('-') ? code : (LOCALE_BY_LANGUAGE[code.toLowerCase()] ?? code);
}

/** Locale de formatage courante, à passer aux `toLocale*String` et à `Intl`. */
export function dateLocale(): string {
  return current;
}

/**
 * Jours de la semaine (lundi → dimanche) dans la locale courante, mémoïsés par locale.
 * `Intl` rend « lundi » / « lun. » : l'initiale est remise en capitale et le point final
 * retiré, pour garder le rendu français d'origine (« Lundi », « Lun ») inchangé.
 */
const dayCache = new Map<string, { long: string[]; short: string[] }>();

function buildDayNames(locale: string) {
  // 2024-01-01 est un lundi : sept jours consécutifs couvrent la semaine ISO.
  const week = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i));
  const format = (style: 'long' | 'short') => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: style });
    return week.map((day) => {
      const label = formatter.format(day).replace(/\.$/, '');
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
  };
  return { long: format('long'), short: format('short') };
}

function dayNames() {
  const locale = dateLocale();
  let names = dayCache.get(locale);
  if (!names) {
    names = buildDayNames(locale);
    dayCache.set(locale, names);
  }
  return names;
}

/** Jours de la semaine en entier (lundi → dimanche). */
export function dayLabels(): string[] {
  return dayNames().long;
}

/** Jours de la semaine en abrégé (lundi → dimanche). */
export function dayShort(): string[] {
  return dayNames().short;
}
