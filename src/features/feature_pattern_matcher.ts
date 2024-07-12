import round from "lodash.round";
import { IOHLC, IPatternOHLC, ISanitizedOHLC } from "../types/types_ohlc";
import { IPatternInference, IPatternInferenceSettings } from "../types/types_patterns";
import { sanitize_ohlc } from "./feature_ohlc";
import { stats_calculate_slope, stats_normalize } from "./feature_statistics";
import { linear_regression } from "./feature_regression";

export const match_pattern_features = (ohlc_dataset: IOHLC[], ohlc_pattern?: IPatternOHLC[]): IPatternInference[] => {
    const calculated_pattern: IPatternInference[] = [];
    if (ohlc_dataset.length) {
        // Sanitize Dataset
        const ohlc_data: ISanitizedOHLC[] = sanitize_ohlc(ohlc_dataset);
        const initial_tick = ohlc_data[0];

        // Calculate Slicing from Data and Pattern
        const data_indexes: number[] = [];
        if (ohlc_pattern) {
            for (const [idx, tick] of ohlc_pattern.entries()) {
                const tick_percentage = round(tick.tick_distance, 2);
                const data_idx = round(tick_percentage * 0.01 * (ohlc_data.length - 1));
                data_indexes.push(data_idx);
            }
        }

        for (const [idx, tick] of ohlc_data.entries()) {
            const tick = ohlc_data[idx];
            const tick_body = Math.abs(tick.close - tick.open);
            const lower_boundary = tick.open < tick.close ? tick.open : tick.close;
            const upper_boundary = tick.open < tick.close ? tick.close : tick.open;

            if (idx === 0) {
                calculated_pattern.push({
                    close_diff_percent: 0,
                    mid_diff_percent: 0,
                    lower_wick_percent: round((100 * (lower_boundary - tick.low)) / tick_body, 2),
                    upper_wick_percent: round((100 * (tick.high - upper_boundary)) / tick_body, 2),
                    volume_diff_percent: 0,
                    is_highlighted: true,
                });
            } else {
                const prev_tick = ohlc_data[idx - 1];
                calculated_pattern.push({
                    close_diff_percent: round((100 * (tick.close - initial_tick.close)) / initial_tick.close, 2),
                    mid_diff_percent: round((100 * (tick.mid - initial_tick.mid)) / initial_tick.mid, 2),
                    lower_wick_percent: round((100 * (lower_boundary - tick.low)) / tick_body, 2),
                    upper_wick_percent: round((100 * (tick.high - upper_boundary)) / tick_body, 2),
                    volume_diff_percent: round((100 * (tick.volume - prev_tick.volume)) / prev_tick.volume, 2),
                    is_highlighted: data_indexes.includes(idx),
                });
            }
        }

        return calculated_pattern;
    }

    return calculated_pattern;
};

export const match_pattern_closeness = (ohlc_patt: IPatternOHLC[], ohlc_data: IOHLC[], settings: IPatternInferenceSettings) => {
    // Sanitize Dataset
    const ohlc_pattern: IPatternOHLC[] = <IPatternOHLC[]>sanitize_ohlc(ohlc_patt);

    // Dataset Validation
    if (ohlc_pattern.slice(1, ohlc_pattern.length).filter((tick) => !tick.tick_distance || tick.tick_distance <= 0).length) {
        return {
            closeness: 0,
            error: "tick_distance not set / incorrect",
        };
    }
    if (ohlc_data.length < ohlc_pattern.length) {
        return {
            closeness: 0,
            error: "data must be greater than pattern length",
        };
    }
    if (ohlc_data.length < 10) {
        return {
            closeness: 0,
            error: "data must be greater than or equals to 10",
        };
    }

    const src_pattern: IPatternInference[] = match_pattern_features(ohlc_pattern);
    const dst_data: IPatternInference[] = match_pattern_features(ohlc_data);
    const dst_pattern: IPatternInference[] = [];

    // Calculate Slicing from Data and Pattern
    for (const [idx, tick] of ohlc_pattern.entries()) {
        const tick_percentage = round(tick.tick_distance, 2);
        const data_idx = round(tick_percentage * 0.01 * (ohlc_data.length - 1));
        dst_pattern.push(dst_data[data_idx]);
    }

    // Calculate Pattern Closeness
    let closeness = 0;
    for (const [idx, tick] of src_pattern.entries()) {
        const src_tick = src_pattern[idx];
        const dst_tick = dst_pattern[idx];

        let ct = 0;
        let current_closeness = 0;

        if (settings.upper_wick_percent) {
            ct += 1;
            current_closeness += calculate_closeness_gradient(src_tick, dst_tick, "upper_wick_percent");
        }

        if (settings.lower_wick_percent) {
            ct += 1;
            current_closeness += calculate_closeness_gradient(src_tick, dst_tick, "lower_wick_percent");
        }

        if (settings.mid_diff_percent) {
            ct += 1;
            current_closeness += calculate_closeness_gradient(src_tick, dst_tick, "mid_diff_percent");
        }

        if (settings.close_diff_percent) {
            ct += 1;
            current_closeness += calculate_closeness_gradient(src_tick, dst_tick, "close_diff_percent");
        }

        if (settings.volume_diff_percent) {
            ct += 1;
            current_closeness += calculate_closeness_gradient(src_tick, dst_tick, "volume_diff_percent");
        }

        current_closeness = ct ? current_closeness * (4 / ct) : 0;
        closeness += current_closeness;
    }

    return {
        closeness: round(closeness / src_pattern.length, 2),
        error: "",
    };
};

const calculate_closeness_gradient = (source: any, target: any, key: string): number => {
    let current_closeness = 0;
    if (source[key] >= 0.99 * target[key] && source[key] <= 1.01 * target[key]) {
        current_closeness = 25;
    } else if (source[key] >= 0.98 * target[key] && source[key] <= 1.02 * target[key]) {
        current_closeness = 24;
    } else if (source[key] >= 0.96 * target[key] && source[key] <= 1.04 * target[key]) {
        current_closeness = 23;
    } else if (source[key] >= 0.94 * target[key] && source[key] <= 1.06 * target[key]) {
        current_closeness = 21;
    } else if (source[key] >= 0.92 * target[key] && source[key] <= 1.08 * target[key]) {
        current_closeness = 19;
    } else if (source[key] >= 0.9 * target[key] && source[key] <= 1.1 * target[key]) {
        current_closeness = 17;
    } else if (source[key] >= 0.8 * target[key] && source[key] <= 1.2 * target[key]) {
        current_closeness = 15;
    } else if (source[key] >= 0.7 * target[key] && source[key] <= 1.3 * target[key]) {
        current_closeness = 13;
    } else if (source[key] >= 0.6 * target[key] && source[key] <= 1.4 * target[key]) {
        current_closeness = 11;
    } else if (source[key] >= 0.5 * target[key] && source[key] <= 1.5 * target[key]) {
        current_closeness = 9;
    } else if (source[key] >= 0.4 * target[key] && source[key] <= 1.6 * target[key]) {
        current_closeness = 7;
    } else if (source[key] >= 0.3 * target[key] && source[key] <= 1.7 * target[key]) {
        current_closeness = 5;
    } else if (source[key] >= 0.2 * target[key] && source[key] <= 1.8 * target[key]) {
        current_closeness = 3;
    } else if (source[key] >= 0.1 * target[key] && source[key] <= 1.9 * target[key]) {
        current_closeness = 1;
    }

    return current_closeness;
};

export const match_pattern_closeness_alternate = (ohlc_patt: IPatternOHLC[], ohlc_smp: IOHLC[]) => {
    // Sanitize Dataset
    const ohlc_pattern: IPatternOHLC[] = <IPatternOHLC[]>sanitize_ohlc(ohlc_patt);
    const ohlc_sample: IPatternOHLC[] = <IPatternOHLC[]>sanitize_ohlc(ohlc_smp);

    // Dataset Validation
    if (ohlc_pattern.slice(1, ohlc_pattern.length).filter((tick) => !tick.tick_distance || tick.tick_distance <= 0).length) {
        return {
            closeness: 0,
            error: "tick_distance not set / incorrect",
        };
    }
    if (ohlc_sample.length < ohlc_pattern.length) {
        return {
            closeness: 0,
            error: "data must be greater than pattern length",
        };
    }

    // Settings for Composite Similarity Score Calculation
    // 1. Individual Handle Angle Contribution (0.7)
    // 2. Overall Angle Contribution (0.2)
    // 3. Handle Wick Direction Contribution (0.1)

    // Step 1 - Normalize Pattern Data Midpoint (0,1)
    // Step 2 - Normalize Sample MidPoint Data
    // Step 3 - Calculate Slope of Segments in Pattern Data
    // Step 4 - Calculate Overall Slope of Pattern Data using Regression
    // Step 5 - Calculate Up Tick % of ticks in Pattern Data Segments
    // Step 6 - Calculate Overall Slope of Sample Data using Linear Regression
    // Step 7 = Calculate Slope of Sample Data using Regressed Segments at Mentioned Distances
    // Step 8 - Calculate Composite Similarity Score of Sample Segments and Pattern Handles based on Settings

    // Step 1 & 2: Normalize data
    const normalizedPattern = stats_normalize(ohlc_pattern.map((item) => item.mid));
    const normalizedSample = stats_normalize(ohlc_sample.map((item) => item.mid));

    console.log("normalizedPattern");
    console.table(normalizedPattern);
    console.log("normalizedSample");
    console.table(normalizedSample);

    // Step 3: Calculate slope of segments in pattern data
    const patternSlopes: number[] = [];
    for (let i = 1; i < normalizedPattern.length; i++) {
        const x1 = Math.floor(ohlc_sample.length * ohlc_pattern[i - 1].tick_distance * 0.01);
        const x2 = Math.floor((ohlc_sample.length - 1) * ohlc_pattern[i].tick_distance * 0.01);

        const y1 = normalizedPattern[i - 1];
        const y2 = normalizedPattern[i];

        // console.log(i, `x1: ${x1}, x2: ${x2}, y1: ${y1}, y2: ${y2}`);

        patternSlopes.push(stats_calculate_slope(y1, y2, x2 - x1));
    }

    // Step 4: Calculate overall slope of pattern data
    const patternRegression = linear_regression(normalizedPattern);

    // Step 5: Calculate up tick percentage of pattern data
    const patternUpTickPercentage = pattern_green_wicks_percentage(ohlc_pattern);

    // Step 6: Calculate overall slope of sample data
    const sampleRegression = linear_regression(normalizedSample);

    // Step 7: Calculate slope of sample data segments
    const sampleSlopes = [];
    for (let i = 1; i < normalizedPattern.length; i++) {
        const x1 = Math.floor(ohlc_sample.length * ohlc_pattern[i - 1].tick_distance * 0.01);

        let x2 = Math.floor(ohlc_sample.length * ohlc_pattern[i].tick_distance * 0.01);
        if (i === normalizedPattern.length - 1) {
            x2 = Math.floor(ohlc_sample.length * ohlc_pattern[i].tick_distance * 0.01) - 1;
        }

        const y1 = normalizedSample[x1];
        const y2 = normalizedSample[x2];

        // console.log(i, `x1: ${x1}, x2: ${x2}, y1: ${y1}, y2: ${y2}`);

        sampleSlopes.push(stats_calculate_slope(y1, y2, x2 - x1));
    }

    // console.log("patternSlopes");
    // console.table(patternSlopes);
    // console.log("sampleSlopes");
    // console.table(sampleSlopes);

    // Step 8: Calculate composite similarity score
    let individualSegmentAngleScore = 0;
    for (let i = 0; i < patternSlopes.length; i++) {
        const patternSlope = patternSlopes[i];
        const sampleSlope = sampleSlopes[i] || 0; // Use 0 if sample slope doesn't exist
        // individualHandleAngleScore += 1 - Math.abs(patternSlope - sampleSlope);
        individualSegmentAngleScore += calculate_closeness_gradient({ slope: patternSlope }, { slope: sampleSlope }, "slope") / 25;
    }
    individualSegmentAngleScore /= patternSlopes.length;
    console.log("individualSegmentAngleScore");
    console.table(individualSegmentAngleScore);

    // console.log("patternRegression");
    // console.table(patternRegression.slope);

    // console.log("sampleRegression");
    // console.table(sampleRegression.slope);

    const overallAngleScore = patternRegression.slope > 0 && sampleRegression.slope > 0 ? 1 : patternRegression.slope < 0 && sampleRegression.slope < 0 ? 1 : 0;
    console.log("overallAngleScore");
    console.table(overallAngleScore);

    const segmentWickDirectionScore = calculate_closeness_gradient({ up_tick: patternUpTickPercentage }, { up_tick: pattern_green_wicks_percentage(ohlc_sample) }, "up_tick") / 25;

    console.log("segmentWickDirectionScore");
    console.table(segmentWickDirectionScore);

    return {
        closeness: round(INDIVIDUAL_HANDLE_ANGLE_CONTRIBUTION * individualSegmentAngleScore + OVERALL_ANGLE_CONTRIBUTION * overallAngleScore + HANDLE_WICK_DIRECTION_CONTRIBUTION * segmentWickDirectionScore, 2),
        error: "",
    };
};

// Settings
const INDIVIDUAL_HANDLE_ANGLE_CONTRIBUTION = 0.6;
const OVERALL_ANGLE_CONTRIBUTION = 0.3;
const HANDLE_WICK_DIRECTION_CONTRIBUTION = 0.1;

export const pattern_green_wicks_percentage = (data: ISanitizedOHLC[]): number => {
    let upTicks = 0;
    for (let i = 1; i < data.length; i++) {
        if (data[i].close >= data[i].open) upTicks++;
    }
    return upTicks / (data.length - 1);
};
