/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// 零依賴 SQLite 唯讀讀取器:解析主檔 B-tree + WAL frame 覆蓋 + overflow page 串接。
// 僅供讀取 VRCX.sqlite3,永不寫入。已用真實資料庫原型驗證(feed 五表、長 URL overflow、WAL)。
import { existsSync, readFileSync } from "fs";

type Row = Array<string | number | Buffer | null>;

export interface Db {
    pageSize: number;
    tables: Record<string, number>;
    walkTable(rootPage: number): Generator<[number, Row]>;
    walActive: boolean;
}

export function openDb(path: string): Db {
    const main = readFileSync(path);
    if (main.toString("ascii", 0, 15) !== "SQLite format 3") throw new Error("not sqlite");
    let pageSize = main.readUInt16BE(16);
    pageSize = pageSize === 1 ? 65536 : pageSize;

    // WAL:取每頁最後一個有效 commit(dbSize!=0)之前的最新版本
    const walPages = new Map<number, Buffer>();
    const walPath = path + "-wal";
    if (existsSync(walPath)) {
        const wal = readFileSync(walPath);
        if (wal.length >= 32 && (wal.readUInt32BE(0) === 0x377f0682 || wal.readUInt32BE(0) === 0x377f0683)) {
            const walPageSize = wal.readUInt32BE(8);
            const frameSize = 24 + walPageSize;
            let maxValidFrame = 0;
            for (let i = 0, off = 32; off + frameSize <= wal.length; i++, off += frameSize) {
                if (wal.readUInt32BE(off + 4) !== 0) maxValidFrame = i + 1;
            }
            for (let i = 0, off = 32; i < maxValidFrame; i++, off += frameSize) {
                walPages.set(wal.readUInt32BE(off), wal.subarray(off + 24, off + 24 + walPageSize));
            }
            if (walPageSize) pageSize = walPageSize;
        }
    }

    function page(n: number): Buffer {
        return walPages.get(n) ?? main.subarray((n - 1) * pageSize, n * pageSize);
    }

    function varint(b: Buffer, off: number): [bigint, number] {
        let result = 0n;
        for (let i = 0; i < 9; i++) {
            const byte = b[off + i];
            if (i === 8) return [(result << 8n) | BigInt(byte), off + 9];
            result = (result << 7n) | BigInt(byte & 0x7f);
            if (!(byte & 0x80)) return [result, off + i + 1];
        }
        return [result, off + 9];
    }

    const usable = pageSize;
    const maxLocal = usable - 35;
    const minLocal = ((usable - 12) * 32 / 255 | 0) - 23;

    function readPayload(pg: Buffer, cellOff: number, payloadLen: number): Buffer {
        if (payloadLen <= maxLocal) return pg.subarray(cellOff, cellOff + payloadLen);
        let local = minLocal + ((payloadLen - minLocal) % (usable - 4));
        if (local > maxLocal) local = minLocal;
        const parts = [pg.subarray(cellOff, cellOff + local)];
        let ovfl = pg.readUInt32BE(cellOff + local);
        let remaining = payloadLen - local;
        while (ovfl !== 0 && remaining > 0) {
            const op = page(ovfl);
            const next = op.readUInt32BE(0);
            const take = Math.min(remaining, usable - 4);
            parts.push(op.subarray(4, 4 + take));
            remaining -= take;
            ovfl = next;
        }
        return Buffer.concat(parts);
    }

    function serialType(b: Buffer, off: number, type: number): [string | number | Buffer | null, number] {
        switch (type) {
            case 0: return [null, off];
            case 1: return [b.readInt8(off), off + 1];
            case 2: return [b.readInt16BE(off), off + 2];
            case 3: return [(b[off] << 16 | b[off + 1] << 8 | b[off + 2]) << 8 >> 8, off + 3];
            case 4: return [b.readInt32BE(off), off + 4];
            case 5: return [b.readInt16BE(off) * 2 ** 32 + b.readUInt32BE(off + 2), off + 6];
            case 6: return [Number(b.readBigInt64BE(off)), off + 8];
            case 7: return [b.readDoubleBE(off), off + 8];
            case 8: return [0, off];
            case 9: return [1, off];
            default: {
                if (type >= 12 && type % 2 === 0) { const len = (type - 12) / 2; return [b.subarray(off, off + len), off + len]; }
                const len = (type - 13) / 2; return [b.toString("utf8", off, off + len), off + len];
            }
        }
    }

    function parseRecord(payload: Buffer): Row {
        const [hdrLen, hdrStart] = varint(payload, 0);
        const types: number[] = [];
        let p = hdrStart;
        const hdrEnd = Number(hdrLen);
        while (p < hdrEnd) { const [t, np] = varint(payload, p); types.push(Number(t)); p = np; }
        const cols: Row = [];
        let dp = hdrEnd;
        for (const t of types) { const [v, ndp] = serialType(payload, dp, t); cols.push(v); dp = ndp; }
        return cols;
    }

    function* walkTable(rootPage: number): Generator<[number, Row]> {
        const stack = [rootPage];
        while (stack.length) {
            const pnum = stack.pop()!;
            const pg = page(pnum);
            const hoff = pnum === 1 ? 100 : 0;
            const type = pg[hoff];
            const nCells = pg.readUInt16BE(hoff + 3);
            const cellPtrStart = hoff + (type === 2 || type === 5 ? 12 : 8);
            if (type === 5) {
                for (let i = 0; i < nCells; i++) {
                    stack.push(pg.readUInt32BE(pg.readUInt16BE(cellPtrStart + i * 2)));
                }
                stack.push(pg.readUInt32BE(hoff + 8));
            } else if (type === 13) {
                for (let i = 0; i < nCells; i++) {
                    let p = pg.readUInt16BE(cellPtrStart + i * 2);
                    const [payloadLen, p1] = varint(pg, p); p = p1;
                    const [rowid, p2] = varint(pg, p); p = p2;
                    yield [Number(rowid), parseRecord(readPayload(pg, p, Number(payloadLen)))];
                }
            }
        }
    }

    const tables: Record<string, number> = {};
    for (const [, rec] of walkTable(1)) {
        if (rec[0] === "table" && typeof rec[1] === "string") tables[rec[1]] = Number(rec[3]);
    }

    return { pageSize, tables, walkTable, walActive: walPages.size > 0 };
}
