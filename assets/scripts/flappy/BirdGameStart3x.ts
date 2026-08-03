import { _decorator, Camera, Color, Component, director, find, Graphics, Label, Node, Sprite, tween, UIOpacity, UITransform } from 'cc';
import AdManager from './AdManager';
import { applyCuteYellowBird } from './CuteBirdArt';
import SkinManager from './SkinManager';
const { ccclass, property } = _decorator;

declare const wx: any;

/** 与 FbGame3x 共用：easy=当前难度，hard=更高难度 */
export const DIFFICULTY_STORAGE_KEY = 'flappy_difficulty_mode';
export type DifficultyMode = 'easy' | 'hard';

export function getDifficultyMode(): DifficultyMode {
  try {
    const v = localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    return v === 'hard' ? 'hard' : 'easy';
  } catch {
    return 'easy';
  }
}

export function setDifficultyMode(mode: DifficultyMode) {
  try {
    localStorage.setItem(DIFFICULTY_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

function ensureUIOpacity(node: Node) {
  let opacity = node.getComponent(UIOpacity);
  if (!opacity) {
    opacity = node.addComponent(UIOpacity);
  }
  return opacity;
}

function getOrSetSize(node: Node, w: number, h: number) {
  const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
  ui.setContentSize(w, h);
  return ui;
}

@ccclass('BirdGameStart3x')
export class BirdGameStart3x extends Component {
  @property(Node)
  maskLayer: Node | null = null;

  private easyModeBtn: Node | null = null;
  private hardModeBtn: Node | null = null;
  private shareBtn: Node | null = null;

  onLoad() {
    AdManager.init();
    this.fitPlayfieldToCanvas();
    // 开始页小鸟也换成统一可爱黄鸟
    applyCuteYellowBird(find('Canvas/bird'));
    if (this.maskLayer) {
      this.maskLayer.active = false;
      ensureUIOpacity(this.maskLayer).opacity = 0;
    }
    this.setupWechatShare();
    this.disableRankButton();
    this.setupModeButtons();
    this.setupShareButton();
    this.bindHomeButtons();
  }

  /** 竖屏铺满背景/地面（兼容旧包仍是 960x640 场景） */
  private fitPlayfieldToCanvas() {
    const canvas = find('Canvas');
    if (!canvas?.isValid) {
      return;
    }
    const cui = canvas.getComponent(UITransform) || canvas.addComponent(UITransform);
    let w = cui.width || 720;
    let h = cui.height || 1560;
    if (h < w * 1.15) {
      w = 720;
      h = 1560;
      cui.setContentSize(w, h);
    }
    const cam = canvas.getChildByName('Camera')?.getComponent(Camera);
    if (cam) {
      cam.orthoHeight = h / 2;
    }
    const bg = canvas.getChildByName('background');
    if (bg?.isValid) {
      getOrSetSize(bg, w, h);
      bg.setPosition(0, 0, 0);
      const sp = bg.getComponent(Sprite);
      if (sp) {
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.enabled = true;
      }
    }
    const groundH = Math.max(170, Math.min(220, h * 0.13));
    const groundY = -h / 2 + groundH / 2;
    for (const name of ['ground', 'groundLong'] as const) {
      const g = canvas.getChildByName(name);
      if (!g?.isValid) {
        continue;
      }
      getOrSetSize(g, w, groundH);
      g.setPosition(name === 'groundLong' ? w : 0, groundY, 0);
    }
    const title = canvas.getChildByName('title');
    if (title?.isValid) {
      title.setPosition(0, h / 2 - 280, 0);
    }
    const mask = canvas.getChildByName('maskLayer');
    if (mask?.isValid) {
      getOrSetSize(mask, w, h);
    }
  }

  /** 暂不需要排行：隐藏并解绑 */
  private disableRankButton() {
    const canvas = find('Canvas');
    const rank = canvas?.getChildByName('rankBtn');
    if (!rank) {
      return;
    }
    rank.active = false;
    rank.off(Node.EventType.TOUCH_END);
    rank.off(Node.EventType.TOUCH_START);
  }

  /**
   * 用运行时按钮替代单一「开始」：
   * - 简单模式（当前难度）
   * - 困难模式（更高难度）
   * 原 startBtn 隐藏，避免重复入口。
   */
  private setupModeButtons() {
    const canvas = find('Canvas');
    if (!canvas) {
      return;
    }

    const oldStart = canvas.getChildByName('startBtn');
    if (oldStart) {
      oldStart.active = false;
      oldStart.off(Node.EventType.TOUCH_END);
    }

    // 竖屏：按钮整体下移，贴近中下区域
    this.easyModeBtn = this.createModeButton(canvas, 'easyModeBtn', '简单模式', 0, -40, new Color(76, 175, 80, 255));
    this.hardModeBtn = this.createModeButton(canvas, 'hardModeBtn', '困难模式', 0, -140, new Color(244, 81, 30, 255));

    this.easyModeBtn.off(Node.EventType.TOUCH_END);
    this.easyModeBtn.on(Node.EventType.TOUCH_END, () => this.startWithMode('easy'), this);
    this.hardModeBtn.off(Node.EventType.TOUCH_END);
    this.hardModeBtn.on(Node.EventType.TOUCH_END, () => this.startWithMode('hard'), this);

    this.refreshModeButtonStyles();
  }

  /** 保留场景原始 shareBtn（含 Button + clickEvents），只改外观与位置，避免破坏微信同步点击手势 */
  private setupShareButton() {
    const canvas = find('Canvas');
    if (!canvas) {
      return;
    }

    const share = canvas.getChildByName('shareBtn');
    // 清理改版时临时新建的 shareActionBtn，避免叠两个按钮抢点击
    const orphan = canvas.getChildByName('shareActionBtn');
    if (orphan?.isValid && orphan !== share) {
      orphan.active = false;
      orphan.off(Node.EventType.TOUCH_END);
      orphan.off(Node.EventType.TOUCH_START);
    }
    if (!share?.isValid) {
      // 极端兜底：没有场景按钮才新建
      this.shareBtn = this.createShareButton(canvas, 'shareActionBtn', 0, -250);
    } else {
      this.shareBtn = share;
      share.active = true;
      // 与简单/困难同尺寸、居中放到下方（竖屏）
      this.restyleExistingShareButton(share, 0, -250);
    }

    // 关键：wx.shareAppMessage 必须在用户点击的同步回调里调用
    // 同时绑 Button.click / TOUCH_END / TOUCH_START，避免被改版 UI 吃掉
    this.bindShareHandlers(this.shareBtn);
  }

  private restyleExistingShareButton(btn: Node, x: number, y: number) {
    const w = 280;
    const h = 78;
    getOrSetSize(btn, w, h);
    btn.setPosition(x, y, 0);
    btn.setSiblingIndex(btn.parent ? btn.parent.children.length - 1 : 0);

    // 关掉根 Label 旧「分享」字（避免叠字），用子节点统一画
    const rootLabel = btn.getComponent(Label);
    if (rootLabel) {
      rootLabel.enabled = false;
      rootLabel.string = '';
    }
    const rootSprite = btn.getComponent(Sprite);
    if (rootSprite) {
      rootSprite.enabled = false;
    }

    let gNode = btn.getChildByName('btnBg');
    if (!gNode) {
      gNode = new Node('btnBg');
      gNode.layer = btn.layer;
      gNode.addComponent(UITransform).setContentSize(w, h);
      btn.addChild(gNode);
      gNode.setSiblingIndex(0);
    }
    getOrSetSize(gNode, w, h);
    gNode.setPosition(0, 0, 0);
    let g = gNode.getComponent(Graphics);
    if (!g) {
      g = gNode.addComponent(Graphics);
    }
    g.clear();
    g.fillColor = new Color(7, 193, 96, 255);
    g.roundRect(-w / 2, -h / 2, w, h, 14);
    g.fill();
    g.strokeColor = new Color(255, 255, 255, 160);
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, 14);
    g.stroke();

    let icon = btn.getChildByName('shareIcon');
    if (!icon) {
      icon = new Node('shareIcon');
      icon.layer = btn.layer;
      icon.addComponent(UITransform).setContentSize(36, 36);
      btn.addChild(icon);
    }
    icon.setPosition(-88, 0, 0);
    let ig = icon.getComponent(Graphics);
    if (!ig) {
      ig = icon.addComponent(Graphics);
    }
    this.drawShareIcon(ig);

    let labelNode = btn.getChildByName('btnLabel');
    if (!labelNode) {
      labelNode = new Node('btnLabel');
      labelNode.layer = btn.layer;
      labelNode.addComponent(UITransform).setContentSize(200, h);
      btn.addChild(labelNode);
    }
    getOrSetSize(labelNode, 200, h);
    labelNode.setPosition(12, 0, 0);
    labelNode.setSiblingIndex(btn.children.length - 1);
    let label = labelNode.getComponent(Label);
    if (!label) {
      label = labelNode.addComponent(Label);
    }
    label.enabled = true;
    label.string = '分享给好友';
    label.fontSize = 32;
    label.isBold = true;
    label.color = Color.WHITE;
    label.enableOutline = true;
    label.outlineColor = new Color(0, 90, 40, 200);
    label.outlineWidth = 3;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    label.verticalAlign = Label.VerticalAlign.CENTER;

    // 保持 Button 可点
    const button = btn.getComponent('cc.Button') as any;
    if (button) {
      button.interactable = true;
      button.enabled = true;
    }
    ensureUIOpacity(btn).opacity = 255;
  }

  private bindShareHandlers(btn: Node | null) {
    if (!btn?.isValid) {
      return;
    }
    // 清掉旧 TOUCH，重新绑同步 shareGame
    btn.off(Node.EventType.TOUCH_END);
    btn.off(Node.EventType.TOUCH_START);
    // 用普通 function，保证 this 与同步调用栈
    const onShare = () => {
      this.shareGame();
    };
    btn.on(Node.EventType.TOUCH_END, onShare, this);
    // 部分安卓机型 TOUCH_END 不稳定，START 也试一次（shareAppMessage 同一次手势内多次调用通常只出一次面板）
    btn.on(Node.EventType.TOUCH_START, onShare, this);

    // 场景 Button.clickEvents 可能仍指向 shareGame；确保 interactable
    const button = btn.getComponent('cc.Button') as any;
    if (button) {
      button.interactable = true;
    }
  }

  private createShareButton(parent: Node, name: string, x: number, y: number) {
    // 与简单/困难同尺寸：280 x 78
    const w = 280;
    const h = 78;
    let btn = parent.getChildByName(name);
    if (!btn) {
      btn = new Node(name);
      btn.layer = parent.layer;
      btn.addComponent(UITransform).setContentSize(w, h);
      parent.addChild(btn);

      const gNode = new Node('btnBg');
      gNode.layer = parent.layer;
      gNode.addComponent(UITransform).setContentSize(w, h);
      const g = gNode.addComponent(Graphics);
      // 微信绿
      g.fillColor = new Color(7, 193, 96, 255);
      g.roundRect(-w / 2, -h / 2, w, h, 14);
      g.fill();
      g.strokeColor = new Color(255, 255, 255, 160);
      g.lineWidth = 2;
      g.roundRect(-w / 2, -h / 2, w, h, 14);
      g.stroke();
      btn.addChild(gNode);

      // 左侧小分享图标
      const icon = new Node('shareIcon');
      icon.layer = parent.layer;
      icon.addComponent(UITransform).setContentSize(36, 36);
      icon.setPosition(-88, 0, 0);
      const ig = icon.addComponent(Graphics);
      this.drawShareIcon(ig);
      btn.addChild(icon);

      const labelNode = new Node('btnLabel');
      labelNode.layer = parent.layer;
      labelNode.addComponent(UITransform).setContentSize(200, h);
      labelNode.setPosition(12, 0, 0);
      const label = labelNode.addComponent(Label);
      label.string = '分享给好友';
      label.fontSize = 32;
      label.isBold = true;
      label.color = Color.WHITE;
      label.enableOutline = true;
      label.outlineColor = new Color(0, 90, 40, 200);
      label.outlineWidth = 3;
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      btn.addChild(labelNode);
    } else {
      // 已存在时也强制对齐尺寸（避免旧 240x70 残留）
      getOrSetSize(btn, w, h);
      const gNode = btn.getChildByName('btnBg');
      if (gNode) {
        getOrSetSize(gNode, w, h);
        const g = gNode.getComponent(Graphics);
        if (g) {
          g.clear();
          g.fillColor = new Color(7, 193, 96, 255);
          g.roundRect(-w / 2, -h / 2, w, h, 14);
          g.fill();
          g.strokeColor = new Color(255, 255, 255, 160);
          g.lineWidth = 2;
          g.roundRect(-w / 2, -h / 2, w, h, 14);
          g.stroke();
        }
      }
      const icon = btn.getChildByName('shareIcon');
      if (icon) {
        icon.setPosition(-88, 0, 0);
      }
      const labelNode = btn.getChildByName('btnLabel');
      if (labelNode) {
        getOrSetSize(labelNode, 200, h);
        labelNode.setPosition(12, 0, 0);
        const label = labelNode.getComponent(Label);
        if (label) {
          label.fontSize = 32;
          label.string = '分享给好友';
        }
      }
    }

    btn.setPosition(x, y, 0);
    btn.active = true;
    btn.setSiblingIndex(parent.children.length - 1);
    ensureUIOpacity(btn).opacity = 255;
    return btn;
  }

  /** 简洁「分享」小图标：圆点网络 + 外指箭头 */
  private drawShareIcon(g: Graphics) {
    g.clear();
    const white = new Color(255, 255, 255, 255);
    g.strokeColor = white;
    g.fillColor = white;
    g.lineWidth = 2.5;

    // 三个节点（分享网络）
    const nodes = [
      { x: -6, y: 8 },
      { x: -6, y: -8 },
      { x: 8, y: 0 },
    ];
    // 连线
    g.moveTo(nodes[0].x, nodes[0].y);
    g.lineTo(nodes[2].x, nodes[2].y);
    g.moveTo(nodes[1].x, nodes[1].y);
    g.lineTo(nodes[2].x, nodes[2].y);
    g.stroke();
    // 圆点
    for (const n of nodes) {
      g.circle(n.x, n.y, 3.2);
      g.fill();
    }
  }

  private createModeButton(parent: Node, name: string, text: string, x: number, y: number, bg: Color) {
    let btn = parent.getChildByName(name);
    if (!btn) {
      btn = new Node(name);
      btn.layer = parent.layer;
      btn.addComponent(UITransform).setContentSize(280, 78);
      parent.addChild(btn);

      const gNode = new Node('btnBg');
      gNode.layer = parent.layer;
      gNode.addComponent(UITransform).setContentSize(280, 78);
      const g = gNode.addComponent(Graphics);
      g.fillColor = bg;
      g.roundRect(-140, -39, 280, 78, 14);
      g.fill();
      btn.addChild(gNode);

      const labelNode = new Node('btnLabel');
      labelNode.layer = parent.layer;
      labelNode.addComponent(UITransform).setContentSize(280, 78);
      const label = labelNode.addComponent(Label);
      label.string = text;
      label.fontSize = 32;
      label.isBold = true;
      label.color = Color.WHITE;
      label.enableOutline = true;
      label.outlineColor = new Color(20, 24, 40, 220);
      label.outlineWidth = 3;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      btn.addChild(labelNode);
    }
    btn.setPosition(x, y, 0);
    btn.active = true;
    btn.setSiblingIndex(parent.children.length - 1);
    ensureUIOpacity(btn).opacity = 255;
    return btn;
  }

  private refreshModeButtonStyles() {
    const mode = getDifficultyMode();
    this.tintModeButton(this.easyModeBtn, mode === 'easy', new Color(76, 175, 80, 255));
    this.tintModeButton(this.hardModeBtn, mode === 'hard', new Color(244, 81, 30, 255));
  }

  private tintModeButton(btn: Node | null, selected: boolean, base: Color) {
    if (!btn) {
      return;
    }
    const g = btn.getChildByName('btnBg')?.getComponent(Graphics);
    if (!g) {
      return;
    }
    const c = selected
      ? base
      : new Color(Math.floor(base.r * 0.55), Math.floor(base.g * 0.55), Math.floor(base.b * 0.55), 220);
    g.clear();
    g.fillColor = c;
    g.roundRect(-140, -39, 280, 78, 14);
    g.fill();
    if (selected) {
      g.strokeColor = new Color(255, 255, 255, 200);
      g.lineWidth = 3;
      g.roundRect(-140, -39, 280, 78, 14);
      g.stroke();
    }
  }

  startWithMode(mode: DifficultyMode) {
    setDifficultyMode(mode);
    this.refreshModeButtonStyles();
    this.startGame();
  }

  /** 微信分享菜单 + 右上角转发文案 */
  private setupWechatShare() {
    if (typeof wx === 'undefined') {
      return;
    }
    try {
      // 先开基础分享菜单；menus 字段在部分基础库会报错，失败再降级
      if (wx.showShareMenu) {
        try {
          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage', 'shareTimeline'],
          });
        } catch {
          wx.showShareMenu({ withShareTicket: true });
        }
      }
    } catch (e) {
      console.warn('[Flappy] showShareMenu fail', e);
    }
    try {
      if (wx.onShareAppMessage) {
        wx.onShareAppMessage(() => this.getSharePayload());
      }
    } catch (e) {
      console.warn('[Flappy] onShareAppMessage fail', e);
    }
    try {
      if (wx.onShareTimeline) {
        wx.onShareTimeline(() => {
          const p = this.getSharePayload();
          return { title: p.title, query: p.query };
        });
      }
    } catch {
      // 开发者工具/旧库可能无朋友圈分享
    }
  }

  private getSharePayload() {
    // 不要传空 imageUrl：部分端会异常；省略则用默认截图
    return {
      title: '我在玩「欢乐躲避」，超上头！你也来试试',
      query: 'from=share_home',
    };
  }

  /** Button 的 clickEvents 在部分预览下不稳，再绑一层 TOUCH */
  private bindHomeButtons() {
    const canvas = find('Canvas');
    if (!canvas) {
      return;
    }
    const share = canvas.getChildByName('shareBtn') || canvas.getChildByName('shareActionBtn');
    this.bindShareHandlers(share);
  }

  private fadeMaskThen(loadSceneName: string) {
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

  startGame() {
    director.preloadScene('bird_game');
    this.fadeMaskThen('bird_game');
  }

  shareGame() {
    // 必须在点击同步栈里调起；不要先 await / setTimeout
    if (typeof wx === 'undefined' || !wx.shareAppMessage) {
      console.log('[Flappy] share payload', this.getSharePayload());
      this.previewToast('预览环境无法调起微信分享\n请用手机扫码预览');
      return;
    }
    try {
      const payload = this.getSharePayload();
      wx.shareAppMessage(payload);
    } catch (e) {
      console.error('[Flappy] shareAppMessage error', e);
      if (wx.showToast) {
        wx.showToast({ title: '分享调起失败', icon: 'none' });
      }
    }
  }

  /** 非微信预览用的简单提示 */
  private previewToast(msg: string) {
    const canvas = find('Canvas');
    if (!canvas) {
      console.log('[Flappy]', msg);
      return;
    }
    let tip = canvas.getChildByName('previewToast');
    if (!tip) {
      tip = new Node('previewToast');
      tip.layer = canvas.layer;
      tip.addComponent(UITransform).setContentSize(520, 80);
      tip.setPosition(0, 0, 0);
      const label = tip.addComponent(Label);
      label.fontSize = 28;
      label.color = Color.WHITE;
      label.enableOutline = true;
      label.outlineColor = new Color(0, 0, 0, 200);
      label.outlineWidth = 3;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      canvas.addChild(tip);
    }
    tip.setSiblingIndex(canvas.children.length - 1);
    tip.active = true;
    const label = tip.getComponent(Label)!;
    label.string = msg;
    ensureUIOpacity(tip).opacity = 255;
    tween(ensureUIOpacity(tip))
      .delay(1.6)
      .to(0.25, { opacity: 0 })
      .call(() => {
        if (tip?.isValid) {
          tip.active = false;
        }
      })
      .start();
  }

  trialSkin(_event?: Event, skinId?: string) {
    if (!skinId) {
      return;
    }
    AdManager.showRewarded().then((finished) => {
      if (!finished) {
        return;
      }
      SkinManager.startTrial(skinId, 3);
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '试用 3 局已开启', icon: 'none' });
      }
    });
  }

  backGameList() {
    this.fadeMaskThen('flappy_start');
  }
}
