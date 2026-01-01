import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './services/firebase';
import { ensureFcmTokenForUser, listenForegroundMessages, startFcmTokenAutoRefresh } from './services/firebase/messaging';
import { ensureSeedGeneralAdmin } from './services/rbac';

const container = document.getElementById('root')!;
function Root() {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      ensureSeedGeneralAdmin().catch(() => {});
      if (user) {
        ensureFcmTokenForUser().catch(() => {});
        listenForegroundMessages().catch(() => {});
        startFcmTokenAutoRefresh();
      }
    });
    return () => unsub();
  }, []);
  return (
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}

createRoot(container).render(<Root />);
