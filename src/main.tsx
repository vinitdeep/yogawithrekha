import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { StoreProvider } from './lib/store';
import { ToastProvider } from './components/ui';
import { CurrencyProvider } from './components/brand';
import { router } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <CurrencyProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </CurrencyProvider>
    </StoreProvider>
  </StrictMode>,
);
