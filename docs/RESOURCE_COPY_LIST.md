# 资源清单（历史 / 对照）

> **状态：主路径资源已在本 3.x 工程内。**  
> 本文不是「还要再拷一遍」的待办；仅在缺图/缺字体/缺动画时对照排查。

## 工程路径

| 角色 | 路径 |
|---|---|
| 本工程（3.8.8） | `/opt/workspace/liusan/flappy_cocos3` |
| 旧合集参考（2.x） | `/opt/workspace/liusan/game_with_cocosCreater` |

## 本工程内应已有的资源类型

- 图集 / 贴图（如 `res_bundle`）
- 位图字体 `number`
- 鸟动画 `birdFlapping` / `birdWing`
- 场景：`assets/scenes/*.scene`
- 管道 prefab：工程内 3.x 版（勿从 2.x 硬拷 scene/prefab）

## 若编辑器里缺失，可从旧工程对照复制

来源：`game_with_cocosCreater`（仅文件本体，**.meta 不要强依赖**）

- `assets/fonts/number.fnt`
- `assets/fonts/number.png`
- `assets/animation/bird_animation/birdFlapping.anim`
- `assets/animation/bird_animation/birdWing.anim`
- 可选：`res_bundle.png` / `res_bundle.plist`

复制后在 Creator 3.x 中 **重新导入**，再检查引用。

## 明确不要做的事

- 不要再「整包迁移」或新建 `cocos3_migration/`
- 不要从 2.x 复制 `.fire` / 旧 prefab 当主场景
- 不要把本文当成 migration 未完成清单
