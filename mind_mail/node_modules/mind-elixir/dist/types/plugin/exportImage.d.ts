import type { MindElixirInstance } from '../types';
export declare const exportSvg: (this: MindElixirInstance, noForeignObject?: boolean, injectCss?: string) => Blob;
export declare const exportPng: (this: MindElixirInstance, noForeignObject?: boolean, injectCss?: string) => Promise<Blob | null>;
