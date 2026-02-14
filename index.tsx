import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

type ErrorBoundaryState = { hasError: boolean };

class RootErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };
  private lastErrorMessage = '';

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Root render crashed:', error);
    this.lastErrorMessage = error instanceof Error ? error.message : String(error);
    try {
      sessionStorage.setItem('connectai_last_runtime_error', this.lastErrorMessage);
    } catch {}
  }

  private hardRecover = () => {
    try {
      const storage: Storage[] = [localStorage, sessionStorage];
      storage.forEach((store) => {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i);
          if (key && key.startsWith('connectai_active_call_')) keys.push(key);
        }
        keys.forEach((k) => store.removeItem(k));
      });
      sessionStorage.removeItem('connectai_last_runtime_error');
    } catch {}
    const target = `${window.location.origin}/#/app?recover=${Date.now()}`;
    window.location.assign(target);
  }

  render() {
    if (this.state.hasError) {
      const errorText = (() => {
        try {
          return sessionStorage.getItem('connectai_last_runtime_error') || this.lastErrorMessage || '';
        } catch {
          return this.lastErrorMessage || '';
        }
      })();
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/90 p-6 text-center">
            <h1 className="text-lg font-black uppercase tracking-wider">ConnectAI Recovered From A Crash</h1>
            <p className="text-sm text-slate-300 mt-2">
              A runtime error occurred. Reload to restore the workspace.
            </p>
            {errorText ? (
              <p className="text-[11px] text-rose-300 mt-3 break-words">
                {errorText}
              </p>
            ) : null}
            <button
              className="mt-5 w-full rounded-xl bg-brand-600 hover:bg-brand-700 text-white py-3 text-xs font-black uppercase tracking-widest"
              onClick={this.hardRecover}
            >
              Recover And Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      caches.keys()
        .then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
        .catch(() => {});
    }
  });
}
