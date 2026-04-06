import { Transform, TransformCallback } from 'node:stream';
export interface FileChangeRecord {
    commitHash: string;
    filePath: string;
    linesAdded: number;
    linesRemoved: number;
    author: string;
    date: Date;
}
export declare class NumstatParser extends Transform {
    private buffer;
    private currentHash;
    private currentAuthor;
    private currentDate;
    constructor();
    _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
    private parseLine;
}
//# sourceMappingURL=numstat-parser.d.ts.map