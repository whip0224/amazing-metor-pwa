import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Download,
  Database,
  CheckCircle2,
  Sparkles,
  Globe,
} from 'lucide-react';
import {
  MetroLine,
  MetroStationData,
  MetroTransferData,
  RegionId,
} from '../types/metro';
import { REGIONS, autoGenerateTransfers } from '../lib/metroEngine';

interface DataSyncModalProps {
  isOpen: boolean;
  region: RegionId;
  stationData: MetroStationData | null;
  transferData: MetroTransferData | null;
  onClose: () => void;
  onApplyUpdatedData: (
    newStationData: MetroStationData,
    newTransferData: MetroTransferData,
  ) => void;
}

const CITY_BBOX: Record<RegionId, string> = {
  hk: '22.18,113.88,22.54,114.32',
  sz: '22.45,113.78,22.84,114.52',
  twp: '24.94,121.38,25.20,121.66',
};

export const DataSyncModal: React.FC<DataSyncModalProps> = ({
  isOpen,
  region,
  stationData,
  transferData,
  onClose,
  onApplyUpdatedData,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetchingOnline, setIsFetchingOnline] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [generatedStations, setGeneratedStations] =
    useState<MetroStationData | null>(null);
  const [generatedTransfers, setGeneratedTransfers] =
    useState<MetroTransferData | null>(null);

  if (!isOpen) return null;

  // 1. 一鍵從現有 metro_station.json 自動推算 metro_transfer.json
  const handleAutoComputeTransfers = () => {
    const targetStationData = generatedStations || stationData;
    if (!targetStationData) return;
    const computed = autoGenerateTransfers(
      targetStationData,
      transferData?.specialTransfers || [],
    );
    setGeneratedTransfers(computed);
    onApplyUpdatedData(targetStationData, computed);
    setStatusMsg(
      `已從 ${targetStationData.lines.length} 條路線自動推算出 ${computed.transfers?.length || 0} 個交匯轉乘站！並已套用至目前 App。`,
    );
  };

  // 2. 一鍵從伺服器同步最新 JSON
  const handleSyncLatestFromServer = async () => {
    setIsSyncing(true);
    setStatusMsg(null);
    try {
      const bust = Date.now();
      const [sRes, tRes] = await Promise.all([
        fetch(`/cities/${region}/metro_station.json?t=${bust}`, {
          cache: 'no-store',
        }),
        fetch(`/cities/${region}/metro_transfer.json?t=${bust}`, {
          cache: 'no-store',
        }),
      ]);

      if (!sRes.ok || !tRes.ok) {
        throw new Error('伺服器回應錯誤');
      }

      const sJson: MetroStationData = await sRes.json();
      const tJson: MetroTransferData = await tRes.json();

      const mergedTransfers = autoGenerateTransfers(
        sJson,
        tJson.specialTransfers || [],
      );

      localStorage.setItem(
        `metro_custom_station_${region}`,
        JSON.stringify(sJson),
      );
      localStorage.setItem(
        `metro_custom_transfer_${region}`,
        JSON.stringify(mergedTransfers),
      );
      localStorage.setItem(
        `metro_last_sync_${region}`,
        new Date().toLocaleString('zh-HK'),
      );

      onApplyUpdatedData(sJson, mergedTransfers);
      setGeneratedStations(sJson);
      setGeneratedTransfers(mergedTransfers);
      setStatusMsg(
        `已成功同步 ${REGIONS[region].name} 最新路網資料並寫入手機離線快取！`,
      );
    } catch {
      setStatusMsg(
        '目前處於離線狀態或無法連線伺服器，已維持使用本機快取資料庫。',
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // 3. 從網路公開資料庫 (OpenStreetMap Overpass API) 自動搜尋並補齊車站座標與路線資訊
  const handleFetchFromOpenStreetMap = async () => {
    if (!stationData) return;
    setIsFetchingOnline(true);
    setStatusMsg(null);

    try {
      const bbox = CITY_BBOX[region];
      const query = `[out:json][timeout:20];(node["railway"="station"]["station"="subway"](${bbox});node["railway"="station"](${bbox}););out body;`;
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
      });

      if (!res.ok) throw new Error('Overpass API request failed');
      const osmData = await res.json();

      const updatedCoords: Record<string, { lat: number; lng: number }> = {
        ...(stationData.coordinates || {}),
      };
      let updatedCoordCount = 0;

      if (Array.isArray(osmData.elements)) {
        for (const el of osmData.elements) {
          if (el.lat && el.lon && el.tags) {
            const rawName: string =
              el.tags['name:zh-Hant'] ||
              el.tags['name:zh-HK'] ||
              el.tags['name:zh-TW'] ||
              el.tags['name:zh'] ||
              el.tags.name ||
              '';
            const cleanName = rawName.replace(/站$/g, '').trim();
            if (cleanName && !updatedCoords[cleanName]) {
              updatedCoords[cleanName] = {
                lat: Number(el.lat.toFixed(4)),
                lng: Number(el.lon.toFixed(4)),
              };
              updatedCoordCount++;
            }
          }
        }
      }

      const nextStationData: MetroStationData = {
        lines: stationData.lines as MetroLine[],
        coordinates: updatedCoords,
      };
      const nextTransferData = autoGenerateTransfers(
        nextStationData,
        transferData?.specialTransfers || [],
      );

      localStorage.setItem(
        `metro_custom_station_${region}`,
        JSON.stringify(nextStationData),
      );
      localStorage.setItem(
        `metro_custom_transfer_${region}`,
        JSON.stringify(nextTransferData),
      );
      localStorage.setItem(
        `metro_last_sync_${region}`,
        new Date().toLocaleString('zh-HK'),
      );

      setGeneratedStations(nextStationData);
      setGeneratedTransfers(nextTransferData);
      onApplyUpdatedData(nextStationData, nextTransferData);
      setStatusMsg(
        `已成功從 OpenStreetMap 公開資料庫檢索 ${osmData.elements?.length || 0} 筆車站節點，補充了 ${updatedCoordCount} 個新座標並自動更新 ${nextTransferData.transfers?.length || 0} 個轉乘站！`,
      );
    } catch {
      setStatusMsg(
        '連線至 OpenStreetMap Overpass 公開伺服器逾時，請稍後再試或使用本機快取更新。',
      );
    } finally {
      setIsFetchingOnline(false);
    }
  };

  const downloadJsonFile = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lastSyncTime = localStorage.getItem(`metro_last_sync_${region}`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              路網資料自動生成與更新中心
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. 一鍵同步伺服器最新 JSON */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              1. 一鍵更新本機離線快取 ({REGIONS[region].name})
            </span>
            {lastSyncTime && (
              <span className="text-[11px] font-mono-tabular text-slate-500">
                上次更新：{lastSyncTime}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            強制繞過瀏覽器快取拉取最新路線與車站資料，並自動推算所有轉乘站寫入手機快取。
          </p>
          <button
            type="button"
            onClick={handleSyncLatestFromServer}
            disabled={isSyncing}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span>
              {isSyncing ? '正在更新路網資料...' : '🔄 立即更新最新路線資料'}
            </span>
          </button>
        </div>

        {/* 2. 從網路公開資料庫 (OSM Overpass API) 自動抓取更新 metro_station.json */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
            <Globe className="w-4 h-4 text-emerald-600" />
            <span>2. 從網路公開資料庫自動擷取車站與座標</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            直接連線至免費公開的 <strong>OpenStreetMap Overpass API</strong>，即時搜尋{REGIONS[region].name}最新地鐵站經緯度座標並合成最新{' '}
            <code className="font-mono">metro_station.json</code>。
          </p>
          <button
            type="button"
            onClick={handleFetchFromOpenStreetMap}
            disabled={isFetchingOnline}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <Globe
              className={`w-4 h-4 ${isFetchingOnline ? 'animate-spin' : ''}`}
            />
            <span>
              {isFetchingOnline
                ? '正在從 OpenStreetMap 檢索車站資料...'
                : '🌐 從網路公開資料庫自動補齊與更新'}
            </span>
          </button>
        </div>

        {/* 3. 自動推算轉乘表與匯出 JSON */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>3. 免人手製作：自動推算轉乘站 & 匯出 JSON 檔案</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            系統會自動掃描 <code className="font-mono">metro_station.json</code> 中出現於 2 條線以上的同名車站，零誤差生成完整轉乘檔。
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAutoComputeTransfers}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>自動重算轉乘表</span>
            </button>

            <button
              type="button"
              onClick={() =>
                downloadJsonFile(
                  'metro_station.json',
                  generatedStations || stationData,
                )
              }
              className="py-2 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下載 metro_station.json</span>
            </button>

            <button
              type="button"
              onClick={() =>
                downloadJsonFile(
                  'metro_transfer.json',
                  generatedTransfers || transferData,
                )
              }
              className="py-2 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下載 metro_transfer.json</span>
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
};
