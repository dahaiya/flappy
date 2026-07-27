# Flappy Cocos 3.x 场景搭建指南

> **说明（2026-07）**  
> 场景 **已经存在**：`assets/scenes/flappy_start.scene`、`assets/scenes/bird_game.scene`。  
> 本文是节点/组件绑定的 **对照手册**，不是「从零迁移 / 重建工程」待办。  
> 玩法逻辑优先看 `assets/scripts/flappy/`。

## 目标
在 `Cocos Creator 3.8.x` 中核对（或必要时修补）两个场景：
- `assets/scenes/flappy_start.scene`
- `assets/scenes/bird_game.scene`

## 资源核对（工程内应已具备；缺失时再补）
- 图集：`assets/resources/res_bundle.png` + `res_bundle.plist`（或等价导入）
- 数字字体：`assets/fonts/number.fnt`、`number.png`
- 动画：`assets/animation/bird_animation/`
- 管道：使用本工程 3.x prefab，不要从 2.x 硬拷
- 缺项对照：`docs/RESOURCE_COPY_LIST.md`

## 图集帧名
3.x 中重新导入后，确保至少能取到这些 frame：
- `background`
- `ground`
- `bird1`
- `bird2`
- `bird3`
- `top_pipe`
- `bottom_pipe`
- `start`
- `getready`
- `gameover`
- `result_board`
- `medal_gold`
- `medal_silver`

## 开始场景 `flappy_start.scene`
Canvas 下节点结构：
- `background`
- `ground`
- `groundLong`
- `bird`
- `title`
- `startBtn`
- `shareBtn`
- `rankBtn`
- `trialSkinBtn`
- `backBtn`
- `maskLayer`

### 开始场景组件挂载
- Canvas 根节点挂：`BirdGameStart3x`
- `maskLayer` 绑定到 `BirdGameStart3x.maskLayer`
- `ground` 挂 `Scroller3x`
- `Scroller3x.canvasNode` 指向 Canvas
- `Scroller3x.longGround` 指向 `groundLong`

### 开始场景按钮事件
- `startBtn` -> `BirdGameStart3x.startGame`
- `shareBtn` -> `BirdGameStart3x.shareGame`
- `rankBtn` -> `BirdGameStart3x.showRankPlaceholder`
- `trialSkinBtn` -> `BirdGameStart3x.trialSkin`，参数传 `space`
- `backBtn` -> `BirdGameStart3x.backGameList`

## 游戏场景 `bird_game.scene`
Canvas 下节点结构：
- `background`
- `pipeManager`
- `bird`
- `ground`
- `groundLong`
- `scoreLabel`
- `readyMenu`
- `gameOverMenu`
- `maskLayer`

### `readyMenu` 子节点
- `getready`
- `tapTips`

### `gameOverMenu` 子节点
- `gameOverLabel`
- `resultBoard`
- `startBtn`
- `backbtn`
- `reviveBtn`
- `tipsLabel`

### `resultBoard` 子节点
- `medal`
- `currentScore`
- `bestScore`

## 游戏场景组件挂载
- Canvas 根节点挂：`FbGame3x`
- `pipeManager` 节点挂：`PipeManager3x`
- `bird` 节点挂：`Bird3x`
- `ground` 节点挂：`Scroller3x`

### `FbGame3x` 属性绑定
- `pipeManager` -> `Canvas/pipeManager`
- `bird` -> `Canvas/bird`
- `scoreLabel` -> `Canvas/scoreLabel`
- `maskLayer` -> `Canvas/maskLayer`
- `ground` -> `Canvas/ground`
- `readyMenu` -> `Canvas/readyMenu`
- `gameOverMenu` -> `Canvas/gameOverMenu`

### `Bird3x` 属性绑定
- `ground` -> `Canvas/ground`

### `Scroller3x` 属性绑定
- `canvasNode` -> `Canvas`
- `longGround` -> `Canvas/groundLong`

## 管道 Prefab `pipeGroup.prefab`
重新创建一个 3.x prefab：`assets/resources/prefabs/pipeGroup.prefab`

节点结构：
- `pipeGroup`
- `topPipe`
- `bottomPipe`

### `topPipe`
- SpriteFrame: `top_pipe`
- UITransform 大小可参考：`75 x 467`
- 加 `BoxCollider2D`

### `bottomPipe`
- SpriteFrame: `bottom_pipe`
- UITransform 大小可参考：`75 x 467`
- 加 `BoxCollider2D`

### 根节点 `pipeGroup`
- 挂 `PipeGroup3x`
- `topPipe` 绑定到脚本属性
- `bottomPipe` 绑定到脚本属性

### `PipeManager3x`
- `pipePrefab` 指向上面新建的 `pipeGroup.prefab`

## Bird 节点
- 名称必须是 `bird`
- Sprite 默认用 `bird1`
- 挂 `Animation`
- 挂 `BoxCollider2D`
- 挂 `Bird3x`

## Ground 节点
- 名称必须是 `ground`
- 挂 `BoxCollider2D`
- 挂 `Scroller3x`

## 文本节点
- `scoreLabel` 用位图字体或普通 Label 都可以，先保证能显示数字
- `tipsLabel` 默认文案：`看完整广告可复活一次`
- `currentScore` 默认 `0`
- `bestScore` 默认 `0`

## 运行检查（回归用，不是「迁移完成条件」）
- 点击屏幕能起飞
- 管道持续生成
- 穿过管道会加分
- 撞管道 / 出上下界 / 碰地 → 出现结算层
- 右上角暂停 / 继续可用（`FbGame3x` 可运行时生成）
- `reviveBtn` 点击后能继续一局
- 每 3 局触发一次插屏占位
