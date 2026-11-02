import hkStation from '../../cities/hk/metro_station.json';
import hkTransfer from '../../cities/hk/metro_transfer.json';
import szStation from '../../cities/sz/metro_station.json';
import szTransfer from '../../cities/sz/metro_transfer.json';
import twpStation from '../../cities/twp/metro_station.json';
import twpTransfer from '../../cities/twp/metro_transfer.json';
import {
  MetroStationData,
  MetroTransferData,
  RegionId,
} from '../types/metro';
import { autoGenerateTransfers } from '../lib/metroEngine';

export const BUILT_IN_METRO_DATA: Record<
  RegionId,
  { stationData: MetroStationData; transferData: MetroTransferData }
> = {
  sz: {
    stationData: szStation as unknown as MetroStationData,
    transferData: autoGenerateTransfers(
      szStation as unknown as MetroStationData,
      (szTransfer as unknown as MetroTransferData).specialTransfers || [],
    ),
  },
  hk: {
    stationData: hkStation as unknown as MetroStationData,
    transferData: autoGenerateTransfers(
      hkStation as unknown as MetroStationData,
      (hkTransfer as unknown as MetroTransferData).specialTransfers || [],
    ),
  },
  twp: {
    stationData: twpStation as unknown as MetroStationData,
    transferData: autoGenerateTransfers(
      twpStation as unknown as MetroStationData,
      (twpTransfer as unknown as MetroTransferData).specialTransfers || [],
    ),
  },
};
