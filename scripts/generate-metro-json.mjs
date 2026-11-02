/**
 * 自動化地鐵資料擷取與轉乘表產生腳本 (scripts/generate-metro-json.mjs)
 *
 * 功能：
 * 1. 自動掃描 cities/{sz,hk,twp}/metro_station.json，
 *    自動找出所有跨線交匯站，免人工維護更新 metro_transfer.json！
 * 2. 同步複製完整 JSON 至 public/cities/ 供靜態伺服器與 PWA 快取使用。
 *
 * 使用方式：
 *   npm run sync-data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootCitiesDir = path.resolve(__dirname, '../cities');
const publicCitiesDir = path.resolve(__dirname, '../public/cities');

function syncTransfersFromStations(cityId) {
  const stationFile = path.join(rootCitiesDir, cityId, 'metro_station.json');
  const transferFile = path.join(rootCitiesDir, cityId, 'metro_transfer.json');

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

  const formattedTransfer = JSON.stringify(output, null, 2);
  fs.writeFileSync(transferFile, formattedTransfer, 'utf-8');

  // 同步至 public/cities/{cityId}
  const pubCityDir = path.join(publicCitiesDir, cityId);
  fs.mkdirSync(pubCityDir, { recursive: true });
  fs.copyFileSync(stationFile, path.join(pubCityDir, 'metro_station.json'));
  fs.writeFileSync(
    path.join(pubCityDir, 'metro_transfer.json'),
    formattedTransfer,
    'utf-8',
  );

  console.log(
    `✅ [${cityId.toUpperCase()}] 已從 ${stationData.lines.length} 條路線自動生成 ${transfers.length} 個交匯轉乘站並同步至 public/cities/${cityId}`,
  );
}

function main() {
  const cities = ['sz', 'hk', 'twp'];
  for (const city of cities) {
    syncTransfersFromStations(city);
  }
}

main();
