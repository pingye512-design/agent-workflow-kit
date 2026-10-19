# hello-service（最小示例）

用来验证脚手架能跑通，不依赖任何第三方包。

```bash
# 1) 起服务
python3 examples/hello-service/app.py 8080

# 2) 另开一个终端，把体检指向它
export HEALTH_URL="http://127.0.0.1:8080/health"
bash scripts/doctor.sh

# 3) 跑测试（命令 + 输出 + 时间戳）
python3 -m unittest discover -s examples/hello-service -v
```

预期：

- `GET /health` 返回 `{"ok": true, "service": "hello-service"}`
- `doctor.sh` 输出「接口 200」
- 3 个测试全部通过

## 用它练一遍闭环

```bash
bash scripts/newtask.sh "给 hello-service 加一个 /sum 接口" --files examples/hello-service/app.py
bash scripts/lock.sh acquire "示例发布" 10
mkdir -p deploy && cp examples/hello-service/app.py deploy/
bash scripts/deploy.sh examples/hello-service/app.py
bash scripts/doctor.sh
bash scripts/rollback.sh app.py        # 演示回滚
bash scripts/lock.sh release "示例完成"
bash scripts/handoff.sh
```
