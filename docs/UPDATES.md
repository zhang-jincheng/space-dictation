# 应用内自动更新

启动时后台读取 GitHub 最新正式 Release 的 `latest.json`。Mac 从 Dock 重新打开窗口时也检查。只有更高的正式版本且存在匹配系统与处理器的签名更新包才弹窗。无新版本、网络错误、清单缺失或缺少对应平台均不提示。

左侧暗色“暂不更新”关闭提示；右侧亮黄色“立即更新”在等待词表保存后，下载、验证签名、自动安装并重新打开应用。界面显示下载和安装进度，不打开 DMG、不出现拖拽替换页或安装向导。损坏或签名不正确的包会被拒绝，允许重试。

- Mac 使用签名的 `.app.tar.gz` 原位更新应用，通过 LaunchServices 重新打开窗口。
- Windows 使用签名的 NSIS 更新包，`quiet` 静默安装并自动重新打开。首次安装使用 `currentUser`，避免每次更新要求管理员权限。
- 安装在系统保护目录等特殊情况下，操作系统仍可能要求授权，程序不能绕过。
- 不修改应用标识、数据目录或词表数据。

## 发布

`bundle.createUpdaterArtifacts` 开启。应用中只包含更新公钥；签名私钥保存在本地受限目录和 GitHub Actions Secret `TAURI_SIGNING_PRIVATE_KEY`，不得提交到 Git。更新签名独立于 Apple 公证及 Windows 代码签名。

发布前同步提高 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 的版本号。工作流先在草稿 Release 构建 Mac Apple Silicon、Windows x64 的安装包、签名和合并的 `latest.json`，两种平台全部成功后才发布。

清单平台键使用 `darwin-aarch64`、`windows-x86_64`；未来提供其他架构时增加对应构建。清单的 URL 指向 GitHub 对应版本的真实文件，signature 使用 `.sig` 文件内容。不要用手动安装的 DMG 作为自动更新包。

本地构建需要设置 `TAURI_SIGNING_PRIVATE_KEY` 为私钥文件路径及空的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。不要把私钥内容放入命令、日志或文档。

运行更新单元测试：`cargo test --lib updates::tests --manifest-path src-tauri/Cargo.toml`。完整 Mac 安装测试使用独立应用标识、本机测试服务器及独立词表，覆盖坏签名拒绝、正确签名安装、重新打开与数据保留。测试专用配置允许回环 HTTP；正式配置仅用 HTTPS 并验证证书。
