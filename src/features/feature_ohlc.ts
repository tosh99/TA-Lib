import round from "lodash.round";
import { IHeikinAshi, Candle } from "../types/types_ohlc";
import { stats_median } from "./feature_statistics";

export const calculate_heikin_ashi = (ohlc: IHeikinAshi[]): IHeikinAshi[] => {
    const heikin_ashi_data: IHeikinAshi[] = [];

    // console.log("ohlc", ohlc);
    for (let i = 0; i < ohlc.length; i++) {
        const current_ohlc = ohlc[i];
        const prev_heikin_ashi = i > 0 ? heikin_ashi_data[i - 1] : { open: 0, high: 0, low: 0, close: 0 };

        const haClose = (current_ohlc.open + current_ohlc.high + current_ohlc.low + current_ohlc.close) / 4;
        const haOpen = (prev_heikin_ashi.open + prev_heikin_ashi.close) / 2;
        const haHigh = Math.max(current_ohlc.high, haOpen, haClose);
        const haLow = Math.min(current_ohlc.low, haOpen, haClose);

        const heikin_ashi: IHeikinAshi = {
            ...current_ohlc,
            open: round(haOpen, 2),
            high: round(haHigh, 2),
            low: round(haLow, 2),
            close: round(haClose, 2),
        };

        heikin_ashi_data.push(heikin_ashi);
    }

    return heikin_ashi_data;
};

export const calculate_median_ohlc = (ohlc: Candle[]): Candle => {
    const med_open = stats_median(ohlc.map((tick) => tick.open));
    const med_high = stats_median(ohlc.map((tick) => tick.high));
    const med_low = stats_median(ohlc.map((tick) => tick.low));
    const med_close = stats_median(ohlc.map((tick) => tick.close));
    const med_volume = stats_median(ohlc.map((tick) => tick.volume));

    return {
        time: ohlc[0].time,
        close: med_close,
        high: med_high,
        low: med_low,
        open: med_open,
        volume: med_volume,
    };
};
