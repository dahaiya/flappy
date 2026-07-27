# flappy_cocos3

Cocos Creator **3.8.8** 独立 Flappy 小游戏工程（可运行，不是未完成的迁移骨架）。

## 打开方式

1. Cocos Creator 3.8.8 打开本目录  
2. 场景：
   - 开始页 `assets/scenes/flappy_start.scene`
   - 游戏页 `assets/scenes/bird_game.scene`

## 脚本

`assets/scripts/flappy/`

| 文件 | 作用 |
|---|---|
| `Bird3x.ts` | 鸟、边界、碰撞、失败 |
| `FbGame3x.ts` | 游戏流程、分数、结算、暂停 |
| `PipeManager3x.ts` / `PipeGroup3x.ts` | 管道 |
| `Scroller3x.ts` | 地面滚动 |
| `BirdGameStart3x.ts` | 开始页 |
| `AdManager.ts` / `SkinManager.ts` | 广告 / 皮肤占位 |

## 文档

| 文件 | 用途 |
|---|---|
| `AGENTS.md` | **给 Agent 的默认约束**（优先读） |
| `docs/MIGRATION_3X.md` | **历史**：2.x→3.x 已完成；勿当待办 |
| `docs/SCENE_BUILD_GUIDE.md` | 场景节点与组件绑定参考 |
| `docs/RESOURCE_COPY_LIST.md` | 缺资源时对照（不是待拷清单） |
| `docs/FLAPPY_MVP_SETUP_2X_REFERENCE.md` | 旧 2.x 对照（一般不用） |

## Agent 注意

- **先回答用户问题**，禁止只读 AGENTS/README 后空转  
- 不要执行「检查 migration 进度 / 重建整个 3.x 工程」  
- 玩法 bug 优先改 `Bird3x.ts`、`FbGame3x.ts`、`Scroller3x.ts`  
- 场景无物理碰撞体：用坐标/AABB，不要等 Collider 回调  
- 不要 compact 无关上下文；不要创建无关 goal  
- 用户中文 → 中文回复  
