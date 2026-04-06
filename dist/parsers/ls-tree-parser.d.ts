import { Transform, TransformCallback } from 'node:stream';
export interface TreeEntry {
    mode: string;
    type: 'blob' | 'tree';
    hash: string;
    path: string;
    size: number;
}
export declare class LsTreeParser extends Transform {
    private buffer;
    constructor();
    _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
    private parseLine;
}
//# sourceMappingURL=ls-tree-parser.d.ts.map