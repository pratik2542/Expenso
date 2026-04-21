const fs = require('fs');
let text = fs.readFileSync('src/pages/_app.tsx', 'utf-8');

text = text.replace(
  '<PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>',
  `{typeof window !== 'undefined' ? (
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>`
);

text = text.replace(
  `</PersistQueryClientProvider>`,
  `</PersistQueryClientProvider>
      ) : (
      <QueryClientProvider client={queryClient}>
        <PreferencesProvider>
          <EnvironmentProvider>
            <AppLockProvider>
              <UpdateChecker />
              <WhatsNewModal />
              <UserActivityTracker />
              <Component {...pageProps} />
              <AppLockScreen />
              <SpeedInsights />
            </AppLockProvider>
          </EnvironmentProvider>
        </PreferencesProvider>
      </QueryClientProvider>
      )}`
);

fs.writeFileSync('src/pages/_app.tsx', text);
console.log('Fixed SSR provider wrapper');
