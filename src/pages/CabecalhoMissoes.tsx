import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref as dbRef, onValue, update } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import PageHeader from '../components/PageHeader';
import { auth, db, storage } from '../services/firebase';

interface MissionsHeaderData {
  leftImageUrl?: string;
  rightImageUrl?: string;
  centerLines: string[];
}

export default function CabecalhoMissoes() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [userUnits, setUserUnits] = useState<{ code: string; titulo: string }[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [headerData, setHeaderData] = useState<MissionsHeaderData>({ centerLines: [] });
  const [leftFile, setLeftFile] = useState<File | null>(null);
  const [rightFile, setRightFile] = useState<File | null>(null);
  const [leftPreview, setLeftPreview] = useState<string>('');
  const [rightPreview, setRightPreview] = useState<string>('');
  const [newLine, setNewLine] = useState('');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const userUnitsRef = dbRef(db, `/users/${uid}/units`);
    const unsub = onValue(userUnitsRef, (snapshot) => {
      const unitsData = snapshot.val() || {};
      const unitsArray = Object.entries(unitsData).map(([code, data]: [string, any]) => ({
        code,
        titulo: (data && data.titulo) || `Unidade ${code}`
      }));
      setUserUnits(unitsArray);
      if (!selectedUnit && unitsArray.length > 0) setSelectedUnit(unitsArray[0].code);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedUnit) return;
    const r = dbRef(db, `/units/${selectedUnit}/settings/missionsHeader`);
    const unsub = onValue(r, (snapshot) => {
      const data = snapshot.val() || { centerLines: [] };
      setHeaderData({
        leftImageUrl: data.leftImageUrl || undefined,
        rightImageUrl: data.rightImageUrl || undefined,
        centerLines: Array.isArray(data.centerLines) ? data.centerLines : []
      });
      setLeftPreview(data.leftImageUrl || '');
      setRightPreview(data.rightImageUrl || '');
    });
    return () => unsub();
  }, [selectedUnit]);

  const handleLeftImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLeftFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLeftPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRightImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRightFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setRightPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (side: 'left' | 'right'): Promise<string | undefined> => {
    const file = side === 'left' ? leftFile : rightFile;
    if (!file) return side === 'left' ? headerData.leftImageUrl : headerData.rightImageUrl;
    if (!selectedUnit) return undefined;
    const ts = Date.now();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `missions-headers/${selectedUnit}/${side}-image-${ts}.${ext}`;
    const sRef = storageRef(storage, path);
    const snap = await uploadBytes(sRef, file);
    const url = await getDownloadURL(snap.ref);
    return url;
  };

  const addCenterLine = () => {
    const v = newLine.trim();
    if (!v) return;
    setHeaderData((prev) => ({ ...prev, centerLines: [...prev.centerLines, v] }));
    setNewLine('');
  };

  const updateCenterLine = (idx: number, v: string) => {
    setHeaderData((prev) => ({
      ...prev,
      centerLines: prev.centerLines.map((line, i) => (i === idx ? v : line))
    }));
  };

  const removeCenterLine = (idx: number) => {
    setHeaderData((prev) => ({
      ...prev,
      centerLines: prev.centerLines.filter((_, i) => i !== idx)
    }));
  };

  const moveLine = (idx: number, dir: -1 | 1) => {
    setHeaderData((prev) => {
      const arr = [...prev.centerLines];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return prev;
      const [item] = arr.splice(idx, 1);
      arr.splice(target, 0, item);
      return { ...prev, centerLines: arr };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnit) return;
    setSaving(true);
    try {
      const leftUrl = await uploadImage('left');
      const rightUrl = await uploadImage('right');
      const dataToSave: MissionsHeaderData = {
        leftImageUrl: leftUrl,
        rightImageUrl: rightUrl,
        centerLines: headerData.centerLines
      };
      await update(dbRef(db, `/units/${selectedUnit}/settings/missionsHeader`), {
        ...dataToSave,
        updatedAt: new Date().toISOString()
      });
      alert('Cabeçalho salvo com sucesso!');
      navigate('/configuracao');
    } catch (e) {
      alert('Erro ao salvar cabeçalho. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const renderCenterPreview = () => {
    const lines = headerData.centerLines || [];
    return (
      <div className="text-center">
        {lines.map((line, i) => (
          <div key={i} className={`uppercase ${i === lines.length - 1 ? 'font-bold' : ''}`}>{line}</div>
        ))}
        <div className="border-t border-black mt-2"></div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Cabeçalho - Missões" />
      <div className="px-4 py-4">
        <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 shadow-card max-w-4xl mx-auto">
          <div className="space-y-6">
            <div>
              <label className="flex flex-col gap-1">
                <span className="text-secondary text-sm">Unidade</span>
                <select
                  className="bg-white border rounded px-3 py-2"
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  required
                >
                  <option value="" disabled>Selecione a unidade</option>
                  {userUnits.map((u) => (
                    <option key={u.code} value={u.code}>{u.titulo}</option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-text mb-4">Imagens do Cabeçalho</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-secondary text-sm">Imagem Esquerda</span>
                  <input type="file" accept="image/*" onChange={handleLeftImageChange} className="bg-white border rounded px-3 py-2" />
                  {leftPreview && (
                    <img src={leftPreview} alt="Esquerda" className="max-h-24 object-contain border rounded mt-2" />
                  )}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary text-sm">Imagem Direita</span>
                  <input type="file" accept="image/*" onChange={handleRightImageChange} className="bg-white border rounded px-3 py-2" />
                  {rightPreview && (
                    <img src={rightPreview} alt="Direita" className="max-h-24 object-contain border rounded mt-2" />
                  )}
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-text mb-4">Texto Central (linha por linha)</h3>
              <div className="flex gap-2 mb-3">
                <input
                  className="bg-white border rounded px-3 py-2 flex-1"
                  placeholder="Adicionar linha"
                  value={newLine}
                  onChange={(e) => setNewLine(e.target.value)}
                />
                <button type="button" className="px-4 py-2 bg-primary text-white rounded" onClick={addCenterLine}>Adicionar</button>
              </div>
              <ul className="divide-y rounded border">
                {headerData.centerLines.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-light">Nenhuma linha adicionada.</li>
                ) : (
                  headerData.centerLines.map((line, i) => (
                    <li key={i} className="px-3 py-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">{i + 1}.</span>
                      <input
                        className="border rounded px-2 py-1 flex-1"
                        value={line}
                        onChange={(e) => updateCenterLine(i, e.target.value)}
                      />
                      <div className="flex gap-1">
                        <button type="button" className="px-2 py-1 border rounded text-xs" onClick={() => moveLine(i, -1)}>↑</button>
                        <button type="button" className="px-2 py-1 border rounded text-xs" onClick={() => moveLine(i, 1)}>↓</button>
                        <button type="button" className="px-2 py-1 border rounded text-xs" onClick={() => removeCenterLine(i)}>Remover</button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-text mb-4">Preview</h3>
              <div className="bg-gray-50 border rounded p-4">
                <div className="flex items-start justify-between">
                  <div className="w-1/5 flex justify-start">
                    {leftPreview && <img src={leftPreview} alt="Esquerda" className="max-h-24 object-contain" />}
                  </div>
                  <div className="w-3/5 px-2">
                    {renderCenterPreview()}
                  </div>
                  <div className="w-1/5 flex justify-end">
                    {rightPreview && <img src={rightPreview} alt="Direita" className="max-h-24 object-contain" />}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t">
              <button type="button" onClick={() => navigate('/configuracao')} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50" disabled={saving}>Cancelar</button>
              <button type="submit" className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60" disabled={saving}>{saving ? 'Salvando...' : 'Salvar Cabeçalho'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
