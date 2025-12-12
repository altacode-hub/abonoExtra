import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db, storage } from "../../services/firebase";
import { ref, get, set } from "firebase/database";
import { ref as storageRef, deleteObject } from "firebase/storage";

export default function CabecalhoMissoesSection() {
  const navigate = useNavigate();
  const [adminUnits, setAdminUnits] = useState<{ code: string; titulo: string }[]>([]);
  const [headersByUnit, setHeadersByUnit] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleNavigateToHeaderForm = () => {
    navigate("/configuracao/cabecalho-missoes");
  };

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    (async () => {
      try {
        const adminSnap = await get(ref(db, `/roles/${uid}/unitAdmin`));
        const adminMap = adminSnap.val() || {};
        const codes: string[] = Object.keys(adminMap);
        const metas = await Promise.all(
          codes.map(async (code) => {
            const metaSnap = await get(ref(db, `/units/${code}/meta`));
            const meta = metaSnap.val() || {};
            return { code, titulo: meta.titulo || `Unidade ${code}` };
          })
        );
        setAdminUnits(metas);
        const headersEntries = await Promise.all(
          codes.map(async (code) => {
            const headerSnap = await get(ref(db, `/units/${code}/settings/missionsHeader`));
            return [code, headerSnap.val() || null] as const;
          })
        );
        setHeadersByUnit(Object.fromEntries(headersEntries));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDeleteHeader = async (unitCode: string) => {
    const header = headersByUnit[unitCode];
    setDeleting(unitCode);
    try {
      const urls: string[] = [header?.leftImageUrl, header?.rightImageUrl].filter(Boolean);
      for (const url of urls) {
        if (typeof url === "string" && (url.startsWith("http") || url.startsWith("gs://"))) {
          const sref = storageRef(storage, url);
          try { await deleteObject(sref); } catch {}
        }
      }
      await set(ref(db, `/units/${unitCode}/settings/missionsHeader`), null);
      setHeadersByUnit((prev) => ({ ...prev, [unitCode]: null }));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="bg-white border rounded-lg p-6 shadow-card">
      <h2 className="text-lg font-semibold text-gray-text mb-2">Cabeçalho — Missões</h2>
      <p className="text-sm text-gray-light mb-4">Gerencie o cabeçalho com duas imagens e texto central.</p>

      <div className="flex justify-end mt-4">
        <button
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60 flex items-center gap-2"
          onClick={handleNavigateToHeaderForm}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Adicionar Cabeçalho
        </button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="text-sm text-gray-light">Carregando…</div>
        ) : (
          <ul className="divide-y">
            {adminUnits.map((u) => {
              const h = headersByUnit[u.code];
              const has = !!h;
              return (
                <li key={u.code} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{u.titulo}</div>
                    <div className="text-sm text-gray-light">{has ? "Cabeçalho cadastrado" : "Sem cabeçalho"}</div>
                  </div>
                  <div className="flex gap-2">
                    {has && (
                      <button
                        className="p-2 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600 disabled:opacity-60"
                        onClick={() => handleDeleteHeader(u.code)}
                        disabled={deleting === u.code}
                        aria-label="Excluir cabeçalho"
                        title="Excluir cabeçalho"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m1 0-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7m5 4v6m4-6v6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {adminUnits.length === 0 && (
              <li className="py-3 text-sm text-gray-light">Sem unidades administradas.</li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
