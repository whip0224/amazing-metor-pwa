import React, { useState, useMemo } from 'react';
import { X, Search, Train } from 'lucide-react';
import { MetroStationData } from '../types/metro';

interface StationSelectorModalProps {
  isOpen: boolean;
  targetField: 'start' | 'end';
  stationData: MetroStationData | null;
  onSelectStation: (station: string) => void;
  onClose: () => void;
}

export const StationSelectorModal: React.FC<StationSelectorModalProps> = ({
  isOpen,
  targetField,
  stationData,
  onSelectStation,
  onClose,
}) => {
  const [selectedLineId, setSelectedLineId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const lines = stationData?.lines || [];

  const activeLine = useMemo(() => {
    if (selectedLineId === 'all') return null;
    return lines.find((l) => l.id === selectedLineId) || lines[0] || null;
  }, [lines, selectedLineId]);

  const filteredStations = useMemo(() => {
    if (!stationData?.lines) return [];
    const q = searchQuery.trim().toLowerCase();

    if (q) {
      const set = new Set<string>();
      stationData.lines.forEach((l) => {
        l.stations.forEach((s) => {
          if (s.toLowerCase().includes(q)) set.add(s);
        });
      });
      return Array.from(set);
    }

    if (activeLine) {
      return activeLine.stations;
    }

    const all = new Set<string>();
    stationData.lines.forEach((l) => l.stations.forEach((s) => all.add(s)));
    return Array.from(all);
  }, [stationData, activeLine, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Train className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              選擇{targetField === 'start' ? '起點' : '終點'}車站
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="輸入關鍵字快速過濾站名..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition"
            />
          </div>

          {/* Line selector tabs */}
          {!searchQuery.trim() && (
            <div className="flex items-center gap-1.5 overflow-x-auto pt-3 pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedLineId('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                  selectedLineId === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                全部車站
              </button>
              {lines.map((line) => {
                const isSelected = selectedLineId === line.id;
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => setSelectedLineId(line.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: line.color }}
                    />
                    <span>{line.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Station Grid */}
        <div className="p-4 overflow-y-auto flex-1">
          {activeLine && !searchQuery.trim() && (
            <div className="mb-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                {activeLine.name} · 共 {activeLine.stations.length} 站
              </span>
              <span>
                {activeLine.stations[0]} ⇄{' '}
                {activeLine.stations[activeLine.stations.length - 1]}
              </span>
            </div>
          )}

          {filteredStations.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              找不到符合「{searchQuery}」的車站
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {filteredStations.map((station, idx) => (
                <button
                  key={`${station}-${idx}`}
                  type="button"
                  onClick={() => {
                    onSelectStation(station);
                    onClose();
                  }}
                  className="min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 text-center transition active:scale-[0.98] cursor-pointer truncate"
                >
                  {station}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
