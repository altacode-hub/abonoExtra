import { useEffect, useState } from 'react';
import { strings } from '../i18n/strings';

export default function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  return (
    <div role="status" className="bg-yellow-100 text-yellow-800 p-2 text-sm text-center">
      <strong>{strings.offline.title}</strong> — {strings.offline.description}
    </div>
  );
}