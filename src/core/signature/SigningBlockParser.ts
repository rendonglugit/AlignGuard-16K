export interface SignatureBlockPair {
  id: number;
  length: number;
  data: Uint8Array;
}

export interface ApkSignatureInfo {
  hasSigningBlock: boolean;
  signingBlockOffset?: number;
  signingBlockTotalSize?: number;
  hasV1Scheme?: boolean;
  hasV2Scheme: boolean;
  hasV3Scheme: boolean;
  hasV31Scheme: boolean;
  hasV32Scheme: boolean;
  hasWalleChannel: boolean;
  channelName?: string;
  channelExtraInfo?: Record<string, string>;
  rawPairs: { id: string; name: string; size: number }[];
}

export const APK_SIG_BLOCK_MAGIC = new Uint8Array([
  0x41, 0x50, 0x4b, 0x20, 0x53, 0x69, 0x67, 0x20, 0x42, 0x6c, 0x6f, 0x63, 0x6b, 0x20, 0x34, 0x32,
]); // "APK Sig Block 42"

export const ID_APK_SIGNATURE_SCHEME_V2 = 0x7109871a;
export const ID_APK_SIGNATURE_SCHEME_V3 = 0xf346146d;
export const ID_APK_SIGNATURE_SCHEME_V31 = 0x1b93ad61;
export const ID_APK_SIGNATURE_SCHEME_V32 = 0x70e1c89f; // Android 17+ PQC Hybrid
export const ID_WALLE_CHANNEL = 0x71777777;

export class SigningBlockParser {
  /**
   * 检查魔数是否匹配 "APK Sig Block 42"
   */
  private static checkMagic(bytes: Uint8Array): boolean {
    if (bytes.length < 16) return false;
    for (let i = 0; i < 16; i++) {
      if (bytes[i] !== APK_SIG_BLOCK_MAGIC[i]) return false;
    }
    return true;
  }

  /**
   * 解析 APK Signing Block
   * @param file APK File
   * @param cdOffset ZIP Central Directory 偏移量
   */
  static async parse(file: File, cdOffset: number): Promise<ApkSignatureInfo> {
    if (cdOffset < 24) {
      return {
        hasSigningBlock: false,
        hasV2Scheme: false,
        hasV3Scheme: false,
        hasV31Scheme: false,
        hasV32Scheme: false,
        hasWalleChannel: false,
        rawPairs: [],
      };
    }

    // 读取 CD 之前的 24 字节：8 字节长度 + 16 字节 Magic
    const footerBuffer = await file.slice(cdOffset - 24, cdOffset).arrayBuffer();
    const footerView = new DataView(footerBuffer);
    const magicBytes = new Uint8Array(footerBuffer, 8, 16);

    if (!this.checkMagic(magicBytes)) {
      return {
        hasSigningBlock: false,
        hasV2Scheme: false,
        hasV3Scheme: false,
        hasV31Scheme: false,
        hasV32Scheme: false,
        hasWalleChannel: false,
        rawPairs: [],
      };
    }

    // 获取 block 总大小（不包含前 8 字节自身）
    const blockSizeInFooter = Number(footerView.getBigUint64(0, true));
    const totalBlockSize = blockSizeInFooter + 8;
    const blockStartOffset = cdOffset - totalBlockSize;

    if (blockStartOffset < 0) {
      throw new Error('APK 签名块计算偏移量异常');
    }

    // 读取整个 Signing Block
    const blockBuffer = await file.slice(blockStartOffset, cdOffset).arrayBuffer();
    const blockView = new DataView(blockBuffer);

    // 验证头部 8 字节的 blockSize 必须与尾部一致
    const blockSizeInHeader = Number(blockView.getBigUint64(0, true));
    if (blockSizeInHeader !== blockSizeInFooter) {
      throw new Error('APK Signing Block 头部与尾部长度不一致');
    }

    let hasV2 = false;
    let hasV3 = false;
    let hasV31 = false;
    let hasV32 = false;
    let hasWalle = false;
    let channelName: string | undefined;
    let channelExtraInfo: Record<string, string> | undefined;

    const rawPairs: { id: string; name: string; size: number }[] = [];
    const textDecoder = new TextDecoder('utf-8');

    // pairs 从 offset = 8 开始，到 offset = blockBuffer.byteLength - 24 结束
    let offset = 8;
    const pairsEnd = blockBuffer.byteLength - 24;

    while (offset < pairsEnd) {
      const pairLength = Number(blockView.getBigUint64(offset, true));
      offset += 8;

      if (pairLength < 4 || offset + pairLength > pairsEnd + 24) {
        break;
      }

      const id = blockView.getUint32(offset, true);
      const valueLength = pairLength - 4;
      const valueData = new Uint8Array(blockBuffer, offset + 4, valueLength);

      let name = `ID: 0x${id.toString(16)}`;

      if (id === ID_APK_SIGNATURE_SCHEME_V2) {
        hasV2 = true;
        name = 'APK Signature Scheme v2';
      } else if (id === ID_APK_SIGNATURE_SCHEME_V3) {
        hasV3 = true;
        name = 'APK Signature Scheme v3';
      } else if (id === ID_APK_SIGNATURE_SCHEME_V31) {
        hasV31 = true;
        name = 'APK Signature Scheme v3.1';
      } else if (id === ID_APK_SIGNATURE_SCHEME_V32) {
        hasV32 = true;
        name = 'APK Signature Scheme v3.2 (PQC Hybrid)';
      } else if (id === ID_WALLE_CHANNEL) {
        hasWalle = true;
        name = 'Meituan Walle Channel';

        try {
          // 美团 Walle 格式解析：可能是纯文本或 JSON 格式的 map
          const decoded = textDecoder.decode(valueData);
          if (decoded.trim().startsWith('{')) {
            const parsed = JSON.parse(decoded);
            channelName = parsed.channel || parsed.channelName;
            channelExtraInfo = parsed;
          } else {
            // Walle 标准二进制存储：前 2 字节为 short 长度或直接为字符串
            if (valueLength > 2) {
              const strLen = new DataView(valueData.buffer, valueData.byteOffset, 2).getUint16(0, true);
              if (strLen > 0 && strLen <= valueLength - 2) {
                channelName = textDecoder.decode(valueData.subarray(2, 2 + strLen));
              } else {
                channelName = decoded;
              }
            } else {
              channelName = decoded;
            }
          }
        } catch {
          channelName = textDecoder.decode(valueData);
        }
      }

      rawPairs.push({
        id: `0x${id.toString(16).padStart(8, '0')}`,
        name,
        size: pairLength,
      });

      offset += pairLength;
    }

    return {
      hasSigningBlock: true,
      signingBlockOffset: blockStartOffset,
      signingBlockTotalSize: totalBlockSize,
      hasV2Scheme: hasV2,
      hasV3Scheme: hasV3,
      hasV31Scheme: hasV31,
      hasV32Scheme: hasV32,
      hasWalleChannel: hasWalle,
      channelName,
      channelExtraInfo,
      rawPairs,
    };
  }
}
