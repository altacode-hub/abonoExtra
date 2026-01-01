import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'

export default function PlanilhaEfetivo() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state || {}) as any
  const efetivo = state?.efetivo || {}
  const unidade = state?.unidade || ''
  const periodo = state?.periodo || {}
  const totalJornadas = state?.totalJornadas as number | undefined
  const uniqueDaysCount = state?.uniqueDaysCount as number | undefined
  const jornadas = Array.isArray(state?.jornadas)
    ? (state?.jornadas as Array<{ dia: string; escalaId?: string; referencia?: string; local?: string }>)
    : (Array.isArray((efetivo as any)?.jornadas) ? ((efetivo as any).jornadas as Array<{ dia: string; escalaId?: string; referencia?: string; local?: string }>) : [])
  const nome = (efetivo.nomeCompleto || efetivo.nome || 'Nome não informado') as string
  const cpf = (efetivo.cpf || '') as string
  const mf = (efetivo.matriculaFuncional || '') as string
  const dias: string[] = Array.isArray(efetivo.dias) ? efetivo.dias : []

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Efetivo - Detalhes" />
      <div className="px-4 py-4">
        <section className="bg-white border rounded-lg p-6 shadow-card">
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="text-lg font-semibold text-gray-text">{nome}</div>
              <div className="text-sm text-gray-600">CPF: {cpf || '—'} • MF: {mf || '—'}</div>
              <div className="text-xs text-gray-500 mt-1">Unidade: {unidade || '—'} • Período: {periodo?.inicio || '—'} a {periodo?.fim || '—'}</div>
            </div>
            <button onClick={() => navigate(-1)} className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Voltar</button>
          </div>
          <div className="mt-2">
            <div className="text-sm text-gray-text mb-1">Jornadas extras ({typeof totalJornadas === 'number' ? totalJornadas : dias.length})</div>
            {typeof uniqueDaysCount === 'number' && <div className="text-xs text-gray-500 mb-2">Dias distintos ({uniqueDaysCount})</div>}
            {jornadas.length > 0 ? (
              <ul className="divide-y">
                {jornadas.map((j, i) => (
                  <li key={i} className="py-2 flex items-center justify-between">
                    <div className="font-medium text-gray-text">{j.dia}</div>
                    <div className="text-xs text-gray-500">{j.escalaId || j.referencia || '—'}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dias.map((d, i) => (
                  <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-md font-medium">{d}</span>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
