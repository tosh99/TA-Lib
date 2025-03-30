import round from "lodash.round";
import { BollingerBands, Candle } from "../types/types_ohlc";
import { compute_ema, stats_mean } from "./feature_statistics";

export const compute_adx = (ohlc_data: Candle[], period: number): number[] => {
    const true_ranges: number[] = [];
    const positive_dms: number[] = [];
    const negative_dms: number[] = [];
    const dx_values: number[] = [];
    const adx_values: number[] = [];

    // Calculate True Range (TR), Positive Directional Movement (+DM), Negative Directional Movement (-DM)
    for (let i = 1; i < ohlc_data.length; i++) {
        const current_high = ohlc_data[i].high;
        const current_low = ohlc_data[i].low;
        const previous_close = ohlc_data[i - 1].close;

        const true_range = Math.max(current_high - current_low, Math.abs(current_high - previous_close), Math.abs(current_low - previous_close));

        true_ranges.push(true_range);

        const positive_dm = current_high - ohlc_data[i - 1].high;
        const negative_dm = ohlc_data[i - 1].low - current_low;

        positive_dms.push(positive_dm > 0 ? positive_dm : 0);
        negative_dms.push(negative_dm > 0 ? negative_dm : 0);
    }

    // Calculate the smoothed average of True Range (ATR)
    const atr_values = calculate_smoothed_average(true_ranges, period);

    // Calculate the smoothed averages of Positive Directional Movement (+DM) and Negative Directional Movement (-DM)
    const positive_dm_mas = calculate_smoothed_average(positive_dms, period);
    const negative_dm_mas = calculate_smoothed_average(negative_dms, period);

    // Calculate the Directional Movement Index (DX) and ADX
    for (let i = period; i < ohlc_data.length - 1; i++) {
        const di_plus = (positive_dm_mas[i - period] / atr_values[i - period]) * 100;
        const di_minus = (negative_dm_mas[i - period] / atr_values[i - period]) * 100;

        const dx = (Math.abs(di_plus - di_minus) / (di_plus + di_minus)) * 100;
        dx_values.push(dx);

        if (dx_values.length >= period) {
            const adx = calculate_smoothed_average(dx_values, period)[dx_values.length - period];
            adx_values.push(adx);
        }
    }

    return adx_values;
};

export const compute_macd = (data: number[], short_period: number = 12, long_period: number = 26, signal_period: number = 9): { macd: number[]; signal_line: number[] } => {
    // Calculate the short EMA
    const short_ema = compute_ema(data, short_period);

    // Calculate the long EMA
    const long_ema = compute_ema(data, long_period);

    // Calculate the MACD line
    const macd_line: number[] = [];
    for (let i = 0; i < data.length; i++) {
        macd_line.push(short_ema[i] - long_ema[i]);
    }

    // Calculate the signal line using SMA of the MACD line
    const signal_line = compute_ema(macd_line, signal_period);

    // Return the MACD line and signal line
    return {
        macd: macd_line,
        signal_line: signal_line,
    };
};

export const compute_obv = (data: Candle[]): number[] => {
    const obv_values: number[] = [];
    obv_values.push(0); // Initialize OBV with zero as the starting value

    for (let i = 1; i < data.length; i++) {
        const current_close = data[i].close;
        const previous_close = data[i - 1].close;
        const volume = parseInt(data[i].volume.toString());

        if (current_close > previous_close) {
            // Add the volume to OBV if the current close price is higher than the previous close price
            obv_values.push(obv_values[i - 1] + volume);
        } else if (current_close < previous_close) {
            // Subtract the volume from OBV if the current close price is lower than the previous close price
            obv_values.push(obv_values[i - 1] - volume);
        } else {
            // If the current close price is equal to the previous close price, keep the OBV value unchanged
            obv_values.push(obv_values[i - 1]);
        }
    }

    return obv_values;
};

export const compute_alligator = (
    ohlc_data: Candle[],
    jaw_period: number,
    teeth_period: number,
    lips_period: number,
): {
    jaw: number[];
    teeth: number[];
    lips: number[];
} => {
    const jaw_values: number[] = [];
    const teeth_values: number[] = [];
    const lips_values: number[] = [];

    for (let i = jaw_period - 1; i < ohlc_data.length; i++) {
        const jaw_start_index = i - jaw_period + 1;
        const teeth_start_index = i - teeth_period + 1;
        const lips_start_index = i - lips_period + 1;

        const jaw_highs = ohlc_data.slice(jaw_start_index, i + 1).map((d) => d.high);
        const jaw_lowest_high = Math.min(...jaw_highs);
        jaw_values.push(jaw_lowest_high);

        const teeth_highs = ohlc_data.slice(teeth_start_index, i + 1).map((d) => d.high);
        const teeth_lowest_high = Math.min(...teeth_highs);
        teeth_values.push(teeth_lowest_high);

        const lips_highs = ohlc_data.slice(lips_start_index, i + 1).map((d) => d.high);
        const lips_lowest_high = Math.min(...lips_highs);
        lips_values.push(lips_lowest_high);
    }

    return {
        jaw: jaw_values,
        teeth: teeth_values,
        lips: lips_values,
    };
};

export const compute_rsi = (data: number[], period: number = 7): number[] => {
    const gains: number[] = [];
    const losses: number[] = [];
    const rsi: number[] = [];

    // Calculate the price changes and separate gains and losses
    for (let i = 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];

        if (change >= 0) {
            gains.push(change);
            losses.push(0);
        } else {
            gains.push(0);
            losses.push(-change);
        }
    }

    // Calculate the average gains and losses for the first period
    let avg_gain = stats_mean(gains.slice(0, period));
    let avg_loss = stats_mean(losses.slice(0, period));

    // Calculate the initial RSI value
    let rs = avg_gain / avg_loss;
    const initial_rsi = 100 - 100 / (1 + rs);
    rsi.push(initial_rsi);

    // Calculate RSI for the remaining data
    for (let i = period; i < data.length - 1; i++) {
        const current_gain = gains[i];
        const current_loss = losses[i];

        // Smooth the average gains and losses using the previous averages
        avg_gain = (avg_gain * (period - 1) + current_gain) / period;
        avg_loss = (avg_loss * (period - 1) + current_loss) / period;

        rs = avg_gain / avg_loss;
        const current_rsi = 100 - 100 / (1 + rs);
        rsi.push(current_rsi);
    }

    return rsi;
};

export const compute_bollinger_bands = (data: Candle[], period: number = 20, multiplier: number = 2): BollingerBands => {
    const close_prices = data.map((d) => round(Number(d.close), 2));
    const middle: number[] = [];
    const upper: number[] = [];
    const lower: number[] = [];

    function simple_moving_average(prices: number[], period: number, index: number): number {
        const slice = prices.slice(index - period, index);
        const sum = slice.reduce((acc, price) => acc + price, 0);
        return sum / period;
    }

    function standard_deviation(prices: number[], period: number, index: number, sma: number): number {
        const slice = prices.slice(index - period, index);
        const variance = slice.reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / period;
        return Math.sqrt(variance);
    }

    for (let i = period; i <= close_prices.length; i++) {
        const sma = simple_moving_average(close_prices, period, i);
        const std_dev = standard_deviation(close_prices, period, i, sma);

        middle.push(sma);
        upper.push(sma + multiplier * std_dev);
        lower.push(sma - multiplier * std_dev);
    }

    return { middle, upper, lower };
};

const calculate_smoothed_average = (data: number[], period: number): number[] => {
    const smoothed_data: number[] = [];

    const sum = data.slice(0, period).reduce((acc, val) => acc + val, 0);
    const average = sum / period;
    smoothed_data.push(average);

    for (let i = period; i < data.length; i++) {
        const smoothed_value = (smoothed_data[i - period] * (period - 1) + data[i]) / period;
        smoothed_data.push(smoothed_value);
    }

    return smoothed_data;
};
