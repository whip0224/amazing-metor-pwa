import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWA';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            install();
          } else {
            setShowGuideModal(true);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>安裝離線 App</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  安裝「地鐵極速導航」至主畫面
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p>在 iPhone / iPad Safari 安裝後，即使在地底沒有網路也能秒速查詢路線：</p>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <Share className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      步驟 1：點擊底部「分享」按鈕
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      在 Safari 工具列正中央找到分享圖示
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <PlusSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      步驟 2：選擇「加入主畫面」
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      向下滑動選單並點擊「加入主畫面 (Add to Home Screen)」
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  本應用程式已自動快取香港、深圳、台北完整地鐵路網資料，支援全離線規劃：
                </p>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1.5 text-xs">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    Chrome / Edge 電腦與手機版安裝方式：
                  </p>
                  <p>1. 點擊瀏覽器網址列右側的「安裝圖示」或右上角選單 (⋮)</p>
                  <p>2. 選擇「安裝應用程式」或「加到主畫面」即可獨立開啟</p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-5 w-full rounded-xl bg-slate-900 dark:bg-slate-100 py-2.5 text-sm font-semibold text-white dark:text-slate-900 hover:opacity-90 transition cursor-pointer"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
};
