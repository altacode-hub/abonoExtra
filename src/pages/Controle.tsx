import PageHeader from '../components/PageHeader';

export default function Controle() {
  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Controle" />
      <div className="px-4 py-4">
        <section className="bg-white border rounded-lg p-6 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-2">Painel de Controle</h2>
          <p className="text-sm text-gray-light">Tela placeholder usando a paleta da Home.</p>
        </section>
      </div>
    </div>
  );
}