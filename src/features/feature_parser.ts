import round from "lodash.round";
import {IOHLC} from "../types/types_ohlc";
import {sanitize_ohlc} from "./feature_ohlc";
import {stats_ema, stats_sma} from "./feature_statistics";

export const parse_buy_sell_conditions = (statement: string, prices: IOHLC[]): { is_satisfied: boolean; clean_statement: string; raw_statement: string; ta_replaced_statement: string } => {
    if (!statement || prices.length === 0) return {is_satisfied: false, clean_statement: "", raw_statement: "", ta_replaced_statement: ""};

    let ta_replaced_statement = statement.trim();

    // For Reporting Only
    const clean_statement = ta_replaced_statement;

    let is_pure_math = false;
    const ta_regex = /(sma|ema|pde|open|high|low|close|abcd)\d*(\[\d+])*/gi;

    while (!is_pure_math) {
        const ta_string = findRegexSubstring(ta_replaced_statement, ta_regex);

        if (ta_string) {
            const ta_value = parse_technical_analysis(ta_string, prices);
            ta_replaced_statement = ta_replaced_statement.replace(ta_string, ta_value?.toString());
        } else {
            is_pure_math = true;
        }
    }

    let is_satisfied = false;
    try {
        const eval2 = eval;
        is_satisfied = eval2(ta_replaced_statement) == true;
    } catch (e) {
        /* empty */
    }

    return {
        raw_statement: statement,
        clean_statement: clean_statement,
        ta_replaced_statement: ta_replaced_statement,
        is_satisfied: is_satisfied,
    };
};

const parse_technical_analysis = (ta_expression: string, ohlc_data: IOHLC[]): number => {
    const ohlc = sanitize_ohlc(ohlc_data);
    const index_regex = /\[\d+]/gi;
    const index: number = round(Number(findRegexSubstring(ta_expression, index_regex).replaceAll("[", "").replaceAll("]", "")?.trim()));

    const open_close_regex = /(open|high|low|close|volume)/gi;
    const ohlc_key = <"open" | "close" | "high" | "volume" | "low">findRegexSubstring(ta_expression, open_close_regex);

    if (ohlc_key && index >= 0) {
        if (ohlc.length > index) {
            return round(Number(ohlc[index][ohlc_key]), 2);
        }

        return 0;
    }

    const data = ohlc.map((item) => item.close);
    if (ta_expression.includes("sma")) {
        const period_o = ta_expression.replaceAll(index_regex, "").replaceAll("sma", "");
        const period = period_o ? round(Number(period_o)) : 3;
        return stats_sma(data, period)[index || 0];
    }

    if (ta_expression.includes("ema")) {
        const period_o = ta_expression.replaceAll(index_regex, "").replaceAll("ema", "");
        const period = period_o ? round(Number(period_o)) : 3;
        return stats_ema(data, period)[index || 0];
    }

    return round(Number(ta_expression), 2);
};

const findRegexSubstring = (search_text: string, regex_string: RegExp): string => {
    if (search_text) {
        const matches = findRegexSubstrings(search_text, regex_string);
        for (const match of matches) {
            if (match?.trim()) {
                return match;
            }
        }
    }

    return "";
};

const findRegexSubstrings = (search_text: string, regex_string: RegExp): any[] => {
    return search_text.match(regex_string) || [];
};
