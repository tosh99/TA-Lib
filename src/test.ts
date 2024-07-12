import { match_pattern_closeness_alternate } from "./features/feature_pattern_matcher";
import { IPatternOHLC } from "./types/types_ohlc";

const run = () => {
    const ohlc_data: IPatternOHLC[] = [
        { open: 1, high: 1, low: 1, close: 1, volume: 1, tick_distance: 0, mid: 0 },
        { open: 2, high: 2, low: 2, close: 2, volume: 2, tick_distance: 50, mid: 0 },
        { open: 3, high: 3, low: 3, close: 3, volume: 3, tick_distance: 100, mid: 0 },
        { open: 4, high: 4, low: 4, close: 4, volume: 4, tick_distance: 100, mid: 0 },
        { open: 5, high: 5, low: 5, close: 5, volume: 5, tick_distance: 100, mid: 0 },
    ];

    const pattern_data = [
        { open: 5, high: 5, low: 5, close: 5, volume: 5 },
        { open: 7, high: 7, low: 7, close: 7, volume: 7 },
        { open: 10, high: 10, low: 10, close: 10, volume: 10 },
        { open: 9, high: 9, low: 9, close: 9, volume: 9 },
        { open: 15, high: 15, low: 15, close: 15, volume: 15 },
        { open: 5, high: 5, low: 5, close: 5, volume: 5 },
        { open: 7, high: 7, low: 7, close: 7, volume: 7 },
        { open: 10, high: 10, low: 10, close: 10, volume: 10 },
        { open: 9, high: 9, low: 9, close: 9, volume: 9 },
        { open: 15, high: 15, low: 15, close: 15, volume: 15 },
        { open: 5, high: 5, low: 5, close: 5, volume: 5 },
        { open: 7, high: 7, low: 7, close: 7, volume: 7 },
        { open: 10, high: 10, low: 10, close: 10, volume: 10 },
        { open: 9, high: 9, low: 9, close: 9, volume: 9 },
        { open: 15, high: 15, low: 15, close: 15, volume: 15 },
    ];
    const resample_data = match_pattern_closeness_alternate(ohlc_data, pattern_data);

    console.log(resample_data);
};

// run();
