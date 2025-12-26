import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { onValue, ref, get } from 'firebase/database';
import { isUnitAdmin } from '../services/rbac';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getStorage, ref as storageRef, getDownloadURL, getBytes, getMetadata } from 'firebase/storage';
import { borderBottomStyle, borderLeftStyle } from 'html2canvas/dist/types/css/property-descriptors/border-style';

interface EfetivoEscalado {
  nome: string;
  nomeCompleto?: string;
  cpf?: string;
  matriculaFuncional?: string;
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

interface MissionsHeader {
  leftImageUrl?: string;
  rightImageUrl?: string;
  centerLines?: string[];
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
  const [missionsHeader, setMissionsHeader] = useState<MissionsHeader>({});

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
      setMissionsHeader({});
      return;
    }
    const headerRef = ref(db, `/units/${formData.unidade}/settings/spreadsheetHeader`);
    const unsub = onValue(headerRef, (snapshot) => {
      const data = snapshot.val() || {};
      setSpreadsheetHeader(data);
    });
    const missionsRef = ref(db, `/units/${formData.unidade}/settings/missionsHeader`);
    const unsub2 = onValue(missionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setMissionsHeader(data);
    });
    return () => { unsub(); unsub2(); };
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
      const efetivoMap = new Map<string, { nomeCompleto?: string; cpf?: string; matriculaFuncional?: string; dias: string[] }>();

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
                  const existing = efetivoMap.get(nome) || { dias: [] };
                  
                  // Atualiza ou cria novo registro com dados completos
                  if (!efetivoMap.has(nome)) {
                    efetivoMap.set(nome, {
                      nomeCompleto: efetivo.nomeCompleto || '',
                      cpf: efetivo.cpf || '',
                      matriculaFuncional: efetivo.matriculaFuncional || '',
                      dias: []
                    });
                  }
                  
                  efetivoMap.get(nome)?.dias.push(diaMes);
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
        .map(([nome, dados]) => ({
          nome,
          nomeCompleto: dados.nomeCompleto,
          cpf: dados.cpf,
          matriculaFuncional: dados.matriculaFuncional,
          dias: [...new Set(dados.dias)].sort((a, b) => {
            // Ordena por data (DD/MM)
            const [diaA, mesA] = a.split('/').map(Number);
            const [diaB, mesB] = b.split('/').map(Number);
            if (mesA !== mesB) return mesA - mesB;
            return diaA - diaB;
          })
        }))
        .sort((a, b) => {
          const an = (a.nomeCompleto || a.nome || '').toString();
          const bn = (b.nomeCompleto || b.nome || '').toString();
          return an.localeCompare(bn, 'pt-BR', { sensitivity: 'base' });
        });

      setEfetivoEscalado(efetivoArray);
    } catch (error) {
      console.error('Erro ao buscar efetivo escalado:', error);
      setEfetivoEscalado([]);
    }
  };

  // Função auxiliar para desenhar o cabeçalho em cada página
  const drawHeader = (doc: jsPDF, pageWidth: number, marginLeft: number, marginRight: number, marginTop: number, currentPage: number, totalPages: number, headerImage?: { imgEl?: HTMLImageElement; dataUrl?: string; format: 'PNG' | 'JPEG' }) => {
    const contentWidth = pageWidth - marginLeft - marginRight;
    const colWidth = contentWidth / 3;
    let currentY = marginTop;
    
    // Altura das caixas do cabeçalho
    const headerBoxHeight = 30;
    
    // Desenhar caixas do cabeçalho
    // Coluna 1 - Autorização (A-F)
    doc.setDrawColor(0, 0, 0); // Borda preta
    doc.setFillColor(255, 255, 255); // Fundo branco
    doc.rect(marginLeft, currentY, colWidth, headerBoxHeight, 'FD');
    
    // Coluna 2 - Brasão/Emblema (G-L)
    doc.setFillColor(255, 255, 255); // Fundo branco
    doc.rect(marginLeft + colWidth, currentY, colWidth, headerBoxHeight, 'FD');
    
    // Coluna 3 - Aprovação (M-Q)
    doc.setFillColor(255, 255, 255); // Fundo branco
    doc.rect(marginLeft + colWidth * 2, currentY, colWidth, headerBoxHeight, 'FD');
    
    // Adicionar textos do cabeçalho
    // Coluna 1 - Autorização
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text('AUTORIZO:', marginLeft + colWidth/2, currentY + 5, { align: 'center' });
    doc.text('________________________________', marginLeft + colWidth/2, currentY + 17, { align: 'center' });
    doc.text(spreadsheetHeader.autorizacao?.nome?.toUpperCase() || 'NOME NÃO CONFIGURADO', marginLeft + colWidth/2, currentY + 22, { align: 'center' });
    doc.setFont(undefined, 'normal');
    doc.text(spreadsheetHeader.autorizacao?.cargo || 'CARGO NÃO CONFIGURADO', marginLeft + colWidth/2, currentY + 28, { align: 'center' });
    
    if (headerImage?.imgEl || headerImage?.dataUrl) {
      const imgW = 22;
      const imgH = 22;
      const imgX = marginLeft + colWidth + (colWidth - imgW) / 2;
      const imgY = currentY + (headerBoxHeight - imgH) / 2;
      console.log('[PDF] drawHeader: adicionando imagem', { fonte: headerImage.imgEl ? 'imgEl' : 'dataUrl', format: headerImage.format, pos: { imgX, imgY, imgW, imgH } });
      doc.addImage((headerImage.imgEl ?? headerImage.dataUrl) as any, headerImage.format, imgX, imgY, imgW, imgH);
    } else {
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('[BRASÃO/EMBLEMA]', marginLeft + colWidth + colWidth/2, currentY + 15, { align: 'center' });
    }
    
    // Coluna 3 - Aprovação
    if (spreadsheetHeader.aprovacao) {
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.text('APROVO:', marginLeft + colWidth * 2 + colWidth/2, currentY + 5, { align: 'center' });
      doc.text('_________________________', marginLeft + colWidth * 2 + colWidth/2, currentY + 17, { align: 'center' });
      doc.text(spreadsheetHeader.aprovacao.nome?.toUpperCase() || 'NOME NÃO CONFIGURADO', marginLeft + colWidth * 2 + colWidth/2, currentY + 22, { align: 'center' });
      doc.setFont(undefined, 'normal');
      doc.text(spreadsheetHeader.aprovacao.cargo || 'CARGO NÃO CONFIGURADO', marginLeft + colWidth * 2 + colWidth/2, currentY + 28, { align: 'center' });
    }
    
    return currentY + headerBoxHeight;
  };

  const drawHeaderMissions = (
    doc: jsPDF,
    pageWidth: number,
    marginLeft: number,
    marginRight: number,
    marginTop: number,
    leftImage?: { dataUrl?: string; format: 'PNG' | 'JPEG' },
    rightImage?: { dataUrl?: string; format: 'PNG' | 'JPEG' }
  ) => {
    const contentWidth = pageWidth - marginLeft - marginRight;
    let currentY = marginTop;
    const imgW = 22;
    const imgH = 22;
    if (leftImage?.dataUrl) {
      doc.addImage(leftImage.dataUrl as any, leftImage.format, marginLeft, currentY, imgW, imgH);
    }
    if (rightImage?.dataUrl) {
      doc.addImage(rightImage.dataUrl as any, rightImage.format, pageWidth - marginRight - imgW, currentY, imgW, imgH);
    }
    const lines = Array.isArray(missionsHeader.centerLines) ? missionsHeader.centerLines : [];
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    lines.forEach((raw, idx) => {
      const text = (raw || '').toString().toUpperCase();
      doc.setFont(undefined, idx === lines.length - 1 ? 'bold' : 'normal');
      doc.text(text, marginLeft + contentWidth / 2, currentY + 5 + idx * 5, { align: 'center' });
    });
    const lastY = currentY + 5 + (lines.length ? (lines.length - 1) * 5 : 0) + 4;
    doc.setDrawColor(0, 0, 0);
    doc.line(marginLeft, lastY, pageWidth - marginRight, lastY);
    return lastY + 2;
  };

  // Função auxiliar para desenhar o rodapé em cada página
  const drawFooter = (doc: jsPDF, pageWidth: number, pageHeight: number, marginLeft: number, marginRight: number, currentPage: number, totalPages: number, totalDias: number, totalValor: number) => {
    const contentWidth = pageWidth - marginLeft - marginRight;
    const colWidth = contentWidth / 3;
        
    // ===== INDICADOR DE PÁGINA =====
    // Adicionar texto do indicador de página
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text(`PÁGINA ${currentPage} DE ${totalPages}`, marginLeft + colWidth + colWidth/2, pageHeight - 10, { align: 'center' });
    
    // ===== RODAPÉ COM ASSINATURAS =====
    const footerY = pageHeight - 40;
    const footerBoxHeight = 30;
    
    // Caixa da esquerda - Diretor da Escola
    doc.setFillColor(255, 255, 255);
    doc.rect(marginLeft, footerY, colWidth, footerBoxHeight, 'FD');
    
    // Caixa da direita - Coordenadora
    doc.rect(marginLeft + colWidth * 2, footerY, colWidth, footerBoxHeight, 'FD');
    
    // Adicionar textos do rodapé
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    // Assinatura esquerda
    const footerTextY = footerY + 20;
    doc.text('________________________________', marginLeft + colWidth/2, footerTextY - 5, { align: 'center' });
    doc.setFont(undefined, 'bold');
    doc.text('PAULO DAMASCENO COSTA', marginLeft + colWidth / 2, footerTextY, { align: 'center' });
    doc.setFont(undefined, 'normal');
    doc.text('DIRETOR DA ESCOLA', marginLeft + colWidth / 2, footerTextY + 4, { align: 'center' });
    doc.text('PROFª RAIMUNDA MOTA', marginLeft + colWidth / 2, footerTextY + 8, { align: 'center' });
    
    // Assinatura direita
    doc.text('________________________________', marginLeft + colWidth * 2 + colWidth/2, footerTextY - 5, { align: 'center' });
    doc.setFont(undefined, 'bold');
    doc.text('ELIZABETE LIMA SOARES - CAP', marginLeft + colWidth * 2 + colWidth / 2, footerTextY, { align: 'center' });
    doc.setFont(undefined, 'normal');
    doc.text('COORDENADORA DA SME', marginLeft + colWidth * 2 + colWidth / 2, footerTextY + 4, { align: 'center' });
    doc.text('PROFª RAIMUNDA MOTA', marginLeft + colWidth * 2 + colWidth / 2, footerTextY + 8, { align: 'center' });
  };

  const generatePDF = async () => {
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
      console.log('[PDF] Iniciando resolução da imagem do cabeçalho', spreadsheetHeader.imagemUrl);
      let headerImageData: { imgEl?: HTMLImageElement; dataUrl?: string; format: 'PNG' | 'JPEG' } | undefined;
      let leftImg: { dataUrl?: string; format: 'PNG' | 'JPEG' } | undefined;
      let rightImg: { dataUrl?: string; format: 'PNG' | 'JPEG' } | undefined;
      if (spreadsheetHeader.imagemUrl) {
        try {
          const storage = getStorage();
          const resolveStoragePath = (raw: string): string | undefined => {
            if (!raw) return undefined;
            if (raw.startsWith('http')) {
              const idx = raw.indexOf('/o/');
              if (idx >= 0) {
                const after = raw.substring(idx + 3);
                const endQ = after.indexOf('?');
                const encoded = endQ >= 0 ? after.substring(0, endQ) : after;
                return decodeURIComponent(encoded);
              }
              return undefined;
            }
            return raw;
          };

          const path = resolveStoragePath(spreadsheetHeader.imagemUrl);
          console.log('[PDF] Storage path resolvido', path);
          if (path) {
            const sRef = storageRef(storage, path);
            let format: 'PNG' | 'JPEG' = path.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG';
            try {
              const meta = await getMetadata(sRef);
              console.log('[PDF] getMetadata OK', meta.contentType);
              if (meta.contentType?.includes('png')) format = 'PNG';
              if (meta.contentType?.includes('jpeg') || meta.contentType?.includes('jpg')) format = 'JPEG';
            } catch {
              console.log('[PDF] getMetadata falhou, inferindo pelo path');
            }

            try {
              console.log('[PDF] getBytes: iniciando download de bytes');
              const arrayBuffer = await getBytes(sRef);
              console.log('[PDF] getBytes OK, tamanho', arrayBuffer.byteLength);
              const uint = new Uint8Array(arrayBuffer);
              let binary = '';
              const chunk = 0x8000;
              for (let i = 0; i < uint.length; i += chunk) {
                binary += String.fromCharCode.apply(null, Array.from(uint.subarray(i, i + chunk)));
              }
              const base64 = btoa(binary);
              const mime = format === 'PNG' ? 'image/png' : 'image/jpeg';
              const dataUrl = `data:${mime};base64,${base64}`;
              headerImageData = { dataUrl, format };
              console.log('[PDF] dataUrl gerado, tamanho', dataUrl.length);
            } catch (e) {
              console.log('[PDF] getBytes falhou', e);
            }
          }
        } catch (e) {
          console.log('[PDF] Erro geral ao resolver imagem', e);
        }
      }
      const storage = getStorage();
      const resolveStoragePath = (raw: string): string | undefined => {
        if (!raw) return undefined;
        if (raw.startsWith('http')) {
          const idx = raw.indexOf('/o/');
          if (idx >= 0) {
            const after = raw.substring(idx + 3);
            const endQ = after.indexOf('?');
            const encoded = endQ >= 0 ? after.substring(0, endQ) : after;
            return decodeURIComponent(encoded);
          }
          return undefined;
        }
        return raw;
      };
      const fetchImage = async (url?: string) => {
        if (!url) return undefined;
        const path = resolveStoragePath(url);
        if (!path) return undefined;
        const sRef = storageRef(storage, path);
        let format: 'PNG' | 'JPEG' = path.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG';
        try {
          const meta = await getMetadata(sRef);
          if (meta.contentType?.includes('png')) format = 'PNG';
          if (meta.contentType?.includes('jpeg') || meta.contentType?.includes('jpg')) format = 'JPEG';
        } catch {}
        try {
          const arrayBuffer = await getBytes(sRef);
          const uint = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < uint.length; i += chunk) {
            binary += String.fromCharCode.apply(null, Array.from(uint.subarray(i, i + chunk)));
          }
          const base64 = btoa(binary);
          const mime = format === 'PNG' ? 'image/png' : 'image/jpeg';
          const dataUrl = `data:${mime};base64,${base64}`;
          return { dataUrl, format } as { dataUrl: string; format: 'PNG' | 'JPEG' };
        } catch {
          return undefined;
        }
      };
      leftImg = await fetchImage(missionsHeader.leftImageUrl);
      rightImg = await fetchImage(missionsHeader.rightImageUrl);
      
      // Calcular totais
      const totalDias = efetivoEscalado.reduce((sum, efetivo) => sum + efetivo.dias.length, 0);
      const totalValor = totalDias * 204.87;
      
      // ===== PREPARAR DADOS DA TABELA =====
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
          row.push( (efetivo.nomeCompleto || efetivo.nome || '').toUpperCase()); // Nome em CAIXA ALTA em cada linha
          row.push( efetivo.cpf || ''); // CPF em cada linha
          row.push( efetivo.matriculaFuncional || ''); // Matrícula funcional em cada linha
          
          // Adicionar dias do grupo (máximo 12)
          for (let j = 0; j < 12; j++) {
            row.push(j < grupoDias.length ? grupoDias[j] : '');
          }
          
          row.push(qtdDias); // Quantidade
          row.push(valorGrupo.toLocaleString('pt-BR', { 
            style: 'currency', 
            currency: 'BRL' 
          })); // Valor formatado
          
          tableData.push(row);
        }
      });
      
      // Adicionar linha de total com layout diferenciado (mescla e destaque)
      const totalRow: any[] = [];
      totalRow.push({
        content: '',
        colSpan: 12,
        styles: {
          fillColor: [255, 255, 255] as [number, number, number],
          lineColor: [255, 255, 255] as [number, number, number]
        }
      });
      totalRow.push({
        content: 'TOTAL',
        colSpan: 3,
        styles: {
          fontStyle: 'bold' as const,
          halign: 'center' as const,
          fillColor: [255, 255, 255] as [number, number, number],
          //textColor: [0, 0, 0] as [number, number, number],
          //lineWidth: 0.3,
          lineColor: [0, 0, 0] as [number, number, number]
        }
      });
      totalRow.push({
        content: totalDias,
        styles: {
          fillColor: [255, 255, 255] as [number, number, number],
          fontStyle: 'bold' as const,
          halign: 'center' as const
        }
      });
      totalRow.push({
        content: totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        styles: {
          fillColor: [255, 255, 255] as [number, number, number],
          fontStyle: 'bold' as const,
          halign: 'right' as const
        }
      });
      
      // Não adiciona total global aqui; será adicionado por página mais abaixo
      
      // Cabeçalho da tabela com duas linhas
      const headerRow1 = [
        { content: 'Nome', rowSpan: 2 },
        { content: 'CPF', rowSpan: 2 },
        { content: 'Matrícula\nFuncional', rowSpan: 2 },
        { content: 'DATAS DAS JORNADAS', colSpan: 12 },
        { content: 'Qde', rowSpan: 2 },
        { content: 'Valor (R$)', rowSpan: 2 }
      ];
      
      const headerRow2 = [
        { content: '1º' },
        { content: '2º' },
        { content: '3º' },
        { content: '4º' },
        { content: '5º' },
        { content: '6º' },
        { content: '7º' },
        { content: '8º' },
        { content: '9º' },
        { content: '10º' },
        { content: '11º' },
        { content: '12º' }
      ];
      
      // ===== IMPLEMENTAR PAGINAÇÃO COM CABEÇALHO E RODAPÉ REPETIDOS =====
      
      // Calcular quantidade de linhas por página (considerando espaço para cabeçalho e rodapé)
      const linhasPorPagina = 10; // Ajustado para caber com cabeçalho e rodapé
      let paginaAtual = 1;
      let totalPaginas = Math.ceil(tableData.length / linhasPorPagina);
      let cumulativeDias = 0;
      let cumulativeValor = 0;
      
      // Função para adicionar nova página e desenhar cabeçalho
      const addPageWithHeader = (currentPage: number, totalPages: number) => {
        if (currentPage > 1) {
          doc.addPage();
        }
        let headerEndY = marginTop;
        const useMissions = (Array.isArray(missionsHeader.centerLines) && missionsHeader.centerLines.length > 0) || missionsHeader.leftImageUrl || missionsHeader.rightImageUrl;
        if (useMissions) {
          headerEndY = drawHeaderMissions(doc, pageWidth, marginLeft, marginRight, marginTop, leftImg, rightImg);
        } else {
          headerEndY = drawHeader(doc, pageWidth, marginLeft, marginRight, marginTop, currentPage, totalPages, headerImageData);
        }
        
        // Adicionar informações de mês e período
        let currentY = headerEndY + 5;
        
        // Mês
        const optionsMes: Intl.DateTimeFormatOptions = {
          month: '2-digit',
          year: 'numeric',
          timeZone: 'UTC'
        };
        const periodoMes = new Intl.DateTimeFormat('pt-BR', optionsMes).format(new Date(formData.dataInicial));
        const periodoMesTexto = `Mês: ${periodoMes}`;
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(128, 0, 0);
        doc.text(periodoMesTexto, pageWidth - marginRight, currentY, { align: 'right' });
        
        // Período
        currentY += 5;
        const options: Intl.DateTimeFormatOptions = {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'UTC'
        };
        const periodoInicio = new Intl.DateTimeFormat('pt-BR', options).format(new Date(formData.dataInicial));
        const periodoFinal = new Intl.DateTimeFormat('pt-BR', options).format(new Date(formData.dataFinal));
        const periodoTexto = `Período: ${periodoInicio} a ${periodoFinal}`;
        doc.text(periodoTexto, pageWidth - marginRight, currentY, { align: 'right' });
        
        return currentY + 8;
      };
      
      // Processar dados em páginas
      for (let i = 0; i < tableData.length; i += linhasPorPagina) {
        const dadosPagina = tableData.slice(i, i + linhasPorPagina);
        
        // Adicionar página com cabeçalho
        const tableStartY = addPageWithHeader(paginaAtual, totalPaginas);
        
        // Adicionar total da página (linha especial)
        const pageTotalDias = dadosPagina.reduce((sum: number, row: any[]) => {
          const qtd = row?.[15];
          return sum + (typeof qtd === 'number' ? qtd : 0);
        }, 0);
        const pageTotalValor = pageTotalDias * VALOR_POR_DIA;

        const pageTotalRow: any[] = [];
        pageTotalRow.push({
          content: '',
          colSpan: 12,
          styles: {
            fillColor: [255, 255, 255] as [number, number, number],
            lineWidth: 0
          }
        });
        pageTotalRow.push({
          content: 'TOTAL',
          colSpan: 3,
          styles: {
            fontStyle: 'bold' as const,
            halign: 'center' as const,
            fillColor: [255, 255, 255] as [number, number, number],
            lineColor: [0, 0, 0] as [number, number, number]
          }
        });
        pageTotalRow.push({
          content: pageTotalDias,
          styles: {
            fillColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold' as const,
            halign: 'center' as const
          }
        });
        pageTotalRow.push({
          content: pageTotalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          styles: {
            fillColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold' as const,
            halign: 'right' as const
          }
        });

        // Atualiza acumulado (páginas 1..paginaAtual)
        cumulativeDias += pageTotalDias;
        cumulativeValor += pageTotalValor;

        // Linha acumulada com mesmo layout do TOTAL
        const pageCumRow: any[] = [];
        pageCumRow.push({
          content: '',
          colSpan: 12,
          styles: {
            fillColor: [255, 255, 255] as [number, number, number],
            lineColor: [255, 255, 255] as [number, number, number]
          }
        });
        pageCumRow.push({
          content: `TOTAL GERAL`,
          colSpan: 3,
          styles: {
            fontStyle: 'bold' as const,
            halign: 'center' as const,
            fillColor: [255, 255, 255] as [number, number, number],
            lineColor: [0, 0, 0] as [number, number, number]
          }
        });
        pageCumRow.push({
          content: cumulativeDias,
          styles: {
            fillColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold' as const,
            halign: 'center' as const
          }
        });
        pageCumRow.push({
          content: cumulativeValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          styles: {
            fillColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold' as const,
            halign: 'right' as const
          }
        });

        dadosPagina.push(pageTotalRow);
        dadosPagina.push(pageCumRow);

        // Configurar e desenhar tabela para esta página
        const tableOptions = {
          head: [headerRow1, headerRow2],
          body: dadosPagina,
          startY: tableStartY,
          margin: { left: marginLeft, right: marginRight, top: 0, bottom: 40 },
          tableWidth: contentWidth,
          theme: 'grid' as const,
          styles: {
            fontSize: 9,
            cellPadding: { top: 2, bottom: 2, left: 1, right: 1 },
            fillColor: [240, 255, 240] as [number, number, number],
            textColor: [0, 0, 0] as [number, number, number],
            lineColor: [0, 0, 0] as [number, number, number],
            lineWidth: 0.1
          },
          headStyles: {
            fillColor: [200, 230, 200] as [number, number, number],
            textColor: [0, 0, 0] as [number, number, number],
            fontStyle: 'bold' as const,
            halign: 'center' as const,
            valign: 'middle' as const,
          },
          columnStyles: {
            0: { halign: 'left' as const, width: 30},
            1: { halign: 'center' as const },
            2: { halign: 'center' as const },
            3: { halign: 'center' as const },
            4: { halign: 'center' as const },
            5: { halign: 'center' as const },
            6: { halign: 'center' as const },
            7: { halign: 'center' as const },
            8: { halign: 'center' as const },
            9: { halign: 'center' as const },
            10: { halign: 'center' as const },
            11: { halign: 'center' as const },
            12: { halign: 'center' as const },
            13: { halign: 'center' as const },
            14: { halign: 'center' as const },
            15: { halign: 'center' as const },
            16: { halign: 'right' as const }
          },
          alternateRowStyles: {
            fillColor: [248, 255, 248] as [number, number, number]
          },
          showHead: 'firstPage' as const,
          showFoot: 'never' as const,
          didDrawCell: (data: any) => {
            const rawRow = data?.row?.raw;
            if (!Array.isArray(rawRow)) return;

            const isTotalRow = rawRow[1]?.content === 'TOTAL';
            const isCumRow = typeof rawRow[1]?.content === 'string' && rawRow[1]?.content.startsWith('TOTAL DA SOMA DAS PÁGINAS');
            const isFirstMergedCell = data?.cell?.raw?.colSpan === 12;

            if ((isTotalRow || isCumRow) && isFirstMergedCell) {
              const x = data.cell.x;
              const y = data.cell.y;
              const w = data.cell.width;
              const h = data.cell.height;

              // desenha apenas topo e direita (pretas); esquerda e baixo sem borda
              data.doc.setDrawColor(0, 0, 0);
              data.doc.setLineWidth(0.1);
              data.doc.line(x, y, x + w, y); // topo
              data.doc.line(x + w, y, x + w, y + h); // direita
            }
          }
        };

        // Desenhar tabela para esta página
        autoTable(doc, tableOptions);

        // Rodapé da página
        drawFooter(doc, pageWidth, pageHeight, marginLeft, marginRight, paginaAtual, totalPaginas, totalDias, totalValor);

        paginaAtual++;
      }

      const fileName = `Efetivo_Escalado_${formData.unidade}_${formData.dataInicial}_a_${formData.dataFinal}.pdf`;
      doc.save(fileName);

    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsGeneratingPDF(false);
    }
  }
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
                  onClick={generatePDF}
                  disabled={isGeneratingPDF}
                  className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingPDF ? 'Gerando PDF...' : 'Gerar PDF'}
                </button>
                <button
                  //onClick={gerarPlanilhaExcel}
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
                          {linhaIndex === 0 ? (efetivo.nomeCompleto || efetivo.nome) : ''}
                          {linhaIndex === 0 && efetivo.nomeCompleto && efetivo.nomeCompleto !== efetivo.nome && (
                            <div className="text-xs text-gray-500 font-normal">
                              ({efetivo.nome})
                            </div>
                          )}
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
