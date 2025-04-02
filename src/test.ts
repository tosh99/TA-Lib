import { DEFAULT_FUNCTION_REGISTRY } from "./features/feature_indicators_formulaes";
import { StrategyRunner } from "./features/feature_strategy_runner";
import { Candle } from "./types/types_ohlc";
import * as fs from "fs";
import { StrategySchema } from "./types/types-strategy";

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
    warmup_period: 10,
    capital: 10000,
    risk_per_trade: 0.005,
    cooldown_period: 6,
    transaction_charges: 0.00021,
    allow_reentry: true, // Added example, set as needed

    // --- Long Conditions ---
    entry_long: `
     (ema(3,0) - ema(5,0)) >= 0.75 * (ema(5,0) - ema(9, 0))
     && (ema(3,0) - ema(5,0)) >= 0.3 * (close(0) - open(0))
    `,

    exit_long: `
  ema(9, 0) < ema(100, 0)
    `,

    // stop_loss_expr_long: null,
    // target_expr_long: `entry_price() + (entry_price() - stop_loss()) * 8.0`,

    breakeven_trigger_expr_long: `1 === 2`,
    trailing_trigger_expr_long: `1 === 2`,
    trailing_offset_expr_long: `1 === 2`,

    // --- Short Conditions ---
    entry_short: `
          ema(9, 0) < ema(20, 0) &&
     ema(20, 0) < ema(50, 0) &&
     ema(50, 0) < ema(100, 0)
    `,

    exit_short: `
ema(9, 0) > ema(100, 0)
    `,

    stop_loss_expr_short: `max(high(1), high(2)) + atr(14, 0) * 6.2`,
    target_expr_short: `entry_price() - (stop_loss() - entry_price()) * 8.0`,

    breakeven_trigger_expr_short: `1 === 2`,
    trailing_trigger_expr_short: `1 === 2`,
    trailing_offset_expr_short: `1 === 2`, // Often the same offset is used for long and short
};

const strat = new StrategyRunner(candles, s_schema, DEFAULT_FUNCTION_REGISTRY);
// const report = strat.get_report();
// const decisions = report.candle_decisions;
// console.table(decisions.filter((item) => !item.decision.includes("IGNORE")));
// console.log(report.metric);
// // fs.writeFileSync(process.cwd() + "/src/report.json", JSON.stringify(report, null, 2));
strat.on("progress", (progress) => {
    if (progress.progress === 100) {
        console.table(progress.report.trades);
    }
});

strat.run().then();
