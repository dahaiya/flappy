import { BlockInputEvents, Color, Graphics, Label, Node, UIOpacity, UITransform, find } from 'cc';
import { gameAudio } from './GameAudio';

const K_SOUND = 'flappy_sound_on';
const K_VIBRATE = 'flappy_vibrate_on';
const K_BGM = 'flappy_bgm_on';
const K_BG_VOL = 'flappy_bg_volume';
const K_SFX_VOL = 'flappy_sfx_volume';

const DEFAULTS = { sound: true, vibrate: true, bgm: true, bgVol: 0.5, sfxVol: 0.6 };

const BG_GREEN = new Color(46, 204, 113, 255);
const BG_GREY = new Color(120, 130, 145, 255);
const PANEL = new Color(28, 33, 48, 245);
const RAIL = new Color(60, 66, 84, 255);

/**
 * 设置单例：开关（背景音乐 / 音效 / 震动）+ 音量，localStorage 持久化。
 * 右上角齿轮入口，点开面板可逐项开关。
 *
 * 行为契约（与需求对齐）：
 * - 背景音乐开关：关 = 游戏中无背景音乐（BGM 不受「音效」开关影响）。
 * - 音效开关：关 = 游戏中拍翅/过柱/碰撞都不发声。
 * - 震动开关：关 = 过柱子时不震动；开 = 过柱子时震动一次。
 */
export class SettingsManager {
  static instance: SettingsManager | null = null;

  soundOn = DEFAULTS.sound;
  vibrateOn = DEFAULTS.vibrate;
  bgmOn = DEFAULTS.bgm;
  bgVolume = DEFAULTS.bgVol;
  sfxVolume = DEFAULTS.sfxVol;

  private gearBtn: Node | null = null;
  private panel: Node | null = null;
  private backdrop: Node | null = null;
  private bgSwitch: Node | null = null;
  private sfxSwitch: Node | null = null;
  private vibSwitch: Node | null = null;
  private bgVolRow: Node | null = null;
  private sfxVolRow: Node | null = null;
  private opened = false;

  constructor() {
    SettingsManager.instance = this;
  }

  // ---------- 持久化 ----------

  private read(key: string, def: boolean): boolean {
    try {
      const v = localStorage.getItem(key);
      if (v === null) {
        return def;
      }
      return v !== '0';
    } catch {
      return def;
    }
  }

  private readVol(key: string, def: number): number {
    try {
      const v = parseFloat(localStorage.getItem(key) || '');
      return Number.isNaN(v) ? def : Math.min(1, Math.max(0, v));
    } catch {
      return def;
    }
  }

  init() {
    this.soundOn = this.read(K_SOUND, DEFAULTS.sound);
    this.vibrateOn = this.read(K_VIBRATE, DEFAULTS.vibrate);
    this.bgmOn = this.read(K_BGM, DEFAULTS.bgm);
    this.bgVolume = this.readVol(K_BG_VOL, DEFAULTS.bgVol);
    this.sfxVolume = this.readVol(K_SFX_VOL, DEFAULTS.sfxVol);
    gameAudio.setVolumes(this.bgVolume, this.sfxVolume);
  }

  private saveBool(key: string, on: boolean) {
    try {
      localStorage.setItem(key, on ? '1' : '0');
    } catch {
      // ignore
    }
  }

  private saveVol(key: string, v: number) {
    try {
      localStorage.setItem(key, String(v));
    } catch {
      // ignore
    }
  }

  // ---------- 运行时切换 ----------

  setSound(on: boolean) {
    this.soundOn = on;
    this.saveBool(K_SOUND, on);
  }

  setVibrate(on: boolean) {
    this.vibrateOn = on;
    this.saveBool(K_VIBRATE, on);
  }

  setBgm(on: boolean) {
    this.bgmOn = on;
    this.saveBool(K_BGM, on);
    gameAudio.setBgmEnabled(on);
  }

  setBgVolume(v: number) {
    this.bgVolume = v;
    this.saveVol(K_BG_VOL, v);
    gameAudio.setVolumes(v, this.sfxVolume);
  }

  setSfxVolume(v: number) {
    this.sfxVolume = v;
    this.saveVol(K_SFX_VOL, v);
    gameAudio.setVolumes(this.bgVolume, v);
  }

  // ---------- 入口 UI ----------

  /** 右上角齿轮按钮（开始页与游戏页通用）。 */
  ensureGear() {
    const canvas = find('Canvas');
    if (!canvas) {
      return;
    }
    const cui = canvas.getComponent(UITransform) || canvas.addComponent(UITransform);
    const w = cui.width || 720;
    const h = cui.height || 1560;
    if (!this.gearBtn || !this.gearBtn.isValid) {
      const btn = this.createButton(canvas, 'settingsGear', 78, w / 2 - 70, h / 2 - 84);
      btn.off(Node.EventType.TOUCH_END);
      btn.on(Node.EventType.TOUCH_END, () => this.togglePanel(), this);
      this.gearBtn = btn;
    } else {
      this.gearBtn.setPosition(w / 2 - 70, h / 2 - 84, 0);
      this.gearBtn.setSiblingIndex(canvas.children.length - 1);
    }
  }

  /** 首次用户手势时调用：初始化设置 + 解锁音频 + 同步背景音乐开关。 */
  onFirstGesture() {
    if (!SettingsManager.instance || !this.panelBuilt) {
      // no-op; init() already called
    }
    gameAudio.unlock();
    gameAudio.setBgmEnabled(this.bgmOn);
  }

  togglePanel() {
    if (!this.panel) {
      this.buildPanel();
    }
    if (!this.panel) {
      return;
    }
    this.refresh();
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  private open() {
    this.opened = true;
    if (this.backdrop) {
      this.backdrop.active = true;
      ensureUIOpacity(this.backdrop).opacity = 255;
    }
    if (this.panel) {
      this.panel.active = true;
      this.panel.setSiblingIndex(this.panel.parent ? this.panel.parent.children.length - 1 : 0);
    }
  }

  private close() {
    this.opened = false;
    if (this.backdrop) {
      this.backdrop.active = false;
    }
    if (this.panel) {
      this.panel.active = false;
    }
  }

  // ---------- 面板 ----------

  private panelBuilt = false;

  private buildPanel() {
    const canvas = find('Canvas');
    if (!canvas) {
      return;
    }
    if (this.panel && this.panel.isValid) {
      return;
    }

    const bd = new Node('settingsBackdrop');
    bd.layer = canvas.layer;
    bd.addComponent(UITransform).setContentSize(2000, 2000);
    bd.addComponent(BlockInputEvents);
    const bg = bd.addComponent(Graphics);
    bg.fillColor = new Color(0, 0, 0, 150);
    bg.rect(-1000, -1000, 2000, 2000);
    bg.fill();
    bd.on(Node.EventType.TOUCH_END, () => this.close(), this);
    bd.setSiblingIndex(canvas.children.length - 1);
    this.backdrop = bd;

    const panel = new Node('settingsPanel');
    panel.layer = canvas.layer;
    const pw = 460;
    const ph = 420;
    panel.addComponent(UITransform).setContentSize(pw, ph);
    panel.addComponent(BlockInputEvents);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = PANEL;
    pg.roundRect(-pw / 2, -ph / 2, pw, ph, 24);
    pg.fill();
    pg.strokeColor = new Color(255, 255, 255, 90);
    pg.lineWidth = 2;
    pg.roundRect(-pw / 2, -ph / 2, pw, ph, 24);
    pg.stroke();
    canvas.addChild(panel);

    // 标题
    const title = this.makeLabel(panel, canvas.layer, '设置', 40, 0, 105, new Color(255, 255, 255, 255));
    title.getComponent(Label)!.isBold = true;
    title.getComponent(Label)!.enableOutline = true;
    title.getComponent(Label)!.outlineColor = new Color(10, 14, 24, 200);
    title.getComponent(Label)!.outlineWidth = 3;

    // 关闭按钮
    const closeBtn = this.createTextButton(panel, 'closeX', 26, pw / 2 - 56, ph / 2 - 44, '关闭', new Color(230, 90, 90, 230));
    closeBtn.off(Node.EventType.TOUCH_END);
    closeBtn.on(Node.EventType.TOUCH_END, () => this.close(), this);

    // 三项开关
    const rows: Array<{ key: 'bg' | 'sfx' | 'vib'; label: string; sub: string; on: boolean }> = [
      { key: 'bg', label: '背景音乐', sub: '游戏中持续播放', on: this.bgmOn },
      { key: 'sfx', label: '音效', sub: '拍翅 / 过柱子 / 碰撞', on: this.soundOn },
      { key: 'vib', label: '震动', sub: '过柱子时震一下', on: this.vibrateOn },
    ];
    rows.forEach((row, i) => {
      const y = 150 - i * 100;
      const label = this.makeLabel(panel, canvas.layer, row.label, 32, -pw / 2 + 110, y, new Color(245, 245, 245, 255));
      label.getComponent(Label)!.horizontalAlign = Label.HorizontalAlign.LEFT;
      const sub = this.makeLabel(panel, canvas.layer, row.sub, 20, -pw / 2 + 110, y - 26, new Color(170, 180, 200, 255));
      sub.getComponent(Label)!.horizontalAlign = Label.HorizontalAlign.LEFT;
      const sw = this.createSwitch(canvas.layer, pw / 2 - 80, y, 120, 58, row.on);
      panel.addChild(sw);
      if (row.key === 'bg') {
        this.bgSwitch = sw;
      } else if (row.key === 'sfx') {
        this.sfxSwitch = sw;
      } else {
        this.vibSwitch = sw;
      }
      sw.off(Node.EventType.TOUCH_END);
      sw.on(Node.EventType.TOUCH_END, () => this.onToggleSwitch(row.key), this);
    });

    // 音量条
    const volRows: Array<{ key: 'bg' | 'sfx'; label: string; v: number }> = [
      { key: 'bg', label: '音乐音量', v: this.bgVolume },
      { key: 'sfx', label: '音效音量', v: this.sfxVolume },
    ];
    volRows.forEach((r, i) => {
      const y = -170 - i * 56;
      const label = this.makeLabel(panel, canvas.layer, r.label, 26, -pw / 2 + 110, y, new Color(210, 215, 230, 255));
      label.getComponent(Label)!.horizontalAlign = Label.HorizontalAlign.LEFT;
      const slider = this.createSlider(canvas.layer, pw / 2 - 70, y, 200, 18, r.v);
      panel.addChild(slider);
      if (r.key === 'bg') {
        this.bgVolRow = slider;
      } else {
        this.sfxVolRow = slider;
      }
      slider.off(Node.EventType.TOUCH_END);
      slider.on(Node.EventType.TOUCH_END, (e: any) => {
        this.onSlider(r.key, this.sliderValueFromEvent(e));
      }, this);
    });

    this.panel = panel;
    this.panelBuilt = true;
    this.panel.active = false;
  }

  private onToggleSwitch(key: 'bg' | 'sfx' | 'vib') {
    if (key === 'bg') {
      this.setBgm(!this.bgmOn);
    } else if (key === 'sfx') {
      this.setSound(!this.soundOn);
    } else {
      this.setVibrate(!this.vibrateOn);
    }
    this.refresh();
  }

  private sliderValueFromEvent(e: any): number {
    const x = e?.getUILocation ? e.getUILocation().x : 0;
    const ui = this.panel?.getComponent(UITransform);
    const pw = ui?.width || 460;
    const w = 200;
    const left = -pw / 2 + 70;
    const v = (x - left) / w;
    return Math.min(1, Math.max(0, v));
  }

  private onSlider(key: 'bg' | 'sfx', v: number) {
    if (key === 'bg') {
      this.setBgVolume(v);
    } else {
      this.setSfxVolume(v);
    }
    this.refresh();
  }

  private refresh() {
    if (this.bgSwitch) drawSwitch(this.bgSwitch, this.bgmOn);
    if (this.sfxSwitch) drawSwitch(this.sfxSwitch, this.soundOn);
    if (this.vibSwitch) drawSwitch(this.vibSwitch, this.vibrateOn);
    drawSlider(this.bgVolRow, this.bgVolume);
    drawSlider(this.sfxVolRow, this.sfxVolume);
  }

  // ---------- UI 构造助手 ----------

  private createButton(parent: Node, name: string, size: number, x: number, y: number): Node {
    let btn = parent.getChildByName(name);
    if (!btn) {
      btn = new Node(name);
      btn.layer = parent.layer;
      btn.addComponent(UITransform).setContentSize(size, size);
      // 阻断穿透：点齿轮不要触发底层 Canvas 的拍翅/开局
      btn.addComponent(BlockInputEvents);
      parent.addChild(btn);
      const gNode = new Node('btnBg');
      gNode.layer = btn.layer;
      gNode.addComponent(UITransform).setContentSize(size, size);
      const g = gNode.addComponent(Graphics);
      g.fillColor = new Color(30, 36, 52, 200);
      g.circle(0, 0, size / 2);
      g.fill();
      g.strokeColor = new Color(255, 255, 255, 140);
      g.lineWidth = 2;
      g.circle(0, 0, size / 2);
      g.stroke();
      btn.addChild(gNode);
      const icon = new Node('icon');
      icon.layer = btn.layer;
      icon.addComponent(UITransform).setContentSize(40, 40);
      btn.addChild(icon);
      drawGear(icon.addComponent(Graphics));
    }
    btn.setPosition(x, y, 0);
    btn.active = true;
    ensureUIOpacity(btn).opacity = 255;
    return btn;
  }

  private createTextButton(parent: Node, name: string, size: number, x: number, y: number, text: string, bg: Color): Node {
    const w = size * text.length + 30;
    const h = size + 16;
    const btn = new Node(name);
    btn.layer = parent.layer;
    btn.addComponent(UITransform).setContentSize(w, h);
    const gNode = new Node('btnBg');
    gNode.layer = btn.layer;
    gNode.addComponent(UITransform).setContentSize(w, h);
    const g = gNode.addComponent(Graphics);
    g.fillColor = bg;
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    btn.addChild(gNode);
    const lbl = new Node('btnLabel');
    lbl.layer = btn.layer;
    lbl.addComponent(UITransform).setContentSize(w, h);
    const l = lbl.addComponent(Label);
    l.string = text;
    l.fontSize = size;
    l.color = Color.WHITE;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    btn.addChild(lbl);
    btn.setPosition(x, y, 0);
    parent.addChild(btn);
    return btn;
  }

  private makeLabel(parent: Node, layer: number, text: string, fontSize: number, x: number, y: number, color: Color): Node {
    const node = new Node('label');
    node.layer = layer;
    node.addComponent(UITransform).setContentSize(500, 60);
    const l = node.addComponent(Label);
    l.string = text;
    l.fontSize = fontSize;
    l.color = color || Color.WHITE;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    node.setPosition(x, y, 0);
    parent.addChild(node);
    return node;
  }

  private createSwitch(layer: number, x: number, y: number, w: number, h: number, on: boolean): Node {
    const node = new Node('switch');
    node.layer = layer;
    node.addComponent(UITransform).setContentSize(w, h);
    node.addComponent(Graphics);
    node.setPosition(x, y, 0);
    drawSwitch(node, on);
    return node;
  }

  private createSlider(layer: number, x: number, y: number, w: number, h: number, v: number): Node {
    const node = new Node('slider');
    node.layer = layer;
    node.addComponent(UITransform).setContentSize(w, h);
    node.addComponent(Graphics);
    node.setPosition(x, y, 0);
    drawSlider(node, v);
    return node;
  }
}

// ----------------- 模块级助手 -----------------

function ensureUIOpacity(node: Node) {
  return node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
}

function drawSwitch(node: Node, on: boolean) {
  const ui = node.getComponent(UITransform);
  if (!ui) return;
  const w = ui.width;
  const h = ui.height;
  const g = node.getComponent(Graphics);
  if (!g) return;
  g.clear();
  g.fillColor = on ? BG_GREEN : BG_GREY;
  g.roundRect(-w / 2, -h / 2, w, h, h / 2);
  g.fill();
  g.strokeColor = new Color(255, 255, 255, 120);
  g.lineWidth = 1.5;
  g.roundRect(-w / 2, -h / 2, w, h, h / 2);
  g.stroke();
  const r = h / 2 - 6;
  const knobX = on ? w / 2 - h / 2 : -w / 2 + h / 2;
  g.fillColor = Color.WHITE;
  g.circle(knobX, 0, r);
  g.fill();
  g.strokeColor = new Color(0, 0, 0, 40);
  g.lineWidth = 1;
  g.circle(knobX, 0, r);
  g.stroke();
}

function drawSlider(node: Node | null, v: number) {
  if (!node) return;
  const ui = node.getComponent(UITransform);
  if (!ui) return;
  const w = ui.width;
  const h = ui.height;
  const g = node.getComponent(Graphics);
  if (!g) return;
  g.clear();
  g.fillColor = RAIL;
  g.roundRect(-w / 2, -h / 2, w, h, h / 2);
  g.fill();
  g.fillColor = BG_GREEN;
  g.roundRect(-w / 2, -h / 2, Math.max(1, w * v), h, h / 2);
  g.fill();
  const r = h / 2;
  g.fillColor = Color.WHITE;
  g.circle(-w / 2 + w * v, 0, r + 2);
  g.fill();
  g.strokeColor = new Color(0, 0, 0, 50);
  g.lineWidth = 1;
  g.circle(-w / 2 + w * v, 0, r + 2);
  g.stroke();
}

/** 简洁齿轮图标。 */
function drawGear(g: Graphics) {
  g.clear();
  const teeth = 8;
  const outer = 18;
  const inner = 13;
  g.fillColor = new Color(255, 255, 255, 255);
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    g.circle(Math.cos(a) * outer, Math.sin(a) * outer, 4);
    g.fill();
  }
  g.circle(0, 0, inner);
  g.fill();
  g.strokeColor = new Color(28, 33, 48, 255);
  g.lineWidth = 4;
  g.circle(0, 0, 6);
  g.stroke();
}

export const settings = new SettingsManager();
