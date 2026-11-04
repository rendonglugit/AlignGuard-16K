export interface ElfLoadSegment {
  type: number;
  offset: number;
  vaddr: number;
  filesz: number;
  memsz: number;
  align: number;
  is16KbAligned: boolean;
}

export interface ElfAnalysisResult {
  isValidElf: boolean;
  is64Bit: boolean;
  isLittleEndian: boolean;
  machineType?: number;
  loadSegments: ElfLoadSegment[];
  minLoadAlignment: number;
  maxLoadAlignment: number;
  is16KbCompatible: boolean;
  errorMessage?: string;
}

export class ElfParser {
  /**
   * 解析 ELF 二进制头部
   */
  static parse(buffer: ArrayBuffer): ElfAnalysisResult {
    const view = new DataView(buffer);

    if (buffer.byteLength < 52) {
      return {
        isValidElf: false,
        is64Bit: false,
        isLittleEndian: true,
        loadSegments: [],
        minLoadAlignment: 0,
        maxLoadAlignment: 0,
        is16KbCompatible: false,
        errorMessage: '文件数据长度不足 ELF 头部大小',
      };
    }

    // 校验 Magic 0x7F 'E' 'L' 'F'
    const magic = view.getUint32(0, false);
    if (magic !== 0x7f454c46) {
      return {
        isValidElf: false,
        is64Bit: false,
        isLittleEndian: true,
        loadSegments: [],
        minLoadAlignment: 0,
        maxLoadAlignment: 0,
        is16KbCompatible: false,
        errorMessage: '非合法 ELF 二进制（Magic 不匹配）',
      };
    }

    const is64Bit = view.getUint8(4) === 2;
    const isLittleEndian = view.getUint8(5) === 1;

    let phOffset = 0;
    let phEntrySize = 0;
    let phNum = 0;

    if (is64Bit) {
      if (buffer.byteLength < 64) {
        throw new Error('ELF64 头部长度不足');
      }
      phOffset = Number(view.getBigUint64(32, isLittleEndian));
      phEntrySize = view.getUint16(54, isLittleEndian);
      phNum = view.getUint16(56, isLittleEndian);
    } else {
      phOffset = view.getUint32(28, isLittleEndian);
      phEntrySize = view.getUint16(42, isLittleEndian);
      phNum = view.getUint16(44, isLittleEndian);
    }

    const loadSegments: ElfLoadSegment[] = [];
    let minLoadAlignment = Infinity;
    let maxLoadAlignment = 0;

    // 遍历所有 Program Header 条目
    for (let i = 0; i < phNum; i++) {
      const entryOffset = phOffset + i * phEntrySize;
      if (entryOffset + phEntrySize > buffer.byteLength) {
        // 数据切片可能不足以覆盖所有 PH，记录已有信息
        break;
      }

      const p_type = view.getUint32(entryOffset, isLittleEndian);

      // PT_LOAD = 1
      if (p_type === 1) {
        let align = 0;
        let offset = 0;
        let vaddr = 0;
        let filesz = 0;
        let memsz = 0;

        if (is64Bit) {
          offset = Number(view.getBigUint64(entryOffset + 8, isLittleEndian));
          vaddr = Number(view.getBigUint64(entryOffset + 16, isLittleEndian));
          filesz = Number(view.getBigUint64(entryOffset + 32, isLittleEndian));
          memsz = Number(view.getBigUint64(entryOffset + 40, isLittleEndian));
          align = Number(view.getBigUint64(entryOffset + 48, isLittleEndian));
        } else {
          offset = view.getUint32(entryOffset + 4, isLittleEndian);
          vaddr = view.getUint32(entryOffset + 8, isLittleEndian);
          filesz = view.getUint32(entryOffset + 16, isLittleEndian);
          memsz = view.getUint32(entryOffset + 20, isLittleEndian);
          align = view.getUint32(entryOffset + 28, isLittleEndian);
        }

        if (align > 0) {
          minLoadAlignment = Math.min(minLoadAlignment, align);
          maxLoadAlignment = Math.max(maxLoadAlignment, align);
        }

        loadSegments.push({
          type: p_type,
          offset,
          vaddr,
          filesz,
          memsz,
          align,
          is16KbAligned: align >= 16384,
        });
      }
    }

    if (loadSegments.length === 0) {
      return {
        isValidElf: true,
        is64Bit,
        isLittleEndian,
        loadSegments: [],
        minLoadAlignment: 0,
        maxLoadAlignment: 0,
        is16KbCompatible: false,
        errorMessage: '未找到任何 PT_LOAD 加载段',
      };
    }

    const effectiveMinAlign = minLoadAlignment === Infinity ? 0 : minLoadAlignment;
    // 兼容 16KB 要求：所有 PT_LOAD 段的 align 必须 >= 16384 (16KB)
    const is16KbCompatible = loadSegments.every((seg) => seg.align >= 16384);

    return {
      isValidElf: true,
      is64Bit,
      isLittleEndian,
      loadSegments,
      minLoadAlignment: effectiveMinAlign,
      maxLoadAlignment,
      is16KbCompatible,
    };
  }
}
