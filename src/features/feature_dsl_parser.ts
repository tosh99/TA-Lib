import { Candle } from "../types/types_ohlc";

type FunctionImplementation = (candles: Candle[], ...args: number[]) => number;

interface FunctionMeta {
    fn: FunctionImplementation;
    arity: number | null;
    description?: string;
}

export type FunctionRegistry = Record<string, FunctionMeta>;

export class DSLParser {
    private candles: Candle[];
    private function_registry: FunctionRegistry;

    /**
     * Creates a new DSLParser instance with candle data sliced up to the current evaluation point.
     * This avoids any lookahead bias and ensures real-time safe evaluation.
     *
     * @param sliced_candles - Only the candles up to the current tick (e.g., candles.slice(0, index + 1))
     * @param function_registry - Set of known function implementations (ema, close, etc.)
     */
    constructor(sliced_candles: Candle[], function_registry: FunctionRegistry) {
        this.candles = sliced_candles;
        this.function_registry = function_registry;
    }

    /**
     * Evaluates a DSL expression like "ema(9, 2) > close(0)"
     * against the most recent candle in the slice.
     *
     * Example:
     * - ema(9, 2) → compute EMA(9) using candles[0..(len-1-2)]
     * - close(0) → get close price of latest candle
     *
     * @param expression - DSL rule to evaluate
     * @param context - External variables (e.g., entry_price, capital)
     * @returns boolean or number result
     */
    public evaluate(expression: string, context: Record<string, number | boolean> = {}): number | boolean {
        const resolved = this.parse_and_evaluate_expression(expression, context);
        try {
            return eval(resolved);
        } catch (err) {
            throw new Error(`DSL evaluation error: ${err instanceof Error ? err.message : String(err)}\nResolved: ${resolved}`);
        }
    }

    /**
     * Parses and resolves all function calls within a DSL expression
     * into a final flattened string like "104.2 > 100", ready to be passed to eval().
     *
     * Supports deeply nested calls like:
     * - ema(3, close(0))
     * - avg(ema(5, 1), close(0), 10)
     */
    private parse_and_evaluate_expression(expr: string, context: Record<string, number | boolean>): string {
        const fn_pattern = /\b(\w+)\(([^()]*)\)/;

        while (true) {
            const match = fn_pattern.exec(expr);
            if (!match) break;

            const [full_match, fn_name, raw_args] = match;

            // Recursively evaluate each argument
            const args = this.split_arguments(raw_args).map((arg) => Number(this.evaluate(arg, context)));

            const fn_entry = this.function_registry[fn_name];
            if (!fn_entry) throw new Error(`Unknown function: ${fn_name}`);

            if (fn_entry.arity !== null && args.length !== fn_entry.arity) {
                throw new Error(`Function "${fn_name}" expects ${fn_entry.arity} arguments, got ${args.length}`);
            }

            const result = fn_entry.fn(this.candles, ...args);
            expr = expr.replace(full_match, String(result));
        }

        return expr;
    }

    /**
     * Splits a function argument list string into its individual arguments,
     * handling nested function calls and parentheses properly.
     *
     * Example:
     * "ema(3, close(0)), 5, myfunc(1,2)"
     * → ["ema(3, close(0))", "5", "myfunc(1,2)"]
     */
    private split_arguments(arg_expr: string): string[] {
        const args: string[] = [];
        let current = "";
        let depth = 0;

        for (let i = 0; i < arg_expr.length; i++) {
            const char = arg_expr[i];

            if (char === "," && depth === 0) {
                args.push(current.trim());
                current = "";
            } else {
                if (char === "(") depth++;
                if (char === ")") depth--;
                current += char;
            }
        }

        if (current.trim()) {
            args.push(current.trim());
        }

        return args;
    }
}
