import round from "lodash.round";
import { Candle } from "../types/types_ohlc";
import { DSLParser, FunctionRegistry } from "./feature_dsl_parser";

export interface StrategySchema {
    // Name of the trading strategy
    name: string;

    // Directional entry rules
    // DSL expression for long entry condition
    entry_long?: string;
    // DSL expression for short entry condition
    entry_short?: string;

    // Optional exit rules
    // DSL expression for exiting long positions
    exit_long?: string;
    // DSL expression for exiting short positions
    exit_short?: string;

    // Dynamic DSL-based stop/target
    // DSL expression for calculating stop loss price
    stop_loss_expr?: string;
    // DSL expression for calculating take profit price
    target_expr?: string;

    // Risk & capital
    // Risk per trade as a decimal (e.g., 0.01 for 1%)
    risk_per_trade?: number;
    // Initial trading capital
    capital: number;

    // Controls
    // Number of periods to wait after a trade before entering new positions
    cooldown_period?: number;
    // Whether to allow re-entry in the same direction
    allow_reentry?: boolean;

    // Breakeven and trailing stop
    // DSL condition like "close(0) >= entry_price + 2"
    breakeven_trigger_expr?: string;
    // DSL condition to activate trailing stop
    trailing_trigger_expr?: string;
    // DSL value like "atr(14, 0) * 1.2" for trailing stop offset
    trailing_offset_expr?: string;

    // Charges
    // Transaction fee as a decimal (e.g., 0.00035 for 0.035%)
    transaction_charges?: number;
}

export interface StrategyTrade {
    // Index position of trade entry in the candles array
    entry_index: number;
    // Index position of trade exit in the candles array
    exit_index: number;
    // Timestamp of trade entry
    entry_time: string;
    // Timestamp of trade exit
    exit_time: string;
    // Price at which the trade was entered
    entry_price: number;
    // Price at which the trade was exited
    exit_price: number;
    // Size of the trading position (quantity)
    position_size: number;
    // Direction of the trade (long or short)
    side: "long" | "short";
    // Profit/Loss in absolute terms
    pnl: number;
    // Profit/Loss as a percentage
    pnl_percent: number;
    // Reason for trade exit (take profit, stop loss, or exit condition)
    reason: "tp" | "sl" | "sl_breakeven" | "exit_condition";
    // Stop loss price level (optional)
    stop_price?: number;
    // Take profit price level (optional)
    take_profit_price?: number;
    // Whether trailing stop was activated during the trade
    trailing_triggered?: boolean;
    // Whether breakeven stop was activated during the trade
    breakeven_triggered?: boolean;
}

export interface StrategyState {
    // Whether currently holding a position
    in_position: boolean;
    // Index of the candle where position was entered
    entry_index: number | null;
    // Timestamp when position was entered
    entry_time: string | null;
    // Price at which position was entered
    entry_price: number | null;
    // Size/quantity of the trading position
    position_size: number;
    // Current stop loss price level
    stop_price: number | null;
    // Current take profit price level
    take_profit_price: number | null;
    // Whether breakeven stop has been triggered
    breakeven_triggered: boolean;
    // Whether trailing stop is currently active
    trailing_stop_active: boolean;
    // Number of periods remaining in cooldown
    cooldown_remaining: number;
    // Direction of current position (long/short)
    side: "long" | "short" | null;
    // Price at which last trade was exited
    last_exit_price?: number;
    // Index of the candle where last trade was exited
    last_exit_index?: number;
    // Reason for last trade exit (stop loss/take profit/exit condition)
    last_exit_reason?: "tp" | "exit_condition" | "sl" | "sl_breakeven";
    // The parsed DSL expression of the ENTRY
    expression: null | string;
}

export interface StrategyReport {
    // Name of the strategy
    strategy: string;
    // Initial capital at the start of backtesting
    capital_start: number;
    // Final capital at the end of backtesting
    capital_end: number;
    // Total number of trades executed
    total_trades: number;
    // Percentage of winning trades
    win_rate: number;
    // Average profit/loss per trade
    avg_pnl: number;
    // Average percentage profit/loss per trade
    avg_pnl_percent: number;
    // Average profit of winning trades
    avg_win: number;
    // Average loss of losing trades
    avg_loss: number;
    // Average number of candles a position was held
    avg_hold: number;
    // Total profit/loss from all trades
    total_profit: number;
    // Array of all completed trades
    trades: StrategyTrade[];
    // Time taken for backtesting in milliseconds
    total_time_taken: number;
}

export interface StrategyCandleDecision {
    index: number;
    decision: string;
    last_traded_price: number;
    stop_loss: null | number;
    take_profit: null | number;
    long_expression?: null | string;
    short_expression?: null | string;
    breakeven_expression?: null | string;
    update_sl_expression?: null | string;
}

export class StrategyRunner {
    private start_time = Date.now(); // Start time for backtesting
    private candles: Candle[]; // Array of price candles for backtesting
    private strategy: StrategySchema; // Strategy configuration
    private function_registry: FunctionRegistry; // Registry of functions available to DSL
    private trades: StrategyTrade[] = []; // Array to store completed trades
    private capital: number; // Current capital amount
    private state: StrategyState; // Current state of the strategy
    private candle_decisions: StrategyCandleDecision[] = []; // Array to store decisions made at each candle

    constructor(candles: Candle[], strategy: StrategySchema, function_registry: FunctionRegistry) {
        this.candles = candles; // Initialize candles array
        this.strategy = strategy; // Initialize strategy configuration
        this.function_registry = function_registry; // Initialize function registry
        this.capital = strategy.capital; // Set initial capital from strategy

        // Initialize strategy state with default values
        this.state = {
            in_position: false, // Not in a position initially
            entry_index: null, // No entry index
            entry_time: null, // No entry time
            entry_price: null, // No entry price
            position_size: 0, // No position size
            stop_price: null, // No stop price
            take_profit_price: null, // No take profit price
            breakeven_triggered: false, // Breakeven not triggered
            trailing_stop_active: false, // Trailing stop not active
            cooldown_remaining: 0, // No cooldown initially
            side: null, // No position side
            expression: null, // No expression initially
        };
    }

    public run(): StrategyTrade[] {
        try {
            for (let i = 200; i < this.candles.length; i++) {
                // Loop through each candle
                const sliced = this.candles.slice(0, i + 1); // Get candles up to current index
                const candle = this.candles[i]; // Get current candle
                const parser = new DSLParser(sliced, this.function_registry); // Create parser with available candles

                if (this.state.cooldown_remaining > 0) {
                    // If in cooldown period
                    this.state.cooldown_remaining--; // Decrement cooldown counter
                }

                if (!this.state.in_position) {
                    // If not currently in a position
                    this.try_entry(i, candle, parser); // Try to enter a new position
                } else {
                    // If already in a position
                    this.try_exit(i, candle, parser); // Try to exit the current position
                }
            }
        } catch (e) {
            console.error(e);
        }
        return this.trades; // Return completed trades
    }

    private try_entry(index: number, candle: Candle, parser: DSLParser): void {
        if (this.state.cooldown_remaining > 0) return; // Skip if in cooldown period
        if (this.state.in_position) return; // Skip if already in a position
        let expression: string | null = null;

        // Evaluate entry conditions using DSL
        const long_entry = this.strategy.entry_long ? parser.evaluate(this.strategy.entry_long) : false; // Check long entry condition
        const long_expression = parser.get_last_resolved_expression(); // Get last resolved expression

        const short_entry = this.strategy.entry_short ? parser.evaluate(this.strategy.entry_short) : false; // Check short entry condition
        const short_expression = parser.get_last_resolved_expression(); // Get last resolved expression

        let side: "long" | "short" | null = null; // Initialize position side
        if (long_entry === true) {
            side = "long";
            expression = long_expression;
        } // Set side to long if long entry condition is true
        if (short_entry === true) {
            side = "short";
            expression = short_expression;
        } // Set side to short if short entry condition is true

        if (!side) {
            this.candle_decisions.push({
                index,
                decision: "IGNORE",
                stop_loss: null,
                take_profit: null,
                last_traded_price: candle.close,
                long_expression,
                short_expression,
            });
            return;
        } // Exit if no valid entry signal

        const entry_price = candle.close; // Use close price as entry price
        const context = { entry_price, stop_price: 0, target_price: 0 }; // Create context for DSL evaluation

        // Calculate stop loss price using DSL if provided
        const stop_price = this.strategy.stop_loss_expr ? round(Number(parser.evaluate(this.strategy.stop_loss_expr, context)), 2) : null;

        // Calculate take profit price using DSL if provided
        context.stop_price = stop_price || 0; // Update context with stop price

        const target_price = this.strategy.target_expr ? round(Number(parser.evaluate(this.strategy.target_expr, context)), 2) : null;

        context.target_price = target_price || 0; // Update context with stop price

        // Calculate position sizing
        const risk_per_trade = this.strategy.risk_per_trade ?? 0.01; // Get risk per trade or default to 1%
        const capital_to_risk = this.capital * risk_per_trade; // Calculate amount of capital to risk

        // Calculate stop gap (distance to stop loss)
        let stop_gap = stop_price !== null ? Math.abs(entry_price - stop_price) : 1; // Calculate stop gap or use default
        stop_gap = stop_gap === 0 ? 0.01 : stop_gap; // Ensure stop gap is not zero

        // Calculate position size based on risk and capital constraints
        let position_size = Math.floor(capital_to_risk / stop_gap);

        // Check capital constraint
        const max_position_by_capital = Math.floor(this.capital / entry_price);
        position_size = Math.min(position_size, max_position_by_capital);

        // Ensure we have a valid position size
        if (position_size <= 0) {
            console.debug("Insufficient capital for minimum position size");
            return;
        }

        this.candle_decisions.push({
            index,
            decision: `ENTRY ${side}`,
            stop_loss: stop_price,
            take_profit: target_price,
            last_traded_price: candle.close,
        });
        this.state = {
            in_position: true, // Now in a position
            entry_index: index, // Set entry index
            entry_time: candle.time, // Set entry time
            entry_price, // Set entry price
            position_size, // Set position size
            stop_price, // Set stop loss price
            take_profit_price: target_price, // Set take profit price
            breakeven_triggered: false, // Reset breakeven flag
            trailing_stop_active: false, // Reset trailing stop flag
            cooldown_remaining: 0, // Reset cooldown
            side, // Set position side
            expression, // Set entry expression
        };
    }

    private try_exit(index: number, candle: Candle, parser: DSLParser): void {
        const state = this.state; // Get current state
        if (!state.in_position) return; // Exit if not in a position

        const is_long = state.side === "long"; // Check if position is long
        const is_short = state.side === "short"; // Check if position is short
        const current_price = candle.close; // Use close price as current price
        let breakeven_expression: string | null = null;
        let update_sl_expression: string | null = null;

        let exit_reason: "tp" | "sl" | "sl_breakeven" | "exit_condition" | null = null; // Initialize exit reason

        // === Breakeven ===
        if (!state.breakeven_triggered && this.strategy.breakeven_trigger_expr) {
            // If breakeven not triggered and expression exists
            const be_trigger = parser.evaluate(this.strategy.breakeven_trigger_expr, {
                // Evaluate breakeven trigger condition
                entry_price: state.entry_price!,
                target_price: state.take_profit_price!,
                stop_loss: state.stop_price!,
                position_size: state.position_size,
            });
            breakeven_expression = parser.get_last_resolved_expression();
            if (be_trigger === true) {
                this.candle_decisions.push({
                    index,
                    decision: `UPDATED_SL_TO_BREAKEVEN`,
                    stop_loss: state.entry_price!,
                    take_profit: state.take_profit_price!,
                    last_traded_price: candle.close,
                    update_sl_expression,
                    breakeven_expression,
                });

                // If breakeven condition met
                this.state.breakeven_triggered = true; // Set breakeven flag
                this.state.stop_price = state.entry_price!; // Move stop to entry price
            }
        }

        // === Trailing Stop Activation ===
        if (!state.trailing_stop_active && this.strategy.trailing_trigger_expr) {
            // If trailing stop not active and expression exists
            const trailing_triggered = parser.evaluate(this.strategy.trailing_trigger_expr, {
                // Evaluate trailing stop trigger condition
                entry_price: state.entry_price!,
                target_price: state.take_profit_price!,
                stop_loss: state.stop_price!,
                position_size: state.position_size,
            });
            update_sl_expression = parser.get_last_resolved_expression();
            if (trailing_triggered === true) {
                // If trailing stop condition met
                this.state.trailing_stop_active = true; // Activate trailing stop
            }
        }

        // === Trailing Stop Update ===
        if (state.trailing_stop_active && this.strategy.trailing_offset_expr) {
            // If trailing stop active and offset expression exists
            const trailing_offset = Number(
                // Calculate trailing stop offset
                parser.evaluate(this.strategy.trailing_offset_expr, {
                    entry_price: state.entry_price!,
                    target_price: state.take_profit_price!,
                    stop_loss: state.stop_price!,
                    position_size: state.position_size,
                }),
            );

            // Calculate new trailing stop level based on position direction
            const trailing_sl = is_long ? current_price - trailing_offset : current_price + trailing_offset;

            // Update stop price for long positions if new stop is higher
            if (is_long && (state.stop_price === null || trailing_sl > state.stop_price)) {
                this.candle_decisions.push({
                    index,
                    decision: `UPDATED_SL: ${trailing_sl}`,
                    stop_loss: trailing_sl,
                    take_profit: state.take_profit_price!,
                    last_traded_price: candle.close,
                    update_sl_expression,
                    breakeven_expression,
                });
                this.state.stop_price = trailing_sl;
            }

            // Update stop price for short positions if new stop is lower
            if (is_short && (state.stop_price === null || trailing_sl < state.stop_price)) {
                this.candle_decisions.push({
                    index,
                    decision: `UPDATED_SL: ${trailing_sl}`,
                    stop_loss: trailing_sl,
                    take_profit: state.take_profit_price!,
                    last_traded_price: candle.close,
                    update_sl_expression,
                    breakeven_expression,
                });
                this.state.stop_price = trailing_sl;
            }
        }

        // === Stop Loss ===
        // Check if stop loss has been hit
        if (state.stop_price !== null && ((is_long && candle.low <= state.stop_price) || (is_short && candle.high >= state.stop_price))) {
            if (state.breakeven_triggered && state.stop_price === state.entry_price) {
                exit_reason = "sl_breakeven"; // Special case: breakeven SL
            } else {
                exit_reason = "sl"; // Normal SL
            }
        }

        // === Take Profit ===
        // Check if take profit has been hit
        if (exit_reason === null && state.take_profit_price !== null && ((is_long && candle.high >= state.take_profit_price) || (is_short && candle.low <= state.take_profit_price))) {
            exit_reason = "tp"; // Set exit reason to take profit
        }

        // === Exit DSL ===
        if (exit_reason === null) {
            // If no exit reason yet
            // Get appropriate exit rule based on position side
            const rule = is_long ? this.strategy.exit_long : is_short ? this.strategy.exit_short : null;

            if (rule) {
                // If exit rule exists
                const should_exit = parser.evaluate(rule, {
                    // Evaluate exit condition
                    entry_price: state.entry_price!,
                    target_price: state.take_profit_price!,
                    stop_loss: state.stop_price!,
                    position_size: state.position_size,
                });

                if (should_exit === true) {
                    // If exit condition met
                    exit_reason = "exit_condition"; // Set exit reason to exit condition
                }
            }
        }

        if (!exit_reason) {
            this.candle_decisions.push({
                index,
                decision: `HOLD`,
                stop_loss: state.stop_price!,
                take_profit: state.take_profit_price!,
                last_traded_price: candle.close,
                update_sl_expression,
                breakeven_expression,
            });
            return;
        } // Exit if no exit reason found

        // === Finalize Trade ===
        const qty = state.position_size; // Get position size
        const entry_price = state.entry_price!; // Get entry price
        const exit_price = current_price; // Use current price as exit price

        // Calculate profit/loss
        const gross_pnl = is_long ? (exit_price - entry_price) * qty : (entry_price - exit_price) * qty;

        // Calculate total transaction value
        const turnover = (entry_price + exit_price) * qty;

        // Calculate transaction charges
        const charges = (this.strategy.transaction_charges ?? 0) * turnover;

        // Calculate net profit/loss
        const pnl = gross_pnl - charges;
        // Calculate percentage profit/loss
        const pnl_percent = ((exit_price - entry_price) / entry_price) * (is_long ? 1 : -1) * 100;

        this.candle_decisions.push({
            index,
            decision: `EXITED: ${exit_reason}`,
            stop_loss: state.stop_price!,
            take_profit: state.take_profit_price!,
            last_traded_price: candle.close,
            update_sl_expression,
            breakeven_expression,
        });

        // Add completed trade to trades array
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
        this.capital += pnl; // Update capital with trade profit/loss

        console.table({
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

        // Reset state for next trade
        this.state = {
            in_position: false, // No longer in a position
            entry_index: null, // Clear entry index
            entry_time: null, // Clear entry time
            entry_price: null, // Clear entry price
            position_size: 0, // Clear position size
            stop_price: null, // Clear stop price
            take_profit_price: null, // Clear take profit price
            breakeven_triggered: false, // Reset breakeven flag
            trailing_stop_active: false, // Reset trailing stop flag
            cooldown_remaining: this.strategy.cooldown_period ?? 0, // Set cooldown period
            side: null, // Clear position side
            last_exit_price: exit_price, // Store last exit price
            last_exit_index: index, // Store last exit index
            last_exit_reason: exit_reason, // Store last exit reason
            expression: null, // Clear entry expression
        };
    }

    public get_report(): StrategyReport {
        const total_trades = this.trades.length; // Get total number of trades
        const winning_trades = this.trades.filter((t) => t.pnl > 0); // Filter winning trades
        const losing_trades = this.trades.filter((t) => t.pnl <= 0); // Filter losing trades

        const total_pnl = this.trades.reduce((acc, t) => acc + t.pnl, 0); // Calculate total profit/loss
        const total_pnl_percent = this.trades.reduce((acc, t) => acc + t.pnl_percent, 0); // Calculate total percentage profit/loss

        const avg_pnl = total_trades > 0 ? total_pnl / total_trades : 0; // Calculate average profit/loss per trade
        const avg_pnl_percent = total_trades > 0 ? total_pnl_percent / total_trades : 0; // Calculate average percentage profit/loss per trade

        const win_rate = total_trades > 0 ? (winning_trades.length / total_trades) * 100 : 0; // Calculate win rate
        const avg_win = winning_trades.length > 0 ? winning_trades.reduce((acc, t) => acc + t.pnl, 0) / winning_trades.length : 0; // Calculate average winning trade
        const avg_loss = losing_trades.length > 0 ? losing_trades.reduce((acc, t) => acc + t.pnl, 0) / losing_trades.length : 0; // Calculate average losing trade

        const avg_hold = total_trades > 0 ? this.trades.reduce((acc, t) => acc + (t.exit_index - t.entry_index), 0) / total_trades : 0; // Calculate average holding period

        // Return comprehensive strategy report
        return {
            total_time_taken: Date.now() - this.start_time, // Total time taken to run strategy in milliseconds
            strategy: this.strategy.name, // Strategy name
            capital_start: this.strategy.capital, // Starting capital
            capital_end: this.capital, // Ending capital
            total_trades, // Total number of trades
            win_rate: Number(win_rate.toFixed(2)), // Win rate with 2 decimal places
            avg_pnl: Number(avg_pnl.toFixed(2)), // Average profit/loss with 2 decimal places
            avg_pnl_percent: Number(avg_pnl_percent.toFixed(2)), // Average percentage profit/loss with 2 decimal places
            avg_win: Number(avg_win.toFixed(2)), // Average winning trade with 2 decimal places
            avg_loss: Number(avg_loss.toFixed(2)), // Average losing trade with 2 decimal places
            avg_hold: Number(avg_hold.toFixed(2)), // Average holding period with 2 decimal places
            total_profit: Number(total_pnl.toFixed(2)), // Total profit/loss with 2 decimal places
            trades: this.trades, // All completed trades
        };
    }

    public get_candle_decisions(): StrategyCandleDecision[] {
        return this.candle_decisions;
    }
}
