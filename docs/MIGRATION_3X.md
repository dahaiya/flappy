# Flappy → Cocos Creator 3.x（历史记录）

> **状态：迁移已完成。**  
> 本文件只保留背景说明，**不是**当前待办清单。  
> Agent / 开发者请勿再执行「检查 migration 进度 / 重建场景 / 扫描 cocos3_migration」之类任务。

## 当前工程（以代码与场景为准）

| 项 | 路径 |
|---|---|
| 工程根目录 | 本仓库 `flappy_cocos3/`（Cocos Creator **3.8.8**） |
| 开始场景 | `assets/scenes/flappy_start.scene` |
| 游戏场景 | `assets/scenes/bird_game.scene` |
| 玩法脚本 | `assets/scripts/flappy/*.ts` |

核心脚本（已在 3.x 工程内，**不是**旧的 `cocos3_migration/` 目录）：

- `Bird3x.ts` — 鸟、边界、碰撞、失败
- `FbGame3x.ts` — 开局、计分、结算、暂停、复活
- `PipeManager3x.ts` / `PipeGroup3x.ts` — 管道
- `Scroller3x.ts` — 地面滚动
- `BirdGameStart3x.ts` — 开始页
- `AdManager.ts` / `SkinManager.ts` — 广告与皮肤占位

## 历史背景（可跳过）

原合集工程为 Cocos Creator 2.x（`.fire` / `cc.Class` 等），无法原地在 3.x 打开。  
做法是：**新建 3.x 工程 → 拷资源 → 重写脚本 → 重建场景**。  
该过程已完成；场景与脚本已在本仓库落地。

早期草稿路径 `cocos3_migration/` **已废弃**，勿再查找或拷贝。

## 给 Agent 的约束（重要）

1. **不要**再把本仓库当成「未完成的 2.x→3.x 迁移项目」。
2. **不要**以「inspect migration / remaining migration work」作为默认目标。
3. 玩法问题优先改：`assets/scripts/flappy/Bird3x.ts`、`FbGame3x.ts`。
4. 场景节点约定见：`docs/SCENE_BUILD_GUIDE.md`（结构参考，不是「从零搭建」清单）。
5. 2.x 旧说明仅作对照：`docs/FLAPPY_MVP_SETUP_2X_REFERENCE.md`。

## 近期玩法修复（2026-07）

已在脚本侧处理：

1. 小鸟飞出屏幕后看不见 → 画布上下边界夹紧并判负  
2. 无法判定失败 → 出界/碰地不依赖管道队列也会 `gameOver`  
3. 缺少暂停 → `FbGame3x` 运行时生成右上角「暂停/继续」

验证方式：用 Creator 3.8.8 打开本工程 → 运行 `bird_game` → 手测上述三点。

## 仍可能的非迁移问题

- 广告/分享/排行：多为微信 API 占位  
- 图集 `resources.load('res_bundle')` 路径需与编辑器导入名一致  
- 碰撞体/动画若在编辑器未绑好，会表现为「撞管无反应」等，属场景绑定，不是「还要迁移」

---

**结论：保留本文件作历史说明即可；日常开发与 Agent 任务请围绕可运行的 3.x 玩法，而不是 migration。**
