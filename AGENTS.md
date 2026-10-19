# AGENTS.md —— 多 Agent 协作共享契约

> 这份文件是本仓库里**所有 AI 工具共同遵守的规则**。
> Claude Code / Codex CLI / 其他 CLI Agent 会自动读取工作目录及父目录下的 `AGENTS.md`；请勿在别的文件里另立一套。
> 改代码前先看这里。最后更新：2026-10-19

---

## 0.0 开工第一件事：恢复现场（不许问用户背景）

```bash
bash scripts/live.sh
```

它会自动生成 `.agent-coordination/LIVE.md`：谁在干什么、写锁在谁手上、git 状态、线上健康、最近交接。
然后按顺序读：`LIVE.md` → `AGENTS.md` → `docs/`。

**为什么必须自动生成**：手写交接单，写的时候是对的，三小时后就骗人。`live.sh` 每次重算，永远是当前真相。

**收到需求先建卡**（防止两个 AI 抢同一个文件）：

```bash
bash scripts/newtask.sh "需求一句话" --files <会改的文件...>
```

**做完收尾三件套**：

```bash
# 1) 更新卡片：status=done + note
# 2) 生成交接摘要
bash scripts/handoff.sh
# 3) 提交（不提交 = 换机 / 另一个 AI 都看不到）
git add -A && git commit -m "type(scope): 做了什么"
```

用户只需要发一句需求。以下一律不要问 —— 仓库里都有：

| 想知道的 | 去读 |
|---|---|
| 现在什么状态、谁在干什么 | `.agent-coordination/LIVE.md` |
| 红线 / 部署方式 / 写锁 | 本文件 |
| 历史决策与踩坑 | `docs/`、`git log` |

---

## 1. 目录与关键路径

| 路径 | 用途 |
|---|---|
| `.agent-coordination/tasks.json` | 任务板（唯一任务源） |
| `.agent-coordination/server-lock.json` | 写锁（唯一锁源） |
| `.agent-coordination/LIVE.md` | 现场快照（生成物） |
| `scripts/` | 所有操作入口 |
| `config.sh` | 本机与服务器配置（**不入库**） |

## 2. 服务器写操作（铁律）

1. 改之前先**拿到写锁**：`bash scripts/lock.sh acquire "<操作名>" <预计分钟>`。
2. 覆盖任何文件前**先备份**：`<文件名>.bak-<YYYYMMDD-HHMM>`。
3. 一次只发**指定文件**，不允许整目录覆盖。
4. 发完立刻 `bash scripts/doctor.sh`，把输出贴进卡片 note。
5. 释放锁并写 `last_done`：做了什么、结果、时间。

## 3. 文件级协作（防互相覆盖）

- 建卡时必须填 `files`：你要改的每个文件都列出来。
- 两个人的 `files` 有交集时，**后建卡的人等**，不许同时改。
- 大重构先开分支，别在主干上边改边部署。

## 4. 分工建议

| 任务类型 | 更适合谁 |
|---|---|
| 长上下文、跨文件重构、浏览器交互验收 | 上下文窗口大的 Agent |
| 批量脚本、命令行闭环、测试 | CLI Agent |
| 需求拆解、文档、跨平台数据整理 | 通用助理类 Agent |
| 业务判断、口径确认、上线拍板 | 人 |

## 5. 红线（任何 Agent 都不得自行执行）

- 删除数据库、清空表、批量改权限。
- 改线上环境变量、证书、密钥。
- 动生产数据、给客户发消息、对外发布内容。
- 强制推送（`push --force`）、重写历史。

以上必须先**明确请示并得到人的确认**，且在卡片里留下记录。

## 6. 换机 / 换网络 / 换地区续接

- 3 个节点（例如笔记本 / 台式 / 云端）共用同一个仓库，`tasks.json` 和 `server-lock.json` 都跟着 git 走。
- 换机后第一件事：`git pull && bash scripts/live.sh`。
- 路径不写死：所有机器相关路径放 `config.sh`，脚本里用变量。

## 6.5 异常必须主动通知（不许只写在报告里）

- 任务失败、卡住、数据对不上、线上 5xx：立刻通知具体的人，并写进卡片 `note`。
- 通知模板：`【异常】<什么坏了> ｜ 影响：<谁受影响> ｜ 已做：<做了什么> ｜ 需要你：<一句话>`。
- 通知渠道在 `config.sh` 的 `NOTIFY_CMD` 里配置（可对接任意 IM / webhook），不硬编码在脚本里。

## 7. 当前状态快照

每次大改动后更新这一段（最近一次：2026-10-19）

- 主线任务：见 `tasks.json` 中 `status=doing` 的卡片。
- 线上健康：以 `bash scripts/doctor.sh` 输出为准。
- 已知待办：见 `status=blocked` 的卡片。
