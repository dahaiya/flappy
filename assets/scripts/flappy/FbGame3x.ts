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
    this.applyCurrentSkin();
    this.ensurePauseUi();
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
    this.hideReadyMenu();
    this.applyDifficulty();
    this.pipeManager?.startSpawn();
    this.bird?.startFly();
    this.setPauseButtonVisible(true);
    this.refreshPauseButtonLabel();
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

  /** Create a top-right pause control if the scene has no pauseBtn bound. */
  ensurePauseUi() {
    const canvas = this.node;
    if (!this.pauseBtn) {
      const btn = new Node('pauseBtn');
      btn.layer = canvas.layer;
      const ui = btn.addComponent(UITransform);
      ui.setContentSize(100, 48);
      btn.setPosition((getUITransform(canvas)?.width || 960) / 2 - 70, (getUITransform(canvas)?.height || 640) / 2 - 40, 0);
      const labelNode = new Node('label');
      labelNode.layer = canvas.layer;
      labelNode.addComponent(UITransform).setContentSize(100, 48);
      const label = labelNode.addComponent(Label);
      label.string = '暂停';
      label.fontSize = 28;
      label.color = Color.WHITE;
      label.overflow = Label.Overflow.SHRINK;
      btn.addChild(labelNode);
      canvas.addChild(btn);
      this.pauseBtn = btn;
      this.pauseBtnLabel = label;
    } else {
      this.pauseBtnLabel = this.pauseBtn.getComponentInChildren(Label);
    }

    this.pauseBtn.off(Node.EventType.TOUCH_END, this.onPauseButtonClick, this);
    this.pauseBtn.on(Node.EventType.TOUCH_END, this.onPauseButtonClick, this);
    // Keep pause clickable even when play input is off during overlay.
    this.pauseBtn.setSiblingIndex(canvas.children.length - 1);
    this.setPauseButtonVisible(false);

    if (!this.pauseOverlay) {
      const overlay = new Node('pauseOverlay');
      overlay.layer = canvas.layer;
      const oui = overlay.addComponent(UITransform);
      const cw = getUITransform(canvas)?.width || 960;
      const ch = getUITransform(canvas)?.height || 640;
      oui.setContentSize(cw, ch);
      overlay.setPosition(0, 0, 0);
      // Dim layer via UIOpacity only (no extra sprite dependency).
      const opacity = ensureUIOpacity(overlay);
      opacity.opacity = 140;
      overlay.addComponent(BlockInputEvents);
      const tip = new Node('pauseTip');
      tip.layer = canvas.layer;
      tip.addComponent(UITransform).setContentSize(320, 60);
      const tipLabel = tip.addComponent(Label);
      tipLabel.string = '已暂停\n点击右上角继续';
      tipLabel.fontSize = 32;
      tipLabel.color = Color.WHITE;
      tipLabel.lineHeight = 40;
      tipLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      tipLabel.verticalAlign = Label.VerticalAlign.CENTER;
      overlay.addChild(tip);
      overlay.active = false;
      canvas.addChild(overlay);
      this.pauseOverlay = overlay;
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
    // 前 8 分几乎不加压，之后缓慢变难
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
      backButtonNode.off(Node.EventType.TOUCH_END, this.backToStart, this);
      backButtonNode.on(Node.EventType.TOUCH_END, this.backToStart, this);
    }
    if (reviveButtonNode) {
      reviveButtonNode.off(Node.EventType.TOUCH_END, this.onReviveClick, this);
      reviveButtonNode.on(Node.EventType.TOUCH_END, this.onReviveClick, this);
    }
  }

  /** 失败弹层：全屏暗色遮罩 + 中央面板，盖住场上 START 图。 */
  ensureGameOverChrome() {
    const canvas = this.node;
    const cw = getUITransform(canvas)?.width || 960;
    const ch = getUITransform(canvas)?.height || 640;

    if (!this.gameOverBackdrop || !this.gameOverBackdrop.isValid) {
      const backdrop = new Node('gameOverBackdrop');
      backdrop.layer = canvas.layer;
      const ui = backdrop.addComponent(UITransform);
      ui.setContentSize(cw, ch);
      backdrop.setPosition(0, 0, 0);
      const g = backdrop.addComponent(Graphics);
      g.clear();
      g.fillColor = new Color(8, 16, 36, 220);
      g.rect(-cw / 2, -ch / 2, cw, ch);
      g.fill();
      backdrop.addComponent(BlockInputEvents);
      ensureUIOpacity(backdrop).opacity = 210;
      backdrop.active = false;
      canvas.addChild(backdrop);
      this.gameOverBackdrop = backdrop;
    } else {
      const ui = getUITransform(this.gameOverBackdrop);
      ui?.setContentSize(cw, ch);
    }

    if (!this.gameOverPanel || !this.gameOverPanel.isValid) {
      const panel = new Node('gameOverPanel');
      panel.layer = canvas.layer;
      const pui = panel.addComponent(UITransform);
      pui.setContentSize(420, 520);
      panel.setPosition(0, 10, 0);
      const g = panel.addComponent(Graphics);
      g.clear();
      g.fillColor = new Color(22, 36, 64, 245);
      g.roundRect(-210, -260, 420, 520, 18);
      g.fill();
      g.strokeColor = new Color(120, 160, 220, 180);
      g.lineWidth = 3;
      g.roundRect(-210, -260, 420, 520, 18);
      g.stroke();
      panel.active = false;
      canvas.addChild(panel);
      this.gameOverPanel = panel;
    }
  }

  ensureGameOverTitle(gameOverNode: Node) {
    // 场景里红色 GAME OVER 贴图/旧 Label 会和「游戏结束」叠在一起 → 关掉
    const oldSprite = gameOverNode.getComponent(Sprite);
    if (oldSprite) {
      oldSprite.enabled = false;
    }
    const oldLabel = gameOverNode.getComponent(Label);
    if (oldLabel) {
      oldLabel.enabled = false;
      oldLabel.string = '';
    }

    let title = gameOverNode.getChildByName('clearTitle');
    if (!title) {
      title = new Node('clearTitle');
      title.layer = gameOverNode.layer;
      title.addComponent(UITransform).setContentSize(320, 60);
      const label = title.addComponent(Label);
      label.string = '游戏结束';
      label.fontSize = 44;
      label.color = Color.WHITE;
      label.isBold = true;
      label.enableOutline = true;
      label.outlineColor = new Color(20, 24, 40, 220);
      label.outlineWidth = 3;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      gameOverNode.addChild(title);
    } else {
      const label = title.getComponent(Label);
      if (label) {
        label.string = '游戏结束';
        label.color = Color.WHITE;
        label.enableOutline = true;
        label.outlineColor = new Color(20, 24, 40, 220);
        label.outlineWidth = 3;
      }
    }
    title.setPosition(0, 0, 0);
    title.active = true;
    ensureUIOpacity(title).opacity = 255;
    title.setSiblingIndex(gameOverNode.children.length - 1);
  }

  /** 给结算板两行分数加「本局/最高」前缀，避免只显示两个相同数字。 */
  setScoreRow(node: Node | null | undefined, title: string, value: number) {
    if (!node) {
      return;
    }
    const label = node.getComponent(Label);
    if (!label) {
      return;
    }
    label.string = `${title}  ${value}`;
    label.fontSize = 30;
    label.color = Color.WHITE;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    getUITransform(node)?.setContentSize(200, 44);
    ensureUIOpacity(node).opacity = 255;
    node.active = true;
  }

  /** 实心色块按钮：盖住场景 START 图，并放大可点区域。 */
  styleActionButton(
    node: Node | null | undefined,
    w: number,
    h: number,
    text: string,
    fontSize: number,
    bgColor: Color,
  ) {
    if (!node) {
      return;
    }
    getUITransform(node)?.setContentSize(w, h);

    // 背景色块（Graphics），盖住原 START 贴图；必须在文字节点之下
    let bg = node.getChildByName('btnBg');
    if (!bg) {
      bg = new Node('btnBg');
      bg.layer = node.layer;
      bg.addComponent(UITransform).setContentSize(w, h);
      bg.setPosition(0, 0, 0);
      node.insertChild(bg, 0);
    }
    getUITransform(bg)?.setContentSize(w, h);
    let g = bg.getComponent(Graphics);
    if (!g) {
      g = bg.addComponent(Graphics);
    }
    g.clear();
    g.fillColor = bgColor;
    g.roundRect(-w / 2, -h / 2, w, h, 12);
    g.fill();
    ensureUIOpacity(bg).opacity = 255;
    bg.active = true;
    bg.setSiblingIndex(0);

    // 原 Sprite（START 图）直接关掉，避免盖住文案
    const sprite = node.getComponent(Sprite);
    if (sprite) {
      sprite.enabled = false;
      sprite.color = new Color(255, 255, 255, 0);
    }

    // 根节点 Label 会先于子节点绘制，文字会被 btnBg 盖住 → 关掉，改用顶层子 Label
    const rootLabel = node.getComponent(Label);
    if (rootLabel) {
      rootLabel.enabled = false;
      rootLabel.string = '';
    }

    let labelNode = node.getChildByName('btnLabel') || node.getChildByName('label');
    if (!labelNode) {
      labelNode = new Node('btnLabel');
      labelNode.layer = node.layer;
      labelNode.addComponent(UITransform).setContentSize(w - 16, h - 8);
      labelNode.setPosition(0, 0, 0);
      node.addChild(labelNode);
    } else {
      labelNode.name = 'btnLabel';
    }
    getUITransform(labelNode)?.setContentSize(w - 16, h - 8);
    labelNode.setPosition(0, 0, 0);

    let label = labelNode.getComponent(Label);
    if (!label) {
      label = labelNode.addComponent(Label);
    }
    label.enabled = true;
    label.string = text;
    label.fontSize = fontSize;
    // 白字 + 深色描边：灰/橙底都能看清（不是同色看不见）
    label.color = Color.WHITE;
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = new Color(20, 24, 40, 230);
    label.outlineWidth = 3;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.cacheMode = Label.CacheMode.NONE;
    ensureUIOpacity(labelNode).opacity = 255;
    labelNode.active = true;
    // 文字永远在色块之上
    labelNode.setSiblingIndex(node.children.length - 1);

    ensureUIOpacity(node).opacity = 255;
    node.active = true;
  }

  enlargeHitTarget(node: Node | null | undefined, w: number, h: number, text: string, fontSize: number) {
    this.styleActionButton(node, w, h, text, fontSize, new Color(70, 90, 130, 255));
  }

  backToStart() {
    director.loadScene('flappy_start');
  }

  onReviveClick() {
    if (this.revivedThisRun || !this.gameOverShown) {
      return;
    }
    this.enableInput(false);
    // 先播激励广告（预览/无 adUnit 时走模拟全屏广告，不再瞬间复活）
    AdManager.showRewarded().then((finished) => {
      if (!finished) {
        // 没看完：保持失败弹窗可见，可再点
        this.gameOverShown = true;
        if (this.gameOverMenu) {
          this.gameOverMenu.active = true;
          this.gameOverMenu.setSiblingIndex(this.node.children.length - 1);
        }
        if (this.gameOverBackdrop) {
          this.gameOverBackdrop.active = true;
          this.gameOverBackdrop.setSiblingIndex(this.node.children.length - 2);
        }
        if (this.gameOverPanel) {
          this.gameOverPanel.active = true;
          this.gameOverPanel.setSiblingIndex(this.node.children.length - 2);
        }
        const tips = this.gameOverMenu?.getChildByName('tipsLabel')?.getComponent(Label);
        if (tips) {
          tips.string = '未看完广告，无法复活';
        }
        return;
      }
      this.revivedThisRun = true;
      this.hideGameOverMenu();
      this.resumeGameAfterRevive();
    });
  }

  hideGameOverMenu() {
    if (!this.gameOverMenu || !this.scoreLabel) {
      return;
    }
    this.gameOverMenu.active = false;
    if (this.gameOverBackdrop) {
      this.gameOverBackdrop.active = false;
    }
    if (this.gameOverPanel) {
      this.gameOverPanel.active = false;
    }
    this.scoreLabel.node.active = true;
    ensureUIOpacity(this.scoreLabel.node).opacity = 255;
  }

  resumeGameAfterRevive() {
    // 先清标记：即便后续 early return，也不要卡住第二次失败弹窗
    this.gameOverShown = false;
    this.isPaused = false;
    if (this.gameOverMenu) {
      this.gameOverMenu.active = false;
    }
    if (this.gameOverBackdrop) {
      this.gameOverBackdrop.active = false;
    }
    if (this.gameOverPanel) {
      this.gameOverPanel.active = false;
    }

    const canvas = find('Canvas');
    if (!canvas || !this.bird || !this.ground) {
      return;
    }

    // 安全复活点：画布水平偏左、垂直居中偏上，避开地面与死亡点
    const canvasH = getUITransform(canvas)?.height || 640;
    const canvasW = getUITransform(canvas)?.width || 960;
    const safeX = -canvasW * 0.28;
    const groundTop =
      this.ground.position.y + (getUITransform(this.ground)?.height || 140) / 2;
    const safeY = Math.min(canvasH * 0.12, Math.max(groundTop + 140, 40));

    // 先清近处管子，再放鸟，避免复活瞬间重叠
    this.pipeManager?.resumeAfterRevive(safeX, 480);
    this.bird.node.setPosition(safeX, safeY);
    this.bird.revive();
    this.applyDifficulty();
    this.ground.getComponent(Scroller3x)?.startScroll();
    this.setPauseButtonVisible(true);
    this.refreshPauseButtonLabel();
    this.enableInput(true);
  }

  startGameOrJumpBird() {
    if (this.isPaused || this.gameOverShown) {
      return;
    }
    if (this.bird?.state === BirdState.Ready) {
      this.gameStart();
    } else {
      this.bird?.rise();
    }
  }

  enableInput(enable: boolean) {
    if (enable) {
      this.node.on(Node.EventType.TOUCH_START, this.startGameOrJumpBird, this);
      return;
    }
    this.node.off(Node.EventType.TOUCH_START, this.startGameOrJumpBird, this);
  }
}
