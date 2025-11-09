import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { strings } from '../i18n/strings';

export default function AuthForms() {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function loginWithGoogle() {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/');
    } catch (err: any) {
      setError(err?.message || 'Erro ao autenticar com Google');
    }
  }

  return (
    <div className="bg-white border rounded-lg shadow-card p-8 w-full max-w-sm flex flex-col gap-5" aria-label="Formulário de autenticação">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-primary text-white mx-auto flex items-center justify-center text-xl font-semibold">AE</div>
        <h2 className="text-xl font-semibold text-gray-text mt-3">{strings.auth.login}</h2>
        <p className="text-sm text-gray-light">Entre com sua conta Google</p>
      </div>
      <button type="button" onClick={loginWithGoogle} className="w-full px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark" aria-label="Entrar com Google">
        Entrar com Google
      </button>
      {error && <div role="alert" className="text-red-600 text-sm text-center">{error}</div>}
    </div>
  );
}