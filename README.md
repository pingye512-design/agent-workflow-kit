# agent-workflow-kit

**多 Agent 协作的工程闭环脚手架** —— 让一个人 + 几个 AI 工具（Claude Code / Codex CLI / Accio Work / 其他 CLI Agent）在同一个仓库里接力，而不丢上下文。

> 来自一个真实项目的脱敏版本：一个人维护 40+ 个项目目录、36 张任务卡、104 次提交，靠的就是这里的六件事。

---

## 它解决什么问题

| 常见做法 | 结果 |
|---|---|
| 问一句、AI 答一段，人肉复制粘贴 | 上下文在人脑里，换个工具就失忆 |
| 进度只存在对话窗口 | 工具一挂，做到哪了跟着蒸发 |
| 直接改线上，没有备份 | 改坏了只能连夜手改，没有退路 |
| 多个 AI 同时改同一个文件 | 互相覆盖，谁也不知道谁改的 |

这套脚手架把「工程纪律」变成 4 个文件 + 6 个脚本，人和 AI 都照同一份规则干活。

## 六步闭环

```
① 恢复现场 → ② 建卡 → ③ 执行 → ④ 验证 → ⑤ 治理 → ⑥ 交付
```

| 步骤 | 命令 | 产物 |
|---|---|---|
| 恢复现场 | `bash scripts/live.sh` | `.agent-coordination/LIVE.md` |
| 建卡 | `bash scripts/newtask.sh "目标" --files a.py` | `tasks.json` 一张卡 |
| 执行 | 正常改代码 | `commit` |
| 验证 | `bash scripts/doctor.sh` | 命令 + 输出 + 时间戳 |
| 治理 | `bash scripts/lock.sh acquire/release` | `server-lock.json` |
| 交付 | `bash scripts/handoff.sh` / `deploy.sh` / `rollback.sh` | 交接单 + 备份点 |

## 目录结构

```
agent-workflow-kit/
├── AGENTS.md                    # 共享契约（所有 AI 都读这一份）
├── .agent-coordination/
│   ├── tasks.json               # 任务板（卡片只增不删）
│   ├── server-lock.json         # 写锁（谁在动服务器）
│   ├── LIVE.md                  # 现场快照（自动生成，禁止手改）
│   └── HANDOFF.md               # 断点续做交接单模板
├── scripts/
│   ├── live.sh                  # 生成现场快照
│   ├── newtask.sh               # 一行命令建卡
│   ├── lock.sh                  # 拿锁 / 释放 / 查看
│   ├── handoff.sh               # 生成交接摘要
│   ├── doctor.sh                # 体检
│   ├── deploy.sh                # 带备份的发布
│   ├── rollback.sh              # 一键回滚
│   └── patrol.sh                # 定时巡检（可选 cron）
├── docs/                        # 四篇设计说明 + 踩坑记录
├── examples/hello-service/      # 最小可运行示例
└── config.sh                    # 本机/服务器路径等配置
```

## 快速开始

```bash
git clone <this-repo> && cd agent-workflow-kit
cp config.example.sh config.sh      # 改成你自己的路径
bash scripts/live.sh                # 生成现场快照
bash scripts/newtask.sh "把日报从本机搬到服务器" --files scripts/patrol.sh
bash scripts/lock.sh acquire "日报迁移" 30
bash scripts/lock.sh release "完成，退出码 0"
bash scripts/doctor.sh
```

## 三条设计原则

1. **落盘**：进度不写在对话里，写在任务卡和文件里。
2. **可验证**：每条「完成」都有命令、输出、时间戳。
3. **可回滚**：上线前先想好怎么退；退不回来就别上。

## 适用 / 不适用

- 适合：一个人或小团队 + 多个 AI 工具、有线上服务、改动频繁、需要换人接手。
- 不适合：一次性脚本、纯本地玩具项目、没有交付要求的探索。

## 许可

MIT。脚本与文档可直接用于商业项目。
