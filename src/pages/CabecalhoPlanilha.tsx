import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ref as dbRef, onValue, update } from 'firebase/database';
import PageHeader from '../components/PageHeader';
import { auth, db, storage } from '../services/firebase';

interface HeaderData {
  titulo: string;
  imagemUrl?: string;
  autorizacao: {
    nome: string;
    cargo: string;
  };
  aprovacao: {
    nome: string;
    cargo: string;
  };
}

export default function CabecalhoPlanilha() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userUnits, setUserUnits] = useState<{ code: string; titulo: string }[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [headerData, setHeaderData] = useState<HeaderData>({
    titulo: '',
    autorizacao: {
      nome: '',
      cargo: ''
    },
    aprovacao: {
      nome: '',
      cargo: ''
    }
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

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
      if (!selectedUnit && unitsArray.length > 0) {
        setSelectedUnit(unitsArray[0].code);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedUnit) return;
    const headerRef = dbRef(db, `/units/${selectedUnit}/settings/spreadsheetHeader`);
    const unsub = onValue(headerRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setHeaderData(data);
        if (data.imagemUrl) setImagePreview(data.imagemUrl);
      } else {
        setHeaderData({
          titulo: '',
          autorizacao: { nome: '', cargo: '' },
          aprovacao: { nome: '', cargo: '' }
        });
        setImagePreview('');
      }
    });
    return () => unsub();
  }, [selectedUnit]);

  const handleInputChange = (field: string, value: string, section?: 'autorizacao' | 'aprovacao') => {
    if (section) {
      setHeaderData(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value
        }
      }));
    } else {
      setHeaderData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (): Promise<string | undefined> => {
    if (!imageFile) return headerData.imagemUrl;
    if (!selectedUnit) return undefined;

    try {
      const timestamp = Date.now();
      const ext = imageFile.name.split('.').pop() || 'jpg';
      const storageRef = ref(storage, `spreadsheet-headers/${selectedUnit}/header-image-${timestamp}.${ext}`);
      const snapshot = await uploadBytes(storageRef, imageFile);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Erro ao fazer upload da imagem:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnit) return;

    setSaving(true);
    try {
      let imageUrl = headerData.imagemUrl;
      
      // Fazer upload da imagem se houver um novo arquivo
      if (imageFile) {
        imageUrl = await uploadImage();
      }

      const dataToSave = {
        ...headerData,
        imagemUrl: imageUrl,
        updatedAt: new Date().toISOString()
      };

      // Salvar no banco de dados
      await update(dbRef(db, `/units/${selectedUnit}/settings/spreadsheetHeader`), dataToSave);
      
      alert('Cabeçalho salvo com sucesso!');
      navigate('/configuracao');
    } catch (error) {
      console.error('Erro ao salvar cabeçalho:', error);
      alert('Erro ao salvar cabeçalho. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Cabeçalho - Planilha" />
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
            {/* Título do Cabeçalho */}
            <div>
              <h3 className="text-lg font-semibold text-gray-text mb-4">Configurações do Cabeçalho</h3>
              <label className="flex flex-col gap-1">
                <span className="text-secondary text-sm">Título do Cabeçalho</span>
                <input
                  type="text"
                  className="bg-white border rounded px-3 py-2"
                  placeholder="Ex: AUTORIZAÇÃO DE HORA EXTRA"
                  value={headerData.titulo}
                  onChange={(e) => handleInputChange('titulo', e.target.value)}
                  required
                />
              </label>
            </div>

            {/* Upload de Imagem */}
            <div>
              <h3 className="text-lg font-semibold text-gray-text mb-4">Brasão / Logo</h3>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-secondary text-sm">Imagem do Cabeçalho</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="bg-white border rounded px-3 py-2"
                  />
                </label>
                
                {imagePreview && (
                  <div className="flex flex-col items-center gap-2">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="max-w-xs max-h-32 object-contain border rounded"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview('');
                        setImageFile(null);
                      }}
                      className="px-3 py-1 text-sm text-red-600 hover:text-red-800"
                    >
                      Remover imagem
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Seção de Autorização */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-text mb-4">Autorização</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-secondary text-sm">Nome do Autorizador</span>
                  <input
                    type="text"
                    className="bg-white border rounded px-3 py-2"
                    placeholder="Ex: KEILA MÁRCIA DA SILVA PEDROSA"
                    value={headerData.autorizacao.nome}
                    onChange={(e) => handleInputChange('nome', e.target.value.toUpperCase(), 'autorizacao')}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary text-sm">Cargo do Autorizador</span>
                  <input
                    type="text"
                    className="bg-white border rounded px-3 py-2"
                    placeholder="Ex: Secretaria Municipal de Educação"
                    value={headerData.autorizacao.cargo}
                    onChange={(e) => handleInputChange('cargo', e.target.value, 'autorizacao')}
                    required
                  />
                </label>
              </div>
            </div>

            {/* Seção de Aprovação */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-text mb-4">Aprovação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-secondary text-sm">Nome do Aprovador</span>
                  <input
                    type="text"
                    className="bg-white border rounded px-3 py-2"
                    placeholder="Ex: GEIZIANE SOUZA DA SILVA"
                    value={headerData.aprovacao.nome}
                    onChange={(e) => handleInputChange('nome', e.target.value.toUpperCase(), 'aprovacao')}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary text-sm">Cargo do Aprovador</span>
                  <input
                    type="text"
                    className="bg-white border rounded px-3 py-2"
                    placeholder="Ex: Diretor de Recursos Humanos"
                    value={headerData.aprovacao.cargo}
                    onChange={(e) => handleInputChange('cargo', e.target.value, 'aprovacao')}
                    required
                  />
                </label>
              </div>
            </div>

            {/* Preview do Cabeçalho */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-text mb-4">Preview do Cabeçalho</h3>
              <div className="bg-gray-50 border rounded p-4">
                <div className="flex items-center justify-between">
                  {/* Seção Autorização */}
                  <div className="text-center flex-1">
                    <div className="font-bold text-lg mb-2">AUTORIZO:</div>
                    <div className="border-t border-gray-400 my-2"></div>
                    <div className="font-semibold">{headerData.autorizacao.nome || 'NOME DO AUTORIZADOR'}</div>
                    <div className="text-sm text-gray-600">{headerData.autorizacao.cargo || 'CARGO DO AUTORIZADOR'}</div>
                  </div>

                  {/* Seção Central com Imagem */}
                  <div className="text-center flex-1 mx-4">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Brasão" className="max-h-24 mx-auto" />
                    ) : (
                      <div className="bg-yellow-100 border-2 border-dashed border-yellow-300 rounded p-8">
                        <div className="text-yellow-600 text-sm">BRASÃO / LOGO</div>
                      </div>
                    )}
                  </div>

                  {/* Seção Aprovação */}
                  <div className="text-center flex-1">
                    <div className="font-bold text-lg mb-2">APROVO:</div>
                    <div className="border-t border-gray-400 my-2"></div>
                    <div className="font-semibold">{headerData.aprovacao.nome || 'NOME DO APROVADOR'}</div>
                    <div className="text-sm text-gray-600">{headerData.aprovacao.cargo || 'CARGO DO APROVADOR'}</div>
                  </div>
                </div>
                
                {headerData.titulo && (
                  <div className="text-center mt-4 font-bold text-xl">
                    {headerData.titulo}
                  </div>
                )}
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <button
                type="button"
                onClick={() => navigate('/configuracao')}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60"
                disabled={saving}
              >
                {saving ? 'Salvando...' : 'Salvar Cabeçalho'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}