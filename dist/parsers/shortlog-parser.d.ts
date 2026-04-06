import { Transform, TransformCallback } from 'node:stream';
export interface ShortlogAuthorSummary {
    name: string;
    commitCount: number;
    messages: string[];
}
export declare class ShortlogParser extends Transform {
    private buffer;
    private currentAuthor;
    constructor();
    _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
    private parseLine;
}
//# sourceMappingURL=shortlog-parser.d.ts.map