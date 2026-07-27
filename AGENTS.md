# flappy_cocos3 — Agent 说明（必读）

## 0. 最高优先级（违反即失败）

1. **先回答用户当前问题**，再谈其它。用户问「为什么掉落不停止 / 台阶不对」→ 直接查碰撞与地面，给出原因和修改，不要改去读 migration。
2. **用中文**思考与回复（用户中文时）。
3. **不要**把会话带跑：inspect migration、重建工程、扫 docs 进度、compact、无关 goal。
4. 读完本文件后 **立刻处理用户原话**，禁止只复述 AGENTS.md 就结束。
5. 每轮至少推进用户问题：改代码 / 给结论；禁止反复 `ls`/`find`/`cat README` 空转。

## 工程现状

- Cocos Creator **3.8.8** 可运行 Flappy
- **2.x → 3.x 迁移已完成**
- 场景：`assets/scenes/flappy_start.scene`、`bird_game.scene`
- 玩法脚本：`assets/scripts/flappy/`

## 已知场景事实（省得再瞎扫）

- `bird_game.scene` 里 **没有** `BoxCollider2D` / `RigidBody2D` → 不能依赖物理碰撞回调
- 必须用 **AABB / 坐标** 判鸟碰地、碰管
- 地面是双条带：`ground` + `groundLong`，由 `Scroller3x` 滚动；只滚一条会「台阶错乱」
- 地面顶边约：`ground.y + ground.height/2`（默认 y=-250, h=140 → 顶约 -180），**不是**画布底 -320

## 用户常见问题 → 改哪里

| 用户现象 | 优先文件 |
|---|---|
| 小鸟掉落不停 / 穿地 / 不结算 | `Bird3x.ts`（`getGroundTopY` / `killOnGround`）、`FbGame3x.ts`（`gameOver`） |
| 下面台阶/地面错乱、断层 | `Scroller3x.ts`（双条带一起滚） |
| 飞出屏幕消失 | `Bird3x.ts` 上下边界 |
| 缺暂停 | `FbGame3x.ts` `ensurePauseUi` |

## 默认不要做

- 「inspect migration / remaining work / 从零搭场景」
- 无目标地 `find` 全仓库、反复 cat 文档
- compact、创建无关 goal
- 查找 `cocos3_migration/`

## 文档

| 文件 | 用途 |
|---|---|
| `README.md` | 入口 |
| `docs/MIGRATION_3X.md` | 历史 only |
| `docs/SCENE_BUILD_GUIDE.md` | 节点对照，非从零搭建 |
| `docs/RESOURCE_COPY_LIST.md` | 缺资源时对照 |

## 完成标准

- 对用户问题有**明确中文结论**（原因 + 改了什么）
- 相关脚本已改或说明无需改
- 不要停在「我先看看项目结构」
