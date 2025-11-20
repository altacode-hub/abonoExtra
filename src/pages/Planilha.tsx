import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { onValue, ref, get } from 'firebase/database';
import { isUnitAdmin } from '../services/rbac';
import * as XLSX from 'xlsx';

interface EfetivoEscalado {
  nome: string;
  dias: string[];
}

interface UnitOption {
  code: string;
  titulo: string;
}

interface SpreadsheetHeader {
  titulo?: string;
  imagemUrl?: string;
  autorizacao?: {
    nome: string;
    cargo: string;
  };
  aprovacao?: {
    nome: string;
    cargo: string;
  };
}

export default function Planilha() {
  const [formData, setFormData] = useState({
    dataInicial: '',
    dataFinal: '',
    unidade: ''
  });

  const [userUnits, setUserUnits] = useState<UnitOption[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [spreadsheetHeader, setSpreadsheetHeader] = useState<SpreadsheetHeader>({});

  // Carregar unidades do usuário admin local
  useEffect(() => {
    const loadUserUnits = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setLoadingUnits(false);
        return;
      }

      try {
        // Verifica se é admin de alguma unidade
        const isAdmin = await isUnitAdmin(uid);
        if (!isAdmin) {
          setLoadingUnits(false);
          return;
        }

        // Busca unidades do usuário
        const userUnitsRef = ref(db, `/users/${uid}/units`);
        const unsub = onValue(userUnitsRef, (snapshot) => {
          const unitsData = snapshot.val() || {};
          const unitsArray: UnitOption[] = Object.entries(unitsData).map(([code, data]: [string, any]) => ({
            code,
            titulo: data.titulo || `Unidade ${code}`
          }));
          setUserUnits(unitsArray);
          setLoadingUnits(false);
        });

        return () => unsub();
      } catch (error) {
        console.error('Erro ao carregar unidades:', error);
        setLoadingUnits(false);
      }
    };

    loadUserUnits();
  }, []);

  useEffect(() => {
    if (!formData.unidade) {
      setSpreadsheetHeader({});
      return;
    }
    const headerRef = ref(db, `/units/${formData.unidade}/settings/spreadsheetHeader`);
    const unsub = onValue(headerRef, (snapshot) => {
      const data = snapshot.val() || {};
      setSpreadsheetHeader(data);
    });
    return () => unsub();
  }, [formData.unidade]);

  const [efetivoEscalado, setEfetivoEscalado] = useState<EfetivoEscalado[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Dados do formulário:', formData);
    
    // Buscar efetivo escalado para a unidade e período selecionados
    if (formData.unidade && formData.dataInicial && formData.dataFinal) {
      buscarEfetivoEscalado();
    }
  };

  const buscarEfetivoEscalado = async () => {
    if (!formData.unidade || !formData.dataInicial || !formData.dataFinal) return;

    try {
      const inicio = new Date(formData.dataInicial);
      const fim = new Date(formData.dataFinal);
      const efetivoMap = new Map<string, string[]>();

      // Buscar escalas para cada mês no período
      let currentDate = new Date(inicio);
      while (currentDate <= fim) {
        const monthKey = currentDate.toISOString().slice(0, 7); // YYYY-MM
        const escalasRef = ref(db, `/units/${formData.unidade}/escalas/${monthKey}`);
        
        const snapshot = await get(escalasRef);
        if (snapshot.exists()) {
          const escalas = snapshot.val();
          
          Object.entries(escalas).forEach(([escalaId, escalaData]: [string, any]) => {
            const escalaDate = new Date(escalaData.inicioTs);
            
            // Verifica se a escala está dentro do período
            if (escalaDate >= inicio && escalaDate <= fim) {
              const diaMes = `${String(escalaDate.getDate()).padStart(2, '0')}/${String(escalaDate.getMonth() + 1).padStart(2, '0')}`;
              
              // Processa efetivo da escala
              if (escalaData.efetivo) {
                Object.entries(escalaData.efetivo).forEach(([uid, efetivo]: [string, any]) => {
                  const nome = efetivo.ng || 'Nome não informado';
                  if (!efetivoMap.has(nome)) {
                    efetivoMap.set(nome, []);
                  }
                  efetivoMap.get(nome)?.push(diaMes);
                });
              }
            }
          });
        }
        
        // Avança para o próximo mês
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      // Converte Map para array e ordena por nome
      const efetivoArray: EfetivoEscalado[] = Array.from(efetivoMap.entries())
        .map(([nome, dias]) => ({
          nome,
          dias: [...new Set(dias)].sort((a, b) => {
            // Ordena por data (DD/MM)
            const [diaA, mesA] = a.split('/').map(Number);
            const [diaB, mesB] = b.split('/').map(Number);
            if (mesA !== mesB) return mesA - mesB;
            return diaA - diaB;
          })
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

      setEfetivoEscalado(efetivoArray);
    } catch (error) {
      console.error('Erro ao buscar efetivo escalado:', error);
      setEfetivoEscalado([]);
    }
  };

  const gerarPlanilhaExcel = async () => {
    if (efetivoEscalado.length === 0) {
      alert('Nenhum dado para gerar planilha');
      return;
    }

    setIsGenerating(true);
    const VALOR_POR_DIA = 204.87;

    try {
      // Criar workbook e worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([]);

      // Configurar largura das colunas
      const colWidths = [
        { wch: 30 }, // Nome
        { wch: 15 }, // CPF
        { wch: 15 }, // Matrícula funcional
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, // Dias 1º-12º
        { wch: 8 }, // Qtd
        { wch: 15 }, // Valor (R$)
      ];
      ws['!cols'] = colWidths;

      // Cabeçalho principal usando dados do banco
      const header1 = [
        'AUTORIZOU:',
        '',
        '',
        '',
        ...Array(12).fill(''),
        '',
        ''
      ];
      
      const header2 = [
        spreadsheetHeader.autorizacao?.nome || 'NOME NÃO CONFIGURADO',
        '',
        '',
        '',
        ...Array(12).fill(''),
        '',
        ''
      ];
      
      const header3 = [
        spreadsheetHeader.autorizacao?.cargo || 'CARGO NÃO CONFIGURADO',
        '',
        '',
        '',
        ...Array(12).fill(''),
        '',
        ''
      ];

      // Cabeçalho da tabela com duas linhas conforme imagem (17 colunas total)
      const headerRow1 = [
        'Nome',
        'CPF',
        'Matrícula\nfuncional',
        'DATAS DAS JORNADAS',
        '', '', '', '', '', '', '', '', '', '', '', '', // 12 colunas vazias para dias
        'Qtd',
        'Valor (R$)'
      ];
      
      const headerRow2 = [
        '', // Nome
        '', // CPF
        '', // Matrícula funcional
        '1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º', '11º', '12º', // Dias
        '', // Qtd na segunda linha (vazio, pois Qtd está na primeira linha)
        ''  // Valor (R$) na segunda linha (vazio, pois Valor está na primeira linha)
      ];

      // Processar dados dos efetivos em grupos de 12 dias
      const allRows: any[][] = [];
      
      efetivoEscalado.forEach(efetivo => {
        const diasTrabalhados = efetivo.dias.length;
        const totalValor = diasTrabalhados * VALOR_POR_DIA;
        
        // Dividir dias em grupos de 12
        for (let i = 0; i < efetivo.dias.length; i += 12) {
          const grupoDias = efetivo.dias.slice(i, i + 12);
          const qtdDias = grupoDias.length;
          const valorGrupo = qtdDias * VALOR_POR_DIA;
          
          const row = Array(17).fill(''); // 3 colunas iniciais + 12 dias + qtd + valor (17 total)
          row[0] = i === 0 ? efetivo.nome : ''; // Nome apenas na primeira linha
          row[1] = ''; // CPF - não temos no momento
          row[2] = ''; // Matrícula funcional - não temos no momento
          
          // Preencher dias do grupo
          grupoDias.forEach((dia, index) => {
            row[3 + index] = dia; // Coluna 4 = dia 1º
          });
          
          row[15] = qtdDias; // Quantidade
          row[16] = valorGrupo.toLocaleString('pt-BR', { 
            style: 'currency', 
            currency: 'BRL' 
          }); // Valor formatado
          
          allRows.push(row);
        }
      });

      // Adicionar linha de total
      const totalDias = efetivoEscalado.reduce((sum, efetivo) => sum + efetivo.dias.length, 0);
      const totalValor = totalDias * VALOR_POR_DIA;
      
      const totalRow = Array(17).fill('');
      totalRow[0] = 'TOTAL';
      totalRow[15] = totalDias;
      totalRow[16] = totalValor.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      });
      allRows.push(totalRow);

      // Combinar todos os dados
      const allData = [
        header1,
        header2,
        header3,
        Array(16).fill(''), // Linha vazia
        // Adicionar seção de aprovação se configurada (17 colunas)
        ...(spreadsheetHeader.aprovacao ? [
          ['APROVO:', '', '', ...Array(12).fill(''), '', '', ''],
          [spreadsheetHeader.aprovacao.nome || 'NOME NÃO CONFIGURADO', '', '', ...Array(12).fill(''), '', '', ''],
          [spreadsheetHeader.aprovacao.cargo || 'CARGO NÃO CONFIGURADO', '', '', ...Array(12).fill(''), '', '', ''],
          Array(17).fill('') // Linha vazia (17 colunas)
        ] : []),
        headerRow1,
        headerRow2,
        ...allRows
      ];

      // Adicionar dados ao worksheet
      XLSX.utils.sheet_add_aoa(ws, allData, { origin: 'A1' });

      // Mesclar células do cabeçalho
      if (!ws['!merges']) ws['!merges'] = [];
      
      // Mesclar células do cabeçalho principal (autorização) - 17 colunas (0-16)
      ws['!merges'].push(
        { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } }, // AUTORIZOU: mesclado
        { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } }, // Nome autorizador mesclado
        { s: { r: 2, c: 0 }, e: { r: 2, c: 16 } }  // Cargo autorizador mesclado
      );

      // Mesclar células da seção de aprovação se existir
      if (spreadsheetHeader.aprovacao) {
        const offset = 4; // Offset devido às linhas adicionais
        ws['!merges'].push(
          { s: { r: 0 + offset, c: 0 }, e: { r: 0 + offset, c: 16 } }, // APROVO: mesclado
          { s: { r: 1 + offset, c: 0 }, e: { r: 1 + offset, c: 16 } }, // Nome aprovador mesclado
          { s: { r: 2 + offset, c: 0 }, e: { r: 2 + offset, c: 16 } }  // Cargo aprovador mesclado
        );
      }

      // Mesclar células do cabeçalho da tabela (estrutura de duas linhas)
      const tableStartRow = spreadsheetHeader.aprovacao ? 8 : 4;
      
      // Mesclar colunas que ocupam duas linhas (Nome, CPF, Matrícula funcional, Qtd, Valor)
      ws['!merges'].push(
        { s: { r: tableStartRow, c: 0 }, e: { r: tableStartRow + 1, c: 0 } }, // Nome
        { s: { r: tableStartRow, c: 1 }, e: { r: tableStartRow + 1, c: 1 } }, // CPF
        { s: { r: tableStartRow, c: 2 }, e: { r: tableStartRow + 1, c: 2 } }, // Matrícula funcional
        { s: { r: tableStartRow, c: 15 }, e: { r: tableStartRow + 1, c: 15 } }, // Qtd
        { s: { r: tableStartRow, c: 16 }, e: { r: tableStartRow + 1, c: 16 } }  // Valor (R$)
      );
      
      // Mesclar "DATAS DAS JORNADAS" que ocupa 12 colunas na primeira linha
      ws['!merges'].push(
        { s: { r: tableStartRow, c: 3 }, e: { r: tableStartRow, c: 14 } } // DATAS DAS JORNADAS
      );

      // Estilos
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      
      // Aplicar fundo amarelo claro e bordas discretas para toda a planilha
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
          if (!ws[cellRef].s) ws[cellRef].s = {};
          ws[cellRef].s.fill = { fgColor: { rgb: 'FFFFE0' } }; // Amarelo claro
          ws[cellRef].s.border = {
            top: { style: 'thin', color: { rgb: 'CCCCCC' } },
            bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
            left: { style: 'thin', color: { rgb: 'CCCCCC' } },
            right: { style: 'thin', color: { rgb: 'CCCCCC' } }
          };
        }
      }
      
      // Aplicar estilos ao cabeçalho principal (autorização e aprovação) - 17 colunas
      const headerEndRow = spreadsheetHeader.aprovacao ? 6 : 2;
      for (let R = 0; R <= headerEndRow; R++) {
        for (let C = 0; C <= 16; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
          ws[cellRef].s = {
            ...ws[cellRef].s,
            font: { bold: true, sz: 12 },
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }
      }

      // Estilo do cabeçalho da tabela (duas linhas) - usar tableStartRow já definido
      
      // Estilo para primeira linha do cabeçalho da tabela - 17 colunas
      for (let C = 0; C <= 16; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: tableStartRow, c: C });
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
        ws[cellRef].s = {
          font: { bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'medium', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        };
      }
      
      // Estilo para segunda linha do cabeçalho da tabela (dias)
      for (let C = 3; C <= 14; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: tableStartRow + 1, c: C });
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
        ws[cellRef].s = {
          font: { bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'medium', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        };
      }
      
      // Adicionar bordas fortes para Qtd e Valor nas duas linhas
      for (let R = tableStartRow; R <= tableStartRow + 1; R++) {
        for (let C = 15; C <= 16; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
          ws[cellRef].s = {
            font: { bold: true },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'medium', color: { rgb: '000000' } },
              bottom: { style: 'medium', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } }
            }
          };
        }
      }

      // Estilo para dados das linhas (azul e sublinhado para nomes)
      const dataStartRow = tableStartRow + 2;
      for (let R = dataStartRow; R <= range.e.r; R++) {
        // Nome (coluna 0) - azul e sublinhado
        const nomeCellRef = XLSX.utils.encode_cell({ r: R, c: 0 });
        if (ws[nomeCellRef] && ws[nomeCellRef].v) {
          ws[nomeCellRef].s = {
            ...ws[nomeCellRef].s,
            font: { color: { rgb: '0000FF' }, underline: true },
            alignment: { horizontal: 'left', vertical: 'center' }
          };
        }
        
        // Demais colunas - centro e preto
        for (let C = 1; C <= 16; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[cellRef]) {
            ws[cellRef].s = {
              ...ws[cellRef].s,
              alignment: { horizontal: 'center', vertical: 'center' }
            };
          }
        }
      }

      // Adicionar worksheet ao workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Efetivo Escalado');

      // Configurar página para paisagem A4
      ws['!pageSetup'] = {
        orientation: 'landscape',
        paperSize: 9, // A4
        margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75 }
      };

      // Gerar arquivo
      const fileName = `Efetivo_Escalado_${formData.unidade}_${formData.dataInicial}_a_${formData.dataFinal}.xlsx`;
      XLSX.writeFile(wb, fileName);

    } catch (error) {
      console.error('Erro ao gerar planilha:', error);
      alert('Erro ao gerar planilha. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Planilha" />
      <div className="px-4 py-4">
        <section className="bg-white border rounded-lg p-6 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-6">Filtros da Planilha</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="dataInicial" className="block text-sm font-medium text-gray-text mb-2">
                  Data Inicial
                </label>
                <input
                  type="date"
                  id="dataInicial"
                  name="dataInicial"
                  value={formData.dataInicial}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="dataFinal" className="block text-sm font-medium text-gray-text mb-2">
                  Data Final
                </label>
                <input
                  type="date"
                  id="dataFinal"
                  name="dataFinal"
                  value={formData.dataFinal}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="unidade" className="block text-sm font-medium text-gray-text mb-2">
                Unidade
              </label>
              <select
                id="unidade"
                name="unidade"
                value={formData.unidade}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={loadingUnits || userUnits.length === 0}
              >
                <option value="">
                  {loadingUnits ? 'Carregando unidades...' : 
                   userUnits.length === 0 ? 'Nenhuma unidade disponível' : 
                   'Selecione uma unidade'}
                </option>
                {userUnits.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.titulo}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Visualizar
              </button>
            </div>
          </form>
        </section>

        {efetivoEscalado.length > 0 && (
          <section className="bg-white border rounded-lg p-6 shadow-card mt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-text">Efetivo Escalado</h3>
              <button
                onClick={gerarPlanilhaExcel}
                disabled={isGenerating}
                className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Gerando...' : 'Gerar Planilha'}
              </button>
            </div>
            <div className="space-y-3">
              {efetivoEscalado.map((efetivo, index) => {
                // Divide os dias em grupos de 12
                const diasPorLinha = 12;
                const linhas = [];
                for (let i = 0; i < efetivo.dias.length; i += diasPorLinha) {
                  linhas.push(efetivo.dias.slice(i, i + diasPorLinha));
                }
                
                return (
                  <div key={index} className="space-y-2">
                    {linhas.map((linhaDias, linhaIndex) => (
                      <div key={linhaIndex} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="font-medium text-gray-text min-w-[150px]">
                          {linhaIndex === 0 ? efetivo.nome : ''}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {linhaDias.map((dia, diaIndex) => (
                            <span
                              key={`${linhaIndex}-${diaIndex}`}
                              className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-md font-medium"
                            >
                              {dia}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}