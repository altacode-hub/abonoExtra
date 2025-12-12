import { useEffect, useMemo, useState } from 'react';
import { onValue, ref, get } from 'firebase/database';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { MissionCard } from '../components/MissionCard';
import { makeEscalaId } from '../services/firebase/escalas';
import jsPDF from 'jspdf';
import { getStorage, ref as storageRef, getBytes, getMetadata } from 'firebase/storage';

type UnitMeta = { titulo: string; descricao?: string; cidade?: string };

type Enrollment = {
  userId: string;
  nome?: string;
  email?: string;
  status?: 'voluntario' | string;
  timestamp?: number;
  titulo?: string;
  referencia?: string;
  local?: string;
  tipo?: string;
  horario?: string;
  unit?: string;
  funcao?: string;
};

type MissionTemplate = {
  titulo: string;
  referencias: string[];
  funcoes?: string[];
  inicio: string; // HH:mm
  fim: string; // HH:mm
  repetir: boolean;
  diasSemana?: number[]; // 0-6
  overrides?: { data: string; disponivel: boolean }[]; // YYYY-MM-DD
  local?: string;
  tipo?: string;
};

type MissionAggregate = {
  id: string;
  titulo: string;
  referencia?: string;
  local?: string;
  tipo?: string;
  horario?: string;
  volunteers: { uid: string; nome: string; email?: string; status?: string; funcao?: string }[];
  inicioMin: number;
};

export default function GerarPDF() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [adminUnits, setAdminUnits] = useState<Record<string, UnitMeta>>({});
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [enrollments, setEnrollments] = useState<Record<string, Record<string, Enrollment>>>({});
  const [templates, setTemplates] = useState<Record<string, MissionTemplate>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [missionsHeader, setMissionsHeader] = useState<{ leftImageUrl?: string; rightImageUrl?: string; centerLines?: string[] }>({});

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const r = ref(db, `/roles/${uid}/unitAdmin`);
    const unsub = onValue(r, (snap) => {
      const unitsMap: Record<string, boolean> = snap.val() || {};
      const codes = Object.keys(unitsMap);
      if (codes.length === 0) {
        setAdminUnits({});
        setSelectedUnit('');
        return;
      }
      const updates: Record<string, UnitMeta> = {};
      let pending = codes.length;
      codes.forEach((code) => {
        const rMeta = ref(db, `/units/${code}/meta`);
        onValue(rMeta, (metaSnap) => {
          const meta = metaSnap.val() || { titulo: code };
          updates[code] = meta;
          pending -= 1;
          if (pending === 0) {
            setAdminUnits(updates);
            if (!selectedUnit) {
              const unitParam = params.get('unit') || '';
              setSelectedUnit(unitParam && updates[unitParam] ? unitParam : codes[0]);
            }
          }
        }, { onlyOnce: true });
      });
    });
    return () => unsub();
  }, [selectedUnit]);

  useEffect(() => {
    const dateParam = params.get('date') || '';
    if (dateParam) {
      const [yy, mm, dd] = dateParam.split('-');
      const y = parseInt(yy || '', 10);
      const m = parseInt(mm || '', 10);
      const d = parseInt(dd || '', 10);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) setSelectedDate(new Date(y, m - 1, d));
    }
  }, [params]);

  useEffect(() => {
    if (!selectedUnit || !selectedDate) return;
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    const dateIso = `${y}-${m}-${d}`;
    const r = ref(db, `/units/${selectedUnit}/inscricoes/${dateIso}`);
    const unsub = onValue(r, (snap) => setEnrollments(snap.val() || {}));
    return () => unsub();
  }, [selectedUnit, selectedDate]);

  useEffect(() => {
    if (!selectedUnit) return;
    const r = ref(db, `/units/${selectedUnit}/missionTemplates`);
    const unsub = onValue(r, (snap) => setTemplates(snap.val() || {}));
    return () => unsub();
  }, [selectedUnit]);

  useEffect(() => {
    if (!selectedUnit) return;
    const r = ref(db, `/units/${selectedUnit}/settings/missionsHeader`);
    const unsub = onValue(r, (snap) => setMissionsHeader(snap.val() || {}));
    return () => unsub();
  }, [selectedUnit]);

  const parseStart = (h?: string) => {
    if (!h) return Number.MAX_SAFE_INTEGER;
    const start = h.split('-')[0]?.trim() || '00:00';
    const [hh, mm] = start.split(':');
    const hNum = parseInt(hh || '0', 10);
    const mNum = parseInt(mm || '0', 10);
    return hNum * 60 + mNum;
  };

  const dateIso = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  const dow = selectedDate.getDay();

  const dailyMissions = useMemo(() => {
    const list: MissionAggregate[] = [];
    Object.entries(templates).forEach(([tid, t]) => {
      const hasOverride = (t.overrides || []).find((o) => o.data === dateIso);
      const availableByDow = t.repetir && (t.diasSemana || []).includes(dow);
      const available = hasOverride ? hasOverride.disponivel : availableByDow;
      if (!available) return;
      (t.referencias || []).forEach((refLabel, idx) => {
        const horario = `${t.inicio} - ${t.fim}`;
        const inicioMin = parseStart(horario);
        const missionId = `${tid}:${idx}`;
        const users = enrollments[missionId] || {};
        const sample = Object.values(users)[0] as Enrollment | undefined;
        const refFromEnroll = (sample?.referencia || '').trim() || refLabel;
        const localFromEnroll = (sample?.local || '').trim() || t.local;
        list.push({
          id: missionId,
          titulo: t.titulo || 'Missão',
          referencia: refFromEnroll,
          local: localFromEnroll,
          tipo: t.tipo,
          horario,
          volunteers: Object.entries(users).map(([uid, e]) => ({ uid, nome: (e as Enrollment).nome || uid, email: (e as Enrollment).email, status: (e as Enrollment).status, funcao: (e as Enrollment).funcao })),
          inicioMin,
        });
      });
    });
    return list.sort((a, b) => a.inicioMin - b.inicioMin);
  }, [templates, enrollments, dateIso, dow]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
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

  const generatePdf = async () => {
    const chosen = dailyMissions.filter((m) => selected[m.id]);
    if (chosen.length === 0) {
      alert('Selecione ao menos uma missão.');
      return;
    }
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 12;
    const marginRight = 12;
    const marginTop = 12;
    const marginBottom = 30;
    const bottomLimit = pageHeight - marginBottom;

    // Preparar imagens do cabeçalho de Missões
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
    const leftImg = await fetchImage(missionsHeader.leftImageUrl);
    const rightImg = await fetchImage(missionsHeader.rightImageUrl);

    // Cabeçalho de Missões + título "ESCALA DE MISSÕES"
    let y = drawHeaderMissions(doc, pageWidth, marginLeft, marginRight, marginTop, leftImg, rightImg) + 8;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('ESCALA DE MISSÕES', pageWidth / 2, y, { align: 'center' });
    y += 12;

    for (let i = 0; i < chosen.length; i++) {
      const m = chosen[i];
      // Missão nº — usa YYYYMMDD do selectedDate
      const yyyymmdd = `${selectedDate.getFullYear()}${String(selectedDate.getMonth() + 1).padStart(2, '0')}${String(selectedDate.getDate()).padStart(2, '0')}`;
      const missionTitle = `${m.titulo}${m.referencia ? ` - ${m.referencia}` : ''}`;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Missão nº ${yyyymmdd} - ${missionTitle}`.trim(), marginLeft, y);
      doc.setFont(undefined, 'normal');
      y += 5;
      // Data/Horário com dia da semana
      const dowNames = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
      const dowName = dowNames[selectedDate.getDay()] || '';
      const datePt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(selectedDate);
      const [start, end] = (m.horario || '').split('-').map((s) => (s || '').trim());
      doc.text(`Data/horário: ${datePt} às ${start || '--:--'} até ${datePt} às ${end || '--:--'} (${dowName})`, marginLeft, y);
      y += 5;
      doc.text(`Local: ${m.local || '-'}`, marginLeft, y);
      y += 5;
      doc.text(`Horário: ${m.horario || '-'}`, marginLeft, y);
      y += 5;
      const escalados = (m.volunteers || []).filter((v) => (v.status || '') === 'escalado');
      if (escalados.length > 0) {
        doc.text(`Efetivo Escalado (${escalados.length}):`, marginLeft, y);
        y += 5;
        doc.setFontSize(11);
        // Busca RG/MF dos perfis
        const profileCache: Record<string, { rg?: string; mf?: string; ng?: string }> = {};
        const uids = Array.from(new Set(escalados.map((v) => v.uid)));
        for (const uid of uids) {
          if (!profileCache[uid]) {
            try {
              const snap = await get(ref(db, `/users/${uid}/profile`));
              const val = snap.val() || {};
              profileCache[uid] = { rg: val.rg || '', mf: val.matriculaFuncional || val.mf || '', ng: val.nomeGuerra || '' };
            } catch { profileCache[uid] = {}; }
          }
        }
        for (const v of escalados) {
          const rg = profileCache[v.uid]?.rg || '-';
          const mf = profileCache[v.uid]?.mf || '-';
          const ng = profileCache[v.uid]?.ng || v.nome;
          const funcao = v.funcao ? ` - ${v.funcao}` : '';
          const lineText = `° ${ng}, RG ${rg}, MF ${mf}${funcao}`;
          doc.setTextColor(0, 0, 0);
          doc.text(lineText, marginLeft + 4, y);
          y += 6;
          if (y > bottomLimit && i < chosen.length - 1) { doc.addPage(); y = marginTop; }
        }
      } else {
        doc.text('Efetivo Escalado: nenhum', marginLeft, y);
        y += 5;
      }
      y += 3;
      doc.setDrawColor(220, 220, 220);
      doc.line(marginLeft, y, pageWidth - marginRight, y);
      y += 10;
      if (y > bottomLimit && i < chosen.length - 1) { doc.addPage(); y = marginTop; }
    }

    const fileName = `Missoes_${selectedUnit}_${dateIso}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-20">
      <PageHeader title="Gerar PDF" />
      {/* Cabeçalho com unidade e data */}
      <div className="px-4 py-4">
        <section className="bg-white border rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-light">Unidade: <span className="font-medium text-gray-text">{adminUnits[selectedUnit]?.titulo || selectedUnit}</span></div>
            <div className="text-sm text-gray-light">Data: <span className="font-medium text-gray-text">{dateIso}</span></div>
          </div>
        </section>
      </div>
      <div className="px-4 py-2">
        {dailyMissions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-light">Sem missões para o dia selecionado.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dailyMissions.map((m) => {
              const mission = {
                id: m.id,
                titulo: m.titulo,
                local: m.local || '',
                data: dateIso,
                horario: m.horario || '',
                tipo: m.tipo || '',
                inscrito: m.volunteers.length > 0,
                disponivel: true,
                referencia: m.referencia,
              };
              const tid = m.id.split(':')[0];
              const escalaId = makeEscalaId(dateIso, tid, m.referencia, m.local);
              const escalados = m.volunteers.filter((v) => v.status === 'escalado');
              return (
                <div key={m.id} className="relative">
                  <label className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-white rounded-md shadow-sm border px-2 py-1 flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!selected[m.id]} onChange={() => toggleSelect(m.id)} />
                    <span className="text-xs text-gray-text">Incluir</span>
                  </label>
                  <MissionCard mission={mission} hideToggle>
                    {escalados.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
                        <div className="text-xs text-secondary">Efetivo Escalado ({escalados.length})</div>
                        <div className="flex flex-wrap gap-2">
                          {escalados.map((v) => (
                            <span key={v.uid} className="inline-flex items-center gap-2 rounded px-2 py-1 text-xs">
                              <span className="font-medium text-gray-text">{v.nome}</span>
                              {v.funcao && (<span className="text-xs text-gray-light">• {v.funcao}</span>)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </MissionCard>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rodapé fixo com botão Gerar PDF */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3 flex items-center justify-end">
        <button
          type="button"
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark flex items-center gap-2"
          onClick={generatePdf}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M12 3a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V4a1 1 0 0 1 1-1Z" />
          </svg>
          Gerar PDF
        </button>
      </div>
    </div>
  );
}
