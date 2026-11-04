import { ZipReader } from './zip/ZipReader';
import { ZipEntry } from './zip/types';
import { ElfParser, ElfAnalysisResult } from './elf/ElfParser';
import { SigningBlockParser, ApkSignatureInfo } from './signature/SigningBlockParser';
import { HardeningDetector, HardeningFeature } from './hardening/HardeningDetector';

export type SoAlignmentStatus = 'PASS' | 'FAIL_ELF' | 'FAIL_ZIP' | 'FAIL_BOTH' | 'COMPRESSED' | '32BIT_WARN';

export interface SoCheckResult {
  entry: ZipEntry;
  abi: string;
  name: string;
  elfResult?: ElfAnalysisResult;
  status: SoAlignmentStatus;
  statusReason: string;
}

export interface ApkInspectionReport {
  fileName: string;
  fileSize: number;
  overallStatus: 'PASS' | 'FAIL' | 'WARNING';
  is16KbCompatible: boolean;
  totalSoCount: number;
  aligned64BitSoCount: number;
  unaligned64BitSoCount: number;
  soResults: SoCheckResult[];
  soByAbi: Record<string, SoCheckResult[]>;
  signatureInfo: ApkSignatureInfo;
  hardeningFeatures: HardeningFeature[];
  cdOffset: number;
  eocdOffset: number;
}

export class ApkInspector {
  static async inspect(file: File): Promise<ApkInspectionReport> {
    const zipReader = new ZipReader(file);
    const cd = await zipReader.parseCentralDirectory();

    const allFilenames = cd.entries.map((e) => e.filename);
    const hardeningFeatures = HardeningDetector.detect(allFilenames);

    // 解析签名块 (v2 / v3 / v3.1 / v3.2 / Walle)
    const signatureInfo = await SigningBlockParser.parse(file, cd.cdOffset);

    // 检测 v1 (JAR) 签名：检查 META-INF/ 目录下是否存在清单和证书签名文件
    const hasV1Scheme = cd.entries.some((e) => {
      const fn = e.filename.toUpperCase();
      return (
        fn.startsWith('META-INF/') &&
        (fn.endsWith('.SF') ||
          fn.endsWith('.RSA') ||
          fn.endsWith('.DSA') ||
          fn.endsWith('.EC') ||
          fn === 'META-INF/MANIFEST.MF')
      );
    });
    signatureInfo.hasV1Scheme = hasV1Scheme;

    // 过滤 lib/ 下的所有 .so 文件
    const soEntries = cd.entries.filter(
      (e) => e.filename.startsWith('lib/') && e.filename.endsWith('.so')
    );

    const soResults: SoCheckResult[] = [];
    const soByAbi: Record<string, SoCheckResult[]> = {};

    let unaligned64BitCount = 0;
    let aligned64BitCount = 0;

    for (const entry of soEntries) {
      // 路径格式通常为 lib/<abi>/<name>.so
      const parts = entry.filename.split('/');
      const abi = parts.length >= 3 ? parts[1] : 'unknown';
      const name = parts[parts.length - 1];

      await zipReader.calculateDataOffset(entry);

      let elfResult: ElfAnalysisResult | undefined;
      let status: SoAlignmentStatus = 'PASS';
      let statusReason = 'ELF与Zip偏移均满足 16KB 对齐要求';

      const is64BitAbi = abi === 'arm64-v8a' || abi === 'x86_64';

      if (is64BitAbi) {
        // 64 位架构 (arm64-v8a / x86_64)：必须严格满足 16KB 对齐要求
        if (entry.compressionMethod === 0) {
          try {
            const headerBytes = await zipReader.readEntryHeaderBytes(entry, 8192);
            elfResult = ElfParser.parse(headerBytes);

            const elfOk = elfResult.is16KbCompatible;
            const zipOk = !!entry.is16KbAligned;

            if (!elfOk && !zipOk) {
              status = 'FAIL_BOTH';
              statusReason = `ELF段对齐仅为 ${elfResult.minLoadAlignment} 字节，且 Zip 文件数据偏移未按 16KB 对齐`;
              unaligned64BitCount++;
            } else if (!elfOk) {
              status = 'FAIL_ELF';
              statusReason = `ELF段对齐仅为 ${elfResult.minLoadAlignment} 字节 (需 16384+)，C/C++编译时未开启 16KB`;
              unaligned64BitCount++;
            } else if (!zipOk) {
              status = 'FAIL_ZIP';
              statusReason = `ELF满足16KB，但 Zip 数据偏移 (offset=${entry.dataOffset}) 未对齐 16KB (加固/签名时缺少 zipalign -P 16)`;
              unaligned64BitCount++;
            } else {
              status = 'PASS';
              aligned64BitCount++;
            }
          } catch (e: any) {
            status = 'FAIL_ELF';
            statusReason = `解析 ELF 头出错: ${e.message}`;
            unaligned64BitCount++;
          }
        } else {
          status = 'COMPRESSED';
          statusReason = '该 64 位 SO 库被压缩存储（非 Stored），运行时需解压，建议使用 extractNativeLibs=false';
          unaligned64BitCount++;
        }
      } else {
        // 32 位架构 (armeabi-v7a / x86)：原生采用 4KB 架构，Google 16KB 政策完全豁免，无需也不支持 16KB
        if (entry.compressionMethod === 0) {
          try {
            const headerBytes = await zipReader.readEntryHeaderBytes(entry, 8192);
            elfResult = ElfParser.parse(headerBytes);
          } catch {}
        }
        status = '32BIT_WARN';
        statusReason = '32 位架构库（原生 4KB 标准，Google 16KB 政策完全豁免，合规通过）';
      }

      const item: SoCheckResult = {
        entry,
        abi,
        name,
        elfResult,
        status,
        statusReason,
      };

      soResults.push(item);

      if (!soByAbi[abi]) {
        soByAbi[abi] = [];
      }
      soByAbi[abi].push(item);
    }

    const is16KbCompatible = unaligned64BitCount === 0;
    let overallStatus: 'PASS' | 'FAIL' | 'WARNING' = 'PASS';

    if (!is16KbCompatible) {
      overallStatus = 'FAIL';
    } else if (soResults.some((s) => s.status === 'COMPRESSED' || s.status === '32BIT_WARN')) {
      overallStatus = 'WARNING';
    }

    return {
      fileName: file.name,
      fileSize: file.size,
      overallStatus,
      is16KbCompatible,
      totalSoCount: soResults.length,
      aligned64BitSoCount: aligned64BitCount,
      unaligned64BitSoCount: unaligned64BitCount,
      soResults,
      soByAbi,
      signatureInfo,
      hardeningFeatures,
      cdOffset: cd.cdOffset,
      eocdOffset: cd.eocdOffset,
    };
  }
}
