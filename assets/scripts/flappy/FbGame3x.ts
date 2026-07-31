import { _decorator, BlockInputEvents, Color, Component, director, find, Graphics, Label, Node, Sprite, SpriteAtlas, Tween, tween, UIOpacity, UITransform, Vec3, resources } from 'cc';
import AdManager from './AdManager';
import SkinManager from './SkinManager';
import { Bird3x, BirdState } from './Bird3x';
import { PipeManager3x } from './PipeManager3x';
import { Scroller3x } from './Scroller3x';
const { ccclass, property } = _decorator;

function ensureUIOpacity(node: Node) {
  let opacity = node.getComponent(UIOpacity);
  if (!opacity) {
    opacity = node.addComponent(UIOpacity);
  }
  return opacity;
}

function getUITransform(node: Node | null) {
  return node?.getComponent(UITransform) || null;
}

const STORAGE_KEYS = {
  bestScore: 'flappy_best_score',
  playCount: 'flappy_play_count',
};

@ccclass('FbGame3x')
export class FbGame3x extends Component {
  @property
  goldScore = 20;

  @property
  silverScore = 10;

  /** 管道开口：更大 = 柱子挡路更短、更好过 */
  @property
  easySpacingMin = 280;

  @property
  easySpacingMax = 340;

  @property
  hardSpacingMin = 230;

  @property
  hardSpacingMax = 280;

  /** 管道水平速度（负=向左），绝对值更小 = 更慢更好躲 */
  @property
  basePipeSpeed = -180;

  @property
  maxPipeSpeed = -260;

  @property(PipeManager3x)
  pipeManager: PipeManager3x | null = null;

  @property(Bird3x)
  bird: Bird3x | null = null;

  @property(Label)
  scoreLabel: Label | null = null;

  @property(Node)
  maskLayer: Node | null = null;

  @property(Node)
  ground: Node | null = null;

  @property(Node)
  readyMenu: Node | null = null;

  @property(Node)
  gameOverMenu: Node | null = null;

  @property(Node)
  pauseBtn: Node | null = null;

  /** True while the run is paused (pipes/bird/scroller frozen). */
  isPaused = false;

  private score = 0;
  private bestScore = 0;
  private playCount = 0;
  private revivedThisRun = false;
  private gameOverShown = false;
  private pauseOverlay: Node | null = null;
  private pauseBtnLabel: Label | null = null;
  private wasPipeRunningBeforePause = false;
  private gameOverBackdrop: Node | null = null;
  private gameOverPanel: Node | null = null;

  onLoad() {
    this.bestScore = this.getStoredNumber(STORAGE_KEYS.bestScore);
    this.playCount = this.getStoredNumber(STORAGE_KEYS.playCount);
    this.revivedThisRun = false;
    this.score = 0;
    this.isPaused = false;
    this.gameOverShown = false;
    if (this.scoreLabel) {
      this.scoreLabel.string = String(this.score);
    }
    this.bird?.init(this);
    AdManager.init();
    this.applyCustomBirdLook();
    this.applyCurrentSkin();
    this.localizeReadyMenu();
    this.disablePauseUi();
    this.enableInput(true);
    this.revealScene();
  }

  getStoredNumber(key: string) {
    const value = parseInt(localStorage.getItem(key) || '0', 10);
    return Number.isNaN(value) ? 0 : value;
  }

  setStoredNumber(key: string, value: number) {
    localStorage.setItem(key, String(value));
  }

  revealScene() {
    if (!this.maskLayer) {
      return;
    }
    this.maskLayer.active = true;
    const sprite = this.maskLayer.getComponent(Sprite);
    if (sprite) {
      sprite.color = Color.BLACK;
    }
    const opacity = ensureUIOpacity(this.maskLayer);
    opacity.opacity = 255;
    tween(opacity).to(0.3, { opacity: 0 }).call(() => {
      if (this.maskLayer) {
        this.maskLayer.active = false;
      }
    }).start();
  }

  restart() {
    SkinManager.consumeTrialRound();
    director.loadScene('bird_game');
  }

  gameStart() {
    this.isPaused = false;
    this.gameOverShown = false;
    if (this.pipeManager) {
      this.pipeManager.difficultyScore = 0;
    }
    this.hideReadyMenu();
    this.applyDifficulty();
    this.pipeManager?.startSpawn();
    this.bird?.startFly();
    // 暂停功能暂不需要
    this.setPauseButtonVisible(false);
  }

  gameOver() {
    // 已展示且仍在显示时不重复；若已复活把 menu 关掉后再次失败，必须能再弹
    if (this.gameOverShown && this.gameOverMenu?.active) {
      return;
    }
    this.gameOverShown = true;
    if (this.isPaused) {
      this.resumeGame(false);
    }
    // Freeze world: pipes, ground scroll, further flaps
    this.pipeManager?.reset();
    this.ground?.getComponent(Scroller3x)?.stopScroll();
    // Bird3x sets Dead itself; ensure input cannot flap after fall-through
    this.enableInput(false);
    this.setPauseButtonVisible(false);
    this.hidePauseOverlay();
    this.blinkOnce();
    this.showGameOverMenu();
    this.maybeShowInterstitial();
  }

  /** 暂停暂不需要：隐藏场景/运行时暂停钮，不创建新 UI。 */
  disablePauseUi() {
    if (this.pauseBtn?.isValid) {
      this.pauseBtn.off(Node.EventType.TOUCH_END, this.onPauseButtonClick, this);
      this.pauseBtn.active = false;
    }
    const auto = this.node.getChildByName('pauseBtn');
    if (auto?.isValid) {
      auto.active = false;
    }
    if (this.pauseOverlay?.isValid) {
      this.pauseOverlay.active = false;
    }
  }

  /** 兼容旧调用名 */
  ensurePauseUi() {
    this.disablePauseUi();
  }

  /** 开局英文 GET READY / TAP（含下方小框手势图）来自原版图集，玩家看不懂。
   * 隐藏贴图，改成中文「点击屏幕起飞」。
   */
  localizeReadyMenu() {
    if (!this.readyMenu?.isValid) {
      return;
    }
    const hideNames = ['getready', 'getReady', 'GET READY', 'tapTips', 'tap', 'TAP'];
    for (const child of this.readyMenu.children) {
      if (hideNames.includes(child.name) || /getready|tap/i.test(child.name)) {
        child.active = false;
        const sp = child.getComponent(Sprite);
        if (sp) {
          sp.enabled = false;
        }
      }
    }

    let tip = this.readyMenu.getChildByName('cnReadyTip');
    if (!tip) {
      tip = new Node('cnReadyTip');
      tip.layer = this.readyMenu.layer;
      tip.addComponent(UITransform).setContentSize(420, 80);
      tip.setPosition(0, 20, 0);
      const label = tip.addComponent(Label);
      label.string = '点击屏幕起飞';
      label.fontSize = 36;
      label.isBold = true;
      label.color = Color.WHITE;
      label.enableOutline = true;
      label.outlineColor = new Color(20, 30, 50, 230);
      label.outlineWidth = 3;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      this.readyMenu.addChild(tip);
    }
    tip.active = true;
    ensureUIOpacity(tip).opacity = 255;
    ensureUIOpacity(this.readyMenu).opacity = 255;
    this.readyMenu.active = true;

    // 关键修复：绑定点击事件
    const readyNode = this.readyMenu;
    if (readyNode) {
      const block = readyNode.getComponent(BlockInputEvents);
      if (block) block.enabled = false;
      readyNode.on(Node.EventType.TOUCH_END, this.onReadyTap, this);
    }
  }

  /** 用 Graphics 画一只有辨识度的「焰羽鸟」，盖住原版像素鸟贴图（避免和常见 Flappy 资源撞脸）。
   */
  applyCustomBirdLook() {
    const birdNode = this.bird?.node;
    if (!birdNode?.isValid) {
      return;
    }
    const sprite = birdNode.getComponent(Sprite);
    if (sprite) {
      // 显示新鸟图（豆包生成的黄蓝圆胖鸟）
      sprite.enabled = true;
      sprite.color = Color.WHITE;
      sprite.spriteFrame = resources.load<Texture2D>('bird_new').then(tex => tex);
    }
  }

  onPauseButtonClick() {
    if (this.bird?.state === BirdState.Ready || this.bird?.state === BirdState.Dead || this.gameOverShown) {
      return;
    }
    if (this.isPaused) {
      this.resumeGame(true);
    } else {
      this.pauseGame();
    }
  }

  pauseGame() {
    if (this.isPaused || this.gameOverShown) {
      return;
    }
    this.isPaused = true;
    this.wasPipeRunningBeforePause = !!this.pipeManager?.pipeIsRunning;
    if (this.pipeManager) {
      this.pipeManager.pipeIsRunning = false;
    }
    this.ground?.getComponent(Scroller3x)?.stopScroll();
    this.enableInput(false);
    if (this.pauseOverlay) {
      this.pauseOverlay.active = true;
      this.pauseOverlay.setSiblingIndex(this.node.children.length - 1);
    }
    if (this.pauseBtn) {
      this.pauseBtn.setSiblingIndex(this.node.children.length - 1);
    }
    this.refreshPauseButtonLabel();
  }

  resumeGame(restoreInput: boolean) {
    if (!this.isPaused) {
      return;
    }
    this.isPaused = false;
    if (this.pipeManager && this.wasPipeRunningBeforePause) {
      this.pipeManager.pipeIsRunning = true;
    }
    this.ground?.getComponent(Scroller3x)?.startScroll();
    this.hidePauseOverlay();
    if (restoreInput && !this.gameOverShown) {
      this.enableInput(true);
    }
    this.refreshPauseButtonLabel();
  }

  hidePauseOverlay() {
    if (this.pauseOverlay) {
      this.pauseOverlay.active = false;
    }
  }

  setPauseButtonVisible(visible: boolean) {
    if (this.pauseBtn) {
      this.pauseBtn.active = visible;
    }
  }

  refreshPauseButtonLabel() {
    const text = this.isPaused ? '继续' : '暂停';
    if (this.pauseBtnLabel) {
      this.pauseBtnLabel.string = text;
    } else if (this.pauseBtn) {
      const label = this.pauseBtn.getComponentInChildren(Label);
      if (label) {
        label.string = text;
      }
    }
  }

  maybeShowInterstitial() {
    this.playCount += 1;
    this.setStoredNumber(STORAGE_KEYS.playCount, this.playCount);
    if (this.playCount % 3 === 0) {
      AdManager.showInterstitial();
    }
  }

  applyCurrentSkin() {
    const config = SkinManager.getSkinConfig(SkinManager.getSelectedSkin());
    if (this.bird?.node) {
      const sprite = this.bird.node.getComponent(Sprite);
      if (sprite) {
        sprite.color = config.birdColor;
      }
    }
    this.pipeManager?.forEachActivePipe((pipe) => {
      const topSprite = pipe.topPipe?.getComponent(Sprite);
      const bottomSprite = pipe.bottomPipe?.getComponent(Sprite);
      if (topSprite) topSprite.color = config.pipeTint;
      if (bottomSprite) bottomSprite.color = config.pipeTint;
    });
  }

  gainScore() {
    this.score += 1;
    if (this.scoreLabel) {
      this.scoreLabel.string = String(this.score);
    }
    this.applyDifficulty();
  }

  applyDifficulty() {
    if (!this.pipeManager) {
      return;
    }
    // 前 8 分几乎不加压，之后缓慢变难；同时驱动柱子 top/bottom/both 混合
    this.pipeManager.difficultyScore = this.score;
    const difficulty = Math.min(Math.max(this.score - 8, 0), 24) / 24;
    this.pipeManager.pipeMoveSpeed = this.basePipeSpeed + (this.maxPipeSpeed - this.basePipeSpeed) * difficulty;
    this.pipeManager.spacingMinValue = this.easySpacingMin + (this.hardSpacingMin - this.easySpacingMin) * difficulty;
    this.pipeManager.spacingMaxValue = this.easySpacingMax + (this.hardSpacingMax - this.easySpacingMax) * difficulty;
  }

  hideReadyMenu() {
    if (!this.scoreLabel || !this.readyMenu) {
      return;
    }
    ensureUIOpacity(this.scoreLabel.node).opacity = 255;
    tween(ensureUIOpacity(this.readyMenu)).to(0.5, { opacity: 0 }).call(() => {
      if (this.readyMenu) {
        this.readyMenu.active = false;
      }
    }).start();
  }

  blinkOnce() {
    if (!this.maskLayer) {
      return;
    }
    const sprite = this.maskLayer.getComponent(Sprite);
    if (sprite) {
      sprite.color = Color.WHITE;
    }
    tween(ensureUIOpacity(this.maskLayer)).to(0.1, { opacity: 200 }).to(0.1, { opacity: 0 }).start();
  }

  showGameOverMenu() {
    if (!this.scoreLabel || !this.gameOverMenu) {
      return;
    }

    // 隐藏局内分数，避免和结算板叠字
    const scoreOpacity = ensureUIOpacity(this.scoreLabel.node);
    Tween.stopAllByTarget(scoreOpacity);
    scoreOpacity.opacity = 0;
    this.scoreLabel.node.active = false;

    // 失败后 ready 提示 / 闪白遮罩都关掉，避免透出来或挡住弹窗
    if (this.readyMenu) {
      this.readyMenu.active = false;
    }
    if (this.maskLayer) {
      Tween.stopAllByTarget(ensureUIOpacity(this.maskLayer));
      this.maskLayer.active = false;
    }

    this.ensureGameOverChrome();

    const gameOverNode = this.gameOverMenu.getChildByName('gameOverLabel');
    const resultBoardNode = this.gameOverMenu.getChildByName('resultBoard');
    const startButtonNode = this.gameOverMenu.getChildByName('startBtn');
    const backButtonNode = this.gameOverMenu.getChildByName('backbtn');
    const reviveButtonNode = this.gameOverMenu.getChildByName('reviveBtn');
    const tipsLabelNode = this.gameOverMenu.getChildByName('tipsLabel');
    const currentScoreNode = resultBoardNode?.getChildByName('currentScore');
    const bestScoreNode = resultBoardNode?.getChildByName('bestScore');
    const medalNode = resultBoardNode?.getChildByName('medal');

    let bestScore = this.bestScore;
    if (this.score > bestScore) {
      bestScore = this.score;
      this.bestScore = bestScore;
      this.setStoredNumber(STORAGE_KEYS.bestScore, bestScore);
    }

    // 上下两个数字：上=本局得分，下=历史最高
    this.setScoreRow(currentScoreNode, '本局', this.score);
    this.setScoreRow(bestScoreNode, '最高', bestScore);
    if (tipsLabelNode?.getComponent(Label)) {
      const tips = tipsLabelNode.getComponent(Label)!;
      tips.string = this.revivedThisRun
        ? '本局已复活过，请点「再来一局」'
        : '点「看广告复活」会先播放广告（预览环境为模拟广告）';
      tips.fontSize = 22;
      tips.color = new Color(230, 230, 230, 255);
      tips.horizontalAlign = Label.HorizontalAlign.CENTER;
      tips.verticalAlign = Label.VerticalAlign.CENTER;
      getUITransform(tipsLabelNode)?.setContentSize(460, 60);
      tipsLabelNode.setPosition(0, -250, 0);
      tipsLabelNode.active = true;
      ensureUIOpacity(tipsLabelNode).opacity = 255;
    }

    resources.load('res_bundle', SpriteAtlas, (_err, atlas) => {
      if (!atlas || !medalNode) {
        return;
      }
      const medalSprite = medalNode.getComponent(Sprite);
      if (!medalSprite) {
        return;
      }
      if (this.score >= this.goldScore) {
        medalSprite.spriteFrame = atlas.getSpriteFrame('medal_gold');
      } else if (this.score >= this.silverScore) {
        medalSprite.spriteFrame = atlas.getSpriteFrame('medal_silver');
      } else {
        medalSprite.spriteFrame = null;
      }
    });

    // 用实心按钮盖住场景里半透明 START 图，避免「看不清再来一局/复活」
    this.styleActionButton(startButtonNode, 240, 84, '再来一局', 34, new Color(76, 175, 80, 255));
    this.styleActionButton(backButtonNode, 170, 70, '返回', 28, new Color(90, 98, 120, 255));
    this.styleActionButton(reviveButtonNode, 220, 70, '看广告复活', 26, new Color(255, 167, 38, 255));

    if (startButtonNode) {
      startButtonNode.setPosition(0, -95, 0);
      startButtonNode.active = true;
      ensureUIOpacity(startButtonNode).opacity = 255;
    }
    if (backButtonNode) {
      backButtonNode.setPosition(-140, -190, 0);
      backButtonNode.active = true;
      ensureUIOpacity(backButtonNode).opacity = 255;
    }
    if (reviveButtonNode) {
      reviveButtonNode.setPosition(140, -190, 0);
      // 本局已复活则隐藏，避免误点
      reviveButtonNode.active = !this.revivedThisRun;
      ensureUIOpacity(reviveButtonNode).opacity = this.revivedThisRun ? 0 : 255;
    }
    if (resultBoardNode) {
      getUITransform(resultBoardNode)?.setContentSize(320, 180);
      resultBoardNode.setPosition(0, 35, 0);
      resultBoardNode.active = true;
      ensureUIOpacity(resultBoardNode).opacity = 255;
    }
    if (gameOverNode) {
      ensureUIOpacity(gameOverNode).opacity = 255;
      const goLabel = gameOverNode.getComponent(Label);
      if (goLabel) {
        goLabel.string = '游戏结束';
        goLabel.fontSize = 44;
        goLabel.color = Color.WHITE;
        goLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      }
      // 有些场景 gameOverLabel 是 Sprite「GAME OVER」图，再叠一个清晰标题
      this.ensureGameOverTitle(gameOverNode);
      gameOverNode.setPosition(0, 210, 0);
      gameOverNode.active = true;
    }

    // 全屏遮罩 + 弹层置顶，盖住场上 START / 鸟 / 管
    if (this.gameOverBackdrop) {
      this.gameOverBackdrop.active = true;
      ensureUIOpacity(this.gameOverBackdrop).opacity = 210;
      this.gameOverBackdrop.setSiblingIndex(this.node.children.length - 1);
    }
    if (this.gameOverPanel) {
      this.gameOverPanel.active = true;
      this.gameOverPanel.setSiblingIndex(this.node.children.length - 1);
    }

    // 扩大 menu 命中区域，并保证整层可见
    getUITransform(this.gameOverMenu)?.setContentSize(520, 640);
    this.gameOverMenu.active = true;
    ensureUIOpacity(this.gameOverMenu).opacity = 255;
    // 顺序：遮罩 < 面板 < 菜单按钮（菜单必须最顶）
    if (this.gameOverBackdrop) {
      this.gameOverBackdrop.setSiblingIndex(this.node.children.length - 1);
    }
    if (this.gameOverPanel) {
      this.gameOverPanel.setSiblingIndex(this.node.children.length - 1);
    }
    this.gameOverMenu.setSiblingIndex(this.node.children.length - 1);

    // 重新绑定，复活后再失败也要能点
    if (startButtonNode) {
      startButtonNode.off(Node.EventType.TOUCH_END, this.restart, this);
      startButtonNode.on(Node.EventType.TOUCH_END, this.restart, this);
    }
    if (backButtonNode) {
      backButtonNode.off(Node.EventType.TOUCH_END, this.backGameList, this);
      backButtonNode.on(Node.EventType.TOUCH_END, this.backGameList, this);
    }
    if (reviveButtonNode) {
      reviveButtonNode.off(Node.EventType.TOUCH_END, this.reviveGame, this);
      reviveButtonNode.on(Node.EventType.TOUCH_END, this.reviveGame, this);
    }
  }

  ensureGameOverChrome() {
    if (this.gameOverBackdrop?.isValid) {
      this.gameOverBackdrop.active = true;
      ensureUIOpacity(this.gameOverBackdrop).opacity = 210;
      this.gameOverBackdrop.setSiblingIndex(this.node.children.length - 1);
    }
    if (this.gameOverPanel?.isValid) {
      this.gameOverPanel.active = true;
      this.gameOverPanel.setSiblingIndex(this.node.children.length - 1);
    }
  }

  ensureGameOverTitle(gameOverNode: Node) {
    const title = gameOverNode.getChildByName('gameOverTitle');
    if (!title) {
      const t = new Node('gameOverTitle');
      t.layer = gameOverNode.layer;
      t.addComponent(UITransform).setContentSize(400, 80);
      t.setPosition(0, 40, 0);
      const lbl = t.addComponent(Label);
      lbl.string = '游戏结束';
      lbl.fontSize = 48;
      lbl.color = Color.WHITE;
      lbl.isBold = true;
      lbl.enableOutline = true;
      lbl.outlineColor = new Color(255, 255, 255, 255);
      lbl.outlineWidth = 4;
      lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
      lbl.verticalAlign = Label.VerticalAlign.CENTER;
      gameOverNode.addChild(t);
    }
  }

  setScoreRow(node: Node | null, label: string, value: number) {
    if (!node) return;
    const up = node.getChildByName('up');
    const down = node.getChildByName('down');
    if (up) up.getComponent(Label)!.string = label;
    if (down) down.getComponent(Label)!.string = String(value);
  }

  styleActionButton(btn: Node | null, width: number, height: number, text: string, fontSize: number, bgColor: Color) {
    if (!btn) return;
    const ui = btn.getComponent(UITransform);
    if (ui) {
      ui.setContentSize(width, height);
    }
    const label = btn.getComponentInChildren(Label);
    if (label) {
      label.string = text;
      label.fontSize = fontSize;
    }
    const bg = btn.getChildByName('btnBg');
    if (bg) {
      const sp = bg.getComponent(Sprite);
      if (sp) sp.color = bgColor;
    }
  }

  backGameList() {
    // 独立工程没有合集 startscene，回到开始页自身
    this.fadeMaskThen('flappy_start');
  }

  reviveGame() {
    // 复活逻辑已在 Bird3x 里实现，这里只触发游戏开始
    this.gameStart();
  }

  fadeMaskThen(loadSceneName: string) {
    if (!this.maskLayer) {
      director.loadScene(loadSceneName);
      return;
    }
    this.maskLayer.active = true;
    const sprite = this.maskLayer.getComponent(Sprite);
    if (sprite) {
      sprite.color = Color.BLACK;
    }
    const opacity = ensureUIOpacity(this.maskLayer);
    opacity.opacity = 0;
    tween(opacity)
      .to(0.2, { opacity: 255 })
      .call(() => director.loadScene(loadSceneName))
      .start();
  }
}