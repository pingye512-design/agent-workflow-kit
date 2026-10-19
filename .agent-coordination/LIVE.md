# 现场快照 · LIVE

> 本文件由 `scripts/live.sh` 自动生成，**不要手改**（手改会在下次刷新时被覆盖）。
> 生成时间：**2026-10-19 10:57:23** ｜ 刷新：`bash scripts/live.sh`

---

## 1. 任务板（谁在干什么）

共 2 张卡：blocked 1 / doing 1

### 正在做（接这个，别另起炉灶）

T-20261019-01    cli-agent  doing    把每日汇总从本机定时任务搬到服务器，本机关机也能发
    占用：scripts/patrol.sh, config.sh
    下一步：在服务器执行 systemctl enable --now patrol.timer，然后连续观察两个周期

### 卡住的（等人或外部条件）

T-20261019-02    assistant  blocked  登录失败时给出可读原因，而不是只弹『操作失败』
    占用：web/login.js
    下一步：需要产品确认：是否允许区分『密码错误』与『账号不存在』（有撞库风险）

## 2. 写锁

🔓 空闲
最近完成：2026-10-19T09:44+08 ｜ 每日汇总迁移（示例） ｜ 退出码 0，重跑一次结果一致（幂等）

## 3. 仓库

- 分支：`非 git 目录`
- 工作区：干净
- 最近提交：

## 4. 健康检查

- 未配置 `HEALTH_URL`，跳过接口检查
- 磁盘：79% 已用，可用 52G

## 5. 接手提醒

- 动服务器前先 `bash scripts/lock.sh acquire "<操作名>" 30`
- 改完跑 `bash scripts/doctor.sh`，把输出贴进卡片 note
