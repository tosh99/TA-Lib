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
    capital: 1000000,
    risk_per_trade: 0.005,
    cooldown_period: 6,
    transaction_charges: 0.00021,
    allow_reentry: true, // Added example, set as needed

    // --- Long Conditions ---
    entry_long: `
 close(0) > vwap(0) &&
 close(0) > ema(20, 0) &&
 ema(20, 0) > ema(50, 0) &&
 ema(50, 0) > ema(100, 0) &&
 
 rsi(14, 0) > 50 &&
 rsi(14, 0) > rsi(14, 1) &&
 
 volume(0) > avg(volume(1), volume(2), volume(3), volume(4)) * 1.2 &&
 
 atr(14, 0) > atr(14, 20) &&
 
 close(0) > open(0) &&
 close(1) > open(1) &&
 low(0) > low(1)
    `,

    exit_long: `
 ema(20, 0) < ema(50, 0) ||
 rsi(14, 0) < 40
    `,

    stop_loss_expr_long: `min(low(1), low(2)) - atr(14, 0) * (rsi(14, 0) > 70 ? 1.5 : 1.0)`,
    target_expr_long: `entry_price() + (entry_price() - stop_loss()) * (rsi(14, 0) < 40 ? 3.0 : 2.5)`, // Note: Uses stop_loss() which refers to the calculated stop loss value

    breakeven_trigger_expr_long: `close(0) >= entry_price() + atr(14, 0) * 0.5`,
    trailing_trigger_expr_long: `close(0) >= entry_price() + atr(14, 0) * 1.0`,
    trailing_offset_expr_long: `atr(14, 0) * 0.8`,

    // --- Short Conditions ---
    entry_short: `
 close(0) < vwap(0) &&
 close(0) < ema(20, 0) &&
 ema(20, 0) < ema(50, 0) &&
 ema(50, 0) < ema(100, 0) &&
 
 rsi(14, 0) < 50 &&
 rsi(14, 0) < rsi(14, 1) &&
 
 volume(0) > avg(volume(1), volume(2), volume(3), volume(4)) * 1.2 &&
 
 atr(14, 0) > atr(14, 20) &&
 
 close(0) < open(0) &&
 close(1) < open(1) &&
 high(0) < high(1)
    `,

    exit_short: `
 ema(20, 0) > ema(50, 0) ||
 rsi(14, 0) > 60
    `,

    stop_loss_expr_short: `max(high(1), high(2)) + atr(14, 0) * (rsi(14, 0) < 30 ? 1.5 : 1.0)`,
    target_expr_short: `entry_price() - (stop_loss() - entry_price()) * (rsi(14, 0) > 60 ? 3.0 : 2.5)`, // Note: Uses stop_loss() which refers to the calculated stop loss value

    breakeven_trigger_expr_short: `close(0) <= entry_price() - atr(14, 0) * 0.5`,
    trailing_trigger_expr_short: `close(0) <= entry_price() - atr(14, 0) * 1.0`,
    trailing_offset_expr_short: `atr(14, 0) * 0.8`, // Often the same offset is used for long and short
};

const strat = new StrategyRunner(candles, s_schema, DEFAULT_FUNCTION_REGISTRY);
// const report = strat.get_report();
// const decisions = report.candle_decisions;
// console.table(decisions.filter((item) => !item.decision.includes("IGNORE")));
// console.log(report.metric);
// // fs.writeFileSync(process.cwd() + "/src/report.json", JSON.stringify(report, null, 2));
strat.on("progress", (progress) => {
    console.log(progress);
});

strat.run().then();

