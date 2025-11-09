import React from "react";
import type { UnitMeta } from "../../services/rbac";

type Props = {
  userUnits: Record<string, UnitMeta> | null;
  onManageUnit: (code: string) => void;
  onCreateNewUnit: () => void;
};

export default function MinhasUnidadesSection({ userUnits, onManageUnit, onCreateNewUnit }: Props) {
  return (
    <section className="bg-white border rounded-lg p-6 shadow-card relative pb-16">
      <h2 className="text-lg font-semibold text-gray-text mb-2">Minhas Unidades</h2>
      <p className="text-sm text-gray-light mb-4">
        Selecione uma unidade para gerenciar seus dados. Uma unidade pode ter vários Admin Unidade.
      </p>

      <ul className="divide-y">
        {userUnits && Object.entries(userUnits).length > 0 ? (
          Object.entries(userUnits).map(([code, meta]) => (
            <li
              key={code}
              className="py-3 text-gray-text flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => onManageUnit(code)}
            >
              <div>
                <div className="font-medium">{meta?.titulo || code}</div>
                {meta?.cidade && <div className="text-sm text-gray-light">{meta.cidade}</div>}
              </div>
              <svg className="w-5 h-5 text-gray-light" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </li>
          ))
        ) : (
          <li className="py-3 text-gray-light">Você ainda não possui unidades vinculadas.</li>
        )}
      </ul>
      <button
        aria-label="Cadastrar nova unidade"
        title="Cadastrar nova unidade"
        className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-dark"
        onClick={onCreateNewUnit}
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </section>
  );
}