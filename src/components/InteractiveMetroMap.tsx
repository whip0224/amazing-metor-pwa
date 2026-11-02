import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Check, RotateCcw } from 'lucide-react';
import {
  CalculatedRoute,
  MetroStationData,
  RegionId,
} from '../types/metro';
import { REGIONS } from '../lib/metroEngine';

interface InteractiveMetroMapProps {
  region: RegionId;
  stationData: MetroStationData | null;
  selectedRoute: CalculatedRoute | null;
  pickerTarget: 'start' | 'end' | null;
  onCancelPicker: () => void;
  onConfirmPickedCoords: (
    lat: number,
    lng: number,
    target: 'start' | 'end',
  ) => void;
  onSelectStationFromMap: (stationName: string, target: 'start' | 'end') => void;
}

export const InteractiveMetroMap: React.FC<InteractiveMetroMapProps> = ({
  region,
  stationData,
  selectedRoute,
  pickerTarget,
  onCancelPicker,
  onConfirmPickedCoords,
  onSelectStationFromMap,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const allStationsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const pickerMarkerRef = useRef<L.CircleMarker | null>(null);

  const [pickedLatLng, setPickedLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [showAllNetworkStations, setShowAllNetworkStations] = useState(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const regionInfo = REGIONS[region];
    const map = L.map(mapContainerRef.current, {
      center: regionInfo.defaultCenter,
      zoom: regionInfo.defaultZoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    routeLayerGroupRef.current = L.layerGroup().addTo(map);
    allStationsLayerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recenter map when region changes
  useEffect(() => {
    if (!mapRef.current) return;
    const regionInfo = REGIONS[region];
    mapRef.current.setView(regionInfo.defaultCenter, regionInfo.defaultZoom);
    setPickedLatLng(null);
    if (pickerMarkerRef.current) {
      pickerMarkerRef.current.remove();
      pickerMarkerRef.current = null;
    }
  }, [region]);

  // Handle Map Click for Coordinate Picker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!pickerTarget) return;
      const { lat, lng } = e.latlng;
      setPickedLatLng({ lat, lng });

      if (pickerMarkerRef.current) {
        pickerMarkerRef.current.setLatLng(e.latlng);
      } else {
        pickerMarkerRef.current = L.circleMarker(e.latlng, {
          radius: 10,
          color: '#ffffff',
          weight: 3,
          fillColor: pickerTarget === 'start' ? '#16a34a' : '#dc2626',
          fillOpacity: 1,
        }).addTo(map);
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [pickerTarget]);

  // Clear picker marker when exiting picker mode
  useEffect(() => {
    if (!pickerTarget) {
      setPickedLatLng(null);
      if (pickerMarkerRef.current) {
        pickerMarkerRef.current.remove();
        pickerMarkerRef.current = null;
      }
    }
  }, [pickerTarget]);

  // Render All Network Stations when toggled
  useEffect(() => {
    const group = allStationsLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!showAllNetworkStations || !stationData?.coordinates) return;

    Object.entries(stationData.coordinates).forEach(([stationName, coord]) => {
      const marker = L.circleMarker([coord.lat, coord.lng], {
        radius: 5,
        color: '#334155',
        weight: 1.5,
        fillColor: '#ffffff',
        fillOpacity: 0.9,
      });

      const popupDiv = document.createElement('div');
      popupDiv.className = 'text-xs space-y-2 p-1';
      popupDiv.innerHTML = `
        <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px;">${stationName}</div>
        <div style="display:flex;gap:6px;">
          <button id="set-start-btn" style="padding:4px 8px;background:#16a34a;color:white;border-radius:6px;border:none;cursor:pointer;font-weight:600;">設為起點</button>
          <button id="set-end-btn" style="padding:4px 8px;background:#2563eb;color:white;border-radius:6px;border:none;cursor:pointer;font-weight:600;">設為終點</button>
        </div>
      `;

      popupDiv
        .querySelector('#set-start-btn')
        ?.addEventListener('click', () => {
          onSelectStationFromMap(stationName, 'start');
          mapRef.current?.closePopup();
        });
      popupDiv.querySelector('#set-end-btn')?.addEventListener('click', () => {
        onSelectStationFromMap(stationName, 'end');
        mapRef.current?.closePopup();
      });

      marker.bindPopup(popupDiv);
      marker.addTo(group);
    });
  }, [showAllNetworkStations, stationData, onSelectStationFromMap]);

  // Render Selected Route Polyline & Station Nodes
  useEffect(() => {
    const map = mapRef.current;
    const group = routeLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    if (!selectedRoute || !stationData?.coordinates) return;

    const boundsLatLngs: L.LatLngExpression[] = [];

    // Draw each segment polyline with its official line color
    selectedRoute.segments.forEach((seg) => {
      const segCoords: L.LatLngExpression[] = [];
      seg.allStations.forEach((st) => {
        const c = stationData.coordinates[st];
        if (c) {
          segCoords.push([c.lat, c.lng]);
          boundsLatLngs.push([c.lat, c.lng]);
        }
      });

      if (segCoords.length >= 2) {
        L.polyline(segCoords, {
          color: seg.color || '#2563eb',
          weight: 6,
          opacity: 0.9,
          dashArray: seg.isOutStationTransfer ? '8, 8' : undefined,
        }).addTo(group);
      }
    });

    // Draw station markers along the route
    const transferStationSet = new Set<string>();
    selectedRoute.segments.forEach((seg, idx) => {
      if (idx > 0) transferStationSet.add(seg.fromStation);
    });

    selectedRoute.path.forEach((node, idx) => {
      const c = stationData.coordinates[node.station];
      if (!c) return;

      const isStart = idx === 0;
      const isEnd = idx === selectedRoute.path.length - 1;
      const isTransfer = transferStationSet.has(node.station);

      const radius = isStart || isEnd ? 8 : isTransfer ? 7 : 4.5;
      const fillColor = isStart
        ? '#16a34a'
        : isEnd
          ? '#dc2626'
          : isTransfer
            ? '#f59e0b'
            : '#ffffff';

      const marker = L.circleMarker([c.lat, c.lng], {
        radius,
        color: '#0f172a',
        weight: isStart || isEnd || isTransfer ? 2.5 : 1.5,
        fillColor,
        fillOpacity: 1,
      });

      const roleLabel = isStart
        ? '起點站'
        : isEnd
          ? '終點站'
          : isTransfer
            ? '轉乘站'
            : `途經第 ${idx} 站`;

      marker.bindTooltip(`${node.station} (${roleLabel})`, {
        permanent: isStart || isEnd || isTransfer,
        direction: 'top',
        offset: [0, -8],
      });

      marker.addTo(group);
    });

    if (boundsLatLngs.length >= 2) {
      map.fitBounds(L.latLngBounds(boundsLatLngs), {
        padding: [40, 40],
        maxZoom: 15,
      });
    }
  }, [selectedRoute, stationData]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs flex flex-col">
      {/* Map Header Controls */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {pickerTarget
              ? `請點擊地圖選擇${pickerTarget === 'start' ? '起點' : '終點'}位置`
              : selectedRoute
                ? `路線軌跡圖：${selectedRoute.startStation.name} → ${selectedRoute.endStation}`
                : '互動式地鐵路網地圖'}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAllNetworkStations((v) => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
              showAllNetworkStations
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {showAllNetworkStations ? '隱藏全網車站點' : '顯示全網車站點'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!mapRef.current) return;
              const info = REGIONS[region];
              mapRef.current.setView(info.defaultCenter, info.defaultZoom);
            }}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            title="重設地圖視角"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Picker Active Banner */}
      {pickerTarget && (
        <div className="bg-blue-50 dark:bg-blue-950/60 border-b border-blue-200 dark:border-blue-900 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-blue-900 dark:text-blue-200">
            {pickedLatLng
              ? `已選擇座標 (${pickedLatLng.lat.toFixed(4)}, ${pickedLatLng.lng.toFixed(4)})，點擊「確認座標」自動搜尋最近車站`
              : `請在下方地圖直接點選您的${pickerTarget === 'start' ? '出發位置' : '目的地位置'}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancelPicker}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!pickedLatLng}
              onClick={() => {
                if (pickedLatLng) {
                  onConfirmPickedCoords(
                    pickedLatLng.lat,
                    pickedLatLng.lng,
                    pickerTarget,
                  );
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white disabled:opacity-40 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>確認座標</span>
            </button>
          </div>
        </div>
      )}

      {/* Map Canvas */}
      <div
        ref={mapContainerRef}
        className="w-full h-[380px] sm:h-[460px] bg-slate-100 dark:bg-slate-800"
      />
    </div>
  );
};
