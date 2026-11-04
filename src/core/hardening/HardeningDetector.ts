export interface HardeningFeature {
  vendor: string;
  name: string;
  description: string;
  matchedFiles: string[];
}

export class HardeningDetector {
  private static readonly RULES = [
    {
      vendor: 'Tencent',
      name: '腾讯乐固 / 腾讯御安全',
      description: '检测到腾讯加固特征库 (libshex / libshell / libtx_x)',
      patterns: [/lib\/.*\/libshex.*\.so$/, /lib\/.*\/libshell.*\.so$/, /lib\/.*\/libtx_x.*\.so$/],
    },
    {
      vendor: 'Bangcle',
      name: '梆梆安全',
      description: '检测到梆梆加固特征 (libSecShell / libsecexe)',
      patterns: [/lib\/.*\/libSecShell.*\.so$/, /lib\/.*\/libsecexe\.so$/, /assets\/secData.*\.jar$/],
    },
    {
      vendor: 'Ijiami',
      name: '爱加密',
      description: '检测到爱加密特征库 (libexec / ijiami.dat)',
      patterns: [/lib\/.*\/libexec.*\.so$/, /assets\/ijiami\.dat$/],
    },
    {
      vendor: 'NetEase',
      name: '网易易盾',
      description: '检测到网易易盾加固库 (libnesec)',
      patterns: [/lib\/.*\/libnesec.*\.so$/],
    },
    {
      vendor: 'Qihoo360',
      name: '360加固保',
      description: '检测到 360 加固特征 (libjiagu / libprotectClass)',
      patterns: [/lib\/.*\/libjiagu.*\.so$/, /lib\/.*\/libprotectClass.*\.so$/],
    },
    {
      vendor: 'Naga',
      name: '娜迦加固 (NAGA)',
      description: '检测到娜迦加固特征 (libchaosvmp / libddog)',
      patterns: [/lib\/.*\/libchaosvmp\.so$/, /lib\/.*\/libddog\.so$/],
    },
    {
      vendor: 'Baidu',
      name: '百度加固',
      description: '检测到百度加固特征 (libbaiduprotect)',
      patterns: [/lib\/.*\/libbaiduprotect.*\.so$/],
    },
    {
      vendor: 'Aliyun',
      name: '阿里聚安全',
      description: '检测到阿里加固特征 (libsgmain / libmobisec)',
      patterns: [/lib\/.*\/libsgmain.*\.so$/, /lib\/.*\/libmobisec.*\.so$/],
    },
  ];

  static detect(fileList: string[]): HardeningFeature[] {
    const results: HardeningFeature[] = [];

    for (const rule of this.RULES) {
      const matched = fileList.filter((filePath) =>
        rule.patterns.some((pattern) => pattern.test(filePath))
      );

      if (matched.length > 0) {
        results.push({
          vendor: rule.vendor,
          name: rule.name,
          description: rule.description,
          matchedFiles: matched,
        });
      }
    }

    return results;
  }
}
