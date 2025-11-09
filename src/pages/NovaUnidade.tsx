import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { createUnitForCurrentUser } from '../services/rbac';
import { useNavigate } from 'react-router-dom';

export default function NovaUnidade() {
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [cidade, setCidade] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSave = titulo.trim().length > 0 && cidade.trim().length > 0;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    try {
      const meta = { titulo: titulo.trim(), descricao: descricao.trim(), cidade: cidade.trim() };
      const { code } = await createUnitForCurrentUser(meta);
      setMessage(`Unidade criada com código ${code}`);
      // após criar, volta para Configuração para permitir seleção e gerenciamento
      navigate('/configuracao');
    } catch (e: any) {
      setMessage(e?.message || 'Falha ao criar unidade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Nova Unidade" />
      <div className="px-4 py-4 flex justify-center">
        <div className="bg-white border rounded-lg p-6 w-full max-w-xl shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-4">Cadastrar nova unidade</h2>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Título</span>
              <input className="bg-white border rounded px-3 py-2" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Descrição</span>
              <textarea className="bg-white border rounded px-3 py-2" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Cidade</span>
              <input className="bg-white border rounded px-3 py-2" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </label>
          </div>
          {message && <div className="text-sm mt-3">{message}</div>}
          <div className="flex justify-end mt-4">
            <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60" onClick={submit} disabled={saving || !canSave}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}