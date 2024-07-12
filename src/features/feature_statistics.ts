import round from "lodash.round";
import { ISanitizedOHLC } from "../types/types_ohlc";

export const stats_mean = (data: number[]): number => {
    const sum = data.reduce((acc, val) => acc + val, 0);
    return sum / data.length;
};

export const stats_median = (numbers: number[]): number => {
    const sorted = Array.from(numbers).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
};

export const stats_standard_deviation = (numbers: number[]): number => {
    const n = numbers.length;

    // Calculate the mean
    const mean = numbers.reduce((sum, num) => sum + num, 0) / n;

    // Calculate the sum of squared differences
    const squaredDifferencesSum = numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0);

    // Calculate the variance
    const variance = squaredDifferencesSum / n;

    // Calculate the standard deviation (square root of variance)
    return Math.sqrt(variance);
};

export const stats_normalize = (data: number[]): number[] => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    return data.map((value) => (value - min) / (max - min));
};

export const stats_resample_data = (data: number[], newLength: number): number[] => {
    const step = (data.length - 1) / (newLength - 1);
    return Array.from({ length: newLength }, (_, i) => {
        const index = i * step;
        const lowerIndex = Math.floor(index);
        const upperIndex = Math.ceil(index);
        const weight = index - lowerIndex;
        return data[lowerIndex] * (1 - weight) + data[upperIndex] * weight;
    });
};

export const stats_calculate_similarity = (sample: number[], pattern: number[]): number => {
    const correlation = correlate(sample, pattern);
    return Math.max(...correlation) / (pattern.length * stats_standard_deviation(sample) * stats_standard_deviation(pattern));
};

export const correlate = (a: number[], b: number[]): number[] => {
    const result: number[] = [];
    for (let i = 0; i <= a.length - b.length; i++) {
        let sum = 0;
        for (let j = 0; j < b.length; j++) {
            sum += a[i + j] * b[j];
        }
        result.push(sum);
    }
    return result;
};

export const stats_min_max_scaling = (array: any[], key: string): any[] => {
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    // Find the minimum and maximum values of the specified key
    for (const obj of array) {
        const value = obj[key];
        if (value < minValue) {
            minValue = value;
        }
        if (value > maxValue) {
            maxValue = value;
        }
    }

    // Scale the values to the range [0, 1]
    const range = maxValue - minValue;
    for (const obj of array) {
        const value = obj[key];
        obj[key] = round((value - minValue) / range, 2);
    }

    return [...array];
};

export const stats_ema = (numbers: number[], period: number, multiplier = 2): number[] => {
    const ema_array = [];
    const multiplier_value = multiplier / (period + 1);
    let ema = round(numbers[0], 3);

    ema_array.push(ema);

    for (let i = 1; i < numbers.length; i++) {
        ema = round((numbers[i] - ema) * multiplier_value + ema, 3);
        if (ema !== undefined) {
            ema_array.push(ema);
        }
    }

    return ema_array;
};

export const stats_sma = (numbers: number[], period: number): number[] => {
    const sma_array = [];

    for (let i = 0; i <= numbers.length - period; i++) {
        const subset = numbers.slice(i, i + period);
        const sum = subset.reduce((acc, num) => acc + num, 0);
        const sma = sum / period;

        if (sma !== undefined) {
            sma_array.push(sma);
        }
    }

    return sma_array;
};

export const stats_calculate_slope = (point1: number, point2: number, distance: number): number => {
    return (point2 - point1) / distance;
};
