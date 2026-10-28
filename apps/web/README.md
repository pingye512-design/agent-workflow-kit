# 网页端

这是 2026-10-28 线上界面的脱敏快照。界面与交互保留，生产域名、员工身份、固定推送对象、内部页面入口和公司知识均已移除。

## 启动

用任意静态服务器托管当前目录，例如：

```bash
npx serve .
```

打开 `index.html`。直接双击文件也能看到界面，但浏览器会限制部分网络请求与 PWA 能力。

## 配置

编辑 `config.js`：

- `apiBase`：助手后端，需提供 `/chat`、`/task`、`/roles`、`/health` 等接口。
- `inboxBase`：消息盒子后端。
- `links`：ERP、价格表、会议、排班等侧边栏入口。
- `bindUrl`、`voiceScript`、`videoUrl`：可选平台绑定、语音和视频能力。
- `downloadUrl`、`versionUrl`：可选桌面下载和版本提示。

未配置的企业能力会保持关闭，不会回连原生产系统。
