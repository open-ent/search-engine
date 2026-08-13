import {
  AppHeader,
  Breadcrumb,
  Layout,
  LoadingScreen,
  useEdificeClient,
} from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError, FacetCount, SearchResult } from '../api';
import {
  DESCRIPTION_MAX,
  MIN_WORD,
  formatDate,
  isValidQuery,
  preview,
  stripTags,
} from '../utils';

/**
 * Écran « résultats + facettes » (handoff 1b).
 *
 * Parti pris repris de la maquette : la requête d'abord, le filtrage ensuite, avec
 * des compteurs réels par type. L'identité visuelle vient du thème de l'instance —
 * on n'utilise que les classes du design system (`btn-primary`, `text-primary`…),
 * jamais une couleur en dur, pour que eclat-bfc, cd16 ou openent3 soient servis
 * par leur propre thème.
 *
 * Les facettes « Période » et « Espace » de la maquette ne sont pas rendues : le
 * moteur ne sait pas filtrer là-dessus. Afficher un filtre inopérant serait pire
 * que de ne pas l'afficher.
 */

const RECENT_KEY = 'searchengine.recent';
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string): string[] {
  const next = [q, ...readRecent().filter((x) => x !== q)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible : la fonctionnalité se dégrade sans casser la recherche */
  }
  return next;
}

/** Requête initiale lue depuis le hash : /searchengine#/<requête>. */
function queryFromHash(): string {
  if (typeof window === 'undefined') return '';
  const h = window.location.hash.replace(/^#\/?/, '');
  try {
    return decodeURIComponent(h);
  } catch {
    return h;
  }
}

export function App() {
  const { currentApp, init } = useEdificeClient();
  const { t } = useTranslation(['searchengine', 'common']);

  const typesQuery = useQuery({ queryKey: ['searchTypes'], queryFn: api.getTypes });
  const allTypes = useMemo(() => typesQuery.data ?? [], [typesQuery.data]);

  // Par défaut tous les types sont sélectionnés → on ne mémorise que ceux DÉCOCHÉS.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [words, setWords] = useState(queryFromHash);
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [facets, setFacets] = useState<Record<string, FacetCount>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [partial, setPartial] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [recent, setRecent] = useState<string[]>(readRecent);
  // Accès directs (handoff 1d). Les complétions de requête ne sont pas rendues :
  // elles exigent un suggester qu'aucune source ne fournit aujourd'hui.
  const [suggests, setSuggests] = useState<SearchResult[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggest, setActiveSuggest] = useState(-1);
  const suggestToken = useRef(0);

  const selectedFilters = useMemo(
    () => allTypes.filter((ty) => !deselected.has(ty)),
    [allTypes, deselected],
  );

  const runSearch = useCallback(
    async (reset: boolean) => {
      if (loading) return;
      if (!isValidQuery(words)) {
        // La clé ENT utilise le placeholder `{0}` (style mustache) — non géré par
        // l'interpolation i18next configurée (`[[ ]]`) : on le substitue à la main.
        setError(t('search.engine.bad.search.criteria').replace('{0}', String(MIN_WORD)));
        return;
      }
      if (selectedFilters.length === 0) return;

      setError(null);
      setLoading(true);
      const nextPage = reset ? 0 : page;
      const text = words.trim();
      if (reset) {
        setSubmitted(text);
        // Requête partageable et compatible bouton « précédent ».
        window.location.hash = `/${encodeURIComponent(text)}`;
      }
      try {
        const resp = await api.search({
          searchText: text,
          filter: selectedFilters,
          currentPage: nextPage,
        });
        setResults((prev) => (reset ? resp.results : [...prev, ...resp.results]));
        setPage(nextPage + 1);
        setHasMore(Boolean(resp.hasMoreResult));
        setPartial(Boolean(resp.status));
        setSearched(true);
        if (reset) {
          setExpanded(new Set());
          setRecent(pushRecent(text));
        }
      } catch (e) {
        const key = e instanceof ApiError ? e.i18nKey : 'search.engine.error.unknown';
        if (key === 'search.engine.empty') {
          // « Aucun résultat » : ce n'est pas une erreur → état vide (rendu plus bas).
          if (reset) {
            setResults([]);
            setRecent(pushRecent(text));
          }
          setSearched(true);
          setHasMore(false);
        } else {
          setError(t(key));
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, words, selectedFilters, page, t],
  );

  // Compteurs de facettes : calculés sur TOUS les types, indépendamment de la
  // sélection courante — sinon décocher un type ferait disparaître son compteur et
  // interdirait de le recocher en connaissance de cause.
  useEffect(() => {
    if (!submitted || allTypes.length === 0) return;
    let alive = true;
    api
      .getFacets({ searchText: submitted, filter: allTypes })
      .then((r) => {
        if (!alive) return;
        setFacets(r.counts ?? {});
        setTotal(r.total ?? 0);
      })
      .catch(() => {
        if (alive) setFacets({});
      });
    return () => {
      alive = false;
    };
  }, [submitted, allTypes]);

  useEffect(() => {
    const text = words.trim();
    if (!isValidQuery(text) || selectedFilters.length === 0) {
      setSuggests([]);
      setSuggestOpen(false);
      return;
    }
    const token = ++suggestToken.current;
    const timer = setTimeout(() => {
      api
        .search({ searchText: text, filter: selectedFilters, currentPage: 0 })
        .then((r) => {
          // Réponse d'une frappe précédente : on la jette.
          if (token !== suggestToken.current) return;
          setSuggests(r.results.slice(0, 4));
          setActiveSuggest(-1);
          setSuggestOpen(r.results.length > 0);
        })
        .catch(() => {
          if (token === suggestToken.current) {
            setSuggests([]);
            setSuggestOpen(false);
          }
        });
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, selectedFilters]);

  const onFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen || suggests.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggest((i) => (i + 1) % suggests.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggest((i) => (i <= 0 ? suggests.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setSuggestOpen(false);
    } else if (e.key === 'Enter' && activeSuggest >= 0) {
      // Entrée sur une proposition surlignée : on ouvre la ressource plutôt que
      // de lancer la recherche complète.
      e.preventDefault();
      window.location.href = suggests[activeSuggest].url;
    }
  };

  // Recherche automatique si l'utilisateur arrive avec /searchengine#/<requête>
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current || allTypes.length === 0) return;
    bootstrapped.current = true;
    if (queryFromHash()) void runSearch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTypes]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSuggestOpen(false);
    void runSearch(true);
  };

  const toggleFilter = (data: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(data)) next.delete(data);
      else next.add(data);
      return next;
    });
  };

  const resetFilters = () => setDeselected(new Set());

  const toggleExpand = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Types réellement porteurs de résultats, les plus fournis d'abord.
  const facetRows = useMemo(
    () =>
      allTypes
        .map((ty) => ({ type: ty, ...(facets[ty] ?? { count: 0, capped: false }) }))
        .sort((a, b) => b.count - a.count),
    [allTypes, facets],
  );

  const activeChips = useMemo(
    () => (deselected.size > 0 ? allTypes.filter((ty) => !deselected.has(ty)) : []),
    [allTypes, deselected],
  );

  if (!init) return <LoadingScreen />;

  return (
    <div className="d-flex flex-column vh-100">
      <Layout>
        <div className="d-print-none">
          <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>
        </div>

        <div className="flex-grow-1 overflow-auto">
          <div className="container py-16">
            <h1 className="mb-8">{t('searchengine.title')}</h1>

            <form className="d-flex gap-8 mb-16" onSubmit={onSubmit} role="search">
              <div style={{ position: 'relative', maxWidth: 560, flexGrow: 1 }}>
                <input
                  type="text"
                  className="form-control"
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  onKeyDown={onFieldKeyDown}
                  onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                  placeholder={t('label.placeholder')}
                  aria-label={t('label.placeholder')}
                  role="combobox"
                  aria-expanded={suggestOpen}
                  aria-controls="searchengine-suggests"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeSuggest >= 0 ? `searchengine-suggest-${activeSuggest}` : undefined
                  }
                  autoFocus
                />
                {suggestOpen && suggests.length > 0 && (
                  <ul
                    id="searchengine-suggests"
                    role="listbox"
                    aria-label={t('suggest.direct')}
                    className="list-unstyled bg-white border rounded shadow position-absolute w-100 mt-2 mb-0 py-4"
                    style={{ zIndex: 20 }}
                  >
                    <li className="px-12 py-4 text-muted" style={{ fontSize: 12 }} aria-hidden="true">
                      {t('suggest.direct')}
                    </li>
                    {suggests.map((sg, i) => (
                      <li
                        key={`${sg.url}-${i}`}
                        id={`searchengine-suggest-${i}`}
                        role="option"
                        aria-selected={i === activeSuggest}
                        className="px-12 py-8"
                        style={{ cursor: 'pointer', background: i === activeSuggest ? 'var(--openent-neutral-200, #eee)' : undefined }}
                        onMouseEnter={() => setActiveSuggest(i)}
                        onMouseDown={(e) => {
                          // mousedown : le blur du champ fermerait la liste avant le clic.
                          e.preventDefault();
                          window.location.href = sg.url;
                        }}
                      >
                        <b>{sg.title}</b>
                        <span className="text-muted d-block" style={{ fontSize: 12 }}>
                          {t(sg.app.toLowerCase())}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {t('label.search')}
              </button>
            </form>

            {error && (
              <div className="alert alert-warning" role="alert">
                {error}
              </div>
            )}
            {partial && (
              <div className="alert alert-warning" role="alert">
                {t('search.engine.result.partial')}
              </div>
            )}

            {!searched && recent.length > 0 && (
              <div className="mb-16">
                <p className="text-muted mb-8">{t('recent.title')}</p>
                <div className="d-flex flex-wrap gap-8">
                  {recent.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => {
                        setWords(q);
                        setTimeout(() => void runSearch(true), 0);
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="d-flex gap-24 align-items-start">
              {/* ── Colonne de facettes ───────────────────────────────── */}
              {searched && (
                <aside
                  className="border-end pe-16 d-none d-lg-block"
                  style={{ width: 262, flexShrink: 0 }}
                  aria-label={t('filters.title')}
                >
                  <div className="d-flex justify-content-between align-items-center mb-8">
                    <b>{t('filters.title')}</b>
                    {deselected.size > 0 && (
                      <button type="button" className="btn btn-link p-0" onClick={resetFilters}>
                        {t('filters.reset')}
                      </button>
                    )}
                  </div>
                  <ul className="list-unstyled mb-0">
                    {facetRows.map(({ type, count, capped }) => (
                      <li key={type}>
                        <label
                          className="d-flex align-items-center gap-8 py-4"
                          style={{ opacity: count === 0 ? 0.5 : 1 }}
                        >
                          <input
                            type="checkbox"
                            checked={!deselected.has(type)}
                            onChange={() => toggleFilter(type)}
                          />
                          <span className="flex-grow-1">{t(type.toLowerCase())}</span>
                          <span className="text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {count}
                            {capped ? '+' : ''}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </aside>
              )}

              {/* ── Colonne de résultats ──────────────────────────────── */}
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                {searched && (
                  <p className="text-muted mb-8">
                    <b>{total || results.length}</b> {t('label.results')}
                    {submitted && <> — « {submitted} »</>}
                  </p>
                )}

                {/* Filtres actifs, retirables */}
                {activeChips.length > 0 && activeChips.length < allTypes.length && (
                  <div className="d-flex flex-wrap gap-8 mb-12">
                    {activeChips.map((ty) => (
                      <button
                        key={ty}
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => toggleFilter(ty)}
                        title={t('filters.remove')}
                      >
                        {t(ty.toLowerCase())} ×
                      </button>
                    ))}
                  </div>
                )}

                {searched && results.length === 0 && !loading && !error && (
                  <div className="border rounded p-16 mb-16">
                    <p className="fw-bold mb-8">
                      {t('search.engine.empty')} « {submitted} »
                    </p>
                    <ul className="text-muted mb-12">
                      <li>{t('empty.hint.spelling')}</li>
                      {deselected.size > 0 && (
                        <li>
                          {t('empty.hint.filters')}{' '}
                          <b>{allTypes.filter((ty) => deselected.has(ty)).map((ty) => t(ty.toLowerCase())).join(', ')}</b>
                        </li>
                      )}
                    </ul>
                    <div className="d-flex flex-wrap gap-8">
                      {deselected.size > 0 && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            resetFilters();
                            // La recherche est relancée par l'effet lié aux filtres.
                            setTimeout(() => void runSearch(true), 0);
                          }}
                        >
                          {t('empty.action.searchAll')}
                        </button>
                      )}
                      {deselected.size > 0 && (
                        <button type="button" className="btn btn-outline-primary" onClick={resetFilters}>
                          {t('filters.reset')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <ul className="list-unstyled" aria-label={t('searchengine.title')}>
                  {results.map((res, i) => {
                    const isOpen = expanded.has(i);
                    const desc = res.description
                      ? isOpen
                        ? preview(res.description) && res.description
                        : preview(res.description)
                      : '';
                    const canExpand = (res.description?.length ?? 0) >= DESCRIPTION_MAX;
                    return (
                      <li key={`${res.url}-${i}`} className="d-flex gap-16 py-12 border-bottom">
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                          <div
                            style={{ cursor: canExpand ? 'pointer' : 'default' }}
                            onClick={() => canExpand && toggleExpand(i)}
                          >
                            <b>{res.title}</b>{' '}
                            {desc ? (
                              <span>{isOpen ? stripTags(res.description) : desc}</span>
                            ) : (
                              <em>{t('search.engine.noDescription')}</em>
                            )}
                          </div>
                          <div>
                            <a href={res.url}>
                              {t('label.access')} ({t(res.app.toLowerCase())})
                            </a>
                          </div>
                          <em className="text-muted d-block mt-4" style={{ fontSize: 13 }}>
                            {t('label.date')} : {formatDate(res.modified?.$date)}
                          </em>
                        </div>
                        <div className="d-flex align-items-center gap-8" style={{ minWidth: 160 }}>
                          {res.ownerId ? (
                            <img
                              src={`/userbook/avatar/${res.ownerId}?thumbnail=100x100`}
                              alt=""
                              width={40}
                              height={40}
                              style={{ borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <i className="system-avatar" aria-hidden="true" />
                          )}
                          {res.ownerId && (
                            <a href={`/userbook/annuaire#${res.ownerId}`}>{res.ownerDisplayName}</a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {hasMore && (
                  <button
                    type="button"
                    className="btn btn-outline-primary mt-12"
                    onClick={() => void runSearch(false)}
                    disabled={loading}
                  >
                    {t('label.more')}
                  </button>
                )}
                {loading && <p className="mt-8">{t('loading')}</p>}
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </div>
  );
}
