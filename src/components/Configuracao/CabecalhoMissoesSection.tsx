import React from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving?: boolean;
};

export default function CabecalhoMissoesSection({ value, onChange, onSave, saving }: Props) {
  return (
    <section className="bg-white border rounded-lg p-6 shadow-card">
      <h2 className="text-lg font-semibold text-gray-text mb-2">Cabeçalho — Missões</h2>
      <p className="text-sm text-gray-light mb-4">Defina o título exibido na tela de Missões.</p>

      <label className="flex flex-col gap-1">
        <span className="text-secondary text-sm">Título</span>
        <input
          className="bg-white border rounded px-3 py-2"
          placeholder="Título de Missões"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>

      <div className="flex justify-end mt-4">
        <button
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60"
          onClick={onSave}
          disabled={saving}
        >
          Salvar
        </button>
      </div>
    </section>
  );
}