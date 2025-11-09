import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { authorizeUser, RoleKey, ensureSeedGeneralAdmin } from '../services/rbac';
import { seedUnitsMeta } from '../services/seed';

export default function Autorizacoes() {
  const [targetUid, setTargetUid] = useState('');
  const [role, setRole] = useState<RoleKey>('unitMember');
  const [unitCode, setUnitCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    // garante seed do Admin Geral quando ele está autenticado
    ensureSeedGeneralAdmin().catch(() => {});
  }, []);

  const submit = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await authorizeUser(targetUid.trim(), role, unitCode.trim() || undefined);
      setMessage('Autorização aplicada com sucesso');
      setTargetUid('');
      if (role !== 'generalAdmin') setUnitCode('');
    } catch (e: any) {
      setMessage(e?.message || 'Falha ao autorizar');
    } finally {
      setSaving(false);
    }
  };

  const runSeed = async () => {
    setSeeding(true);
    setMessage(null);
    try {
      await seedUnitsMeta();
      setMessage('Seed de unidades aplicado com sucesso');
    } catch (e: any) {
      setMessage(e?.message || 'Falha ao aplicar seed');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Autorizações" />
      <div className="px-4 py-4 flex justify-center">
        <div className="bg-white border rounded-lg p-6 w-full max-w-xl shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-4">Conceder papéis</h2>
          <label className="flex flex-col gap-1 mb-3">
            <span className="text-secondary text-sm">UID do usuário</span>
            <input className="bg-white border rounded px-3 py-2" value={targetUid} onChange={(e) => setTargetUid(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 mb-3">
            <span className="text-secondary text-sm">Papel</span>
            <select className="bg-white border rounded px-3 py-2" value={role} onChange={(e) => setRole(e.target.value as RoleKey)}>
              <option value="generalAdmin">Admin Geral</option>
              <option value="unitAdmin">Admin Unidade</option>
              <option value="unitMember">Membro Unidade</option>
            </select>
          </label>
          {role !== 'generalAdmin' && (
            <label className="flex flex-col gap-1 mb-3">
              <span className="text-secondary text-sm">Código da unidade</span>
              <input className="bg-white border rounded px-3 py-2" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} />
            </label>
          )}

          {message && <div className="text-sm mb-3">{message}</div>}
          <div className="flex justify-end">
            <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60" onClick={submit} disabled={saving || !targetUid || (role !== 'generalAdmin' && !unitCode)}>
              {saving ? 'Salvando...' : 'Autorizar'}
            </button>
          </div>
          <hr className="my-4" />
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Seed de unidades</div>
              <div className="text-sm text-gray-light">Popula 3 unidades em units/{'{'}KEY{'}'}/meta</div>
            </div>
            <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60" onClick={runSeed} disabled={seeding}>
              {seeding ? 'Aplicando...' : 'Aplicar seed'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}