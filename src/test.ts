import { DSLParser, FunctionRegistry } from "./features/feature_dsl_parser";
import { DEFAULT_FUNCTION_REGISTRY } from "./features/feature_indicators_formulaes";
import { StrategyRunner, StrategySchema } from "./features/feature_strategy_runner";
import { Candle } from "./types/types_ohlc";
import * as fs from "fs";

const r = fs.readFileSync(process.cwd() + "/src/sample_ohlc.json", "utf-8");
const rs = JSON.parse(r);

const candles: Candle[] = rs.data.symbol_ticks
    .map((item:any) => ({
        ...item,
        open: item.open / 1000,
        close: item.close / 1000,
        high: item.high / 1000,
        low: item.low / 1000,
    }))
    .slice(0, 250);

// const parser = new DSLParser(mockCandles, function_registry);
// const index = 2;
// const result = parser.evaluate("ema(2, 3)", { entry_price: 22 });
// console.log(`DSL at index ${index}:`, result);

const s_schema: StrategySchema = {
    name: "test",
    entry_long: "ema(9, 0) > ema(21, 0)",
    exit_long: "ema(9, 0) < ema(21, 0)",
    capital: 1000,
    stop_loss_expr: "entry_price() * 0.995",
};
const strat = new StrategyRunner(candles, s_schema, DEFAULT_FUNCTION_REGISTRY);
const res = strat.run();
const report = strat.get_report();
console.log(report);
