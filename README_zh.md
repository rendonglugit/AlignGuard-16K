<div align="center">

# 🛡️ AlignGuard 16K

**专为 Android 15+ 打造的零上传、纯前端 16KB 页面对齐体检与美团 Walle 多渠道发版工坊**

[English](README.md) | [简体中文](README_zh.md)

[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue?style=flat-square&logo=github)](https://rendonglugit.github.io/AlignGuard-16K/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-AlignGuard--16K-181717?style=flat-square&logo=github)](https://github.com/rendonglugit/AlignGuard-16K)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20Local%20(0--Upload)-brightgreen?style=flat-square&logo=shield)](https://github.com/rendonglugit/AlignGuard-16K)
[![Android 15 Ready](https://img.shields.io/badge/Android%2015-16KB%20Page%20Ready-orange?style=flat-square&logo=android)](https://developer.android.com/guide/practices/page-sizes)
[![Meituan Walle](https://img.shields.io/badge/Channel-Meituan%20Walle%20Supported-yellow?style=flat-square)](https://github.com/Meituan-Dianping/walle)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

</div>

---

## 💡 为什么需要 AlignGuard 16K？

Android 15 全面引入了 **16 KB 内存页面大小（16 KB Page Size）**。如果应用内的 Native 库（`.so`）未做 16KB 对齐，在下一代设备上将面临**安装失败（`INSTALL_FAILED_INVALID_APK`）**或**启动直接崩溃**。

然而在实际发版流水线中，开发者面临诸多隐形地雷：
1. **加固重打包翻车**：源码虽然配置了 16KB 对齐，但经过第三方加固（乐固、易盾、爱加密等）重打包重签名时，**遗漏了 `zipalign -P 16` 参数**，导致出厂包在 16KB 设备上直接阵亡。
2. **官方工具门槛高**：Google 官方脚本 `check_elf_alignment.sh` 依赖本地完整的 Linux/Mac Shell、Python 环境与 Android NDK，非 Native 开发者、测试（QA）与运营发版同学很难开箱使用。
3. **商业核心资产不敢上传**：待发版 APK/AAB 属于企业机密资产，绝大多数团队严禁将安装包上传至任何不受控的第三方检测网站。

👉 **AlignGuard 16K 应运而生**：**无需后端、零数据上传、打开网页即可完成全方位体检与多渠道打包！**

---

## ✨ 核心特性矩阵

### 1. 🔍 双重 16KB 深度穿透检测
- **ELF 内部段对齐（p_align >= 16384）**：秒级遍历 ELF Program Header 的 `PT_LOAD` 段，精准查出是哪个底层三方 SDK 或自研 C/C++ 库未按 16KB 编译链接。
- **ZIP 归档绝对偏移（Offset % 16384 === 0）**：专治加固与重签名导致的文件数据偏移错位。

### 2. ⚡ 毫秒级分块流式读取（即使是 1GB 超大包！）
- 采用 HTML5 File API 按需切片技术，**不解压整包，仅读取文件尾部 64KB 索引及 `.so` 头部前 4~8 KB 数据**。
- 内存消耗不超过 20MB，**1~2 秒内瞬间出具完整体检报告**。

### 3. 🛡️ 主流加固厂商壳指纹排查
- 自动扫描并识别**腾讯乐固/御安全、网易易盾、梆梆安全、爱加密、360加固保、娜迦(NAGA)、百度加固、阿里聚安全**等加固指纹。
- 精准诊断加固前后引入的对齐破坏问题。

### 4. 🚀 美团 Walle 多渠道秒级切包工坊
- 针对已加固且已完成重签名的母包，直接在浏览器端解析 **APK Signing Block**。
- 纯内存极速注入 Walle 渠道块（ID: `0x71777777`），**1 秒切出数十个渠道包并一键下载**，绝不破坏原有 v2/v3 签名与 16KB 对齐！

### 5. 🔒 100% 本地浏览器运行（零泄密隐患）
- 所有运算完全在客户端 JavaScript 引擎中执行，**无任何网络数据包外传**，彻底满足最严苛的企业级代码与密钥保密合规要求。

---

## 📐 加固与多渠道避坑黄金时序

很多团队发版时渠道信息丢失或对齐损坏，根本原因在于流程时序错误。请遵循如下标准流水线：

```
                 ┌──────────────────────────┐
                 │  1. 源码编译基础母包     │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │  2. 第三方加固加壳       │ (加固会彻底破坏原签名)
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │  3. 重新对齐与重签名     │
                 │  zipalign -P 16          │ (★ 关键：必须带 -P 16)
                 │  apksigner sign (v2/v3)  │
                 └─────────────┬────────────┘
                               │
                               ▼
      ★ AlignGuard 16K   ┌──────────────────────────┐
      一站式接管环节     │  4. 美团 Walle 注入渠道  │ (纯内存秒级切包，不破坏签名)
                         └─────────────┬────────────┘
                               │
                               ▼
                         ┌──────────────────────────┐
                         │  5. 16KB & 签名出厂复检  │
                         └──────────────────────────┘
```

---

## 🚀 1 分钟部署到 GitHub Pages

AlignGuard 16K 是纯静态架构，开箱即用，无需配置复杂的构建服务器：

### 选项 A：推送至独立 GitHub 仓库开启 Pages（推荐）
1. 在 GitHub 上新建一个仓库，如 `AlignGuard-16K`。
2. 将本目录推送到仓库：
   ```bash
   git init
   git add .
   git commit -m "feat: init AlignGuard 16K"
   git remote add origin https://github.com/rendonglugit/AlignGuard-16K.git
   git push -u origin main
   ```
3. 在 GitHub 仓库页点击 **Settings** -> **Pages**：
   - **Source** 选择 `Deploy from a branch`。
   - 分支选择 `main`，目录选择 `/ (root)`，点击 **Save**。
4. 稍等十几秒，即可通过 `https://rendonglugit.github.io/AlignGuard-16K/` 访问团队专属工具站！

### 选项 B：本地双击即用（无需联网）
直接用浏览器双击打开项目根目录下的 [`index.html`](./index.html)，即可在任意离线 Mac/Windows/Linux 设备上运行！

---

## 📊 体检报告样例

```markdown
# Android 16KB & 渠道合规体检报告
- **文件名**: app-release-signed.apk
- **文件大小**: 85.34 MB
- **综合体检结论**: ✅ 合规通过 (PASS)
- **16KB 兼容状态**: 兼容
- **64位 SO 对齐率**: 18 / 18
- **签名版本**: v1 (JAR), v2, v3, v3.1, v3.2 (PQC)
- **已有渠道**: 无
- **加固特征**: 腾讯乐固 / 御安全

## 详细 64 位 SO 列表
| 架构 | 动态库 | ELF 对齐 | Zip 偏移对齐 | 结论 |
| :--- | :--- | :--- | :--- | :--- |
| arm64-v8a | libshex.so | 16384 B | 1048576 (16KB已对齐) | PASS |
| arm64-v8a | libvoice_engine.so | 65536 B | 2097152 (16KB已对齐) | PASS |
| arm64-v8a | libflutter.so | 16384 B | 4194304 (16KB已对齐) | PASS |
```

---

## 🔐 Android 签名方案全景与美团 Walle 兼容原理解密

许多开发者常有疑问：*“Android 签名方案有 v1、v2、v3、v3.1、v3.2 甚至 v4，为什么美团 Walle 只在 APK 内部注入渠道？是否支持 v4？”*

| 签名方案 | 引入版本 | 物理存储位置 | 校验机制与核心使命 | Walle 渠道兼容性 |
| :--- | :--- | :--- | :--- | :--- |
| **v1 (JAR)** | Android 1.0+ (API 1) | `META-INF/` 目录 | 逐文件校验哈希，不保护 ZIP 元数据与偏移 | ⚠️ 不支持（Walle 依赖 APK 签名块） |
| **v2** | Android 7.0+ (API 24) | **APK Signing Block** (`0x7109871a`) | 整包块哈希，验签时**显式忽略**未知的自定义 ID-Value 块 | ✅ **100% 兼容** |
| **v3** | Android 9.0+ (API 28) | **APK Signing Block** (`0xf346146d`) | 机制同 v2，新增密钥轮换（Key Rotation）支持 | ✅ **100% 兼容** |
| **v3.1** | Android 13+ (API 33) | **APK Signing Block** (`0x1b93ad61`) | 针对不同 targetSdk 的密钥轮换槽位支持 | ✅ **100% 兼容** |
| **v3.2** | **Android 17+ (API 37)** | **APK Signing Block** (`0x70e1c89f`) | **后量子密码学 (PQC) 混合双重签名** (经典+抗量子) | ✅ **100% 兼容** |
| **v4** | Android 11+ (API 30) | **外置文件** (`*.apk.idsig`) | 用于 ADB 增量调试 (`adb install --incremental`) 与流式安装 | ➖ **常规分发安装无需此文件** |

### 关键原理解析：
1. **Walle 的免重签名基石**：  
   Android 规范规定，APK 校验 v2/v3/v3.1/v3.2 时，系统只读取自身对应的 Signature Scheme Block，并对除签名块之外的 ZIP 数据计算散列。**对签名块内部第三方插入的额外 ID（如 Walle 的 `0x71777777` 渠道块），系统验签引擎一律直接忽略跳过**。因此注入渠道绝不会导致签名失效。
2. **为什么渠道包不需要也不可能带 v4？**  
   - v4 签名是**完全独立的外置伴随文件**（`app.apk.idsig`），基于 APK 整体字节构建 Merkle Tree。修改任何字节若无私钥重签，`.idsig` 必然不匹配。
   - 但在**实际业务分发场景**（各大手机厂商应用市场、官网直接下载安装、社交软件下载等），Android 系统的 PackageInstaller 安装器只认 APK 内部的 v2/v3/v3.1 签名，**根本不要求也不读取 `.idsig` 文件**，因此绝不影响用户正常安装使用。

---

## 🤝 鸣谢与参考

- [Google Android 16 KB Page Sizes 指南](https://developer.android.com/guide/practices/page-sizes)
- [Meituan Walle (瓦力) 多渠道打包方案](https://github.com/Meituan-Dianping/walle)
- [Android APK Signature Scheme v2 官方规范](https://source.android.com/docs/security/features/apksigning/v2)
- [Android APK Signature Scheme v3 官方规范](https://source.android.com/docs/security/features/apksigning/v3)
- [Android APK Signature Scheme v3.2 (PQC 混合签名) 官方规范](https://source.android.com/docs/security/features/apksigning/v3-2)

---

<div align="center">
Made with ❤️ for Android Developers & QA Engineers worldwide.
</div>
