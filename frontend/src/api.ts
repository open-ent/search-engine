// Client REST du module Moteur de recherche (cookies de session ENT, même origine).
// Mêmes endpoints que la version AngularJS (backend Java inchangé) :
//  - GET  /searchengine/types  -> liste des types cherchables (filtres)
//  - POST /searchengine        -> résultats paginés

/** Un type cherchable (filtre) : chaîne renvoyée telle quelle par le backend, ex. "BlogSearchingEvents". */
export type SearchType = string;

/** Un résultat de recherche (cf. l'ancien template main.html). */
export interface SearchResult {
  title: string;
  description?: string;
  url: string;
  /** code applicatif d'origine (ex. "blog") — sert au libellé « Accéder (…) ». */
  app: string;
  modified?: { $date: string };
  ownerId?: string;
  ownerDisplayName?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  /** true s'il reste des résultats non renvoyés (pagination). */
  hasMoreResult: boolean;
  /** true si le résultat est partiel (traitement trop long). */
  status: boolean;
}

/** Erreur applicative portant une clé i18n renvoyée par le backend (ex. `search.engine.empty`). */
export class ApiError extends Error {
  constructor(
    public readonly i18nKey: string,
    public readonly status: number,
  ) {
    super(i18nKey);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Le backend renvoie `{ error: "<clé i18n>" }` — ex. 400 + `search.engine.empty`
    // quand il n'y a aucun résultat. On propage la clé pour l'afficher traduite.
    let key = 'search.engine.error.unknown';
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) key = body.error;
    } catch {
      /* corps non-JSON : on garde la clé générique */
    }
    throw new ApiError(key, res.status);
  }
  return (await res.json()) as T;
}

/** Récupère la liste des types cherchables (filtres) — tableau de chaînes. */
export async function getTypes(): Promise<SearchType[]> {
  return json<SearchType[]>(
    await fetch('/searchengine/types', { credentials: 'include' }),
  );
}

export interface SearchParams {
  searchText: string;
  /** types sélectionnés (leurs `data`). */
  filter: string[];
  /** page courante (0-based), comme l'ancien modèle. */
  currentPage: number;
}

/** Lance une recherche paginée. */
export async function search(params: SearchParams): Promise<SearchResponse> {
  return json<SearchResponse>(
    await fetch('/searchengine', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),
  );
}

export const api = { getTypes, search };
