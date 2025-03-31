import { DSLParser, FunctionRegistry } from "./features/feature_dsl_parser";
import { DEFAULT_FUNCTION_REGISTRY } from "./features/feature_indicators_formulaes";
import { StrategyRunner, StrategySchema } from "./features/feature_strategy_runner";
import { Candle } from "./types/types_ohlc";
import * as fs from "fs";

const r = fs.readFileSync(process.cwd() + "/src/sample_ohlc.json", "utf-8");
const rs = JSON.parse(r);

const candles: Candle[] = rs.data.symbol_ticks.map((item: any) => ({
    ...item,
    open: item.open,
    close: item.close,
    high: item.high,
    low: item.low,
}));

// const parser = new DSLParser(candles, DEFAULT_FUNCTION_REGISTRY);
// const index = 2;
// const result = parser.evaluate(`stop_loss()`, {entry_price: 20, stop_price:30});
// console.log(`DSL at index ${index}:`, result);

// && ema(20, 0) > ema(50, 0)
// && close(1) > open(1)
// && volume(1) > max(volume(2),volume(1))
// && (close(0) > ema(20, 0) || close(0) > ema(50, 0))

const s_schema: StrategySchema = {
    name: "VWAP + EMA Pullback with Breakout Confirmation",

    entry_long: `
      close(0) > vwap(0) &&
      ema(20, 0) > ema(50, 0) &&
      close(1) > open(1) &&
      volume(1) > avg(volume(2), volume(3)) &&
      rsi(14, 0) > 50
    `,

    stop_loss_expr: `min(low(1), ema(50, 0)) - atr(14, 0) * 1.2`,
    target_expr: `entry_price() + (entry_price() - stop_loss()) * 2`,

    // Option 1: Use different conditions
    breakeven_trigger_expr: `close(0) >= entry_price() + atr(14, 0) * 0.5`, // Price moved 0.5 ATR
    trailing_trigger_expr: `close(0) >= entry_price() + atr(14, 0) * 1.0`, // Price moved 1.0 ATR

    trailing_offset_expr: `atr(14, 0) * 1.0`, // Trail using 1x ATR

    capital: 1000000,
    risk_per_trade: 0.01,
    cooldown_period: 3,
    transaction_charges: 0.00035,
};

const strat = new StrategyRunner(candles, s_schema, DEFAULT_FUNCTION_REGISTRY);
const res = strat.run();
const decisions = strat.get_candle_decisions();
console.table(decisions.filter((item) => !item.decision.includes("IGNORE")));
const report = strat.get_report();
console.log(report);
// fs.writeFileSync(process.cwd() + "/src/report.json", JSON.stringify(report, null, 2));
