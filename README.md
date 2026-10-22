# 空格听写 · Space Dictation

![空格听写](docs/images/poster-hero.png)

<p align="center">
  <strong>每按一次空格，只听一个新单词。</strong><br>
  面向纸上听写的本地桌面应用，支持 macOS 与 Windows。
</p>

<p align="center">
  <a href="https://github.com/zhang-jincheng/space-dictation/releases/latest">下载安装包</a>
  ·
  <a href="SPACE-DICTATION.md">使用说明</a>
  ·
  <a href="docs/SHOWCASE.md">功能与海报</a>
  ·
  <a href="NOTICE.md">来源与署名</a>
</p>

## 为什么做这个应用

很多背单词工具会自动推进、显示答案或把练习变成屏幕点击。“空格听写”把控制权留给使用者：准备纸笔，按一次空格听一个词，写完后再按空格进入下一个词。

- 第一次按 **Space** 才朗读第一个词。
- 此后每次按 **Space** 停止当前录音并进入下一个词。
- 按 **R** 重读当前词，不改变进度。
- 听写阶段隐藏英文、音标和中文释义。
- 完成后按原顺序核对，可点击单词再次播放录音。
- 错词可以单独重练，词序、位置和核对结果保存在本机。

![核心流程](docs/images/poster-features.png)

## 下载安装

前往 [Releases](https://github.com/zhang-jincheng/space-dictation/releases/latest) 下载当前版本。

| 系统 | 安装包 | 说明 |
| --- | --- | --- |
| macOS Apple 芯片 | `.dmg` | 拖入“应用程序”。当前为个人发布版本，首次打开如遇系统提示，请右键应用并选择“打开”。 |
| Windows x64 | `-setup.exe` | 运行安装程序。当前为个人发布版本，Windows 可能显示 SmartScreen 提示。 |

应用无需账号。词表、录音缓存、错词和练习记录均保存在本机。

![跨平台安装](docs/images/poster-platforms.png)

## 主要功能

- **个人词表**：粘贴单词，或导入 UTF-8 TXT / CSV；导入前预览并处理空行、重复项。
- **内置词库**：大学英语四级、六级和雅思。
- **自由选词**：每轮可选择数量、顺序或乱序、英式或美式录音及播放速度。
- **标准录音提前缓存**：开始听写前下载，优先尝试 Google Dictionary 与有道词典，缺少时尝试 Wikimedia Commons。
- **离线听写**：录音下载完成后，听写推进、核对和错词重练不需要联网。
- **随时切换词书**：听写台和词表页面均可直接选择本轮使用的词书。
- **ChatGPT 整理提示词**：一键复制应用内提示词，让 ChatGPT 生成符合导入格式的 CSV。
- **本地备份**：导出与恢复个人词表、错词和练习记录。
- **安全恢复**：关闭再打开后保留固定词序和当前位置，恢复时不会自动播放。

## 录音与网络说明

应用不在源码或安装包中捆绑在线词典录音。首次使用某个单词和口音时，应用会在开始听写前下载录音并保存到本地；下载后的文件会先经过音频解码检查。

Wikimedia Commons 文件保留其作者、来源页与开放许可证元数据。Google Dictionary 与有道词典录音仅按各服务条款供个人学习使用，应用会显示实际来源；录音覆盖范围和质量由第三方来源决定。

## 导入格式

CSV：

```csv
word,translation
apple,苹果
a lot of,许多
```

TXT 可每行写一个单词或短语。应用内“我的词表”页面还提供可一键复制的完整提示词和本地词表收件箱。

## 本地开发

环境要求：

- Node.js 18+
- Rust 1.77.2+
- 对应平台的 [Tauri v2 系统依赖](https://v2.tauri.app/start/prerequisites/)

```bash
npm install
npm run build
npm run lint
npm test
npx tauri dev
```

生产构建：

```bash
# macOS
npx tauri build --bundles dmg

# Windows
npx tauri build --bundles nsis
```

Windows Release 由 [GitHub Actions](.github/workflows/release-windows.yml) 在 Windows 构建机上生成。

## 技术实现

- React 19 + TypeScript + Vite
- Tauri v2 + Rust
- SQLite 本地存储
- Rodio 跨平台本地音频解码与播放
- 可取消的录音预下载与缓存
- AGPL-3.0

## 项目来源与许可证

本项目基于 [MintWord / 薄荷词汇](https://github.com/Yunease/MintWord) 修改，基准提交为 `16ef1b18a030bcd00954bc5414b01cc3c969e3f1`。原项目署名和许可证信息保留在 [NOTICE.md](NOTICE.md)。

程序源码以 [GNU AGPL-3.0](LICENSE) 发布。内置英语词库来自 [ECDICT](https://github.com/skywind3000/ECDICT)，其 MIT 许可证见 [ECDICT-LICENSE.txt](ECDICT-LICENSE.txt)。
