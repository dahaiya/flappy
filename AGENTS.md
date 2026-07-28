# flappy_cocos3 — Agent 说明（必读）

## 0. 最高优先级（违反即失败）

1. **先回答用户当前问题**，再谈其它。用户问「碰顶 / 掉落 / 台阶 / 管道」→ 直接改对应脚本，不要改去读 migration。
2. **用中文**思考与回复（用户中文时）。
3. **不要**把会话带跑：inspect migration、重建工程、扫 docs 进度、compact、无关 goal。
4. 读完本文件后 **立刻处理用户原话**，禁止只复述 AGENTS.md / README 就结束。
5. 每轮至少推进用户问题：**改代码或给结论**；禁止反复 `ls` / `find` / `cat README` / 全仓扫空转。
6. **禁止** `get_goal` 空转；goal 为 null 时仍必须继续用户原话，**禁止**回 “no task yet / What would you like to work on?”。
7. **禁止**把 tool 报错（`CreateProcess` / `No such file` / 截断输出）当成用户新消息；重试时用 **本机 cwd** `/opt/workspace/liusan/flappy_cocos3`，**禁止**编造 `/Users/...` workdir，**禁止** PowerShell 语法。
8. plan 必须贴用户原话；**禁止**中途改成「inspect migration / 实现整个 Flappy / 重建工程」。

## 工程现状

- Cocos Creator **3.8.8** 可运行 Flappy（**不是**未完成迁移骨架）
- **2.x → 3.x 迁移已完成**；`docs/MIGRATION_3X.md` 仅历史
- 场景：`assets/scenes/flappy_start.scene`、`bird_game.scene`
- 玩法脚本：`assets/scripts/flappy/`
- 工作目录固定：`/opt/workspace/liusan/flappy_cocos3`

## 已知场景事实（省得再瞎扫）

- `bird_game.scene` 里 **没有** `BoxCollider2D` / `RigidBody2D` → 不能依赖物理碰撞回调
- 必须用 **AABB / 坐标** 判鸟碰地、碰管
- 地面是双条带：`ground` + `groundLong`，由 `Scroller3x` 滚动；只滚一条会「台阶错乱」
- 地面顶边约：`ground.y + ground.height/2`（默认 y=-250, h=140 → 顶约 -180），**不是**画布底 -320
- 场景 / prefab **序列化的 `@property` 会覆盖脚本默认值**（如 `initRiseSpeed`）；改手感要脚本 + 场景一起看

## 用户常见问题 → 改哪里

| 用户现象 | 优先文件 |
|---|---|
| 碰顶算失败 / 要贴顶但不出局 | `Bird3x.ts` `detectCollision`：夹紧 `topY` + 清向上速度，**不要** `failAndDrop(true)` |
| 飞出屏幕消失 | `Bird3x.ts` 上下边界（`getPlayBounds`） |
| 小鸟掉落不停 / 穿地 / 不结算 | `Bird3x.ts`（`getGroundTopY` / `killOnGround`）、`FbGame3x.ts`（`gameOver`） |
| 下面台阶/地面错乱、断层 | `Scroller3x.ts`（双条带一起滚） |
| 缺暂停 | `FbGame3x.ts` `ensurePauseUi` |
| 柱子太长 / 开口太窄 | `PipeGroup3x` / `PipeManager3x` / `FbGame3x` 的 spacing*；prefab `pipeGroup`；必要时改场景序列化值 |
| 每次跳跃太高 | 场景 `initRiseSpeed`（常覆盖脚本默认）+ `Bird3x.initRiseSpeed` |

## 默认不要做

- 「inspect migration / remaining work / 从零搭场景」
- 无目标地 `find` 全仓库、反复 cat 文档
- compact、创建无关 goal、`get_goal` 后装傻结束
- 查找 `cocos3_migration/`
- 英文客套收尾代替改代码

## 文档

| 文件 | 用途 |
|---|---|
| `README.md` | 入口 |
| `docs/MIGRATION_3X.md` | 历史 only |
| `docs/SCENE_BUILD_GUIDE.md` | 节点对照，非从零搭建 |
| `docs/RESOURCE_COPY_LIST.md` | 缺资源时对照 |

## 完成标准

- 对用户问题有**明确中文结论**（原因 + 改了什么 / 或无需改的理由）
- 相关脚本已改，或用 `git diff` 证明已满足
- **不要**停在「我先看看项目结构」或 “Hi — what would you like to work on?”
