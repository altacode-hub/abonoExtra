import React from 'react';
import { useNavigate } from 'react-router-dom';

type Props = { title: string };

export const PageHeader: React.FC<Props> = ({ title }) => {
  const navigate = useNavigate();

  return (
    <header className="bg-primary text-white fixed top-0 inset-x-0 z-50 h-[68px]">
      <div className="px-4 relative h-full">
        <button
          className="p-1 absolute left-4 top-1/2 -translate-y-1/2"
          aria-label="Voltar"
          onClick={() => navigate(-1)}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="p-1 absolute right-4 top-1/2 -translate-y-1/2"
          aria-label="Ir para Home"
          onClick={() => navigate('/')}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M3 11l9-7 9 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-center font-semibold leading-[68px]">{title}</h1>
      </div>
    </header>
  );
};

export default PageHeader;