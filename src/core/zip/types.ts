export interface ZipEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number; // 0 = Stored (uncompressed), 8 = Deflated
  localHeaderOffset: number;
  dataOffset?: number; // 实际数据在整个 zip 中的绝对起始字节偏移
  is16KbAligned?: boolean; // dataOffset % 16384 === 0
  is4ByteAligned?: boolean; // dataOffset % 4 === 0
}

export interface ZipCentralDirectory {
  entries: ZipEntry[];
  cdOffset: number;
  cdSize: number;
  eocdOffset: number;
}
