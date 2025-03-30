import { DSLParser, FunctionRegistry } from "./features/feature_dsl_parser";
import { Candle } from "./types/types_ohlc";

const mockCandles: Candle[] = [
    { time: "2024-01-01", open: 100, high: 105, low: 99, close: 102, volume: 1000 },
    { time: "2024-01-02", open: 102, high: 108, low: 101, close: 106, volume: 1100 },
    { time: "2024-01-03", open: 106, high: 110, low: 104, close: 108, volume: 1050 },
    { time: "2024-01-04", open: 108, high: 112, low: 107, close: 111, volume: 1200 },
    { time: "2024-01-05", open: 111, high: 115, low: 109, close: 114, volume: 1250 },
];

function compute_ema(candles: Candle[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema: number[] = [];

    for (let i = 0; i < candles.length; i++) {
        const close = candles[i].close;
        if (i === 0) {
            ema.push(close);
        } else {
            const prev = ema[i - 1];
            ema.push((close - prev) * k + prev);
        }
    }

    return ema;
}

export const function_registry: FunctionRegistry = {
    ema: {
        fn: (candles, period, offset) => {
            const current_index = candles.length - 1;
            const target_index = current_index - offset;
            if (target_index < 0) return NaN;
            const slice = candles.slice(0, target_index + 1);
            return compute_ema(slice, period).at(-1)!;
        },
        arity: 2,
        description: "EMA(period, offset)",
    },
    close: {
        fn: (candles, offset) => {
            const i = candles.length - 1 - offset;
            return i >= 0 ? candles[i].close : NaN;
        },
        arity: 1,
        description: "Close(offset)",
    },
    myfunc: {
        fn: (_candles, a, b, c) => a * 0.5 + b * 0.3 + c * 0.2,
        arity: 3,
    },

    avg: {
        fn: (_candles, ...args) => args.reduce((sum, x) => sum + x, 0) / args.length,
        arity: null,
    },
};

const parser = new DSLParser(mockCandles, function_registry);
const index = 2;
const result = parser.evaluate("myfunc(1, 1, close(0))");
console.log(`DSL at index ${index}:`, result);
