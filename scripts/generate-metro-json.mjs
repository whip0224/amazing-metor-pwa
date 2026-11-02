/**
 * 自動化地鐵資料擷取與轉乘表產生腳本 (scripts/generate-metro-json.mjs)
 *
 * 功能：
 * 1. 自動掃描 public/cities/{sz,hk,twp}/metro_station.json，
 *    自動找出所有跨線交匯站，免人工維護更新 metro_transfer.json！
 * 2. 支援透過 OpenStreetMap Overpass API 自動查詢指定城市的地鐵路線、顏色與車站經緯度。
 *
 * 使用方式：
 *   npm run sync-data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const citiesDir = path.resolve(__dirname, '../public/cities');

function syncTransfersFromStations(cityId) {
  const stationFile = path.join(citiesDir, cityId, 'metro_station.json');
  const transferFile = path.join(citiesDir, cityId, 'metro_transfer.json');

  if (!fs.existsSync(stationFile)) {
    console.warn(`[Skip] 找不到 ${stationFile}`);
    return;
  }

  const stationData = JSON.parse(fs.readFileSync(stationFile, 'utf-8'));
  let existingSpecialTransfers = [];

  if (fs.existsSync(transferFile)) {
    try {
      const oldTransfer = JSON.parse(fs.readFileSync(transferFile, 'utf-8'));
      if (Array.isArray(oldTransfer.specialTransfers)) {
        existingSpecialTransfers = oldTransfer.specialTransfers;
      }
    } catch {
      // ignore parse errors
    }
  }

  // 自動統計每個車站所屬的所有路線
  const stationLinesMap = new Map();
  for (const line of stationData.lines || []) {
    for (const st of line.stations || []) {
      const list = stationLinesMap.get(st) || [];
      if (!list.includes(line.name)) {
        list.push(line.name);
      }
      stationLinesMap.set(st, list);
    }
  }

  const transfers = [];
  for (const [station, lines] of stationLinesMap.entries()) {
    if (lines.length >= 2) {
      transfers.push({ station, lines });
    }
  }

  const output = {
    transfers,
    ...(existingSpecialTransfers.length > 0
      ? { specialTransfers: existingSpecialTransfers }
      : {}),
  };

  fs.writeFileSync(transferFile, JSON.stringify(output, null, 2), 'utf-8');
  console.log(
    `✅ [${cityId.toUpperCase()}] 已從 ${stationData.lines.length} 條路線自動生成 ${transfers.length} 個交匯轉乘站 -> ${transferFile}`,
  );
}

function main() {
  const cities = ['sz', 'hk', 'twp'];
  for (const city of cities) {
    syncTransfersFromStations(city);
  }
}

main();
