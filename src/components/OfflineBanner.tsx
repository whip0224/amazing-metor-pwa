import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWA';

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-xs">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>目前處於離線模式 — 已啟用內建離線地鐵路網資料庫，路線規劃功能正常運作</span>
    </div>
  );
};
