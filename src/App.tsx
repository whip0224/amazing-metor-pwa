import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  ArrowUpDown,
  LocateFixed,
  MapPin,
  Search,
  Star,
  Trash2,
  ListFilter,
  Moon,
  Sun,
  History,
  Compass,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  CalculatedRoute,
  MetroStationData,
  MetroTransferData,
  NearbyStation,
  RegionId,
  SavedRoute,
  SearchPreference,
} from './types/metro';
import {
  REGIONS,
  autoGenerateTransfers,
  buildMetroGraph,
  computeRoutes,
  findTopNearbyStations,
  formatDistance,
  getStationLines,
} from './lib/metroEngine';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineBanner } from './components/OfflineBanner';
import { StationSelectorModal } from './components/StationSelectorModal';
import { RouteCard } from './components/RouteCard';
import { InteractiveMetroMap } from './components/InteractiveMetroMap';
import { DataSyncModal } from './components/DataSyncModal';
import { BUILT_IN_METRO_DATA } from './data/builtInMetroData';

export function App() {
  // Theme State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('metro_theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('metro_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('metro_theme', 'light');
    }
  }, [darkMode]);

  // Core Region & Station Data State
  const [region, setRegion] = useState<RegionId>(() => {
    const saved = localStorage.getItem('metro_saved_region') as RegionId | null;
    return saved && REGIONS[saved] ? saved : 'sz';
  });

  const [stationData, setStationData] = useState<MetroStationData | null>(
    () => BUILT_IN_METRO_DATA[region].stationData,
  );
  const [transferData, setTransferData] = useState<MetroTransferData | null>(
    () => BUILT_IN_METRO_DATA[region].transferData,
  );
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);

  // Inputs & Preferences
  const [startStation, setStartStation] = useState<string>(
    () => localStorage.getItem('metro_saved_start') || '',
  );
  const [endStation, setEndStation] = useState<string>(
    () => localStorage.getItem('metro_saved_end') || '',
  );
  const [searchPref, setSearchPref] = useState<SearchPreference>('transfer');
  const [reverseOrder, setReverseOrder] = useState<boolean>(false);

  // Nearby & Location State
  const [userRawLocation, setUserRawLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [destinationRawLocation, setDestinationRawLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [nearbyStartStations, setNearbyStartStations] = useState<
    NearbyStation[]
  >([]);
  const [nearbyEndStations, setNearbyEndStations] = useState<NearbyStation[]>(
    [],
  );
  const [isUsingAutoLocation, setIsUsingAutoLocation] =
    useState<boolean>(false);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);

  // Autocomplete Dropdown State
  const [focusedInput, setFocusedInput] = useState<'start' | 'end' | null>(
    null,
  );
  const startWrapperRef = useRef<HTMLDivElement>(null);
  const endWrapperRef = useRef<HTMLDivElement>(null);

  // Modals & Map Picker
  const [selectorModalTarget, setSelectorModalTarget] = useState<
    'start' | 'end' | null
  >(null);
  const [mapPickerTarget, setMapPickerTarget] = useState<
    'start' | 'end' | null
  >(null);
  const [isDataSyncModalOpen, setIsDataSyncModalOpen] =
    useState<boolean>(false);

  // Calculated Routes & Selected Map Route
  const [routes, setRoutes] = useState<CalculatedRoute[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Saved Favorites & Recent Searches
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => {
    try {
      const raw = localStorage.getItem('metro_favorite_routes');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [recentRoutes, setRecentRoutes] = useState<SavedRoute[]>(() => {
    try {
      const raw = localStorage.getItem('metro_recent_routes');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Close autocomplete on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        startWrapperRef.current &&
        !startWrapperRef.current.contains(e.target as Node) &&
        endWrapperRef.current &&
        !endWrapperRef.current.contains(e.target as Node)
      ) {
        setFocusedInput(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load Region Data (immediately uses built-in or localStorage custom synced version, and refreshes from ./cities/ in background)
  useEffect(() => {
    let active = true;
    setFeedbackMessage(null);

    // 1. 先立即載入本機已同步版本或內建版本，確保 0 延遲、永不失敗
    const cachedS = localStorage.getItem(`metro_custom_station_${region}`);
    const cachedT = localStorage.getItem(`metro_custom_transfer_${region}`);
    if (cachedS) {
      try {
        const parsedS = JSON.parse(cachedS) as MetroStationData;
        const parsedT = cachedT
          ? (JSON.parse(cachedT) as MetroTransferData)
          : autoGenerateTransfers(
              parsedS,
              BUILT_IN_METRO_DATA[region].transferData.specialTransfers || [],
            );
        setStationData(parsedS);
        setTransferData(parsedT);
      } catch {
        setStationData(BUILT_IN_METRO_DATA[region].stationData);
        setTransferData(BUILT_IN_METRO_DATA[region].transferData);
      }
    } else {
      setStationData(BUILT_IN_METRO_DATA[region].stationData);
      setTransferData(BUILT_IN_METRO_DATA[region].transferData);
    }

    // 2. 背景靜默檢查 ./cities/ JSON
    Promise.all([
      fetch(`./cities/${region}/metro_station.json`).then((r) => {
        if (!r.ok) throw new Error('Failed to load station data');
        return r.json();
      }),
      fetch(`./cities/${region}/metro_transfer.json`).then((r) => {
        if (!r.ok) throw new Error('Failed to load transfer data');
        return r.json();
      }),
    ])
      .then(([sData, tData]: [MetroStationData, MetroTransferData]) => {
        if (!active || !sData?.lines) return;
        if (!localStorage.getItem(`metro_custom_station_${region}`)) {
          const autoTransfers = autoGenerateTransfers(
            sData,
            tData.specialTransfers || [],
          );
          setStationData(sData);
          setTransferData(autoTransfers);
        }
        setIsLoadingData(false);
      })
      .catch(() => {
        if (!active) return;
        setIsLoadingData(false);
      });

    return () => {
      active = false;
    };
  }, [region]);

  // Build Metro Graph & Station Name List
  const metroGraph = useMemo(() => {
    if (!stationData) return {};
    return buildMetroGraph(stationData, transferData);
  }, [stationData, transferData]);

  const allStationNames = useMemo(() => {
    if (!stationData?.lines) return [];
    const set = new Set<string>();
    stationData.lines.forEach((l) => l.stations.forEach((s) => set.add(s)));
    return Array.from(set);
  }, [stationData]);

  // Auto-restore route once data loads
  useEffect(() => {
    if (!stationData || isLoadingData) return;
    const s = startStation.trim();
    const e = endStation.trim();
    if (s && e && metroGraph[s] && metroGraph[e]) {
      executeRouteSearch(s, e, searchPref, false);
    }
  }, [stationData, isLoadingData]);

  const handlePreferenceChange = (newPref: SearchPreference) => {
    setSearchPref(newPref);
    if (routes.length > 0 || (startStation.trim() && endStation.trim())) {
      executeRouteSearch(
        startStation.trim(),
        endStation.trim(),
        newPref,
        isUsingAutoLocation,
      );
    }
  };

  const handleRegionChange = (newRegion: RegionId) => {
    if (newRegion === region) return;
    setRegion(newRegion);
    localStorage.setItem('metro_saved_region', newRegion);
    localStorage.removeItem('metro_saved_start');
    localStorage.removeItem('metro_saved_end');
    setStartStation('');
    setEndStation('');
    setRoutes([]);
    setNearbyStartStations([]);
    setNearbyEndStations([]);
    setUserRawLocation(null);
    setDestinationRawLocation(null);
    setIsUsingAutoLocation(false);
    setMapPickerTarget(null);
    setFeedbackMessage(null);
  };

  const handleSwapStations = () => {
    const nextStart = endStation;
    const nextEnd = startStation;
    setStartStation(nextStart);
    setEndStation(nextEnd);
    setIsUsingAutoLocation(false);
    if (
      nextStart.trim() &&
      nextEnd.trim() &&
      metroGraph[nextStart.trim()] &&
      metroGraph[nextEnd.trim()]
    ) {
      executeRouteSearch(nextStart.trim(), nextEnd.trim(), searchPref, false);
    }
  };

  const executeRouteSearch = (
    manualStart: string,
    manualEnd: string,
    pref: SearchPreference,
    useAutoCandidates: boolean,
    customCandidates?: NearbyStation[],
  ) => {
    setFeedbackMessage(null);
    if (!stationData) return;

    if (!manualEnd) {
      setFeedbackMessage('請先輸入或選擇終點站。');
      return;
    }

    if (!metroGraph[manualEnd]) {
      setFeedbackMessage(
        `在${REGIONS[region].name}找不到終點站「${manualEnd}」。`,
      );
      return;
    }

    const activeCandidates = customCandidates || nearbyStartStations;

    let candidates: NearbyStation[] = [];
    if (useAutoCandidates && activeCandidates.length > 0) {
      candidates = activeCandidates;
    } else {
      if (!manualStart) {
        handleGpsLocate('start', true, manualEnd, pref);
        return;
      }
      if (!metroGraph[manualStart]) {
        setFeedbackMessage(
          `在${REGIONS[region].name}找不到起點站「${manualStart}」。`,
        );
        return;
      }
      candidates = [
        {
          name: manualStart,
          distance: 0,
          lines: getStationLines(manualStart, stationData),
        },
      ];
    }

    const computed = computeRoutes(
      metroGraph,
      stationData,
      candidates,
      manualEnd,
      pref,
    );

    if (computed.length === 0) {
      setRoutes([]);
      setFeedbackMessage('無法找到連接這兩個車站的路線。');
      return;
    }

    setRoutes(computed);
    setSelectedRouteIndex(0);

    const effectiveStart = computed[0].startStation.name;
    localStorage.setItem('metro_saved_start', effectiveStart);
    localStorage.setItem('metro_saved_end', manualEnd);

    const newEntry: SavedRoute = {
      id: `${region}:${effectiveStart}->${manualEnd}`,
      region,
      start: effectiveStart,
      end: manualEnd,
      createdAt: Date.now(),
    };
    setRecentRoutes((prev) => {
      const deduped = [
        newEntry,
        ...prev.filter((r) => r.id !== newEntry.id),
      ].slice(0, 6);
      localStorage.setItem('metro_recent_routes', JSON.stringify(deduped));
      return deduped;
    });
  };

  const handleCoordinatesResolved = (
    lat: number,
    lng: number,
    target: 'start' | 'end',
    autoRunRoute = false,
    overrideEnd?: string,
    overridePref?: SearchPreference,
  ) => {
    if (!stationData) return;

    if (target === 'start') {
      setUserRawLocation({ lat, lng });
      setIsUsingAutoLocation(true);
      const top = findTopNearbyStations(lat, lng, stationData, true);
      setNearbyStartStations(top);
      if (top.length > 0) {
        setStartStation(top[0].name);
      }
      const endToUse = (overrideEnd ?? endStation).trim();
      if (autoRunRoute && endToUse && metroGraph[endToUse]) {
        executeRouteSearch(
          top[0]?.name || '',
          endToUse,
          overridePref ?? searchPref,
          true,
          top,
        );
      }
    } else {
      setDestinationRawLocation({ lat, lng });
      const top = findTopNearbyStations(lat, lng, stationData, false);
      setNearbyEndStations(top);
      if (top.length > 0) {
        setEndStation(top[0].name);
        if (startStation.trim() && metroGraph[startStation.trim()]) {
          executeRouteSearch(
            startStation.trim(),
            top[0].name,
            searchPref,
            isUsingAutoLocation,
          );
        }
      }
    }
  };

  const handleGpsLocate = (
    target: 'start' | 'end',
    autoRunRoute = false,
    overrideEnd?: string,
    overridePref?: SearchPreference,
  ) => {
    if (!navigator.geolocation) {
      setFeedbackMessage('您的瀏覽器不支援 GPS 定位，請使用「地圖選點」功能。');
      return;
    }
    setIsLocatingGps(true);
    setFeedbackMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        handleCoordinatesResolved(
          pos.coords.latitude,
          pos.coords.longitude,
          target,
          autoRunRoute,
          overrideEnd,
          overridePref,
        );
      },
      () => {
        setIsLocatingGps(false);
        setFeedbackMessage(
          '無法取得目前 GPS 位置，您可以點擊「地圖選點」直接在右側地圖點選位置。',
        );
      },
      { enableHighAccuracy: true, timeout: 6000 },
    );
  };

  const currentPrimaryRoute = routes[0];
  const isCurrentFavorite = useMemo(() => {
    if (!currentPrimaryRoute) return false;
    const id = `${region}:${currentPrimaryRoute.startStation.name}->${currentPrimaryRoute.endStation}`;
    return savedRoutes.some((r) => r.id === id);
  }, [currentPrimaryRoute, region, savedRoutes]);

  const toggleSaveCurrentRoute = () => {
    if (!currentPrimaryRoute) return;
    const id = `${region}:${currentPrimaryRoute.startStation.name}->${currentPrimaryRoute.endStation}`;
    setSavedRoutes((prev) => {
      const exists = prev.some((r) => r.id === id);
      const next = exists
        ? prev.filter((r) => r.id !== id)
        : [
            {
              id,
              region,
              start: currentPrimaryRoute.startStation.name,
              end: currentPrimaryRoute.endStation,
              createdAt: Date.now(),
            },
            ...prev,
          ];
      localStorage.setItem('metro_favorite_routes', JSON.stringify(next));
      return next;
    });
  };

  const getAutocompleteMatches = (val: string) => {
    const q = val.trim();
    if (!q) return [];
    return allStationNames.filter((s) => s.includes(q)).slice(0, 8);
  };

  const startMatches =
    focusedInput === 'start' ? getAutocompleteMatches(startStation) : [];
  const endMatches =
    focusedInput === 'end' ? getAutocompleteMatches(endStation) : [];

  const regionFavorites = savedRoutes.filter((r) => r.region === region);
  const regionRecents = recentRoutes.filter((r) => r.region === region);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <OfflineBanner />

      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Brand Title */}
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            地鐵極速導航
          </a>

          {/* Zone 2: 5 Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            {(Object.keys(REGIONS) as RegionId[]).map((rId) => (
              <button
                key={rId}
                type="button"
                onClick={() => handleRegionChange(rId)}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  region === rId
                    ? 'text-blue-600 dark:text-blue-400 font-bold underline underline-offset-8'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {REGIONS[rId].shortLabel}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsDataSyncModalOpen(true)}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              更新路網資料
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {darkMode ? '淺色主題' : '深色主題'}
            </button>
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="md:hidden p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              aria-label="切換深淺色主題"
            >
              {darkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Responsive Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Route Planner Controls & Results */}
          <div className="lg:col-span-5 space-y-5">
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
              {/* Region Selector & Data Update Trigger */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    乘車路線規劃
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    步行導航自動採用{REGIONS[region].navProviderName} · 支援全離線查詢
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDataSyncModalOpen(true)}
                    title="一鍵更新路線資料與自動轉乘表工具"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>更新路網</span>
                  </button>
                  <select
                    aria-label="選擇地鐵地區"
                    value={region}
                    onChange={(e) =>
                      handleRegionChange(e.target.value as RegionId)
                    }
                    className="px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="sz">深圳地鐵 (SZ)</option>
                    <option value="twp">台灣鐵路/捷運 (TW)</option>
                    <option value="hk">香港港鐵 (HK)</option>
                  </select>
                </div>
              </div>

              {/* Start Station Input */}
              <div ref={startWrapperRef} className="space-y-2 relative">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="start-station-input"
                    className="text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    起點站
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleGpsLocate('start', false)}
                      disabled={isLocatingGps}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <LocateFixed className="w-3.5 h-3.5" />
                      <span>{isLocatingGps ? '定位中...' : '目前位置'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapPickerTarget('start')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 hover:bg-violet-100 transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>地圖選點</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectorModalTarget('start')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <ListFilter className="w-3.5 h-3.5" />
                      <span>依路線選</span>
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    id="start-station-input"
                    type="text"
                    autoComplete="off"
                    value={startStation}
                    onFocus={() => setFocusedInput('start')}
                    onChange={(e) => {
                      setStartStation(e.target.value);
                      setIsUsingAutoLocation(false);
                      setFocusedInput('start');
                    }}
                    placeholder={REGIONS[region].placeholderStart}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 outline-none transition"
                  />

                  {startMatches.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {startMatches.map((station) => {
                        const lines = getStationLines(station, stationData);
                        return (
                          <button
                            key={station}
                            type="button"
                            onClick={() => {
                              setStartStation(station);
                              setIsUsingAutoLocation(false);
                              setNearbyStartStations([]);
                              setFocusedInput(null);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {station}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {lines.map((l) => l.name).join(' · ')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {nearbyStartStations.length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      <span>
                        找到附近候選起點站（
                        {isUsingAutoLocation
                          ? '自動比對最佳路線中'
                          : '已鎖定單一車站'}
                        ）：
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      {nearbyStartStations.map((s) => (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => {
                            setStartStation(s.name);
                            setIsUsingAutoLocation(false);
                            setNearbyStartStations([]);
                            if (endStation.trim()) {
                              executeRouteSearch(
                                s.name,
                                endStation.trim(),
                                searchPref,
                                false,
                              );
                            }
                          }}
                          className="px-2.5 py-2 rounded-lg text-left text-xs bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition cursor-pointer"
                        >
                          <div className="font-bold text-blue-900 dark:text-blue-200 truncate">
                            {s.name}
                          </div>
                          <div className="text-[11px] font-mono-tabular text-blue-700 dark:text-blue-400">
                            約 {formatDistance(s.distance)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Swap Button Divider */}
              <div className="flex items-center justify-center -my-1">
                <button
                  type="button"
                  onClick={handleSwapStations}
                  title="對調起點與終點"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>對調起終點</span>
                </button>
              </div>

              {/* End Station Input */}
              <div ref={endWrapperRef} className="space-y-2 relative">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="end-station-input"
                    className="text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    終點站
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMapPickerTarget('end')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 hover:bg-violet-100 transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>地圖選點</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectorModalTarget('end')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <ListFilter className="w-3.5 h-3.5" />
                      <span>依路線選</span>
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    id="end-station-input"
                    type="text"
                    autoComplete="off"
                    value={endStation}
                    onFocus={() => setFocusedInput('end')}
                    onChange={(e) => {
                      setEndStation(e.target.value);
                      setFocusedInput('end');
                    }}
                    placeholder={REGIONS[region].placeholderEnd}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 outline-none transition"
                  />

                  {endMatches.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {endMatches.map((station) => {
                        const lines = getStationLines(station, stationData);
                        return (
                          <button
                            key={station}
                            type="button"
                            onClick={() => {
                              setEndStation(station);
                              setNearbyEndStations([]);
                              setFocusedInput(null);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {station}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {lines.map((l) => l.name).join(' · ')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {nearbyEndStations.length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      目的地附近最近車站：
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      {nearbyEndStations.map((s) => (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => {
                            setEndStation(s.name);
                            setNearbyEndStations([]);
                            if (startStation.trim()) {
                              executeRouteSearch(
                                startStation.trim(),
                                s.name,
                                searchPref,
                                isUsingAutoLocation,
                              );
                            }
                          }}
                          className="px-2.5 py-2 rounded-lg text-left text-xs bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 transition cursor-pointer"
                        >
                          <div className="font-bold text-blue-900 dark:text-blue-200 truncate">
                            {s.name}
                          </div>
                          <div className="text-[11px] font-mono-tabular text-blue-700 dark:text-blue-400">
                            約 {formatDistance(s.distance)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Search Preference Segmented Control */}
              <div className="pt-1 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  搜尋偏好
                </span>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handlePreferenceChange('transfer')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap shrink-0 ${
                      searchPref === 'transfer'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    最少轉乘
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreferenceChange('station')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap shrink-0 ${
                      searchPref === 'station'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    最少站數
                  </button>
                </div>
              </div>

              {feedbackMessage && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>{feedbackMessage}</span>
                </div>
              )}

              {/* Primary Search CTA + Save Favorite Button */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    executeRouteSearch(
                      startStation.trim(),
                      endStation.trim(),
                      searchPref,
                      isUsingAutoLocation,
                    )
                  }
                  className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm active:scale-[0.99] transition cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>開始路線規劃</span>
                </button>

                {currentPrimaryRoute && (
                  <button
                    type="button"
                    onClick={toggleSaveCurrentRoute}
                    title={
                      isCurrentFavorite ? '取消收藏此路線' : '收藏為常用路線'
                    }
                    className={`min-h-[46px] px-3.5 rounded-xl border inline-flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      isCurrentFavorite
                        ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        isCurrentFavorite ? 'fill-amber-400 text-amber-500' : ''
                      }`}
                    />
                    <span>{isCurrentFavorite ? '已收藏' : '收藏'}</span>
                  </button>
                )}
              </div>
            </section>

            {/* Quick Access: Favorites & Recent Searches */}
            {(regionFavorites.length > 0 || regionRecents.length > 0) && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
                {regionFavorites.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                      <span>常用收藏路線</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {regionFavorites.map((fav) => (
                        <button
                          key={fav.id}
                          type="button"
                          onClick={() => {
                            setStartStation(fav.start);
                            setEndStation(fav.end);
                            setIsUsingAutoLocation(false);
                            executeRouteSearch(
                              fav.start,
                              fav.end,
                              searchPref,
                              false,
                            );
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50/90 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200/80 dark:border-amber-900 hover:bg-amber-100 transition cursor-pointer"
                        >
                          {fav.start} → {fav.end}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {regionRecents.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                        <History className="w-3.5 h-3.5" />
                        <span>最近查詢紀錄</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRecentRoutes([]);
                          localStorage.removeItem('metro_recent_routes');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>清除</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {regionRecents.map((rec) => (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => {
                            setStartStation(rec.start);
                            setEndStation(rec.end);
                            setIsUsingAutoLocation(false);
                            executeRouteSearch(
                              rec.start,
                              rec.end,
                              searchPref,
                              false,
                            );
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                          {rec.start} → {rec.end}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Route Results List */}
            {routes.length > 0 ? (
              <section className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    系統推薦路線 ({routes.length} 個方案)
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    點擊「途經 N 站」可展開詳情
                  </span>
                </div>
                {routes.map((r, idx) => (
                  <RouteCard
                    key={r.id}
                    region={region}
                    route={r}
                    rank={idx + 1}
                    isSelectedOnMap={selectedRouteIndex === idx}
                    onSelectForMap={() => setSelectedRouteIndex(idx)}
                    stationData={stationData}
                    userRawLocation={userRawLocation}
                    destinationRawLocation={destinationRawLocation}
                    reverseOrder={reverseOrder}
                    onToggleReverseOrder={() => setReverseOrder((v) => !v)}
                  />
                ))}
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center space-y-2">
                <Compass className="w-8 h-8 text-blue-500 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  準備開始地鐵導航
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  輸入起點與終點，或點擊「目前位置」與「依路線選」快速規劃最短乘車路線。
                </p>
              </section>
            )}
          </div>

          {/* Right Column: Interactive Metro Map & Line Directory */}
          <div className="lg:col-span-7 space-y-5 lg:sticky lg:top-20">
            <InteractiveMetroMap
              region={region}
              stationData={stationData}
              selectedRoute={routes[selectedRouteIndex] || null}
              pickerTarget={mapPickerTarget}
              onCancelPicker={() => setMapPickerTarget(null)}
              onConfirmPickedCoords={(lat, lng, target) => {
                setMapPickerTarget(null);
                handleCoordinatesResolved(lat, lng, target, true);
              }}
              onSelectStationFromMap={(stName, target) => {
                if (target === 'start') {
                  setStartStation(stName);
                  setIsUsingAutoLocation(false);
                  if (endStation.trim()) {
                    executeRouteSearch(
                      stName,
                      endStation.trim(),
                      searchPref,
                      false,
                    );
                  }
                } else {
                  setEndStation(stName);
                  if (startStation.trim()) {
                    executeRouteSearch(
                      startStation.trim(),
                      stName,
                      searchPref,
                      isUsingAutoLocation,
                    );
                  }
                }
              }}
            />

            {stationData?.lines && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {REGIONS[region].name} 收錄路線一覽
                  </h3>
                  <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                    共 {stationData.lines.length} 條營運路線 ·{' '}
                    {allStationNames.length} 座車站
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {stationData.lines.map((line) => (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() =>
                        setSelectorModalTarget(
                          !startStation.trim() ? 'start' : 'end',
                        )
                      }
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400 text-xs font-medium text-slate-800 dark:text-slate-200 transition cursor-pointer"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: line.color }}
                      />
                      <span>{line.name}</span>
                      <span className="text-[11px] font-mono-tabular text-slate-400">
                        {line.stations.length}站
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Station Selector Modal */}
      <StationSelectorModal
        isOpen={selectorModalTarget !== null}
        targetField={selectorModalTarget || 'start'}
        stationData={stationData}
        onClose={() => setSelectorModalTarget(null)}
        onSelectStation={(st) => {
          if (selectorModalTarget === 'start') {
            setStartStation(st);
            setIsUsingAutoLocation(false);
            setNearbyStartStations([]);
            if (endStation.trim() && metroGraph[endStation.trim()]) {
              executeRouteSearch(st, endStation.trim(), searchPref, false);
            }
          } else {
            setEndStation(st);
            setNearbyEndStations([]);
            if (startStation.trim() && metroGraph[startStation.trim()]) {
              executeRouteSearch(
                startStation.trim(),
                st,
                searchPref,
                isUsingAutoLocation,
              );
            }
          }
        }}
      />

      {/* Automated Data Sync & Transfer Generator Modal */}
      <DataSyncModal
        isOpen={isDataSyncModalOpen}
        region={region}
        stationData={stationData}
        transferData={transferData}
        onClose={() => setIsDataSyncModalOpen(false)}
        onApplyUpdatedData={(newS, newT) => {
          setStationData(newS);
          setTransferData(newT);
        }}
      />
    </div>
  );
}

export default App;
