import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Navigation,
  Clock,
  ArrowRight,
  Footprints,
  Map as MapIcon,
  ArrowUpDown,
} from 'lucide-react';
import { CalculatedRoute, MetroStationData, RegionId } from '../types/metro';
import {
  REGIONS,
  buildSmartWalkingNavUrl,
  formatDistance,
  getStationLines,
} from '../lib/metroEngine';

interface RouteCardProps {
  region: RegionId;
  route: CalculatedRoute;
  rank: number;
  isSelectedOnMap: boolean;
  onSelectForMap: () => void;
  stationData: MetroStationData | null;
  userRawLocation: { lat: number; lng: number } | null;
  destinationRawLocation: { lat: number; lng: number } | null;
  reverseOrder: boolean;
  onToggleReverseOrder: () => void;
}

export const RouteCard: React.FC<RouteCardProps> = ({
  region,
  route,
  rank,
  isSelectedOnMap,
  onSelectForMap,
  stationData,
  userRawLocation,
  destinationRawLocation,
  reverseOrder,
  onToggleReverseOrder,
}) => {
  const [expandedSegments, setExpandedSegments] = useState<
    Record<number, boolean>
  >({});

  const toggleSegment = (idx: number) => {
    setExpandedSegments((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const navProviderName = REGIONS[region]?.navProviderName || '地圖';

  const segmentsToRender = reverseOrder
    ? [...route.segments].reverse()
    : route.segments;

  return (
    <div
      className={`rounded-2xl border transition-all p-5 bg-white dark:bg-slate-900 ${
        isSelectedOnMap
          ? 'border-blue-600 dark:border-blue-500 shadow-md'
          : 'border-slate-200 dark:border-slate-800 shadow-xs'
      }`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              推薦方案 0{rank}
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              由 {route.startStation.name} 出發
            </span>
            {route.startStation.distance > 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-xs font-mono-tabular text-emerald-600 dark:text-emerald-400">
                  距您 {formatDistance(route.startStation.distance)}
                </span>
              </>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono-tabular">
            <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
              <Clock className="w-3.5 h-3.5" />約 {route.estimatedMinutes} 分鐘
            </span>
            <span aria-hidden="true">·</span>
            <span>共 {route.totalStations} 站</span>
            <span aria-hidden="true">·</span>
            <span>
              {route.transferCount === 0
                ? '直達免轉乘'
                : `轉乘 ${route.transferCount} 次`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleReverseOrder}
            title="切換起終點排列方向"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{reverseOrder ? '終點在上 ↑' : '起點在上 ↓'}</span>
          </button>

          <button
            type="button"
            onClick={onSelectForMap}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
              isSelectedOnMap
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>{isSelectedOnMap ? '地圖顯示中' : '地圖路線'}</span>
          </button>
        </div>
      </div>

      {/* Walking Nav to Start Station (Automatically uses Amap in Mainland China or Google Maps in HK/TW) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={buildSmartWalkingNavUrl(
            region,
            userRawLocation
              ? { ...userRawLocation, label: '我的位置' }
              : `${route.startStation.name}站`,
            route.startStation.name,
            stationData,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-[200px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
        >
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span>
            {navProviderName}步行至起點：{route.startStation.name}站
            {route.startStation.distance > 0
              ? ` (${formatDistance(route.startStation.distance)})`
              : ''}
          </span>
        </a>
      </div>

      {/* Timeline Body */}
      <div className="mt-4 space-y-3">
        {segmentsToRender.map((seg, idx) => {
          const realIdx = reverseOrder
            ? route.segments.length - 1 - idx
            : idx;
          const isExpanded = !!expandedSegments[realIdx];
          const isFirstSeg = realIdx === 0;
          const isLastSeg = realIdx === route.segments.length - 1;
          const intermediateList = reverseOrder
            ? [...seg.intermediateStations].reverse()
            : seg.intermediateStations;

          const startStationLines = getStationLines(
            seg.fromStation,
            stationData,
          );
          const endStationLines = getStationLines(seg.toStation, stationData);

          return (
            <div
              key={`${seg.line}-${realIdx}`}
              className="rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 p-3.5"
            >
              {/* First station of segment */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 ring-4 ring-white dark:ring-slate-900"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {reverseOrder ? seg.toStation : seg.fromStation}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {reverseOrder
                      ? isLastSeg
                        ? '終點站'
                        : '轉乘站'
                      : isFirstSeg
                        ? '起點站'
                        : '轉乘站'}
                  </span>
                </div>

                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {(reverseOrder ? endStationLines : startStationLines)
                    .slice(0, 3)
                    .map((l) => (
                      <span
                        key={l.name}
                        className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
                      >
                        {l.name}
                      </span>
                    ))}
                </div>
              </div>

              {/* Line & Direction Bar */}
              <div className="my-2.5 ml-1.5 pl-4 border-l-2 border-dashed border-slate-300 dark:border-slate-700 space-y-2">
                {seg.isOutStationTransfer ? (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <Footprints className="w-3.5 h-3.5" />
                    <span>
                      站外徒步轉乘 ({seg.fromStation} → {seg.toStation})
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        乘搭 {seg.line}
                      </span>
                      {seg.direction && (
                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <ArrowRight className="w-3 h-3" />往 {seg.direction}{' '}
                          方向
                        </span>
                      )}
                    </div>

                    {seg.intermediateStations.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSegment(realIdx)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <span className="font-mono-tabular">
                          途經 {seg.intermediateStations.length} 站 (共乘{' '}
                          {seg.intermediateStations.length + 1} 站)
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                )}

                {isExpanded && intermediateList.length > 0 && (
                  <div className="pt-1 pb-1 space-y-1.5">
                    {intermediateList.map((stName) => (
                      <div
                        key={stName}
                        className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0 opacity-75"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span>{stName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* End station of segment */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 ring-4 ring-white dark:ring-slate-900"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {reverseOrder ? seg.fromStation : seg.toStation}
                  </span>
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    {reverseOrder
                      ? isFirstSeg
                        ? '起點站'
                        : '在此站轉乘'
                      : isLastSeg
                        ? '抵達終點'
                        : '在此站轉乘'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Walking Nav from End Station to Destination */}
      <div className="mt-3">
        <a
          href={buildSmartWalkingNavUrl(
            region,
            route.endStation,
            destinationRawLocation
              ? { ...destinationRawLocation, label: '目的地' }
              : `${route.endStation}站`,
            stationData,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold transition"
        >
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span>
            {destinationRawLocation
              ? `出站後以${navProviderName}步行導航至目的地`
              : `在${navProviderName}查看終點：${route.endStation}站周邊步行路線`}
          </span>
        </a>
      </div>
    </div>
  );
};
