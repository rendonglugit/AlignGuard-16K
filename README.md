<div align="center">

# 🛡️ AlignGuard 16K

**Ultra-fast, 100% Client-Side 16KB Page Size Alignment Inspector & Meituan Walle Multi-Channel Workshop for Android**

[English](README.md) | [简体中文](README_zh.md)

[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue?style=flat-square&logo=github)](https://rendonglugit.github.io/AlignGuard-16K/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-AlignGuard--16K-181717?style=flat-square&logo=github)](https://github.com/rendonglugit/AlignGuard-16K)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20Local%20(0--Upload)-brightgreen?style=flat-square&logo=shield)](https://github.com/rendonglugit/AlignGuard-16K)
[![Android 15 Ready](https://img.shields.io/badge/Android%2015-16KB%20Page%20Ready-orange?style=flat-square&logo=android)](https://developer.android.com/guide/practices/page-sizes)
[![Meituan Walle](https://img.shields.io/badge/Channel-Meituan%20Walle%20Supported-yellow?style=flat-square)](https://github.com/Meituan-Dianping/walle)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

[Live Demo](#-live-demo) · [Key Features](#-key-features) · [Release Pipeline Guide](#-release-pipeline--best-practices) · [1-Minute Deployment](#-1-minute-deployment-to-github-pages)

</div>

---

## 💡 Why AlignGuard 16K?

Starting with Android 15, the underlying Linux kernel brings official support for **16 KB memory page sizes**. All Android apps containing Native libraries (`.so`) **MUST** ensure both ELF segments and ZIP archive entries are strictly aligned to 16 KB boundaries. Failure to comply will lead to **installation failures (`INSTALL_FAILED_INVALID_APK`)** or immediate runtime crashes on next-generation devices.

However, real-world release pipelines frequently run into critical pitfalls:
1. **Reinforcement / Obfuscation Breakage**: Apps compiled with 16KB flags often lose their alignment after passing through 3rd-party hardening tools (Legu, NetEase Dun, Ijiami, Bangcle) because the re-packaging/re-signing step **missed the `zipalign -P 16` parameter**.
2. **High Tooling Barrier**: Official scripts like Google's `check_elf_alignment.sh` require local Linux/Mac Shell, Python, and an Android NDK environment configured with `llvm-readelf`, making it inaccessible for QA testers, Windows developers, and release managers.
3. **Data Security & Privacy Concerns**: Enterprise APK/AAB files are confidential assets. Uploading unreleased packages to arbitrary 3rd-party cloud scanners poses serious leakage and intellectual property risks.

👉 **AlignGuard 16K solves this completely**: **Zero server overhead, zero uploads, runs 100% in your local browser, delivering instant diagnostics and multi-channel packing in seconds!**

---

## ✨ Key Features

### 1. 🔍 Dual-Layer 16KB Alignment Verification
- **ELF Segment Alignment (`p_align >= 16384`)**: Parses ELF Program Headers (`PT_LOAD`) in milliseconds to pinpoint exactly which 3rd-party SDK or native C/C++ library was compiled without 16KB support.
- **ZIP File Data Offset (`Offset % 16384 === 0`)**: Inspects uncompressed (Stored) `.so` file data absolute offsets in the ZIP archive to detect broken alignment introduced by post-processing tools.

### 2. ⚡ Lightning-Fast Chunked Streaming (Even for 1GB+ Packages)
- Built on modern HTML5 `File.slice()` API. It **never extracts the entire archive into memory**, only streaming the end-of-file ZIP directory (EOCD/Central Directory) and the first 4~8 KB headers of each `.so`.
- Peak memory usage < 20MB. **Generates full diagnostic reports in 1~2 seconds**.

### 3. 🛡️ 3rd-Party Hardening / Packer Fingerprint Detection
- Automatically identifies signatures from major security packers: **Tencent Legu / Yusecure, NetEase Dun, Bangcle, Ijiami, 360 Jiagu, NAGA, Baidu Protect, Alibaba Security**.
- Alerts teams when hardening tools break alignment or inject unaligned stub libraries.

### 4. 🚀 Meituan Walle Multi-Channel Rapid Packing
- Directly parses the **APK Signing Block** of already hardened and signed packages.
- Injects custom Walle channel blocks (ID `0x71777777`) entirely in memory. **Spits out dozens of ready-to-distribute channel APKs in seconds without tampering with signatures or 16KB alignments!**

### 5. 🔒 100% Client-Side Privacy Protection
- All computations take place inside the browser’s JavaScript engine. **Zero network packets leave your computer**, fully satisfying enterprise confidential security requirements.

---

## 📐 Release Pipeline & Best Practices

Channel loss or broken alignment typically happens due to an incorrect stage order. Follow this standard sequence:

```
                 ┌──────────────────────────┐
                 │  1. Build Base Package   │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │  2. Security Hardening   │ (Hardening invalidates original signatures)
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │  3. Re-align & Re-sign   │
                 │  zipalign -P 16          │ (★ Critical: Must include -P 16)
                 │  apksigner sign (v2/v3)  │
                 └─────────────┬────────────┘
                               │
                               ▼
      ★ AlignGuard 16K   ┌──────────────────────────┐
      One-Stop Handover  │  4. Meituan Walle Inject │ (In-memory channel injection without re-signing)
                         └─────────────┬────────────┘
                               │
                               ▼
                         ┌──────────────────────────┐
                         │  5. 16KB & Sign Audit    │
                         └──────────────────────────┘
```

---

## 🚀 1-Minute Deployment to GitHub Pages

AlignGuard 16K is a static, zero-build web application:

### Option A: Push to GitHub & Enable Pages (Recommended)
1. Create a new GitHub repository (e.g., `AlignGuard-16K`).
2. Push this folder to your repository:
   ```bash
   git init
   git add .
   git commit -m "feat: init AlignGuard 16K"
   git remote add origin https://github.com/rendonglugit/AlignGuard-16K.git
   git push -u origin main
   ```
3. Go to **Settings** -> **Pages** in your repository:
   - Under **Build and deployment** -> **Source**, select `Deploy from a branch`.
   - Choose branch `main` and folder `/ (root)`, then click **Save**.
4. Within seconds, your team's private inspection tool is live at `https://rendonglugit.github.io/AlignGuard-16K/`!

### Option B: Double-Click Local Execution (Offline Ready)
Simply double-click [`index.html`](./index.html) in any browser (Chrome / Safari / Edge). No local HTTP server or Node.js runtime required!

---

## 📊 Sample Diagnostic Report

```markdown
# Android 16KB & Channel Compliance Inspection Report
- **File Name**: app-release-signed.apk
- **File Size**: 85.34 MB
- **Overall Status**: ✅ Compliant (PASS)
- **16KB Compatibility**: Supported
- **64-bit SO Compliance Rate**: 18 / 18
- **Signature Schemes**: v1 (JAR), v2, v3, v3.1, v3.2 (PQC)
- **Current Channel**: None
- **Hardening Signature**: Tencent Legu / Yusecure

## Detailed 64-bit Shared Libraries
| Architecture | Library Name | ELF Alignment | ZIP Data Offset | Conclusion |
| :--- | :--- | :--- | :--- | :--- |
| arm64-v8a | libshex.so | 16384 B | 1048576 (16KB Aligned) | PASS |
| arm64-v8a | libvoice_engine.so | 65536 B | 2097152 (16KB Aligned) | PASS |
| arm64-v8a | libflutter.so | 16384 B | 4194304 (16KB Aligned) | PASS |
```

---

## 🔐 Android Signature Scheme Overview (v1 ~ v4 / v3.2) & Walle Compatibility

| Scheme | Introduced | Location | Verification Mechanism | Walle Compatibility |
| :--- | :--- | :--- | :--- | :--- |
| **v1 (JAR)** | Android 1.0+ (API 1) | Inside `META-INF/` | Individual file hash; does not protect ZIP metadata | ⚠️ Unsupported (Walle relies on APK Signing Block) |
| **v2** | Android 7.0+ (API 24) | **APK Signing Block** (`0x7109871a`) | Monolithic hash; verifier explicitly ignores unknown custom ID blocks | ✅ **100% Compatible** |
| **v3** | Android 9.0+ (API 28) | **APK Signing Block** (`0xf346146d`) | Same mechanism as v2 + Key Rotation support | ✅ **100% Compatible** |
| **v3.1** | Android 13+ (API 33) | **APK Signing Block** (`0x1b93ad61`) | Targeted SDK rotation slots | ✅ **100% Compatible** |
| **v3.2** | **Android 17+ (API 37)** | **APK Signing Block** (`0x70e1c89f`) | **Post-Quantum Cryptography (PQC) Hybrid Signing** (Classical + PQC) | ✅ **100% Compatible** |
| **v4** | Android 11+ (API 30) | **External Sidecar** (`*.apk.idsig`) | Merkle tree hashing for `adb install --incremental` | ➖ Not required for standard app store or sideload installs |

---

## 🤝 References & Acknowledgements

- [Google Android 16 KB Page Sizes Guide](https://developer.android.com/guide/practices/page-sizes)
- [Meituan Walle Multi-Channel Packaging Scheme](https://github.com/Meituan-Dianping/walle)
- [Android APK Signature Scheme v2 Specification](https://source.android.com/docs/security/features/apksigning/v2)
- [Android APK Signature Scheme v3 Specification](https://source.android.com/docs/security/features/apksigning/v3)
- [Android APK Signature Scheme v3.2 (PQC Hybrid) Specification](https://source.android.com/docs/security/features/apksigning/v3-2)

---

<div align="center">
Made with ❤️ for Android Developers & QA Engineers worldwide.
</div>
