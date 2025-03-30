import { Candle } from "../types/types_ohlc";
import { DSLParser, FunctionRegistry } from "./feature_dsl_parser";

export interface StrategySchema {
    name: string;

    // Directional entry rules
    entry_long?: string;
    entry_short?: string;

    // Optional exit rules
    exit_long?: string;
    exit_short?: string;

    // Dynamic DSL-based stop/target
    stop_loss_expr?: string;
    target_expr?: string;

    // Risk & capital
    risk_per_trade?: number;
    capital: number;

    // Controls
    cooldown_period?: number;
    allow_reentry?: boolean;

    // Breakeven and trailing stop
    breakeven_trigger_expr?: string; // DSL condition like "close(0) >= entry_price + 2"
    trailing_trigger_expr?: string; // DSL condition to activate trailing
    trailing_offset_expr?: string; // DSL value like "atr(14, 0) * 1.2"

    // Charges
    transaction_charges?: number; // e.g. 0.00035 (for 0.035%)
}

export interface Trade {
    entry_index: number;
    exit_index: number;
    entry_time: string;
    exit_time: string;
    entry_price: number;
    exit_price: number;
    position_size: number;
    side: "long" | "short";
    pnl: number;
    pnl_percent: number;
    reason: "tp" | "sl" | "exit_condition";
    stop_price?: number;
    take_profit_price?: number;
    trailing_triggered?: boolean;
    breakeven_triggered?: boolean;
}

export interface StrategyState {
    in_position: boolean;
    entry_index: number | null;
    entry_time: string | null;
    entry_price: number | null;
    position_size: number;
    stop_price: number | null;
    take_profit_price: number | null;
    breakeven_triggered: boolean;
    trailing_stop_active: boolean;
    cooldown_remaining: number;
    side: "long" | "short" | null;
    last_exit_price?: number;
    last_exit_index?: number;
    last_exit_reason?: "sl" | "tp" | "exit_condition";
}

export class StrategyRunner {
    private candles: Candle[];
    private strategy: StrategySchema;
    private function_registry: FunctionRegistry;
    private trades: Trade[] = [];
    private capital: number;
    private state: StrategyState;

    constructor(candles: Candle[], strategy: StrategySchema, function_registry: FunctionRegistry) {
        this.candles = candles;
        this.strategy = strategy;
        this.function_registry = function_registry;
        this.capital = strategy.capital;

        this.state = {
            in_position: false,
            entry_index: null,
            entry_time: null,
            entry_price: null,
            position_size: 0,
            stop_price: null,
            take_profit_price: null,
            breakeven_triggered: false,
            trailing_stop_active: false,
            cooldown_remaining: 0,
            side: null,
        };
    }

    public run(): Trade[] {
        for (let i = 0; i < this.candles.length; i++) {
            const sliced = this.candles.slice(0, i + 1);
            const candle = this.candles[i];
            const parser = new DSLParser(sliced, this.function_registry);

            if (this.state.cooldown_remaining > 0) {
                this.state.cooldown_remaining--;
            }

            if (!this.state.in_position) {
                this.try_entry(i, candle, parser);
            } else {
                this.try_exit(i, candle, parser);
            }
        }

        return this.trades;
    }

    private try_entry(index: number, candle: Candle, parser: DSLParser): void {
        if (this.state.cooldown_remaining > 0) return;
        if (this.state.in_position) return;

        const long_entry = this.strategy.entry_long ? parser.evaluate(this.strategy.entry_long) : false;
        const short_entry = this.strategy.entry_short ? parser.evaluate(this.strategy.entry_short) : false;

        let side: "long" | "short" | null = null;
        if (long_entry === true) side = "long";
        if (short_entry === true) side = "short";

        if (!side) return;

        const entry_price = candle.close;
        const context = { entry_price };

        const stop_price = this.strategy.stop_loss_expr ? Number(parser.evaluate(this.strategy.stop_loss_expr, context)) : null;

        const target_price = this.strategy.target_expr ? Number(parser.evaluate(this.strategy.target_expr, context)) : null;

        const risk_per_trade = this.strategy.risk_per_trade ?? 1;
        const capital_to_risk = this.capital * risk_per_trade;

        let stop_gap = stop_price !== null ? Math.abs(entry_price - stop_price) : 1;
        stop_gap = stop_gap === 0 ? 0.01 : stop_gap;

        const position_size = Math.floor(capital_to_risk / stop_gap);

        this.state = {
            in_position: true,
            entry_index: index,
            entry_time: candle.time,
            entry_price,
            position_size,
            stop_price,
            take_profit_price: target_price,
            breakeven_triggered: false,
            trailing_stop_active: false,
            cooldown_remaining: 0,
            side,
        };
    }

    private try_exit(index: number, candle: Candle, parser: DSLParser): void {
        const state = this.state;
        if (!state.in_position) return;

        const is_long = state.side === "long";
        const is_short = state.side === "short";
        const current_price = candle.close;

        let exit_reason: "tp" | "sl" | "exit_condition" | null = null;

        // === Breakeven ===
        if (!state.breakeven_triggered && this.strategy.breakeven_trigger_expr) {
            const be_trigger = parser.evaluate(this.strategy.breakeven_trigger_expr, {
                entry_price: state.entry_price!,
                position_size: state.position_size,
            });
            if (be_trigger === true) {
                this.state.breakeven_triggered = true;
                this.state.stop_price = state.entry_price!;
            }
        }

        // === Trailing Stop Activation ===
        if (!state.trailing_stop_active && this.strategy.trailing_trigger_expr) {
            const trailing_triggered = parser.evaluate(this.strategy.trailing_trigger_expr, {
                entry_price: state.entry_price!,
                position_size: state.position_size,
            });
            if (trailing_triggered === true) {
                this.state.trailing_stop_active = true;
            }
        }

        // === Trailing Stop Update ===
        if (state.trailing_stop_active && this.strategy.trailing_offset_expr) {
            const trailing_offset = Number(
                parser.evaluate(this.strategy.trailing_offset_expr, {
                    entry_price: state.entry_price!,
                    position_size: state.position_size,
                }),
            );

            const trailing_sl = is_long ? current_price - trailing_offset : current_price + trailing_offset;

            if (is_long && (state.stop_price === null || trailing_sl > state.stop_price)) {
                this.state.stop_price = trailing_sl;
            }

            if (is_short && (state.stop_price === null || trailing_sl < state.stop_price)) {
                this.state.stop_price = trailing_sl;
            }
        }

        // === Stop Loss ===
        if (state.stop_price !== null && ((is_long && candle.low <= state.stop_price) || (is_short && candle.high >= state.stop_price))) {
            exit_reason = "sl";
        }

        // === Take Profit ===
        if (exit_reason === null && state.take_profit_price !== null && ((is_long && candle.high >= state.take_profit_price) || (is_short && candle.low <= state.take_profit_price))) {
            exit_reason = "tp";
        }

        // === Exit DSL ===
        if (exit_reason === null) {
            const rule = is_long ? this.strategy.exit_long : is_short ? this.strategy.exit_short : null;

            if (rule) {
                const should_exit = parser.evaluate(rule, {
                    entry_price: state.entry_price!,
                    position_size: state.position_size,
                });

                if (should_exit === true) {
                    exit_reason = "exit_condition";
                }
            }
        }

        if (!exit_reason) return;

        // === Finalize Trade ===
        const qty = state.position_size;
        const entry_price = state.entry_price!;
        const exit_price = current_price;

        const gross_pnl = is_long ? (exit_price - entry_price) * qty : (entry_price - exit_price) * qty;

        const turnover = (entry_price + exit_price) * qty;
        const charges = (this.strategy.transaction_charges ?? 0) * turnover;

        const pnl = gross_pnl - charges;
        const pnl_percent = ((exit_price - entry_price) / entry_price) * (is_long ? 1 : -1) * 100;

        this.trades.push({
            entry_index: state.entry_index!,
            exit_index: index,
            entry_time: state.entry_time!,
            exit_time: candle.time,
            entry_price,
            exit_price,
            position_size: qty,
            side: state.side!,
            pnl,
            pnl_percent,
            reason: exit_reason,
            stop_price: state.stop_price ?? undefined,
            take_profit_price: state.take_profit_price ?? undefined,
            trailing_triggered: state.trailing_stop_active,
            breakeven_triggered: state.breakeven_triggered,
        });

        // === Capital Update & Reset State ===
        this.capital += pnl;

        this.state = {
            in_position: false,
            entry_index: null,
            entry_time: null,
            entry_price: null,
            position_size: 0,
            stop_price: null,
            take_profit_price: null,
            breakeven_triggered: false,
            trailing_stop_active: false,
            cooldown_remaining: this.strategy.cooldown_period ?? 0,
            side: null,
            last_exit_price: exit_price,
            last_exit_index: index,
            last_exit_reason: exit_reason,
        };
    }

    public get_report() {
        const total_trades = this.trades.length;
        const winning_trades = this.trades.filter((t) => t.pnl > 0);
        const losing_trades = this.trades.filter((t) => t.pnl <= 0);

        const total_pnl = this.trades.reduce((acc, t) => acc + t.pnl, 0);
        const total_pnl_percent = this.trades.reduce((acc, t) => acc + t.pnl_percent, 0);

        const avg_pnl = total_trades > 0 ? total_pnl / total_trades : 0;
        const avg_pnl_percent = total_trades > 0 ? total_pnl_percent / total_trades : 0;

        const win_rate = total_trades > 0 ? (winning_trades.length / total_trades) * 100 : 0;
        const avg_win = winning_trades.length > 0 ? winning_trades.reduce((acc, t) => acc + t.pnl, 0) / winning_trades.length : 0;
        const avg_loss = losing_trades.length > 0 ? losing_trades.reduce((acc, t) => acc + t.pnl, 0) / losing_trades.length : 0;

        const avg_hold = total_trades > 0 ? this.trades.reduce((acc, t) => acc + (t.exit_index - t.entry_index), 0) / total_trades : 0;

        return {
            strategy: this.strategy.name,
            capital_start: this.strategy.capital,
            capital_end: this.capital,
            total_trades,
            win_rate: Number(win_rate.toFixed(2)),
            avg_pnl: Number(avg_pnl.toFixed(2)),
            avg_pnl_percent: Number(avg_pnl_percent.toFixed(2)),
            avg_win: Number(avg_win.toFixed(2)),
            avg_loss: Number(avg_loss.toFixed(2)),
            avg_hold: Number(avg_hold.toFixed(2)),
            total_profit: Number(total_pnl.toFixed(2)),
            trades: this.trades,
        };
    }
}
