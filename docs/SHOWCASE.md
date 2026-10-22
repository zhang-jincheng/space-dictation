# 展示与功能说明

## 主视觉

![空格听写主视觉](images/poster-hero.png)

“空格听写”的核心动作只有一个：使用者写完当前答案后，主动按下空格进入下一个词。主视觉用亮起的空格键、纸质笔记本和音频波形表达这个流程。

## 完整听写流程

![功能流程](images/poster-features.png)

1. 在听写台选择个人词表、四级、六级或雅思，并设置本轮数量。
2. 应用提前下载本轮标准录音；已缓存的录音可以离线使用。
3. 按 Space 逐词推进，按 R 重读当前词。
4. 最后一个词结束后进入核对页，可点击英文再次播放录音。
5. 手动标记正确或错误，错词可单独开始新一轮听写。

## macOS 与 Windows

![跨平台版本](images/poster-platforms.png)

macOS 与 Windows 使用同一套 React 界面、SQLite 数据结构和 Rodio 本地音频播放器。平台安装包均从同一版本源码构建；Windows 安装包由 GitHub Actions 在 Windows 环境中生成。

