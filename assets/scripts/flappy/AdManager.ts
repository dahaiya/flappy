import { BlockInputEvents, Color, Label, Node, UIOpacity, UITransform, find } from 'cc';

export const AD_DEFAULTS = {
  rewardedAdUnitId: 'replace-with-your-rewarded-adunit',
  interstitialAdUnitId: 'replace-with-your-interstitial-adunit',
  /** 非微信 / 游客 / 未配置 adUnit 时，用全屏模拟广告（需点「已看完」才算成功） */
  useMockWhileTourist: true,
  mockRewardedSeconds: 2,
};

declare const wx: any;

class AdManager {
  private rewardedAd: any = null;
  private interstitialAd: any = null;
  private rewardedAvailable = false;
  private interstitialAvailable = false;
  private readonly isWechat = typeof wx !== 'undefined';
  private isTourist = true;
  private mockLayer: Node | null = null;

  constructor() {
    if (this.isWechat && wx.getAccountInfoSync) {
      try {
        const info = wx.getAccountInfoSync();
        this.isTourist = !info || !info.miniProgram || info.miniProgram.appId === 'touristappid';
      } catch {
        this.isTourist = true;
      }
    }
  }

  init() {
    if (!this.isWechat) {
      return;
    }
    this.initRewarded();
    this.initInterstitial();
  }

  private hasRealAdUnit(adUnitId: string) {
    return !!adUnitId && !adUnitId.startsWith('replace-with-your-');
  }

  private shouldMockRewarded() {
    if (!this.isWechat) {
      return AD_DEFAULTS.useMockWhileTourist;
    }
    if (this.isTourist && AD_DEFAULTS.useMockWhileTourist) {
      return true;
    }
    if (!this.hasRealAdUnit(AD_DEFAULTS.rewardedAdUnitId)) {
      return AD_DEFAULTS.useMockWhileTourist;
    }
    return false;
  }

  private initRewarded() {
    if (!wx.createRewardedVideoAd || !this.hasRealAdUnit(AD_DEFAULTS.rewardedAdUnitId)) {
      return;
    }
    this.rewardedAd = wx.createRewardedVideoAd({ adUnitId: AD_DEFAULTS.rewardedAdUnitId, multiton: false });
    this.rewardedAd.onLoad(() => { this.rewardedAvailable = true; });
    this.rewardedAd.onError(() => { this.rewardedAvailable = false; });
    this.rewardedAd.load?.().catch(() => { this.rewardedAvailable = false; });
  }

  private initInterstitial() {
    if (!wx.createInterstitialAd || !this.hasRealAdUnit(AD_DEFAULTS.interstitialAdUnitId)) {
      return;
    }
    this.interstitialAd = wx.createInterstitialAd({ adUnitId: AD_DEFAULTS.interstitialAdUnitId });
    this.interstitialAd.onLoad(() => { this.interstitialAvailable = true; });
    this.interstitialAd.onError(() => { this.interstitialAvailable = false; });
    this.interstitialAd.load?.().catch(() => { this.interstitialAvailable = false; });
  }

  canShowRewarded() {
    if (this.shouldMockRewarded()) {
      return true;
    }
    return !!this.rewardedAd && this.rewardedAvailable;
  }

  /**
   * 播放激励视频。
   * - 真机 + 有效 adUnit：调微信广告，看完 isEnded 才 true
   * - 预览/桌面/游客/占位 adUnit：弹出模拟广告层，倒计时后点「已看完」才 true（避免「点复活=直接开始」）
   */
  showRewarded() {
    return new Promise<boolean>((resolve) => {
      if (this.shouldMockRewarded()) {
        this.showMockRewarded(resolve);
        return;
      }
      if (!this.rewardedAd) {
        // 无广告实例时仍走 mock，避免静默失败
        this.showMockRewarded(resolve);
        return;
      }
      const onClose = (result: any) => {
        this.rewardedAd.offClose?.(onClose);
        resolve(!!(result && result.isEnded));
        this.rewardedAd.load?.().catch(() => { this.rewardedAvailable = false; });
      };
      this.rewardedAd.onClose?.(onClose);
      this.rewardedAd.show()
        .catch(() => (this.rewardedAd.load ? this.rewardedAd.load().then(() => this.rewardedAd.show()) : Promise.reject()))
        .catch(() => {
          this.rewardedAd.offClose?.(onClose);
          // 微信广告拉起失败 → mock 兜底
          this.showMockRewarded(resolve);
        });
    });
  }

  private showMockRewarded(resolve: (ok: boolean) => void) {
    const canvas = find('Canvas');
    if (!canvas) {
      // 极端情况：无 Canvas 时延迟后视为看完（仍有等待感）
      setTimeout(() => resolve(true), AD_DEFAULTS.mockRewardedSeconds * 1000);
      return;
    }

    this.closeMockLayer();
    const layer = new Node('MockRewardedAd');
    layer.layer = canvas.layer;
    const ui = layer.addComponent(UITransform);
    const cw = canvas.getComponent(UITransform)?.width || 960;
    const ch = canvas.getComponent(UITransform)?.height || 640;
    ui.setContentSize(cw, ch);
    layer.setPosition(0, 0, 0);
    layer.addComponent(BlockInputEvents);
    const opacity = layer.addComponent(UIOpacity);
    opacity.opacity = 230;

    const title = new Node('title');
    title.layer = canvas.layer;
    title.addComponent(UITransform).setContentSize(500, 80);
    title.setPosition(0, 80, 0);
    const titleLabel = title.addComponent(Label);
    titleLabel.string = '模拟激励广告';
    titleLabel.fontSize = 40;
    titleLabel.color = Color.WHITE;
    titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    layer.addChild(title);

    const tip = new Node('tip');
    tip.layer = canvas.layer;
    tip.addComponent(UITransform).setContentSize(560, 120);
    tip.setPosition(0, 0, 0);
    const tipLabel = tip.addComponent(Label);
    tipLabel.string = `预览环境无真实广告位\n请等待 ${AD_DEFAULTS.mockRewardedSeconds} 秒后点击「已看完」`;
    tipLabel.fontSize = 26;
    tipLabel.lineHeight = 36;
    tipLabel.color = Color.WHITE;
    tipLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    tipLabel.verticalAlign = Label.VerticalAlign.CENTER;
    layer.addChild(tip);

    const btn = new Node('doneBtn');
    btn.layer = canvas.layer;
    btn.addComponent(UITransform).setContentSize(220, 70);
    btn.setPosition(0, -120, 0);
    const btnLabel = btn.addComponent(Label);
    btnLabel.string = `请等待 ${AD_DEFAULTS.mockRewardedSeconds}s`;
    btnLabel.fontSize = 28;
    btnLabel.color = new Color(200, 200, 200, 255);
    btnLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    btnLabel.verticalAlign = Label.VerticalAlign.CENTER;
    layer.addChild(btn);

    const skip = new Node('skipBtn');
    skip.layer = canvas.layer;
    skip.addComponent(UITransform).setContentSize(160, 50);
    skip.setPosition(0, -200, 0);
    const skipLabel = skip.addComponent(Label);
    skipLabel.string = '关闭（不复活）';
    skipLabel.fontSize = 22;
    skipLabel.color = new Color(180, 180, 180, 255);
    skipLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    layer.addChild(skip);

    canvas.addChild(layer);
    layer.setSiblingIndex(canvas.children.length - 1);
    this.mockLayer = layer;

    let remain = AD_DEFAULTS.mockRewardedSeconds;
    let unlocked = false;
    const timer = setInterval(() => {
      remain -= 1;
      if (remain > 0) {
        btnLabel.string = `请等待 ${remain}s`;
        return;
      }
      clearInterval(timer);
      unlocked = true;
      btnLabel.string = '已看完';
      btnLabel.color = Color.WHITE;
    }, 1000);

    const finish = (ok: boolean) => {
      clearInterval(timer);
      this.closeMockLayer();
      resolve(ok);
    };

    btn.on(Node.EventType.TOUCH_END, () => {
      if (!unlocked) {
        return;
      }
      finish(true);
    });
    skip.on(Node.EventType.TOUCH_END, () => finish(false));
  }

  private closeMockLayer() {
    if (this.mockLayer?.isValid) {
      this.mockLayer.destroy();
    }
    this.mockLayer = null;
  }

  showInterstitial() {
    if (!this.interstitialAd) {
      return;
    }
    this.interstitialAd.show().catch(() => undefined);
  }
}

export default new AdManager();
