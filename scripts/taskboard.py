#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""taskboard.py —— 任务板与写锁的唯一读写入口。

所有脚本都调用这里，避免手工编辑 JSON 造成格式损坏（重复 key、少逗号、BOM）。
用法：
  python3 scripts/taskboard.py counts
  python3 scripts/taskboard.py list --status doing
  python3 scripts/taskboard.py add --goal "..." --files a.py,b.py --owner cli-agent
  python3 scripts/taskboard.py done --id T-20261019-01 --note "已验证"
  python3 scripts/taskboard.py lock-status
  python3 scripts/taskboard.py lock-acquire --operation "..." --minutes 30 --owner cli-agent
  python3 scripts/taskboard.py lock-release --result "退出码 0" --owner cli-agent
"""
import argparse
import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COORD = os.path.join(ROOT, ".agent-coordination")
TASKS = os.path.join(COORD, "tasks.json")
LOCK = os.path.join(COORD, "server-lock.json")


def now():
    return datetime.datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M")


def load(path, default):
    if not os.path.exists(path):
        return default
    # utf-8-sig: 容忍 Windows PowerShell 写出的 BOM
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def save(path, data):
    """原子写：先写临时文件再替换，避免中途失败把文件写坏。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def tasks_data():
    data = load(TASKS, {"tasks": []})
    data.setdefault("tasks", [])
    return data


def cmd_counts(_):
    ts = tasks_data()["tasks"]
    counts = {}
    for t in ts:
        counts[t.get("status", "?")] = counts.get(t.get("status", "?"), 0) + 1
    print("共 %d 张卡：%s" % (len(ts), " / ".join("%s %d" % (k, v) for k, v in sorted(counts.items()))))


def cmd_list(args):
    ts = tasks_data()["tasks"]
    for t in ts:
        if args.status and t.get("status") != args.status:
            continue
        print("%-16s %-10s %-8s %s" % (t.get("id"), t.get("owner"), t.get("status"), t.get("goal")))
        print("    占用：%s" % (", ".join(t.get("files", [])) or "未声明"))
        print("    下一步：%s" % t.get("next_step", ""))


def cmd_add(args):
    data = tasks_data()
    ts = data["tasks"]
    day = datetime.date.today().strftime("%Y%m%d")
    n = 1 + sum(1 for t in ts if str(t.get("id", "")).startswith("T-" + day))
    tid = "T-%s-%02d" % (day, n)
    files = [f.strip() for f in (args.files or "").split(",") if f.strip()]
    # 冲突检查：同文件正在被别的 doing 卡占用时直接拒绝
    busy = {}
    for t in ts:
        if t.get("status") == "doing":
            for f in t.get("files", []):
                busy[f] = t.get("id")
    clash = [(f, busy[f]) for f in files if f in busy]
    if clash:
        for f, tid2 in clash:
            print("✖ 文件 %s 已被 %s 占用，先协调再建卡" % (f, tid2), file=sys.stderr)
        return 1
    ts.append({
        "id": tid,
        "owner": args.owner,
        "goal": args.goal,
        "files": files,
        "status": "doing",
        "started_at": now(),
        "done_so_far": [],
        "next_step": args.next_step or "",
        "handoff_hint": "",
        "note": "",
    })
    save(TASKS, data)
    print("✔ 已建卡 %s ｜ %s" % (tid, args.goal))
    return 0


def cmd_done(args):
    data = tasks_data()
    for t in data["tasks"]:
        if t.get("id") == args.id:
            t["status"] = "done"
            t["note"] = args.note or t.get("note", "")
            t["finished_at"] = now()
            save(TASKS, data)
            print("✔ %s → done" % args.id)
            return 0
    print("✖ 找不到卡片 %s" % args.id, file=sys.stderr)
    return 1


def cmd_lock_status(_):
    d = load(LOCK, {})
    holder = d.get("lock_holder")
    if holder:
        print("🔒 锁定中：%s ｜ 操作：%s ｜ 预计完成：%s" % (holder, d.get("operation"), d.get("expected_done")))
        return 2
    print("🔓 空闲")
    last = d.get("last_done") or {}
    if last:
        print("最近完成：%s ｜ %s ｜ %s" % (last.get("at"), last.get("task"), last.get("result")))
    return 0


def cmd_lock_acquire(args):
    d = load(LOCK, {})
    if d.get("lock_holder"):
        print("✖ 锁在 %s 手上（%s），请等待或协调后再试" % (d.get("lock_holder"), d.get("operation")), file=sys.stderr)
        return 1
    d.update({
        "lock_holder": args.owner,
        "operation": args.operation,
        "started_at": now(),
        "expected_done": (datetime.datetime.now() + datetime.timedelta(minutes=args.minutes)).strftime("%Y-%m-%dT%H:%M"),
        "note": "",
    })
    save(LOCK, d)
    print("✔ 已拿锁：%s（预计 %d 分钟）" % (args.operation, args.minutes))
    return 0


def cmd_lock_release(args):
    d = load(LOCK, {})
    if not d.get("lock_holder"):
        print("! 锁本来就是空闲的")
        return 0
    d["last_done"] = {
        "at": now(),
        "task": d.get("operation", ""),
        "result": args.result or "",
        "operator": d.get("lock_holder"),
    }
    d.update({"lock_holder": None, "operation": "", "started_at": "", "expected_done": "", "note": args.result or ""})
    save(LOCK, d)
    print("✔ 已释放，last_done 已记录")
    return 0


def main():
    ap = argparse.ArgumentParser(description="任务板与写锁")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("counts").set_defaults(func=cmd_counts)

    p = sub.add_parser("list")
    p.add_argument("--status", choices=["doing", "blocked", "done"])
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("add")
    p.add_argument("--goal", required=True)
    p.add_argument("--files", default="")
    p.add_argument("--owner", default="agent")
    p.add_argument("--next-step", dest="next_step", default="")
    p.set_defaults(func=cmd_add)

    p = sub.add_parser("done")
    p.add_argument("--id", required=True)
    p.add_argument("--note", default="")
    p.set_defaults(func=cmd_done)

    sub.add_parser("lock-status").set_defaults(func=cmd_lock_status)

    p = sub.add_parser("lock-acquire")
    p.add_argument("--operation", required=True)
    p.add_argument("--minutes", type=int, default=30)
    p.add_argument("--owner", default="agent")
    p.set_defaults(func=cmd_lock_acquire)

    p = sub.add_parser("lock-release")
    p.add_argument("--result", default="")
    p.add_argument("--owner", default="agent")
    p.set_defaults(func=cmd_lock_release)

    args = ap.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
