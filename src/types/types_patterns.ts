import { ISanitizedOHLC } from "./types_ohlc";

export interface IPatternInference {
    upper_wick_percent: number;
    lower_wick_percent: number;
    close_diff_percent: number;
    mid_diff_percent: number;
    volume_diff_percent: number;
    is_highlighted?: boolean;
}

export interface IPatternInferenceSettings {
    upper_wick_percent?: boolean;
    lower_wick_percent?: boolean;
    close_diff_percent?: boolean;
    mid_diff_percent?: boolean;
    volume_diff_percent?: boolean;
}

export interface IPatternProperties {
    error?: string;
    uptrend_probability: number;
    signal_macd: "buy" | "sell" | "ignore";
    signal_rsi: "buy" | "sell" | "ignore";
    signal_obv: "buy" | "sell" | "ignore";
    signal_adx: "buy" | "sell" | "ignore";
}
