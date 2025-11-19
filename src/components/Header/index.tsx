import React, { useEffect, useState } from 'react';
import { MenuIcon } from '../../assets/icons/Menu';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { isGeneralAdmin, isUnitAdmin, isUnitMember } from '../../services/rbac';

type HeaderProps = { date?: Date };

export const Header: React.FC<HeaderProps> = ({ date }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleGeneralAdmin, setRoleGeneralAdmin] = useState(false);
  const [roleUnitAdmin, setRoleUnitAdmin] = useState(false);
  const [roleUnitMember, setRoleUnitMember] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  const goTo = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };
  
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setIsAuthenticated(false);
        setRoleGeneralAdmin(false);
        setRoleUnitAdmin(false);
        setRoleUnitMember(false);
        return;
      }
      setIsAuthenticated(true);
      const [ga, ua, um] = await Promise.all([
        isGeneralAdmin(u.uid),
        isUnitAdmin(u.uid),
        isUnitMember(u.uid),
      ]);
      setRoleGeneralAdmin(ga);
      setRoleUnitAdmin(ua);
      setRoleUnitMember(um);
    });
    return () => unsub();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      setMenuOpen(false);
      navigate('/login');
    } catch (err) {
      // silently fail
    }
  };
  // Tokens de data conforme imagem: "24" grande + "Segunda" e "Jan 2024"
  const getDateParts = () => {
    const now = date ?? new Date();
    const day = now.getDate();
    const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return {
      day,
      weekday: weekdays[now.getDay()],
      month: months[now.getMonth()],
      year: now.getFullYear(),
    };
  };

  const { day, weekday, month, year } = getDateParts();

  return (
    <header className="bg-primary text-white fixed top-0 inset-x-0 z-50 h-[68px]">
      <div className="px-4 h-full flex items-center">
        <div className="w-full flex items-center justify-between">
          {/* Chip de data à esquerda */}
          <div className="inline-flex items-center gap-2 bg-primary rounded-md px-3 py-2">
            <span className="text-4xl font-semibold leading-none">{day}</span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium">{weekday}</span>
              <span className="text-xs">{month} {year}</span>
            </div>
          </div>

          {/* Botão de menu à direita */}
          <button className="p-1" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
            <MenuIcon className="w-6 h-6 text-white" />
          </button>
        </div>
        {menuOpen && (
          <div className="fixed inset-0 z-[60]">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
            {/* Drawer */}
            <div className="absolute left-0 top-0 h-full w-72 bg-white text-gray-text shadow-card border-r flex flex-col">
              {/* Drawer header */}
              <div className="px-4 pt-5 pb-4 border-b">
                <div className="w-16 h-16 rounded-full bg-primary text-white mx-auto flex items-center justify-center text-xl font-semibold">AE</div>
                <div className="text-center mt-2 font-semibold">Abono Extra</div>
              </div>
              {/* Drawer items */}
              <nav className="py-2 overflow-y-auto">
                {roleGeneralAdmin && (
                  <div className="mb-2">
                    <div className="px-4 py-2 text-secondary text-xs uppercase font-semibold">Admin Geral</div>
                    {/* Dashboard primeiro */}
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/controle')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="13" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="4" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="13" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                      <span>Dashboard</span>
                    </button>
                    {/* Missão em seguida */}
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/missao')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Missão</span>
                    </button>
                    {/* Escala */}
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/escala')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Escala</span>
                    </button>
                    {/* Relatório */}
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/relatorio')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M6 6h12v12H6z" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M9 10h6M9 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Relatório</span>
                    </button>
                    {/* Planilha */}
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/planilha')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M8 8h8M8 12h8M8 16h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Planilha</span>
                    </button>
                    {/* Configuração com ícone engrenagem dentada */}
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/configuracao')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="11" y="2" width="2" height="3" rx="1" fill="currentColor" />
                        <rect x="11" y="19" width="2" height="3" rx="1" fill="currentColor" />
                        <rect x="2" y="11" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="19" y="11" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="5" y="5" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="16" y="5" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="5" y="17" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="16" y="17" width="3" height="2" rx="1" fill="currentColor" />
                      </svg>
                      <span>Configuração</span>
                    </button>
                  </div>
                )}
                {roleUnitAdmin && !roleGeneralAdmin && (
                  <div className="mb-2">
                    <div className="px-4 py-2 text-secondary text-xs uppercase font-semibold">Admin Unidade</div>
                    {/* Igual ao Admin Geral */}
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/controle')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="13" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="4" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="13" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                      <span>Dashboard</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/admin')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Missão</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/escala')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Escala</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/relatorio')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M6 6h12v12H6z" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M9 10h6M9 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Relatório</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/planilha')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M8 8h8M8 12h8M8 16h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Planilha</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/configuracao')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="11" y="2" width="2" height="3" rx="1" fill="currentColor" />
                        <rect x="11" y="19" width="2" height="3" rx="1" fill="currentColor" />
                        <rect x="2" y="11" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="19" y="11" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="5" y="5" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="16" y="5" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="5" y="17" width="3" height="2" rx="1" fill="currentColor" />
                        <rect x="16" y="17" width="3" height="2" rx="1" fill="currentColor" />
                      </svg>
                      <span>Configuração</span>
                    </button>
                  </div>
                )}
                {isAuthenticated && (
                  <div className="mb-2">
                    <div className="px-4 py-2 text-secondary text-xs uppercase font-semibold">Membro Unidade</div>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/perfil')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Perfil</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/missoesPessoal')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Missões Pessoal</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray" onClick={() => goTo('/unidades')}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="3" y="10" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M7 10V6h10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>Unidades</span>
                    </button>
                  </div>
                )}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray text-red-600"
                  onClick={logout}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M10 17l5-5-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15 12H4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <rect x="4" y="4" width="6" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                  <span>Sair</span>
                </button>
              </nav>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;