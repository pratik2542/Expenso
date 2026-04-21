const fs = require('fs');
let text = fs.readFileSync('src/pages/_app.tsx', 'utf-8');

// Replace imports and QueryClient initialization
const importReplacement = `import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { get, set, del } from 'idb-keyval'`;

text = text.replace(`import { QueryClient, QueryClientProvider } from '@tanstack/react-query'`, importReplacement);

const clientReplacement = `const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // Data becomes stale after 30 seconds (triggers background fetches immediately on launch)
      gcTime: 1000 * 60 * 60 * 24 * 7, // Keep cache for 7 days
      refetchOnWindowFocus: true, // Auto-sync when app resumes
    },
  },
})

// Setup IndexedDB persister for offline-first boot caching
const persister = createAsyncStoragePersister({
  storage: typeof window !== 'undefined' ? {
    getItem: async (key) => await get(key),
    setItem: async (key, value) => await set(key, value),
    removeItem: async (key) => await del(key),
  } : undefined,
})`;

text = text.replace(`const queryClient = new QueryClient()`, clientReplacement);

// Replace Provider
text = text.replace(`<QueryClientProvider client={queryClient}>`, `<PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>`);
text = text.replace(`</QueryClientProvider>`, `</PersistQueryClientProvider>`);

fs.writeFileSync('src/pages/_app.tsx', text);
console.log('patched app component');
