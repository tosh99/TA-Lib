import {ISanitizedOHLC, IOHLC} from "../types/types_ohlc";
import {sanitize_ohlc} from "./feature_ohlc";
import {stats_mean} from "./feature_statistics";
import {indi_rsi, indi_macd, indi_obv, indi_adx} from "./feature_indicators";
import {IPatternProperties} from "../types/types_patterns";

export const pattern_properties = (ohlc_data: IOHLC[]): IPatternProperties => {
    const error = "";
    let uptrend_probability = 0;
    let macd_signal: "buy" | "sell" | "ignore" = "ignore";
    let signal_rsi: "buy" | "sell" | "ignore" = "ignore";
    let signal_obv: "buy" | "sell" | "ignore" = "ignore";
    let signal_adx: "buy" | "sell" | "ignore" = "ignore";

    if (ohlc_data.length) {
        // Sanitize Dataset
        const sanitized_ohlc: ISanitizedOHLC[] = sanitize_ohlc(ohlc_data);

        const gradient_array = [];
        for (const [idx, tick] of sanitized_ohlc.entries()) {
            const next_tick = sanitized_ohlc[idx + 1];

            let gradient_percentage = 0;
            if (next_tick && next_tick.mid && tick.mid) {
                gradient_percentage = 100 * ((next_tick.mid - tick.mid) / tick.mid);
            }
            gradient_array.push(gradient_percentage);
        }

        const closed_ticks = sanitized_ohlc.map((tick) => tick.close);

        // Calculate MACD Signal
        const {macd, signal_line} = indi_macd(closed_ticks);
        if (signal_line[signal_line.length - 1] > macd[macd.length - 1]) {
            macd_signal = "buy";
        } else if (signal_line[signal_line.length - 1] < macd[macd.length - 1]) {
            macd_signal = "sell";
        }

        // Calculate RSI Signal
        const rsi = indi_rsi(closed_ticks);
        if (rsi[rsi.length - 1] >= 70) {
            signal_rsi = "buy";
        } else if (rsi[rsi.length - 1] <= 30) {
            signal_rsi = "sell";
        }

        // Calculate OBV Signal
        const obv = indi_obv(sanitized_ohlc);
        signal_obv = obv[obv.length - 1] >= 0 ? "buy" : "sell";

        // Calculate ADX Signal
        const adx = indi_adx(sanitized_ohlc, 4);
        signal_adx = adx[adx.length - 1] >= 25 ? "buy" : adx[adx.length - 1] <= -25 ? "sell" : "ignore";


        const average_gradient = stats_mean(gradient_array);
        uptrend_probability = average_gradient >= 50 ? 100 : average_gradient >= 20 ? 50 : average_gradient >= 0 ? 20 : 0;
    }

    return {
        error: error,
        uptrend_probability: uptrend_probability,
        signal_macd: macd_signal,
        signal_rsi: signal_rsi,
        signal_obv: signal_obv,
        signal_adx: signal_adx,
    };
};



