import React, { useState, useRef } from 'react';
import { ApkInspector, ApkInspectionReport } from './core/ApkInspector';
import { WalleWriter } from './core/walle/WalleWriter';

export default function App() {
  const [activeTab, setActiveTab] = useState<'inspect' | 'walle'>('inspect');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [report, setReport] = useState<ApkInspectionReport | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // 渠道生成状态
  const [channelsInput, setChannelsInput] = useState<string>('googleplay\nhuawei\nxiaomi\noppo\nvivo');
  const [generating, setGenerating] = useState(false);
  const [generatedList, setGeneratedList] = useState<{ channel: string; blob: Blob; filename: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileProcess = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.apk') && !selectedFile.name.endsWith('.aab')) {
      alert('请选择 .apk 或 .aab 文件');
      return;
    }

    setFile(selectedFile);
    setLoading(true);
    setLoadingText('正在按需分块读取 APK 结构...');
    setGeneratedList([]);

    try {
      const rep = await ApkInspector.inspect(selectedFile);
      setReport(rep);
    } catch (err: any) {
      alert(`解析失败: ${err.message || '文件损坏或非标准格式'}`);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const getSignatureSchemeNames = (sig: ApkInspectionReport['signatureInfo']): string[] => {
    const list: string[] = [];
    if (sig.hasV1Scheme) list.push('v1 (JAR)');
    if (sig.hasV2Scheme) list.push('v2');
    if (sig.hasV3Scheme) list.push('v3');
    if (sig.hasV31Scheme) list.push('v3.1');
    if (sig.hasV32Scheme) list.push('v3.2 (PQC)');
    return list;
  };

  const handleBatchGenerate = async () => {
    if (!file || !report) return;

    const hasModernScheme =
      report.signatureInfo.hasV2Scheme ||
      report.signatureInfo.hasV3Scheme ||
      report.signatureInfo.hasV31Scheme ||
      report.signatureInfo.hasV32Scheme;

    if (!hasModernScheme) {
      if (report.signatureInfo.hasV1Scheme) {
        alert(
          '无法生成：母包仅包含 v1 (JAR) 签名，缺失 APK 签名块 (v2/v3/v3.1/v3.2)。美团 Walle 方案基于 APK Signing Block，请先使用 apksigner 对母包开启 v2 或 v3 签名后再试。'
        );
      } else {
        alert(
          '无法生成：母包未包含有效的 APK Signing Block 签名 (v2/v3/v3.1/v3.2)。美团 Walle 方案依赖签名块。请先对母包进行签名。'
        );
      }
      return;
    }

    const channels = channelsInput
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (channels.length === 0) {
      alert('请输入至少一个渠道名称');
      return;
    }

    setGenerating(true);
    const results: { channel: string; blob: Blob; filename: string }[] = [];

    try {
      const baseName = file.name.replace(/\.apk$/i, '');
      for (const ch of channels) {
        const channelBlob = await WalleWriter.generateChannelApk(
          file,
          report.cdOffset,
          report.eocdOffset,
          { channel: ch }
        );
        const outName = `${baseName}_${ch}.apk`;
        results.push({ channel: ch, blob: channelBlob, filename: outName });
      }
      setGeneratedList(results);
    } catch (err: any) {
      alert(`生成渠道包失败: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyMarkdownReport = () => {
    if (!report) return;
    const sigNames = getSignatureSchemeNames(report.signatureInfo);
    const lines = [
      `# Android 16KB & 渠道合规体检报告`,
      `- **文件名**: ${report.fileName}`,
      `- **文件大小**: ${(report.fileSize / (1024 * 1024)).toFixed(2)} MB`,
      `- **综合体检结论**: ${report.overallStatus === 'PASS' ? '✅ 合规通过 (PASS)' : report.overallStatus === 'FAIL' ? '❌ 不合规 (FAIL)' : '⚠️ 存在警告 (WARNING)'}`,
      `- **16KB 兼容状态**: ${report.is16KbCompatible ? '兼容' : '不兼容'}`,
      `- **64位 SO 对齐率**: ${report.aligned64BitSoCount} / ${report.aligned64BitSoCount + report.unaligned64BitSoCount}`,
      `- **签名版本**: ${sigNames.join(', ') || '未检测到已知签名'}`,
      `- **已有渠道**: ${report.signatureInfo.channelName || '无'}`,
      `- **加固特征**: ${report.hardeningFeatures.length > 0 ? report.hardeningFeatures.map((h) => h.name).join(', ') : '未检测到加固壳'}`,
      ``,
      `## 详细 64 位 SO 列表`,
      `| 架构 | 动态库 | ELF 对齐 | Zip 偏移对齐 | 结论 |`,
      `| :--- | :--- | :--- | :--- | :--- |`,
    ];

    for (const so of report.soResults) {
      const elfAlign = so.elfResult ? `${so.elfResult.minLoadAlignment} B` : '-';
      const zipAlign = so.entry.dataOffset !== undefined ? `${so.entry.is16KbAligned ? '✅ 16KB对齐' : '❌ 未对齐'}` : '-';
      lines.push(`| ${so.abi} | ${so.name} | ${elfAlign} | ${zipAlign} | ${so.status} |`);
    }

    navigator.clipboard.writeText(lines.join('\n'));
    alert('Markdown 报告已成功复制到剪贴板！');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* 顶部 Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-200">
              16K
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                Android 16KB & 美团渠道工具箱
              </h1>
              <p className="text-xs text-slate-500">
                16 KB Page Size 对齐检测 · 加固排查 · 美团 Walle 多渠道
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            100% 浏览器本地流式读取 · 零文件上传 · 源码绝不外泄
          </div>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="max-w-6xl mx-auto px-4 mt-6">
        {/* 顶部 Tab 切换 */}
        <div className="flex border-b border-slate-200 mb-6 bg-white p-1 rounded-xl shadow-sm">
          <button
            onClick={() => setActiveTab('inspect')}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'inspect'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🔍 16KB 对齐与加固排查
          </button>
          <button
            onClick={() => setActiveTab('walle')}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'walle'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚡ 美团 Walle 多渠道工坊
          </button>
        </div>

        {/* 拖拽上传区 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all bg-white ${
            dragOver
              ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
              : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/80 shadow-sm'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && e.target.files[0] && handleFileProcess(e.target.files[0])}
            accept=".apk,.aab"
            className="hidden"
          />

          <div className="max-w-md mx-auto flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-800">
              {file ? `已选择: ${file.name}` : '点击或将 APK / AAB 拖拽至此处'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              支持任意大小的 APK/AAB，即使是 1GB 安装包也能在 1~2 秒内完成本地检查
            </p>
          </div>
        </div>

        {/* 解析中遮罩 */}
        {loading && (
          <div className="my-8 text-center py-6 bg-white rounded-xl shadow-sm border border-slate-100">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-2"></div>
            <p className="text-sm font-medium text-slate-700">{loadingText}</p>
          </div>
        )}

        {/* TAB 1: 16KB 体检详情看板 */}
        {activeTab === 'inspect' && report && !loading && (
          <div className="mt-8 space-y-6">
            {/* 核心结论横幅 */}
            <div
              className={`p-6 rounded-2xl border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                report.overallStatus === 'PASS'
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  : report.overallStatus === 'FAIL'
                  ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                  : 'bg-amber-50/80 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-sm ${
                    report.overallStatus === 'PASS'
                      ? 'bg-emerald-600'
                      : report.overallStatus === 'FAIL'
                      ? 'bg-rose-600'
                      : 'bg-amber-600'
                  }`}
                >
                  {report.overallStatus === 'PASS' ? '✓' : report.overallStatus === 'FAIL' ? '✕' : '!'}
                </div>
                <div>
                  <h2 className="text-xl font-bold">
                    {report.overallStatus === 'PASS'
                      ? '体检合格：100% 满足 16 KB Page Size 要求'
                      : report.overallStatus === 'FAIL'
                      ? '体检不合格：发现未按 16 KB 对齐的动态库！'
                      : '体检提示：存在部分非致命警告项'}
                  </h2>
                  <p className="text-xs opacity-90 mt-1">
                    {report.is16KbCompatible
                      ? '所有 64 位 (arm64-v8a / x86_64) Native 库的 ELF 内部段对齐与 ZIP 归档偏移均达到 16384+ 字节。'
                      : `检测到 ${report.unaligned64BitSoCount} 个 64 位库未对齐，在 Android 15+ (16KB) 设备上运行或安装将发生崩溃！`}
                  </p>
                </div>
              </div>

              <button
                onClick={copyMarkdownReport}
                className="px-4 py-2 bg-white rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm whitespace-nowrap"
              >
                📋 复制 Markdown 报告
              </button>
            </div>

            {/* 基础指标卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">SO 库总数</span>
                <p className="text-2xl font-bold text-slate-800 mt-1">{report.totalSoCount}</p>
                <span className="text-xs text-slate-400">
                  {Object.keys(report.soByAbi).join(', ') || '无 Native 库'}
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">64位合规库 / 不合规</span>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  <span className="text-emerald-600">{report.aligned64BitSoCount}</span>
                  <span className="text-slate-400 text-lg"> / </span>
                  <span className={report.unaligned64BitSoCount > 0 ? 'text-rose-600' : 'text-slate-400'}>
                    {report.unaligned64BitSoCount}
                  </span>
                </p>
                <span className="text-xs text-slate-400">arm64-v8a & x86_64</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">签名方案</span>
                  <span className="text-[10px] text-slate-400">Android v1~v3.2</span>
                </div>
                <p className="text-sm font-bold text-slate-800 mt-2 truncate" title={getSignatureSchemeNames(report.signatureInfo).join(' + ')}>
                  {getSignatureSchemeNames(report.signatureInfo).join(' + ') || '未检测到有效签名'}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                  <span>{report.signatureInfo.hasSigningBlock ? '包含签名块' : '无签名块'}</span>
                  <span title="v4 签名仅用于 ADB 增量调试的外置 .idsig 文件，普通分发安装以 v2/v3 块为准">ℹ️ v4为外置文件</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">加固与渠道</span>
                <p className="text-base font-bold text-slate-800 mt-2 truncate">
                  {report.hardeningFeatures.length > 0
                    ? report.hardeningFeatures[0].name
                    : '未加固 / 纯净包'}
                </p>
                <span className="text-xs text-blue-600 font-medium">
                  {report.signatureInfo.hasWalleChannel
                    ? `Walle: ${report.signatureInfo.channelName}`
                    : '无 Walle 渠道'}
                </span>
              </div>
            </div>

            {/* 加固告警提示框（若有） */}
            {report.hardeningFeatures.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <div className="font-bold text-sm mb-1">⚠️ 检测到应用已进行加固保护：</div>
                {report.hardeningFeatures.map((h, i) => (
                  <div key={i} className="mt-1">
                    • <strong>{h.name}</strong>: {h.description}（匹配到 {h.matchedFiles.length} 个特征文件）
                  </div>
                ))}
                <div className="mt-2 text-amber-800">
                  <strong>防坑提示</strong>：如果发现下方的 SO 出现 <code>FAIL_ZIP</code>（即 ELF 已支持 16KB 但 Zip 偏移未对齐），通常是由于加固工具重新打包或重签名时遗漏了 <code>zipalign -P 16</code> 参数导致！
                </div>
              </div>
            )}

            {/* SO 详细列表 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-sm">动态链接库 (.so) 对齐穿透明细</h3>
                <span className="text-xs text-slate-500">共 {report.soResults.length} 个文件</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="px-6 py-3">架构 (ABI)</th>
                      <th className="px-6 py-3">库名称</th>
                      <th className="px-6 py-3">ELF 段对齐 (p_align)</th>
                      <th className="px-6 py-3">ZIP 数据偏移 (Offset)</th>
                      <th className="px-6 py-3">对齐结论</th>
                      <th className="px-6 py-3">说明与修复指引</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.soResults.map((so, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-6 py-3.5 font-medium text-slate-700">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px]">
                            {so.abi}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 font-mono text-slate-800">{so.name}</td>
                        <td className="px-6 py-3.5">
                          {so.elfResult ? (
                            <span
                              className={`font-mono font-semibold ${
                                so.elfResult.is16KbCompatible ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {so.elfResult.minLoadAlignment} B (0x{so.elfResult.minLoadAlignment.toString(16)})
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {so.entry.dataOffset !== undefined ? (
                            <span
                              className={`font-mono ${
                                so.entry.is16KbAligned ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {so.entry.dataOffset} {so.entry.is16KbAligned ? '(16KB已对齐)' : '(未对齐)'}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {so.status === 'PASS' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              PASS
                            </span>
                          )}
                          {so.status === 'FAIL_ELF' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
                              ELF 未对齐
                            </span>
                          )}
                          {so.status === 'FAIL_RELRO' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-300">
                              RELRO 未对齐 (不兼容 16KB)
                            </span>
                          )}
                          {so.status === 'WARN_RELRO' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              RELRO 建议优化
                            </span>
                          )}
                          {so.status === 'FAIL_ZIP' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                              ZIP 偏移未对齐
                            </span>
                          )}
                          {so.status === 'FAIL_BOTH' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-200 text-rose-900">
                              双重未对齐
                            </span>
                          )}
                          {so.status === '32BIT_WARN' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                              32位(不强制)
                            </span>
                          )}
                          {so.status === 'COMPRESSED' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-800">
                              压缩存储
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-slate-500 max-w-xs">{so.statusReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 美团多渠道工坊 */}
        {activeTab === 'walle' && (
          <div className="mt-8 space-y-6">
            {!file || !report ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 text-sm shadow-sm">
                请先在上方拖入或选择需要打多渠道包的<strong>已签名母包</strong>。
              </div>
            ) : (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">美团 Walle 多渠道秒级打包工坊</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    原理：直接在 APK Signing Block 中插入自定义 ID-Value 渠道块，不破坏 v2/v3 签名，不改变原有 16KB 对齐。
                  </p>
                </div>

                {/* 签名状态核实 */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">当前母包: {file.name}</span>
                    <span className="font-mono text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
                    <span>
                      v1 签名: {report.signatureInfo.hasV1Scheme ? '✅ 存在' : '❌ 缺失'}
                    </span>
                    <span>
                      v2 签名: {report.signatureInfo.hasV2Scheme ? '✅ 存在' : '❌ 缺失'}
                    </span>
                    <span>
                      v3/v3.1/v3.2 签名:{' '}
                      {report.signatureInfo.hasV3Scheme ||
                      report.signatureInfo.hasV31Scheme ||
                      report.signatureInfo.hasV32Scheme
                        ? '✅ 存在'
                        : '❌ 缺失'}
                    </span>
                    <span>
                      母包 16KB 状态: {report.is16KbCompatible ? '✅ 合规' : '⚠️ 存在未对齐库'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    💡 说明：Walle 依赖 APK Signing Block (v2/v3/v3.1/v3.2) 进行免密无损切包。v4 签名是用于 ADB 增量调试的外置 .idsig 伴随文件，应用市场与常规分发安装无需此文件。
                  </p>
                </div>

                {/* 渠道输入 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    输入目标渠道列表 (每行一个):
                  </label>
                  <textarea
                    rows={5}
                    value={channelsInput}
                    onChange={(e) => setChannelsInput(e.target.value)}
                    placeholder="googleplay&#10;huawei&#10;xiaomi&#10;oppo&#10;vivo"
                    className="w-full text-xs font-mono p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setChannelsInput('googleplay\nhuawei\nxiaomi\noppo\nvivo\nhonor\ntencent')}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] text-slate-600 font-medium transition"
                    >
                      主流应用商店模板
                    </button>
                    <button
                      onClick={() => setChannelsInput('official\nofficial_beta\nweb')}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] text-slate-600 font-medium transition"
                    >
                      官方站内模板
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    disabled={generating}
                    onClick={handleBatchGenerate}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-200 transition"
                  >
                    {generating ? '正在极速生成渠道包...' : '⚡ 开始生成多渠道包 (本地瞬时完成)'}
                  </button>
                </div>

                {/* 生成结果下载列表 */}
                {generatedList.length > 0 && (
                  <div className="pt-4 border-t border-slate-200">
                    <h3 className="text-xs font-bold text-slate-700 mb-3">
                      成功生成 {generatedList.length} 个渠道包：
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {generatedList.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white transition"
                        >
                          <div>
                            <span className="text-xs font-bold text-slate-800">{item.channel}</span>
                            <p className="text-[11px] text-slate-500 font-mono truncate max-w-[200px]">
                              {item.filename}
                            </p>
                          </div>
                          <button
                            onClick={() => downloadBlob(item.blob, item.filename)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition"
                          >
                            ⬇️ 下载 APK
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
