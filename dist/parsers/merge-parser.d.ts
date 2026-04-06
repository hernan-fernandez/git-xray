import { Transform, TransformCallback } from 'node:stream';
export interface MergeRecord {
    hash: string;
    date: Date;
    parentHashes: string[];
    message: string;
}
export declare class MergeParser extends Transform {
    private buffer;
    constructor();
    _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
    private parseLine;
}
//# sourceMappingURL=merge-parser.d.ts.map