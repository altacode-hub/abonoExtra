import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { onValue, ref, get } from 'firebase/database';
import { isUnitAdmin } from '../services/rbac';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

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

  const gerarPDF = async () => {
    if (efetivoEscalado.length === 0) {
      alert('Nenhum dado para gerar PDF');
      return;
    }

    setIsGeneratingPDF(true);
    
    try {
      // Criar documento PDF
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // Configurações de margens e layout
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 10;
      const marginRight = 10;
      const marginTop = 10;
      const contentWidth = pageWidth - marginLeft - marginRight;
      
      // Largura das colunas do cabeçalho (3 seções)
      const colWidth = contentWidth / 3;
      
      // ===== CABEÇALHO COM 3 COLUNAS =====
      let currentY = marginTop;
      
      // Título principal se existir
      //if (spreadsheetHeader.titulo) {
      //  doc.setFontSize(16);
      //  doc.setFont(undefined, 'bold');
      //  doc.setTextColor(0, 0, 128); // Azul escuro
      //  doc.text(spreadsheetHeader.titulo, pageWidth / 2, currentY, { align: 'center' });
      //  currentY += 10;
      //}
      
      // Altura das caixas do cabeçalho
      const headerBoxHeight = 30;
      
      // Desenhar caixas do cabeçalho
      // Coluna 1 - Autorização (A-F)
      doc.setDrawColor(0, 0, 0); // Borda preta
      doc.setFillColor(255, 255, 255); // Fundo branco
      doc.rect(marginLeft, currentY, colWidth, headerBoxHeight, 'FD');
      
      // Coluna 2 - Brasão/Emblema (G-L)
      doc.setFillColor(255, 255, 224); // Fundo amarelo claro
      doc.rect(marginLeft + colWidth, currentY, colWidth, headerBoxHeight, 'FD');
      
      // Coluna 3 - Aprovação (M-Q)
      doc.setFillColor(255, 255, 255); // Fundo branco
      doc.rect(marginLeft + colWidth * 2, currentY, colWidth, headerBoxHeight, 'FD');
      
      // Adicionar textos do cabeçalho
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      
      // Autorização
      const authTextY = currentY + 5;
      doc.text('AUTORIZO:', marginLeft + colWidth / 2, authTextY, { align: 'center' });
      doc.setFont(undefined, 'normal');
      doc.text('_________________________', marginLeft + colWidth / 2, authTextY + 10, { align: 'center' });
      doc.text(spreadsheetHeader.autorizacao?.nome?.toUpperCase() || 'NOME NÃO CONFIGURADO', marginLeft + colWidth / 2, authTextY + 15, { align: 'center' });
      doc.text(spreadsheetHeader.autorizacao?.cargo || 'CARGO NÃO CONFIGURADO', marginLeft + colWidth / 2, authTextY + 20, { align: 'center' });
      
      // Brasão/Emblema
      doc.setFontSize(10);
      doc.setTextColor(102, 102, 102);
      doc.text('[BRASÃO/EMBLEMA]', marginLeft + colWidth + colWidth / 2, authTextY + 10, { align: 'center' });
      if (spreadsheetHeader.imagemUrl) {
        doc.text('[IMAGEM CONFIGURADA]', marginLeft + colWidth + colWidth / 2, authTextY + 15, { align: 'center' });
      }
      
      // Aprovação
      if (spreadsheetHeader.aprovacao) {
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('APROVO:', marginLeft + colWidth * 2 + colWidth / 2, authTextY, { align: 'center' });
        doc.setFont(undefined, 'normal');
        doc.text('_________________________', marginLeft + colWidth * 2 + colWidth / 2, authTextY + 10, { align: 'center' });
        doc.text(spreadsheetHeader.aprovacao.nome?.toUpperCase() || 'NOME NÃO CONFIGURADO', marginLeft + colWidth * 2 + colWidth / 2, authTextY + 15, { align: 'center' });
        doc.text(spreadsheetHeader.aprovacao.cargo || 'CARGO NÃO CONFIGURADO', marginLeft + colWidth * 2 + colWidth / 2, authTextY + 20, { align: 'center' });
      }
      
      currentY += headerBoxHeight + 0;

      // Desenhar caixas do Mês e Periodo
      doc.setFillColor(255, 250, 205); // Amarelo claro
      doc.rect(marginLeft, currentY, contentWidth, 13, 'FD');
      
      // Mês
      // Opções para formatar como MM/YYYY
      const optionsMes: Intl.DateTimeFormatOptions = {
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC' // Define o fuso horário como UTC
      };
      const periodoMes = new Intl.DateTimeFormat('pt-BR', optionsMes).format(new Date(formData.dataInicial));
      const periodoMesTexto = `Mês: ${periodoMes}`;
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(128, 0, 0); // Vermelho escuro
      doc.text(periodoMesTexto, pageWidth - marginRight - 5, currentY + 5, { align: 'right' });
      
      currentY += 5;
      // Período
      // Opções para formatar como DD/MM/YYYY
      const options: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC' // Define o fuso horário como UTC
      };
      const periodoInicio = new Intl.DateTimeFormat('pt-BR', options).format(new Date(formData.dataInicial));
      const periodoFinal = new Intl.DateTimeFormat('pt-BR', options).format(new Date(formData.dataFinal));
      const periodoTexto = `Período: ${periodoInicio} a ${periodoFinal}`;
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(128, 0, 0); // Vermelho escuro
      doc.text(periodoTexto, pageWidth - marginRight - 5, currentY + 5, { align: 'right' });
      
      currentY += 8;
      
      // ===== TABELA COM DADOS =====
      const tableData = [];
      const VALOR_POR_DIA = 204.87;
      
      // Processar dados para a tabela
      efetivoEscalado.forEach(efetivo => {
        const diasTrabalhados = efetivo.dias.length;
        const totalValor = diasTrabalhados * VALOR_POR_DIA;
        
        // Dividir dias em grupos de 12
        for (let i = 0; i < efetivo.dias.length; i += 12) {
          const grupoDias = efetivo.dias.slice(i, i + 12);
          const qtdDias = grupoDias.length;
          const valorGrupo = qtdDias * VALOR_POR_DIA;
          
          const row = [];
          row.push(i === 0 ? efetivo.nome : ''); // Nome apenas na primeira linha
          row.push(''); // CPF - não temos no momento
          row.push(''); // Matrícula funcional - não temos no momento
          
          // Adicionar dias do grupo (máximo 12)
          for (let j = 0; j < 12; j++) {
            row.push(j < grupoDias.length ? grupoDias[j] : '');
          }
          
          row.push(qtdDias); // Quantidade
          row.push(''); // HS - não temos no momento
          row.push(valorGrupo.toLocaleString('pt-BR', { 
            style: 'currency', 
            currency: 'BRL' 
          })); // Valor formatado
          
          tableData.push(row);
        }
      });
      
      // Adicionar linha de total
      const totalDias = efetivoEscalado.reduce((sum, efetivo) => sum + efetivo.dias.length, 0);
      const totalValor = totalDias * VALOR_POR_DIA;
      
      const totalRow = [];
      totalRow.push('TOTAL');
      totalRow.push('');
      totalRow.push('');
      for (let i = 0; i < 12; i++) {
        totalRow.push('');
      }
      totalRow.push(totalDias);
      totalRow.push('');
      totalRow.push(totalValor.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      }));
      
      tableData.push(totalRow);
      
      // Cabeçalho da tabela
      const headers = [
        'Nome',
        'CPF',
        'Matrícula\nFuncional',
        '1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º', '11º', '12º',
        'Qde',
        'HS',
        'Valor (R$)'
      ];
      
      // Configurações da tabela
      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: currentY + 5,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 2,
          fillColor: [240, 255, 240], // Verde claro
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [200, 230, 200], // Verde mais escuro para cabeçalho
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold' }, // Nome
          1: { halign: 'center' }, // CPF
          2: { halign: 'center' }, // Matrícula
          3: { halign: 'center' }, // 1º
          4: { halign: 'center' }, // 2º
          5: { halign: 'center' }, // 3º
          6: { halign: 'center' }, // 4º
          7: { halign: 'center' }, // 5º
          8: { halign: 'center' }, // 6º
          9: { halign: 'center' }, // 7º
          10: { halign: 'center' }, // 8º
          11: { halign: 'center' }, // 9º
          12: { halign: 'center' }, // 10º
          13: { halign: 'center' }, // 11º
          14: { halign: 'center' }, // 12º
          15: { halign: 'center', fontStyle: 'bold' }, // Qde
          16: { halign: 'center' }, // HS
          17: { halign: 'right', fontStyle: 'bold' } // Valor
        },
        alternateRowStyles: {
          fillColor: [248, 255, 248] // Verde ainda mais claro para linhas alternadas
        }
      });
      
      // Pegar posição Y após a tabela
      const finalY = (doc as any).lastAutoTable.finalY || currentY + 50;
      
      // ===== RODAPÉ COM ASSINATURAS =====
      const footerY = finalY + 15;
      const footerBoxHeight = 20;
      
      // Caixa da esquerda - Diretor da Escola
      doc.setFillColor(255, 255, 255);
      doc.rect(marginLeft, footerY, colWidth, footerBoxHeight, 'FD');
      
      // Caixa da direita - Coordenadora
      doc.rect(marginLeft + colWidth * 2, footerY, colWidth, footerBoxHeight, 'FD');
      
      // Adicionar textos do rodapé
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(0, 0, 0);
      
      // Assinatura esquerda
      const footerTextY = footerY + 5;
      doc.text('PAULO DAMASCENO COSTA', marginLeft + colWidth / 2, footerTextY, { align: 'center' });
      doc.text('DIRETOR DA ESCOLA', marginLeft + colWidth / 2, footerTextY + 5, { align: 'center' });
      doc.text('PROFª RAIMUNDA MOTA', marginLeft + colWidth / 2, footerTextY + 10, { align: 'center' });
      
      // Assinatura direita
      doc.text('ELIZABETE LIMA SOARES - CAP', marginLeft + colWidth * 2 + colWidth / 2, footerTextY, { align: 'center' });
      doc.text('COORDENADORA DA SME', marginLeft + colWidth * 2 + colWidth / 2, footerTextY + 5, { align: 'center' });
      doc.text('PROFª RAIMUNDA MOTA', marginLeft + colWidth * 2 + colWidth / 2, footerTextY + 10, { align: 'center' });
      
      // Informações adicionais
      const infoY = footerY + footerBoxHeight + 10;
      doc.setFontSize(9);
      doc.text(`Planilha gerada em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, marginLeft, infoY);
      doc.text(`Unidade: ${userUnits.find(u => u.code === formData.unidade)?.titulo || formData.unidade}`, marginLeft, infoY + 5);
      doc.text(`Total de servidores: ${efetivoEscalado.length}`, marginLeft, infoY + 10);
      doc.text(`Total de dias trabalhados: ${totalDias}`, marginLeft, infoY + 15);
      doc.text(`Valor total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, marginLeft, infoY + 20);
      
      // Número da página
      doc.setFontSize(8);
      doc.text('PÁG 1 DE 1', pageWidth - marginRight, pageHeight - 10, { align: 'right' });
      
      // Gerar e salvar o PDF
      const fileName = `Efetivo_Escalado_${formData.unidade}_${formData.dataInicial}_a_${formData.dataFinal}.pdf`;
      doc.save(fileName);
      
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsGeneratingPDF(false);
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

      // ===== CABEÇALHO DA PLANILHA COM 3 COLUNAS =====
      const headerRows: any[][] = [];
      
      // Configurar largura das colunas para o cabeçalho (3 seções: A-F, G-L, M-Q)
      const headerColWidths = [
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, // Colunas A-F (Autorização)
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, // Colunas G-L (Brasão)
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }  // Colunas M-Q (Aprovação)
      ];
      ws['!cols'] = headerColWidths;

      // Linha 1: Título principal (mesclado se existir)
      if (spreadsheetHeader.titulo) {
        headerRows.push(Array(17).fill(''));
        headerRows.push(Array(17).fill(''));
        headerRows[0][0] = spreadsheetHeader.titulo;
      }

      // Linhas do cabeçalho três colunas (Autorização | Brasão | Aprovação)
      const linhasAutorizacao = 4;
      const linhasAprovacao = 4;
      
      for (let i = 0; i < Math.max(linhasAutorizacao, linhasAprovacao); i++) {
        const row = Array(17).fill('');
        
        // Coluna da Esquerda - Autorização (A-F)
        if (i === 0) {
          row[0] = 'AUTORIZO:'; // A1
        } else if (i === 1) {
          row[0] = '_________________________'; // Linha para assinatura
        } else if (i === 2) {
          row[0] = spreadsheetHeader.autorizacao?.nome?.toUpperCase() || 'NOME NÃO CONFIGURADO';
        } else if (i === 3) {
          row[0] = spreadsheetHeader.autorizacao?.cargo || 'CARGO NÃO CONFIGURADO';
        }
        
        // Coluna do Centro - Brasão/Emblema (G-L)
        if (i === 1) {
          row[6] = '[BRASÃO/EMBLEMA]'; // Espaço reservado para o brasão
        } else if (i === 2 && spreadsheetHeader.imagemUrl) {
          row[6] = '[IMAGEM CONFIGURADA]'; // Indica que há imagem configurada
        }
        
        // Coluna da Direita - Aprovação (M-Q)
        if (spreadsheetHeader.aprovacao) {
          if (i === 0) {
            row[12] = 'APROVO:'; // M1
          } else if (i === 1) {
            row[12] = '_________________________'; // Linha para assinatura
          } else if (i === 2) {
            row[12] = spreadsheetHeader.aprovacao.nome?.toUpperCase() || 'NOME NÃO CONFIGURADO';
          } else if (i === 3) {
            row[12] = spreadsheetHeader.aprovacao.cargo || 'CARGO NÃO CONFIGURADO';
          }
        }
        
        headerRows.push(row);
      }

      // Linha vazia após o cabeçalho
      headerRows.push(Array(17).fill(''));
      
      // Linha do período (mesclada)
      const periodoTexto = `Período: ${formData.dataInicial} a ${formData.dataFinal}`;
      const periodoRowData = Array(17).fill('');
      periodoRowData[0] = periodoTexto;
      headerRows.push(periodoRowData);
      
      // Linha vazia antes da tabela
      headerRows.push(Array(17).fill(''));

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

      // ===== RODAPÉ DA PLANILHA =====
      const footerRows: any[][] = [];
      footerRows.push(['']); // Linha vazia antes do rodapé
      
      // Informações adicionais no rodapé
      const dataGeracao = new Date().toLocaleDateString('pt-BR');
      const horaGeracao = new Date().toLocaleTimeString('pt-BR');
      
      footerRows.push([`Planilha gerada em ${dataGeracao} às ${horaGeracao}`]);
      footerRows.push([`Unidade: ${userUnits.find(u => u.code === formData.unidade)?.titulo || formData.unidade}`]);
      footerRows.push([`Total de servidores: ${efetivoEscalado.length}`]);
      footerRows.push([`Total de dias trabalhados: ${totalDias}`]);
      footerRows.push([`Valor total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`]);

      // Combinar todos os dados: Cabeçalho + Tabela + Rodapé
      const allData = [
        ...headerRows,
        headerRow1,
        headerRow2,
        ...allRows,
        ...footerRows
      ];

      // Adicionar dados ao worksheet
      XLSX.utils.sheet_add_aoa(ws, allData, { origin: 'A1' });

      // ===== CONFIGURAÇÃO DE MESCLAGEM DE CÉLULAS PARA 3 COLUNAS =====
      if (!ws['!merges']) ws['!merges'] = [];
      
      const ultimaLinhaHeader = headerRows.length - 1;
      const linhaPeriodo = ultimaLinhaHeader - 1;
      
      // Mesclar células do título principal (se existir) - ocupa todas as colunas
      if (spreadsheetHeader.titulo) {
        ws['!merges'].push(
          { s: { r: 0, c: 0 }, e: { r: 1, c: 16 } } // Título mesclado (2 linhas)
        );
      }
      
      // Mesclar seções do cabeçalho em 3 colunas
      const offsetTitulo = spreadsheetHeader.titulo ? 2 : 0;
      
      // Seção Autorização (colunas A-F)
      for (let i = 0; i < 4; i++) {
        ws['!merges'].push(
          { s: { r: offsetTitulo + i, c: 0 }, e: { r: offsetTitulo + i, c: 5 } } // A-F
        );
      }
      
      // Seção Brasão/Emblema (colunas G-L) - espaço reservado
      for (let i = 0; i < 4; i++) {
        ws['!merges'].push(
          { s: { r: offsetTitulo + i, c: 6 }, e: { r: offsetTitulo + i, c: 11 } } // G-L
        );
      }
      
      // Seção Aprovação (colunas M-Q)
      if (spreadsheetHeader.aprovacao) {
        for (let i = 0; i < 4; i++) {
          ws['!merges'].push(
            { s: { r: offsetTitulo + i, c: 12 }, e: { r: offsetTitulo + i, c: 16 } } // M-Q
          );
        }
      }
      
      // Mesclar período
      ws['!merges'].push(
        { s: { r: linhaPeriodo, c: 0 }, e: { r: linhaPeriodo, c: 16 } }
      );

      // Mesclar células do cabeçalho da tabela (estrutura de duas linhas)
      const tableStartRow = ultimaLinhaHeader + 1;
      
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

      // Mesclar rodapé (todas as linhas do rodapé)
      const footerStartRow = tableStartRow + allRows.length + 2; // +2 por causa das 2 linhas do cabeçalho da tabela
      for (let i = 0; i < footerRows.length; i++) {
        ws['!merges'].push(
          { s: { r: footerStartRow + i, c: 0 }, e: { r: footerStartRow + i, c: 16 } }
        );
      }

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
      
      // ===== ESTILOS =====
      
      // ===== ESTILOS PARA O LAYOUT COM 3 COLUNAS =====
      
      // Estilos do cabeçalho
      const tituloRow = 0;
      const headerStartRow = spreadsheetHeader.titulo ? 2 : 0;
      const periodoRow = headerStartRow + 5; // 4 linhas de cabeçalho + 1 linha vazia
      
      // Estilo do título
      if (spreadsheetHeader.titulo) {
        const tituloCell = XLSX.utils.encode_cell({ r: tituloRow, c: 0 });
        if (ws[tituloCell]) {
          ws[tituloCell].s = {
            ...ws[tituloCell].s,
            font: { bold: true, sz: 16, color: { rgb: '000080' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            fill: { fgColor: { rgb: 'E6F3FF' } }
          };
        }
      }
      
      // Estilo das 3 colunas do cabeçalho
      for (let R = headerStartRow; R < headerStartRow + 4; R++) {
        // Coluna da Esquerda - Autorização (A-F) - Fundo branco
        for (let C = 0; C <= 5; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[cellRef] && ws[cellRef].v) {
            ws[cellRef].s = {
              ...ws[cellRef].s,
              font: { 
                bold: R === headerStartRow ? true : false, 
                sz: 11, 
                color: { rgb: '000000' } 
              },
              alignment: { horizontal: 'center', vertical: 'center' },
              fill: { fgColor: { rgb: 'FFFFFF' } } // Fundo branco
            };
          }
        }
        
        // Coluna do Centro - Brasão (G-L) - Fundo amarelo claro
        for (let C = 6; C <= 11; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[cellRef] && ws[cellRef].v) {
            ws[cellRef].s = {
              ...ws[cellRef].s,
              font: { sz: 10, color: { rgb: '666666' } },
              alignment: { horizontal: 'center', vertical: 'center' },
              fill: { fgColor: { rgb: 'FFFFE0' } } // Fundo amarelo claro
            };
          }
        }
        
        // Coluna da Direita - Aprovação (M-Q) - Fundo branco
        if (spreadsheetHeader.aprovacao) {
          for (let C = 12; C <= 16; C++) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (ws[cellRef] && ws[cellRef].v) {
              ws[cellRef].s = {
                ...ws[cellRef].s,
                font: { 
                  bold: R === headerStartRow ? true : false, 
                  sz: 11, 
                  color: { rgb: '000000' } 
                },
                alignment: { horizontal: 'center', vertical: 'center' },
                fill: { fgColor: { rgb: 'FFFFFF' } } // Fundo branco
              };
            }
          }
        }
      }
      
      // Estilo da linha de período
      const periodoRowIndex = headerStartRow + 5; // 4 linhas de cabeçalho + 1 linha vazia
      for (let C = 0; C <= 16; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: periodoRowIndex, c: C });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            ...ws[cellRef].s,
            font: { bold: true, sz: 11, color: { rgb: '800000' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            fill: { fgColor: { rgb: 'FFFACD' } }
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
      for (let R = dataStartRow; R < footerStartRow; R++) {
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

      // Estilo do rodapé
      for (let R = footerStartRow; R <= range.e.r; R++) {
        for (let C = 0; C <= 16; C++) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[cellRef]) {
            ws[cellRef].s = {
              ...ws[cellRef].s,
              font: { sz: 10, color: { rgb: '555555' } },
              alignment: { horizontal: 'left', vertical: 'center' },
              fill: { fgColor: { rgb: 'F8F8F8' } },
              border: {
                top: { style: 'thin', color: { rgb: 'DDDDDD' } },
                bottom: { style: 'thin', color: { rgb: 'DDDDDD' } },
                left: { style: 'none' },
                right: { style: 'none' }
              }
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
              <div className="flex gap-3">
                <button
                  onClick={gerarPDF}
                  disabled={isGeneratingPDF}
                  className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingPDF ? 'Gerando PDF...' : 'Gerar PDF'}
                </button>
                <button
                  onClick={gerarPlanilhaExcel}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? 'Gerando...' : 'Gerar Planilha'}
                </button>
              </div>
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