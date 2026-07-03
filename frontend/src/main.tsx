import { EdificeClientProvider, EdificeThemeProvider } from '@open-ent/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';

import { App } from './screens/App';

import './i18n';
import '@open-ent/bootstrap/dist/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <EdificeClientProvider params={{ app: 'searchengine' }}>
      <EdificeThemeProvider>
        <App />
      </EdificeThemeProvider>
    </EdificeClientProvider>
  </QueryClientProvider>,
);
