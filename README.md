# Suno 单曲下载

在桌面版 Chrome 或 Edge（116 及以上）中打开 Suno，点击歌名旁的「↓ 下载」即可在当前页面保存这首歌。工具栏图标仍支持粘贴歌曲 ID、`https://suno.com/song/…` 链接或 `https://suno.com/s/…` 分享短链。

## 安装

1. 从 [GitHub 发布页](https://github.com/MizukiShigure/suno-song-downloader/releases/latest) 下载最新版安装包，把 ZIP 解压到准备长期保留的位置。
2. 在 Chrome 地址栏输入 `chrome://extensions`，或在 Edge 输入 `edge://extensions`，打开「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择直接包含 `manifest.json` 的 `suno-downloader` 文件夹。
4. 在工具栏的扩展菜单里找到「Suno 单曲下载」，需要时可将它固定。

更新同一目录里的扩展文件后，在扩展管理页找到「Suno 单曲下载」，点击卡片上的重新加载按钮 ↻，然后刷新或重新打开 Suno 标签页。

## 保存歌曲

1. 在 Suno 歌曲列表找到要保存的版本，点歌名旁的「↓ 下载」。在单曲详情页，按钮位于标题旁。
2. 小面板会显示歌名。点 M4A、MP3 或 WAV，选择保存位置。下载和转码在后台进行。
3. 想用分享链接时，点击工具栏的扩展图标，粘贴链接后点「解析歌曲」，再选格式保存。

| 格式 | 文件内容 |
| --- | --- |
| M4A | 解析服务提供的原始文件，直接保存，无二次编码。 |
| MP3 | 本机编码，44.1 kHz、192 kbps；适合日常播放。 |
| WAV | 本机从 M4A 解码，44.1 kHz、16 位 PCM；适合导入剪辑软件。音质受原始 M4A 限制。 |

## 解析服务

在页内面板选择下载格式，或在独立扩展页点击「解析歌曲」后，扩展将选中歌曲的 ID 发送给 [ai-suno.com](https://ai-suno.com/)。分享短链会先交给 Suno 展开。音频来自服务返回的媒体地址。解析及音频请求均不附带账号 Cookie。MP3 和 WAV 在本机生成。

扩展处理单曲。遇到失效链接、缺少音频或限流时，页面会显示原因。解析和音频下载依赖第三方服务可用；如果服务更换媒体域名，需要更新扩展。

## 第三方组件

MP3 编码使用独立文件 `vendor/lame.js`，来自 lamejs 1.2.1 的未修改浏览器构建。许可说明随附于 `vendor/`。[lamejs 源码](https://github.com/zhuker/lamejs) · [1.2.1 发布源包](https://registry.npmjs.org/lamejs/-/lamejs-1.2.1.tgz) · [LAME 项目](https://lame.sourceforge.net/)
