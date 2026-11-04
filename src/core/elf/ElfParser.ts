export interface ElfLoadSegment {
  type: number;
  offset: number;
  vaddr: number;
  filesz: number;
  memsz: number;
  align: number;
  is16KbAligned: boolean;
}

export interface ElfRelroInfo {
  hasRelro: boolean;
  start: number;
  end: number;
  align: number;
  isEnd16KbAligned: boolean;
  isSuffix: boolean;
  is16KbCompatible: boolean;
  details?: string;
}

export interface ElfAnalysisResult {
  isValidElf: boolean;
  is64Bit: boolean;
  isLittleEndian: boolean;
  machineType?: number;
  loadSegments: ElfLoadSegment[];
  relroInfo?: ElfRelroInfo;
  minLoadAlignment: number;
  maxLoadAlignment: number;
  is16KbCompatible: boolean;
  errorMessage?: string;
}

export const PT_LOAD = 1;
export const PT_GNU_RELRO = 0x6474e552;

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
    let rawRelro: { vaddr: number; memsz: number; align: number } | null = null;
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
      if (p_type === PT_LOAD) {
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
      } else if (p_type === PT_GNU_RELRO) {
        // PT_GNU_RELRO = 0x6474e552
        let vaddr = 0;
        let memsz = 0;
        let align = 0;

        if (is64Bit) {
          vaddr = Number(view.getBigUint64(entryOffset + 16, isLittleEndian));
          memsz = Number(view.getBigUint64(entryOffset + 40, isLittleEndian));
          align = Number(view.getBigUint64(entryOffset + 48, isLittleEndian));
        } else {
          vaddr = view.getUint32(entryOffset + 8, isLittleEndian);
          memsz = view.getUint32(entryOffset + 20, isLittleEndian);
          align = view.getUint32(entryOffset + 28, isLittleEndian);
        }

        rawRelro = { vaddr, memsz, align };
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

    // 针对 PT_GNU_RELRO 进行 16KB 严格审查
    let relroInfo: ElfRelroInfo | undefined;
    let isRelroOk = true;

    if (rawRelro) {
      const relroStart = rawRelro.vaddr;
      const relroEnd = rawRelro.vaddr + rawRelro.memsz;
      const isEnd16KbAligned = relroEnd % 16384 === 0;

      // 寻找包含该 RELRO 的可写 PT_LOAD 段
      const containingLoad = loadSegments.find(
        (load) => load.vaddr <= relroStart && load.vaddr + load.memsz >= relroEnd
      );

      // 若 RELRO 位于包含段的最末尾，则为 suffix
      const isSuffix = containingLoad
        ? containingLoad.vaddr + containingLoad.memsz === relroEnd
        : false;

      // 64 位下若既未 16KB 对齐又不是 suffix，则为 Google Play / Bionic 阻断项
      if (is64Bit && !isEnd16KbAligned && !isSuffix) {
        isRelroOk = false;
      }

      const details = !isRelroOk
        ? `PT_GNU_RELRO start: 0x${relroStart.toString(16).padStart(8, '0')} end: 0x${relroEnd
            .toString(16)
            .padStart(8, '0')} align: 0x${rawRelro.align
            .toString(16)
            .padStart(8, '0')} (RELRO is not a suffix and its end is not 16 KB aligned)`
        : undefined;

      relroInfo = {
        hasRelro: true,
        start: relroStart,
        end: relroEnd,
        align: rawRelro.align,
        isEnd16KbAligned,
        isSuffix,
        is16KbCompatible: isRelroOk,
        details,
      };
    }

    const effectiveMinAlign = minLoadAlignment === Infinity ? 0 : minLoadAlignment;
    // Google 官方审查硬性标准：所有 PT_LOAD 必须满足 16KB (p_align >= 16384)
    // PT_GNU_RELRO 属于 Android 15 兼容兜底范畴，作为高级建议项，不直接阻断主合规判定
    const is16KbCompatible = loadSegments.every((seg) => seg.align >= 16384);

    return {
      isValidElf: true,
      is64Bit,
      isLittleEndian,
      loadSegments,
      relroInfo,
      minLoadAlignment: effectiveMinAlign,
      maxLoadAlignment,
      is16KbCompatible,
    };
  }
}
