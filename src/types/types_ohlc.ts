export interface IOHLC {
    open: number | string;
    high: number | string;
    low: number | string;
    close: number | string;
    volume: number | string;
}

export interface ISanitizedOHLC extends IOHLC {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    mid: number;

    [key: string]: any;
}

export interface IPatternOHLC extends ISanitizedOHLC {
    tick_name?: string;
    tick_distance: number;
    tick_threshold?: number;
}

export interface IHeikinAshi extends ISanitizedOHLC {
    [key: string]: any;
}
