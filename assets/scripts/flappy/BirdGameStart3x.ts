import { _decorator, Color, Component, director, Node, Sprite, tween, UIOpacity } from 'cc';
import AdManager from './AdManager';
import SkinManager from './SkinManager';
const { ccclass, property } = _decorator;

declare const wx: any;

function ensureUIOpacity(node: Node) {
  let opacity = node.getComponent(UIOpacity);
  if (!opacity) {
    opacity = node.addComponent(UIOpacity);
  }
  return opacity;
}

@ccclass('BirdGameStart3x')
export class BirdGameStart3x extends Component {
  @property(Node)
  maskLayer: Node | null = null;

  onLoad() {
    AdManager.init();
    if (this.maskLayer) {
      this.maskLayer.active = false;
      ensureUIOpacity(this.maskLayer).opacity = 0;
    }
    if (typeof wx !== 'undefined' && wx.showShareMenu) {
      wx.showShareMenu({ withShareTicket: true });
    }
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
    if (typeof wx === 'undefined' || !wx.shareAppMessage) {
      console.log('[Flappy] share placeholder');
      return;
    }
    wx.shareAppMessage({ title: '我在玩一个超上头的躲避小游戏，你也来试试', query: 'from=share_home' });
  }

  showRankPlaceholder() {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title: '好友排行开发中', icon: 'none' });
      return;
    }
    console.log('[Flappy] rank placeholder');
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
    // 独立工程没有合集 startscene，回到开始页自身
    this.fadeMaskThen('flappy_start');
  }
}
