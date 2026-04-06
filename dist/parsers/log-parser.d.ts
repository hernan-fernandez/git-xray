import { Transform, TransformCallback } from 'node:stream';
export interface CommitRecord {
    hash: string;
    author: string;
    email: string;
    date: Date;
    message: string;
    isMerge: boolean;
    parentHashes: string[];
}
export declare class LogParser extends Transform {
    private buffer;
    constructor();
    _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
    private parseLine;
}
//# sourceMappingURL=log-parser.d.ts.map