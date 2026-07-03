import i18n from 'i18next';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

// Les clés i18n du module utilisent l'interpolation `[[ ]]` (héritage ENT).
i18n
  .use(Backend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: (_lngs: string[], namespaces: string[]) => {
        return namespaces.map((namespace: string) =>
          namespace === 'common' ? `/i18n` : `/${namespace}/i18n`,
        );
      },
      parse: (data: string) => JSON.parse(data),
    },
    defaultNS: 'common',
    ns: ['common', 'searchengine'],
    fallbackLng: 'fr',
    lng: 'fr',
    // Les clés ENT sont PLATES et contiennent des points (`searchengine.title`,
    // `search.engine.has.more`) → désactiver le découpage par `.` et `:`.
    keySeparator: false,
    nsSeparator: false,
    interpolation: {
      escapeValue: false,
      prefix: '[[',
      suffix: ']]',
    },
    debug: false,
  });

export default i18n;
