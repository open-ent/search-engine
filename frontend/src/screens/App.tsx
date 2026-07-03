import {
  AppHeader,
  Breadcrumb,
  Layout,
  LoadingScreen,
  useEdificeClient,
} from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError, SearchResult } from '../api';
import {
  DESCRIPTION_MAX,
  MIN_WORD,
  formatDate,
  isValidQuery,
  preview,
  stripTags,
} from '../utils';

export function App() {
  const { currentApp, init } = useEdificeClient();
  const { t } = useTranslation(['searchengine', 'common']);

  const typesQuery = useQuery({ queryKey: ['searchTypes'], queryFn: api.getTypes });
  const allTypes = useMemo(() => typesQuery.data ?? [], [typesQuery.data]);

  // Par défaut tous les types sont sélectionnés → on ne mémorise que ceux DÉCOCHÉS.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [words, setWords] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [partial, setPartial] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
      try {
        const resp = await api.search({
          searchText: words.trim(),
          filter: selectedFilters,
          currentPage: nextPage,
        });
        setResults((prev) => (reset ? resp.results : [...prev, ...resp.results]));
        setPage(nextPage + 1);
        setHasMore(Boolean(resp.hasMoreResult));
        setPartial(Boolean(resp.status));
        setSearched(true);
        if (reset) setExpanded(new Set());
      } catch (e) {
        const key = e instanceof ApiError ? e.i18nKey : 'search.engine.error.unknown';
        if (key === 'search.engine.empty') {
          // « Aucun résultat » : ce n'est pas une erreur → état vide (rendu plus bas).
          if (reset) setResults([]);
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
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

  const toggleExpand = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (!init) return <LoadingScreen />;

  return (
    <div className="d-flex flex-column vh-100">
      <Layout>
        <div className="d-print-none">
          <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>
        </div>

        <div className="flex-grow-1 overflow-auto">
          <div className="container py-16">
            <h1 className="mb-16">{t('searchengine.title')}</h1>

            {/* Filtres par type de ressource */}
            <fieldset className="mb-16">
              <legend className="fw-bold mb-8">{t('filters.title')}</legend>
              <div className="d-flex flex-wrap gap-16">
                {allTypes.map((ty) => (
                  <label key={ty} className="d-flex align-items-center gap-4">
                    <input
                      type="checkbox"
                      checked={!deselected.has(ty)}
                      onChange={() => toggleFilter(ty)}
                    />
                    <span>{t(ty.toLowerCase())}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Champ + bouton de recherche */}
            <form className="d-flex gap-8 mb-16" onSubmit={onSubmit} role="search">
              <input
                type="text"
                className="form-control"
                style={{ maxWidth: 480 }}
                value={words}
                onChange={(e) => setWords(e.target.value)}
                placeholder={t('label.placeholder')}
                aria-label={t('label.placeholder')}
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {t('label.search')}
              </button>
            </form>

            {/* Erreurs / résultat partiel */}
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

            {/* Résultats */}
            {searched && results.length === 0 && !loading && !error && (
              <p className="text-muted">{t('search.engine.empty')}</p>
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
                    <div className="flex-grow-1">
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

            {/* Pagination + info */}
            {searched && results.length > 0 && (
              <p className="text-muted mt-8">
                {t(hasMore ? 'search.engine.has.more' : 'search.engine.has.nomore')}
              </p>
            )}
            {hasMore && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void runSearch(false)}
                disabled={loading}
              >
                {t('label.search')}
              </button>
            )}
            {loading && <p className="mt-8">{t('loading')}</p>}
          </div>
        </div>
      </Layout>
    </div>
  );
}
