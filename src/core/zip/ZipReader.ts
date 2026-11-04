import { ZipCentralDirectory, ZipEntry } from './types';

export class ZipReader {
  private file: File;

  constructor(file: File) {
    this.file = file;
  }

  /**
   * 按需读取文件的指定切片
   */
  async readSlice(start: number, end: number): Promise<ArrayBuffer> {
    const slice = this.file.slice(start, end);
    return await slice.arrayBuffer();
  }

  /**
   * 定位并解析末尾的 EOCD (End of Central Directory Record)
   */
  async parseEocd(): Promise<{ cdOffset: number; cdSize: number; eocdOffset: number }> {
    const fileSize = this.file.size;
    // 正常 EOCD 大小为 22 字节，加上最多 65535 字节的 comment，扫描末尾最多 65557 字节
    const readLength = Math.min(fileSize, 65557);
    const start = fileSize - readLength;
    const buffer = await this.readSlice(start, fileSize);
    const view = new DataView(buffer);

    // 从后向前寻找 EOCD 签名 0x06054b50
    for (let i = buffer.byteLength - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        const cdSize = view.getUint32(i + 12, true);
        const cdOffset = view.getUint32(i + 16, true);
        const eocdOffset = start + i;
        return { cdOffset, cdSize, eocdOffset };
      }
    }

    throw new Error('未找到 ZIP 文件的 EOCD 记录，文件可能不是合法的 APK/ZIP 或已损坏。');
  }

  /**
   * 解析所有的 Central Directory 条目
   */
  async parseCentralDirectory(): Promise<ZipCentralDirectory> {
    const { cdOffset, cdSize, eocdOffset } = await this.parseEocd();
    const buffer = await this.readSlice(cdOffset, cdOffset + cdSize);
    const view = new DataView(buffer);
    const entries: ZipEntry[] = [];
    const textDecoder = new TextDecoder('utf-8');

    let offset = 0;
    while (offset < buffer.byteLength) {
      if (view.getUint32(offset, true) !== 0x02014b50) {
        break; // 结束或签名不匹配
      }

      const compressionMethod = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraFieldLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);

      const fileNameBytes = new Uint8Array(buffer, offset + 46, fileNameLength);
      const filename = textDecoder.decode(fileNameBytes);

      entries.push({
        filename,
        compressedSize,
        uncompressedSize,
        compressionMethod,
        localHeaderOffset,
      });

      offset += 46 + fileNameLength + extraFieldLength + commentLength;
    }

    return { entries, cdOffset, cdSize, eocdOffset };
  }

  /**
   * 计算指定 Entry 的实际数据起始绝对偏移量及 16KB/4B 对齐情况
   */
  async calculateDataOffset(entry: ZipEntry): Promise<number> {
    // 读取 Local File Header (固定 30 字节头部)
    const headerBuffer = await this.readSlice(entry.localHeaderOffset, entry.localHeaderOffset + 30);
    const view = new DataView(headerBuffer);

    if (view.getUint32(0, true) !== 0x04034b50) {
      throw new Error(`Local File Header 校验失败: ${entry.filename}`);
    }

    const fileNameLength = view.getUint16(26, true);
    const extraFieldLength = view.getUint16(28, true);

    const dataOffset = entry.localHeaderOffset + 30 + fileNameLength + extraFieldLength;
    entry.dataOffset = dataOffset;
    entry.is16KbAligned = dataOffset % 16384 === 0;
    entry.is4ByteAligned = dataOffset % 4 === 0;

    return dataOffset;
  }

  /**
   * 读取指定 Entry 的前 N 个字节（用于读取 ELF 头，无需解压整个文件）
   * 仅适用于 compressionMethod === 0 (Stored) 的条目
   */
  async readEntryHeaderBytes(entry: ZipEntry, maxBytes = 8192): Promise<ArrayBuffer> {
    if (entry.dataOffset === undefined) {
      await this.calculateDataOffset(entry);
    }
    const start = entry.dataOffset!;
    const end = Math.min(start + maxBytes, start + entry.uncompressedSize);
    return await this.readSlice(start, end);
  }
}
