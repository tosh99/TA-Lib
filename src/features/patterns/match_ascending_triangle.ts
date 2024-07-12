import { IOHLC, ISanitizedOHLC } from "../../types/types_ohlc";
import { stats_calculate_similarity, stats_normalize, stats_resample_data } from "../feature_statistics";
import { linear_regression } from "../feature_regression";
import { optimize } from "../feature_optimize";

export const match_ascending_triangle = (sampleOHLC: ISanitizedOHLC[], patternOHLC: ISanitizedOHLC[]): [number, number] => {
    const sampleHigh = stats_normalize(sampleOHLC.map((candle) => candle.high));
    const sampleLow = stats_normalize(sampleOHLC.map((candle) => candle.low));

    const patternHigh = stats_normalize(patternOHLC.map((candle) => candle.high));
    const patternLow = stats_normalize(patternOHLC.map((candle) => candle.low));

    const objective = (scale: number): number => {
        const resampledPatternHigh = stats_resample_data(patternHigh, Math.round(sampleHigh.length * scale));
        const resampledPatternLow = stats_resample_data(patternLow, Math.round(sampleLow.length * scale));

        // Pad or truncate the resampled pattern to match the sample length
        const paddedPatternHigh = resampledPatternHigh.length < sampleHigh.length ? [...resampledPatternHigh, ...new Array(sampleHigh.length - resampledPatternHigh.length).fill(resampledPatternHigh[resampledPatternHigh.length - 1])] : resampledPatternHigh.slice(0, sampleHigh.length);

        const paddedPatternLow = resampledPatternLow.length < sampleLow.length ? [...resampledPatternLow, ...new Array(sampleLow.length - resampledPatternLow.length).fill(resampledPatternLow[resampledPatternLow.length - 1])] : resampledPatternLow.slice(0, sampleLow.length);

        const similarityHigh = stats_calculate_similarity(sampleHigh, paddedPatternHigh);
        const similarityLow = stats_calculate_similarity(sampleLow, paddedPatternLow);

        const lowTrend = linear_regression(sampleLow).slope;
        const highTrend = linear_regression(sampleHigh).slope;

        const triangleScore = lowTrend - Math.abs(highTrend);

        // Normalize each component
        const normalizedSimilarityHigh = similarityHigh / (similarityHigh + 1);
        const normalizedSimilarityLow = similarityLow / (similarityLow + 1);
        const normalizedTriangleScore = triangleScore / (Math.abs(triangleScore) + 1);

        // Add a penalty for scaling away from 1
        const scalePenalty = Math.abs(Math.log(scale));

        return -(normalizedSimilarityHigh + normalizedSimilarityLow + normalizedTriangleScore - scalePenalty);
    };

    // Optimize the scaling factor
    const result = optimize(objective, { bounds: [0.1, 2] });
    const bestScale = result.x;
    const bestScore = -result.fx;

    return [bestScore, bestScale];
};
