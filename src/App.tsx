import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import Login from './pages/Login';
import Perfil from './pages/Perfil';
import Unidades from './pages/Unidades';
import ProtectedRoute from './components/ProtectedRoute';
import Autorizacoes from './pages/Autorizacoes';
import Admin from './pages/Admin';
import Escala from './pages/Escala';
import ConsolidarEscala from './pages/ConsolidarEscala';
import Controle from './pages/Controle';
import Relatorio from './pages/Relatorio';
import Planilha from './pages/Planilha';
import Configuracao from './pages/Configuracao';
import NovaUnidade from './pages/NovaUnidade';
import GerenciarUnidade from './pages/GerenciarUnidade';
import Missao from './pages/Missao';
import NovaMissao from './pages/NovaMissao';
import { auth, db, messagingPromise } from './services/firebase';
import { ref, set } from 'firebase/database';
import { getToken } from 'firebase/messaging';

function App() {
  // Captura e salva o token FCM do usuário autenticado para receber push
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      try {
        const messaging = await messagingPromise;
        if (!messaging) return;
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
        const token = await getToken(messaging, vapidKey ? { vapidKey } : undefined);
        if (token) {
          await set(ref(db, `/users/${user.uid}/fcmToken`), token);
        }
      } catch {
        // Ignora erros de permissão/ambiente
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-surface-gray">
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route
          path="/perfil"
          element={
            <ProtectedRoute>
              <Perfil />
            </ProtectedRoute>
          }
        />
        <Route
          path="/unidades"
          element={
            <ProtectedRoute>
              <Unidades />
            </ProtectedRoute>
          }
        />
        <Route
          path="/autorizar"
          element={
            <ProtectedRoute requireGeneralAdmin>
              <Autorizacoes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireGeneralAdmin>
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/escala"
          element={
            <ProtectedRoute>
              <Escala />
            </ProtectedRoute>
          }
        />
        <Route
          path="/escala/consolidar"
          element={
            <ProtectedRoute requireUnitAdmin>
              <ConsolidarEscala />
            </ProtectedRoute>
          }
        />
        <Route
          path="/controle"
          element={
            <ProtectedRoute>
              <Controle />
            </ProtectedRoute>
          }
        />
        <Route
          path="/relatorio"
          element={
            <ProtectedRoute>
              <Relatorio />
            </ProtectedRoute>
          }
        />
        <Route
          path="/planilha"
          element={
            <ProtectedRoute>
              <Planilha />
            </ProtectedRoute>
          }
        />
        <Route
          path="/configuracao"
          element={
            <ProtectedRoute>
              <Configuracao />
            </ProtectedRoute>
          }
        />
        <Route
          path="/unidades/nova"
          element={
            <ProtectedRoute>
              <NovaUnidade />
            </ProtectedRoute>
          }
        />
        <Route
          path="/unidade/:code"
          element={
            <ProtectedRoute>
              <GerenciarUnidade />
            </ProtectedRoute>
          }
        />
        <Route
          path="/missao"
          element={
            <ProtectedRoute requireUnitAdmin>
              <Missao />
            </ProtectedRoute>
          }
        />
        <Route
          path="/missao/nova"
          element={
            <ProtectedRoute requireUnitAdmin>
              <NovaMissao />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}

export default App;