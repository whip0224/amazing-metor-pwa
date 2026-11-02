export type RegionId = 'sz' | 'hk' | 'twp';

export type SearchPreference = 'transfer' | 'station';

export interface RegionInfo {
  id: RegionId;
  name: string;
  shortLabel: string;
  defaultCenter: [number, number];
  defaultZoom: number;
  placeholderStart: string;
  placeholderEnd: string;
}

export interface MetroLine {
  id: string;
  name: string;
  color: string;
  stations: string[];
}

export interface StationCoordinate {
  lat: number;
  lng: number;
}

export interface MetroStationData {
  lines: MetroLine[];
  coordinates: Record<string, StationCoordinate>;
}

export interface TransferItem {
  station: string;
  lines: string[];
}

export interface SpecialTransferItem {
  from: string;
  to: string;
  type: string;
}

export interface MetroTransferData {
  transfers?: TransferItem[];
  specialTransfers?: SpecialTransferItem[];
}

export interface GraphEdge {
  station: string;
  line: string;
  color: string;
}

export type MetroGraph = Record<string, GraphEdge[]>;

export interface RouteNode {
  station: string;
  line: string | null;
  color: string | null;
}

export interface NearbyStation {
  name: string;
  distance: number; // meters
  lines: { name: string; color: string }[];
}

export interface RouteSegment {
  line: string;
  color: string;
  direction: string;
  fromStation: string;
  toStation: string;
  intermediateStations: string[];
  allStations: string[];
  isOutStationTransfer: boolean;
}

export interface CalculatedRoute {
  id: string;
  startStation: NearbyStation;
  endStation: string;
  path: RouteNode[];
  segments: RouteSegment[];
  totalStations: number;
  transferCount: number;
  estimatedMinutes: number;
  cost: number;
}

export interface SavedRoute {
  id: string;
  region: RegionId;
  start: string;
  end: string;
  createdAt: number;
}
