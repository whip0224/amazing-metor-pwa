import {
  CalculatedRoute,
  MetroGraph,
  MetroStationData,
  MetroTransferData,
  NearbyStation,
  RegionId,
  RegionInfo,
  RouteNode,
  RouteSegment,
  SearchPreference,
  TransferItem,
} from '../types/metro';

export const REGIONS: Record<
  RegionId,
  RegionInfo & { isMainlandChina: boolean; navProviderName: string }
> = {
  sz: {
    id: 'sz',
    name: '深圳地鐵 (SZ)',
    shortLabel: '深圳 SZ',
    defaultCenter: [22.5431, 114.0579],
    defaultZoom: 12,
    placeholderStart: '請輸入起點 (例如: 老街、車公廟)',
    placeholderEnd: '請輸入終點 (例如: 世界之窗)',
    isMainlandChina: true,
    navProviderName: '高德地圖',
  },
  hk: {
    id: 'hk',
    name: '香港港鐵 (HK)',
    shortLabel: '香港 HK',
    defaultCenter: [22.3193, 114.1694],
    defaultZoom: 12,
    placeholderStart: '請輸入起點 (例如: 中環、旺角)',
    placeholderEnd: '請輸入終點 (例如: 金鐘、尖沙咀)',
    isMainlandChina: false,
    navProviderName: 'Google Maps',
  },
  twp: {
    id: 'twp',
    name: '台灣鐵路/捷運 (TW)',
    shortLabel: '台北 TW',
    defaultCenter: [25.0478, 121.517],
    defaultZoom: 12,
    placeholderStart: '請輸入起點 (例如: 台北車站、西門)',
    placeholderEnd: '請輸入終點 (例如: 忠孝復興、淡水)',
    isMainlandChina: false,
    navProviderName: 'Google Maps',
  },
};

const LINE_SPEEDS: Record<string, number> = {
  // 香港 HK
  東涌綫: 80,
  機場快綫: 80,
  東鐵綫: 50,
  屯馬綫: 50,
  落馬洲支綫: 50,
  馬場支綫: 50,
  荃灣綫: 33,
  觀塘綫: 33,
  港島綫: 33,
  將軍澳綫: 33,
  康城支綫: 33,
  南港島綫: 33,
  迪士尼綫: 33,
  // 台灣 TWP
  桃園機場線: 60,
  文湖線: 30,
  環狀線: 30,
  // 深圳 SZ
  '11號線': 60,
  '14號線': 60,
  // 步行速度 (站外轉乘)
  站外轉乘: 4,
};

export function buildMetroGraph(
  stationData: MetroStationData,
  transferData: MetroTransferData | null,
): MetroGraph {
  const graph: MetroGraph = {};
  if (!stationData || !stationData.lines) return graph;

  stationData.lines.forEach((line) => {
    const ss = line.stations;
    for (let i = 0; i < ss.length; i++) {
      const cur = ss[i];
      if (!graph[cur]) graph[cur] = [];
      if (i > 0) {
        graph[cur].push({
          station: ss[i - 1],
          line: line.name,
          color: line.color,
        });
      }
      if (i < ss.length - 1) {
        graph[cur].push({
          station: ss[i + 1],
          line: line.name,
          color: line.color,
        });
      }
    }
  });

  if (transferData?.specialTransfers) {
    transferData.specialTransfers.forEach((st) => {
      if (!graph[st.from]) graph[st.from] = [];
      if (!graph[st.to]) graph[st.to] = [];
      graph[st.from].push({
        station: st.to,
        line: st.type,
        color: '#64748b',
      });
      graph[st.to].push({
        station: st.from,
        line: st.type,
        color: '#64748b',
      });
    });
  }

  return graph;
}

/**
 * 自動從 metro_station.json 推算所有站內轉乘站 (出現於 >= 2 條路線的同名車站)
 */
export function autoGenerateTransfers(
  stationData: MetroStationData,
  existingSpecialTransfers = [
    { from: '尖沙咀', to: '尖東', type: '站外轉乘' },
    { from: '中環', to: '香港', type: '站外轉乘' },
    { from: '柯士甸', to: '九龍', type: '站外轉乘' },
  ],
): MetroTransferData {
  const stationLinesMap = new Map<string, string[]>();

  stationData.lines.forEach((line) => {
    line.stations.forEach((st) => {
      const list = stationLinesMap.get(st) || [];
      if (!list.includes(line.name)) {
        list.push(line.name);
      }
      stationLinesMap.set(st, list);
    });
  });

  const transfers: TransferItem[] = [];
  stationLinesMap.forEach((lines, station) => {
    if (lines.length >= 2) {
      transfers.push({ station, lines });
    }
  });

  return {
    transfers,
    specialTransfers: existingSpecialTransfers,
  };
}

export function getStationLines(
  stationName: string,
  stationData: MetroStationData | null,
): { name: string; color: string }[] {
  if (!stationData?.lines) return [];
  const result: { name: string; color: string }[] = [];
  stationData.lines.forEach((line) => {
    if (line.stations.includes(stationName)) {
      result.push({ name: line.name, color: line.color });
    }
  });
  return result;
}

export function findShortestPath(
  graph: MetroGraph,
  start: string,
  end: string,
  pref: SearchPreference,
): RouteNode[] | null {
  if (!graph[start] || !graph[end]) return null;
  if (start === end) {
    return [{ station: start, line: null, color: null }];
  }

  const pq: { cost: number; path: RouteNode[] }[] = [
    { cost: 0, path: [{ station: start, line: null, color: null }] },
  ];
  const minCost: Record<string, number> = {};

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost);
    const cur = pq.shift()!;
    const last = cur.path[cur.path.length - 1];
    if (last.station === end) return cur.path;

    const neighbors = graph[last.station] || [];
    for (const n of neighbors) {
      const isTransfer = last.line !== null && last.line !== n.line;
      const weight =
        pref === 'transfer' ? (isTransfer ? 100 : 1) : isTransfer ? 1.15 : 1;
      const newCost = cur.cost + weight;
      const key = `${n.station}_${n.line}`;
      if (minCost[key] === undefined || newCost < minCost[key]) {
        minCost[key] = newCost;
        pq.push({ cost: newCost, path: [...cur.path, n] });
      }
    }
  }
  return null;
}

export function calculateRouteCost(
  path: RouteNode[],
  pref: SearchPreference,
): number {
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    if (path[i - 1].line !== null && path[i - 1].line !== path[i].line) {
      cost += pref === 'transfer' ? 100 : 1.15;
    } else {
      cost += 1;
    }
  }
  return cost;
}

export function getTrainDirection(
  currentStation: string,
  nextStation: string,
  lineName: string,
  stationData: MetroStationData,
): string {
  if (!lineName || lineName === '站外轉乘') return '';
  const line = stationData.lines.find((l) => l.name === lineName);
  if (!line || !line.stations.length) return '';

  const currentIndex = line.stations.indexOf(currentStation);
  const nextIndex = line.stations.indexOf(nextStation);
  if (currentIndex === -1 || nextIndex === -1) return '';

  return nextIndex > currentIndex
    ? line.stations[line.stations.length - 1]
    : line.stations[0];
}

export function buildRouteSegments(
  path: RouteNode[],
  stationData: MetroStationData,
): RouteSegment[] {
  if (path.length < 2) return [];
  const segments: RouteSegment[] = [];

  let segStartIdx = 0;
  for (let i = 1; i < path.length; i++) {
    const currentLine = path[i].line || '';
    const isLastNode = i === path.length - 1;
    const nextLineChanges = !isLastNode && path[i + 1].line !== currentLine;

    if (isLastNode || nextLineChanges) {
      const fromStation = path[segStartIdx].station;
      const toStation = path[i].station;
      const firstNextStation = path[segStartIdx + 1].station;
      const allStations = path.slice(segStartIdx, i + 1).map((n) => n.station);
      const intermediateStations = allStations.slice(1, -1);
      const isOutStationTransfer = currentLine === '站外轉乘';
      const direction = isOutStationTransfer
        ? ''
        : getTrainDirection(
            fromStation,
            firstNextStation,
            currentLine,
            stationData,
          );

      segments.push({
        line: currentLine,
        color: path[i].color || '#3b82f6',
        direction,
        fromStation,
        toStation,
        intermediateStations,
        allStations,
        isOutStationTransfer,
      });

      segStartIdx = i;
    }
  }

  return segments;
}

export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateEstimatedMinutes(
  path: RouteNode[],
  stationData: MetroStationData,
): number {
  let totalMinutes = 0;

  for (let i = 1; i < path.length; i++) {
    const prevNode = path[i - 1];
    const currNode = path[i];

    const coords1 = stationData.coordinates?.[prevNode.station];
    const coords2 = stationData.coordinates?.[currNode.station];

    if (coords1 && coords2) {
      const distKm =
        calculateDistanceMeters(
          coords1.lat,
          coords1.lng,
          coords2.lat,
          coords2.lng,
        ) / 1000;
      const speed = (currNode.line && LINE_SPEEDS[currNode.line]) || 35;
      totalMinutes += (distKm / speed) * 60;
    } else {
      totalMinutes += 2.2;
    }

    if (i < path.length - 1) {
      const nextNode = path[i + 1];
      if (currNode.line !== nextNode.line) {
        totalMinutes += 4;
      } else {
        totalMinutes += 1;
      }
    }
  }

  return Math.max(1, Math.ceil(totalMinutes));
}

export function findTopNearbyStations(
  lat: number,
  lng: number,
  stationData: MetroStationData,
  diverseLines: boolean,
): NearbyStation[] {
  if (!stationData?.coordinates) return [];

  const all: NearbyStation[] = [];
  for (const name of Object.keys(stationData.coordinates)) {
    const c = stationData.coordinates[name];
    const distance = calculateDistanceMeters(lat, lng, c.lat, c.lng);
    const lines = getStationLines(name, stationData);
    all.push({ name, distance, lines });
  }

  all.sort((a, b) => a.distance - b.distance);
  if (all.length === 0) return [];

  if (!diverseLines) {
    return all.slice(0, 3);
  }

  const filtered: NearbyStation[] = [];
  const seenLines = new Set<string>();

  filtered.push(all[0]);
  all[0].lines.forEach((l) => seenLines.add(l.name));

  for (let i = 1; i < all.length; i++) {
    const st = all[i];
    const myLines = st.lines.map((l) => l.name);
    if (!myLines.every((ln) => seenLines.has(ln))) {
      filtered.push(st);
      myLines.forEach((ln) => seenLines.add(ln));
    }
    if (filtered.length >= 3) break;
  }

  return filtered;
}

export function computeRoutes(
  graph: MetroGraph,
  stationData: MetroStationData,
  candidates: NearbyStation[],
  endStation: string,
  pref: SearchPreference,
): CalculatedRoute[] {
  const results: CalculatedRoute[] = [];

  candidates.forEach((startObj, idx) => {
    const path = findShortestPath(graph, startObj.name, endStation, pref);
    if (path && path.length >= 2) {
      const segments = buildRouteSegments(path, stationData);
      const totalStations = path.length - 1;
      const transferCount = Math.max(0, segments.length - 1);
      const estimatedMinutes = calculateEstimatedMinutes(path, stationData);
      const cost = calculateRouteCost(path, pref);

      results.push({
        id: `${startObj.name}-${endStation}-${idx}`,
        startStation: startObj,
        endStation,
        path,
        segments,
        totalStations,
        transferCount,
        estimatedMinutes,
        cost,
      });
    }
  });

  results.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.estimatedMinutes - b.estimatedMinutes;
  });

  return results.slice(0, 3);
}

export function formatDistance(meters: number): string {
  if (meters <= 0) return '';
  return meters < 1000
    ? `${Math.round(meters)}m`
    : `${(meters / 1000).toFixed(2)}km`;
}

// =========================================================
// 國際標準座標 (WGS-84) 轉 國內高德/國測局火星座標 (GCJ-02)
// 解決國內高德步行導航座標偏移 300~500 公尺的問題
// =========================================================
function transformLat(x: number, y: number): number {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * Math.PI) +
      20.0 * Math.sin(2.0 * x * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * Math.PI) +
      320 * Math.sin((y * Math.PI) / 30.0)) *
      2.0) /
    3.0;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * Math.PI) +
      20.0 * Math.sin(2.0 * x * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * Math.PI) +
      300.0 * Math.sin((x / 30.0) * Math.PI)) *
      2.0) /
    3.0;
  return ret;
}

export function wgs84ToGcj02(
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLon = transformLon(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return {
    lat: Number((lat + dLat).toFixed(6)),
    lng: Number((lng + dLon).toFixed(6)),
  };
}

/**
 * 智慧型跨區步行導航產生器：
 * - 國內環境 (如深圳 sz)：自動轉為 GCJ-02 座標並開啟「高德地圖 (Amap)」步行導航
 * - 海外及港澳台 (hk / twp)：使用「Google Maps」步行導航
 */
export function buildSmartWalkingNavUrl(
  region: RegionId,
  origin: { lat: number; lng: number; label?: string } | string,
  dest: { lat: number; lng: number; label?: string } | string,
  stationData?: MetroStationData | null,
): string {
  const isMainland = REGIONS[region]?.isMainlandChina;

  // Helper to resolve station string (e.g., "老街") to coordinates if present in stationData
  const resolvePoint = (
    pt: { lat: number; lng: number; label?: string } | string,
    defaultLabel: string,
  ): { lat?: number; lng?: number; name: string } => {
    if (typeof pt === 'object' && pt.lat !== undefined && pt.lng !== undefined) {
      return { lat: pt.lat, lng: pt.lng, name: pt.label || defaultLabel };
    }
    const rawName = String(pt).replace(/站$/, '');
    const coord = stationData?.coordinates?.[rawName];
    if (coord) {
      return {
        lat: coord.lat,
        lng: coord.lng,
        name: `${rawName}地鐵站`,
      };
    }
    return { name: String(pt) };
  };

  if (isMainland) {
    // 高德地圖 URI API: https://uri.amap.com/navigation?from=lng,lat,name&to=lng,lat,name&mode=walk&callnative=1
    const fromPt = resolvePoint(origin, '我的位置');
    const toPt = resolvePoint(dest, '目的地');

    if (
      fromPt.lat !== undefined &&
      fromPt.lng !== undefined &&
      toPt.lat !== undefined &&
      toPt.lng !== undefined
    ) {
      const fromGcj = wgs84ToGcj02(fromPt.lat, fromPt.lng);
      const toGcj = wgs84ToGcj02(toPt.lat, toPt.lng);
      return `https://uri.amap.com/navigation?from=${fromGcj.lng},${fromGcj.lat},${encodeURIComponent(fromPt.name)}&to=${toGcj.lng},${toGcj.lat},${encodeURIComponent(toPt.name)}&mode=walk&policy=0&src=metro_pwa&coordinate=gaode&callnative=1`;
    }

    // Fallback to Amap marker/search if one side has no coordinates
    if (toPt.lat !== undefined && toPt.lng !== undefined) {
      const toGcj = wgs84ToGcj02(toPt.lat, toPt.lng);
      return `https://uri.amap.com/marker?position=${toGcj.lng},${toGcj.lat}&name=${encodeURIComponent(toPt.name)}&src=metro_pwa&coordinate=gaode&callnative=1`;
    }

    return `https://uri.amap.com/search?keyword=${encodeURIComponent(toPt.name)}&city=深圳&callnative=1`;
  }

  // 香港 / 台灣：Google Maps 步行導航
  let url = 'https://www.google.com/maps/dir/?api=1&travelmode=walking';
  if (typeof origin === 'object' && origin.lat) {
    url += `&origin=${origin.lat},${origin.lng}`;
  } else {
    url += `&origin=${encodeURIComponent(String(origin))}`;
  }
  if (typeof dest === 'object' && dest.lat) {
    url += `&destination=${dest.lat},${dest.lng}`;
  } else {
    url += `&destination=${encodeURIComponent(String(dest))}`;
  }
  return url;
}
