import {
  APK_SIG_BLOCK_MAGIC,
  ID_WALLE_CHANNEL,
} from '../signature/SigningBlockParser';

export interface ChannelWriteOption {
  channel: string;
  extraInfo?: Record<string, string>;
}

export class WalleWriter {
  /**
   * 将字符串与扩展参数编码为美团 Walle 的 Value 格式
   */
  private static encodeWalleValue(channel: string, extraInfo?: Record<string, string>): Uint8Array {
    const encoder = new TextEncoder();
    const channelBytes = encoder.encode(channel);

    if (extraInfo && Object.keys(extraInfo).length > 0) {
      // 若有额外扩展信息，采用 JSON 包装
      const payload = {
        channel,
        ...extraInfo,
      };
      return encoder.encode(JSON.stringify(payload));
    }

    // 标准 Walle 二进制：2 字节小端长度 + channel 字节
    const buffer = new Uint8Array(2 + channelBytes.length);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, channelBytes.length, true);
    buffer.set(channelBytes, 2);
    return buffer;
  }

  /**
   * 基于已签名的母包，写入美团渠道信息生成新的渠道包 Blob
   */
  static async generateChannelApk(
    file: File,
    cdOffset: number,
    eocdOffset: number,
    option: ChannelWriteOption
  ): Promise<Blob> {
    // 1. 读取原有的 Signing Block 尾部
    const footerBuffer = await file.slice(cdOffset - 24, cdOffset).arrayBuffer();
    const footerView = new DataView(footerBuffer);
    const blockSizeInFooter = Number(footerView.getBigUint64(0, true));
    const totalOldBlockSize = blockSizeInFooter + 8;
    const blockStartOffset = cdOffset - totalOldBlockSize;

    if (blockStartOffset < 0) {
      throw new Error('未找到有效的 APK Signing Block，无法直接写入美团渠道包');
    }

    // 2. 读取原有的完整 Signing Block
    const oldBlockBuffer = await file.slice(blockStartOffset, cdOffset).arrayBuffer();
    const oldBlockView = new DataView(oldBlockBuffer);

    // 3. 解析并重组 ID-Value 列表（过滤或替换已有的 0x71777777 块）
    const retainedPairs: { id: number; data: Uint8Array }[] = [];
    let offset = 8;
    const pairsEnd = oldBlockBuffer.byteLength - 24;

    while (offset < pairsEnd) {
      const pairLength = Number(oldBlockView.getBigUint64(offset, true));
      offset += 8;

      if (pairLength < 4 || offset + pairLength > pairsEnd + 24) {
        break;
      }

      const id = oldBlockView.getUint32(offset, true);
      const valueLength = pairLength - 4;
      const valueData = new Uint8Array(oldBlockBuffer, offset + 4, valueLength);

      // 如果不是 Walle ID，则保留原样；如果是旧的 Walle ID，替换为新渠道
      if (id !== ID_WALLE_CHANNEL) {
        retainedPairs.push({ id, data: valueData });
      }

      offset += pairLength;
    }

    // 4. 追加新的 Walle Channel Block
    const newWalleValue = this.encodeWalleValue(option.channel, option.extraInfo);
    retainedPairs.push({
      id: ID_WALLE_CHANNEL,
      data: newWalleValue,
    });

    // 5. 计算新 Signing Block 的各部分长度
    // pairs 总长度 = sum(8(length) + 4(id) + data.length)
    let newPairsLength = 0;
    for (const pair of retainedPairs) {
      newPairsLength += 8 + 4 + pair.data.length;
    }

    // totalNewBlockSize = 8 (head size) + newPairsLength + 8 (tail size) + 16 (magic)
    const newTotalBlockSize = 8 + newPairsLength + 24;
    const newBlockSizeExcludingHead = newTotalBlockSize - 8;

    // 6. 构造新的 Signing Block 二进制
    const newBlockBuffer = new ArrayBuffer(newTotalBlockSize);
    const newBlockView = new DataView(newBlockBuffer);
    const newBlockUint8 = new Uint8Array(newBlockBuffer);

    // 头部 8 字节
    newBlockView.setBigUint64(0, BigInt(newBlockSizeExcludingHead), true);

    // 写入所有 Pairs
    let writeOffset = 8;
    for (const pair of retainedPairs) {
      const pairLength = 4 + pair.data.length;
      newBlockView.setBigUint64(writeOffset, BigInt(pairLength), true);
      writeOffset += 8;

      newBlockView.setUint32(writeOffset, pair.id, true);
      writeOffset += 4;

      newBlockUint8.set(pair.data, writeOffset);
      writeOffset += pair.data.length;
    }

    // 尾部 8 字节 size
    newBlockView.setBigUint64(writeOffset, BigInt(newBlockSizeExcludingHead), true);
    writeOffset += 8;

    // 尾部 16 字节 Magic
    newBlockUint8.set(APK_SIG_BLOCK_MAGIC, writeOffset);

    // 7. 更新 EOCD 中的 Central Directory 偏移量
    const sizeDelta = newTotalBlockSize - totalOldBlockSize;
    const oldEocdBuffer = await file.slice(eocdOffset, file.size).arrayBuffer();
    const newEocdBuffer = oldEocdBuffer.slice(0); // clone
    const newEocdView = new DataView(newEocdBuffer);

    // EOCD 的 Central Directory 偏移量位于 +16 (uint32)
    const oldCdOffsetInEocd = newEocdView.getUint32(16, true);
    newEocdView.setUint32(16, oldCdOffsetInEocd + sizeDelta, true);

    // 8. 组装最终完整的渠道 APK Blob
    // Part 1: 从 0 到 blockStartOffset（所有 zip entry 数据区，字节完全一致，对齐绝对不受影响）
    const part1 = file.slice(0, blockStartOffset);
    // Part 2: 新的 Signing Block
    const part2 = new Blob([newBlockBuffer]);
    // Part 3: Central Directory（内容保持不变）
    const part3 = file.slice(cdOffset, eocdOffset);
    // Part 4: 更新了 cdOffset 的 EOCD
    const part4 = new Blob([newEocdBuffer]);

    return new Blob([part1, part2, part3, part4], {
      type: 'application/vnd.android.package-archive',
    });
  }
}
