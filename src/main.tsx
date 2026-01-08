import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, onMessageListener, requestFCMToken } from './services/firebase';
import { ensureFcmTokenForUser, listenForegroundMessages, startFcmTokenAutoRefresh } from './services/firebase/messaging';
import { ensureSeedGeneralAdmin } from './services/rbac';

const container = document.getElementById('root')!;
function Root() {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      ensureSeedGeneralAdmin().catch(() => {});
      if (user) {
        try{
          const token = await requestFCMToken();
          if (token) {
              console.log("função: requestFCMToken. " + token);
            }
        } catch (err) {
          console.log("função: requestFCMToken. " + err?.message);
        }
        //ensureFcmTokenForUser().catch((err) => {console.log("função: ensureFcmTokenForUser. " + err?.message)});
        //listenForegroundMessages()
        //  .then(()=>{console.log("notificação foreground")})
        //  .catch((err) => {console.log("função: listenForegroundMessages. " + err?.message)});
        //startFcmTokenAutoRefresh();
      }else{
        console.log("não há usuário logado")
      }
    });
    return () => unsub();
  }, []);

  onMessageListener().then((payload) => {
    console.log('Message received. ', payload);
  }).catch((err) => {
    console.log('Error receiving message. ', err);
  }).finally(() => {
    console.log('Finally. ');
  });

  return (
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}

createRoot(container).render(<Root />);
