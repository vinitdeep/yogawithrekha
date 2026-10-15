import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { StoreProvider } from './lib/store';
import { ToastProvider, useToast } from './components/ui';
import { CurrencyProvider } from './components/brand';
import { ConfigError } from './components/ConfigError';
import { CONFIG_PROBLEMS, IS_PRODUCTION, PRODUCTION_CONFIG } from './lib/config';
import type { Backend } from './lib/backend/types';
import { router } from './App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

function App({ backend }: { backend: Backend }) {
  return (
    <StrictMode>
      <ToastProvider>
        <Store backend={backend} />
      </ToastProvider>
    </StrictMode>
  );
}

function Store({ backend }: { backend: Backend }) {
  const toast = useToast();
  return (
    <StoreProvider backend={backend} onSessionExpired={() => toast('Your session expired. Please sign in again.', 'info')}>
      <CurrencyProvider>
        <RouterProvider router={router} />
      </CurrencyProvider>
    </StoreProvider>
  );
}

async function start() {
  if (IS_PRODUCTION) {
    // Never fall back to the demo when production is misconfigured.
    if (CONFIG_PROBLEMS.length || !PRODUCTION_CONFIG) {
      root.render(<ConfigError problems={CONFIG_PROBLEMS} />);
      return;
    }
    const { createSupabaseBackend } = await import('./lib/supabase/backend');
    root.render(<App backend={createSupabaseBackend(PRODUCTION_CONFIG)} />);
  } else {
    // Demo build only — this branch (and the simulated backend) is not included in production builds.
    const { createDemoBackend } = await import('./lib/demo/backend');
    root.render(<App backend={createDemoBackend()} />);
  }
}

void start();
