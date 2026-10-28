# 桌面端 v1.8.7

这是 Windows 发布包 `resources/app` 的脱敏源码，不包含 Electron 运行时、用户数据、登录态或打包产物。

## 启动

```powershell
$env:RB_APP_URL = "http://127.0.0.1:8080/index.html"
npm install
npm start
```

建议先在 `apps/web` 启动静态服务器，再启动桌面端。

## 环境变量

| 变量 | 作用 |
|---|---|
| `RB_APP_URL` | 必填于实际部署。桌面主界面地址 |
| `RB_INTERNAL_HOST` | 允许在内置窗口打开的可信域名 |
| `RB_INTERNAL_HOME` | 内部系统首页 |
| `RB_LOGIN_URL` | 可选登录页 |
| `RB_SESSION_COOKIE` | 可选会话 Cookie 名称 |
| `RB_VERSION_URL` | 可选版本 JSON 地址 |
| `RB_UPDATE_ZIP_URL` | 可选自动更新 ZIP 地址 |
| `RB_DOWNLOAD_URL` | 可选下载中心地址 |
| `ACCIO_EXE` | 可选 Accio 可执行文件路径 |

## 安全边界

预加载桥允许网页请求桌面操作、文件读取、打印、设备探测和平台消息能力。只把 `RB_APP_URL` 指向你控制且经过审计的页面，并为所有后端接口单独做鉴权与授权。开源仓库不提供任何生产凭据。

飞书/Lark 功能按需读取本机 `lark-cli` 配置，并把用户令牌写入 Electron 的本地安全存储。请在测试账号上先验收权限范围。
