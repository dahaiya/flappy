import { BlockInputEvents, Color, Graphics, Label, Node, UIOpacity, UITransform, find } from 'cc';

/**
 * 微信小游戏广告（对齐 minigame-demo 官方示例 API 用法）
 *
 * demo 路径参考：
 * - miniprogram/js/api/AD/createRewardedVideoAd
 * - miniprogram/js/api/AD/createInterstitialAd
 *
 * 说明：
 * - 下面 adUnitId 来自微信官方 minigame-demo，仅适合对照官方 demo 行为 / 部分测试环境。
 * - 上线到你自己的小游戏时，必须在「流量主」后台创建广告位，换成你的 adunit-xxx。
 * - 可用全局覆盖（构建后注入）：
 *   (globalThis as any).__FLAPPY_AD_CONFIG__ = { rewardedAdUnitId, interstitialAdUnitId }
 * - 浏览器 / 游客 appId / 无 ad 能力：走全屏 mock（点「已看完」才算成功）。
 */
export const AD_DEFAULTS = {
  // 官方 demo：激励视频（长短各一，init 时随机选，贴近 demo）
  rewardedAdUnitIds: ['adunit-367ee566b15d46b3', 'adunit-52baa2f38c69b5f7'] as string[],
  // 官方 demo：插屏
  interstitialAdUnitId: 'adunit-4a474184cd6eb5cc',
  /** 非微信 / 游客 / 无 create*Ad 时用 mock */
  useMockWhileTourist: true,
  mockRewardedSeconds: 2,
  /** true：微信里也强制 mock（本地调 UI 用） */
  forceMock: false,
};

const AD_ERR: Record<number, string> = {
  1000: '后端接口调用失败',
  1001: '参数错误',
  1002: '广告单元无效',
  1003: '内部错误',
  1004: '无合适的广告',
  1005: '广告组件审核中',
  1006: '广告组件被驳回',
  1007: '广告组件被封禁',
  1008: '广告单元已关闭',
};

declare const wx: any;

type AdConfigOverride = {
  rewardedAdUnitId?: string;
  rewardedAdUnitIds?: string[];
  interstitialAdUnitId?: string;
  forceMock?: boolean;
};

function readOverride(): AdConfigOverride {
  try {
    const g = globalThis as any;
    return (g && g.__FLAPPY_AD_CONFIG__) || {};
  } catch {
    return {};
  }
}

class AdManager {
  private rewardedAd: any = null;
  private interstitialAd: any = null;
  private rewardedAvailable = false;
  private interstitialAvailable = false;
  private rewardedUnitId = '';
  private interstitialUnitId = '';
  private readonly isWechat = typeof wx !== 'undefined';
  private isTourist = true;
  private mockLayer: Node | null = null;
  private inited = false;
  private lastError = '';

  constructor() {
    this.refreshEnvFlags();
  }

  private refreshEnvFlags() {
    this.isTourist = true;
    if (this.isWechat && wx.getAccountInfoSync) {
      try {
        const info = wx.getAccountInfoSync();
        const appId = info?.miniProgram?.appId;
        this.isTourist = !appId || appId === 'touristappid';
      } catch {
        this.isTourist = true;
      }
    }
  }

  /** 当前生效配置（含全局覆盖） */
  private getConfig() {
    const o = readOverride();
    const rewardedIds =
      (o.rewardedAdUnitIds && o.rewardedAdUnitIds.length && o.rewardedAdUnitIds) ||
      (o.rewardedAdUnitId ? [o.rewardedAdUnitId] : null) ||
      AD_DEFAULTS.rewardedAdUnitIds;
    return {
      rewardedAdUnitIds: rewardedIds.filter(Boolean),
      interstitialAdUnitId: o.interstitialAdUnitId || AD_DEFAULTS.interstitialAdUnitId,
      forceMock: o.forceMock ?? AD_DEFAULTS.forceMock,
    };
  }

  private pickRewardedUnitId(ids: string[]) {
    if (!ids.length) {
      return '';
    }
    if (ids.length === 1) {
      return ids[0];
    }
    // 与官方 demo 一致：长短视频 adunit 随机
    return ids[Math.round(Math.random()) ? 0 : 1];
  }

  private hasRealAdUnit(adUnitId: string) {
    return !!adUnitId && !adUnitId.startsWith('replace-with-your-') && adUnitId.startsWith('adunit-');
  }

  private shouldMockRewarded() {
    const cfg = this.getConfig();
    if (cfg.forceMock) {
      return true;
    }
    if (!this.isWechat) {
      return AD_DEFAULTS.useMockWhileTourist;
    }
    if (!wx.createRewardedVideoAd) {
      return true;
    }
    if (this.isTourist && AD_DEFAULTS.useMockWhileTourist) {
      return true;
    }
    const unit = this.rewardedUnitId || this.pickRewardedUnitId(cfg.rewardedAdUnitIds);
    if (!this.hasRealAdUnit(unit)) {
      return true;
    }
    return false;
  }

  init() {
    this.refreshEnvFlags();
    if (this.inited) {
      return;
    }
    this.inited = true;
    if (!this.isWechat) {
      console.log('[AdManager] non-wechat → mock ads only');
      return;
    }
    this.initRewarded();
    this.initInterstitial();
  }

  /** 可在运行时换成你自己的流量主 adunit（会重建实例） */
  configure(partial: AdConfigOverride) {
    const g = globalThis as any;
    g.__FLAPPY_AD_CONFIG__ = { ...(g.__FLAPPY_AD_CONFIG__ || {}), ...partial };
    this.destroyAds();
    this.inited = false;
    this.init();
  }

  private destroyAds() {
    try {
      this.rewardedAd?.offLoad?.();
      this.rewardedAd?.offError?.();
      this.rewardedAd?.offClose?.();
      this.rewardedAd?.destroy?.();
    } catch {
      /* ignore */
    }
    try {
      this.interstitialAd?.offLoad?.();
      this.interstitialAd?.offError?.();
      this.interstitialAd?.destroy?.();
    } catch {
      /* ignore */
    }
    this.rewardedAd = null;
    this.interstitialAd = null;
    this.rewardedAvailable = false;
    this.interstitialAvailable = false;
  }

  private initRewarded() {
    const cfg = this.getConfig();
    if (cfg.forceMock || !wx.createRewardedVideoAd) {
      return;
    }
    // 游客环境一般播不了流量主广告，仍创建会刷 error；跳过
    if (this.isTourist && AD_DEFAULTS.useMockWhileTourist) {
      console.log('[AdManager] tourist appId → skip real rewarded, use mock');
      return;
    }
    this.rewardedUnitId = this.pickRewardedUnitId(cfg.rewardedAdUnitIds);
    if (!this.hasRealAdUnit(this.rewardedUnitId)) {
      return;
    }

    try {
      // 对齐官方 demo：createRewardedVideoAd({ adUnitId, multiton })
      this.rewardedAd = wx.createRewardedVideoAd({
        adUnitId: this.rewardedUnitId,
        multiton: false,
      });
    } catch (e) {
      console.warn('[AdManager] createRewardedVideoAd failed', e);
      this.rewardedAd = null;
      return;
    }

    this.rewardedAd.onLoad?.(() => {
      this.rewardedAvailable = true;
      this.lastError = '';
      console.log('[AdManager] rewarded loaded', this.rewardedUnitId);
    });
    this.rewardedAd.onError?.((res: any) => {
      this.rewardedAvailable = false;
      const code = res?.errCode;
      this.lastError = AD_ERR[code] || res?.errMsg || 'rewarded error';
      console.warn('[AdManager] rewarded error', code, this.lastError, res);
    });

    // 官方 demo：创建后 load
    this.rewardedAd
      .load?.()
      .then(() => {
        this.rewardedAvailable = true;
      })
      .catch((err: any) => {
        this.rewardedAvailable = false;
        console.warn('[AdManager] rewarded load fail', err);
      });
  }

  private initInterstitial() {
    const cfg = this.getConfig();
    if (cfg.forceMock || !wx.createInterstitialAd) {
      return;
    }
    if (this.isTourist && AD_DEFAULTS.useMockWhileTourist) {
      return;
    }
    this.interstitialUnitId = cfg.interstitialAdUnitId;
    if (!this.hasRealAdUnit(this.interstitialUnitId)) {
      return;
    }
    try {
      this.interstitialAd = wx.createInterstitialAd({ adUnitId: this.interstitialUnitId });
    } catch (e) {
      console.warn('[AdManager] createInterstitialAd failed', e);
      this.interstitialAd = null;
      return;
    }
    this.interstitialAd.onLoad?.(() => {
      this.interstitialAvailable = true;
    });
    this.interstitialAd.onError?.((res: any) => {
      this.interstitialAvailable = false;
      const code = res?.errCode;
      console.warn('[AdManager] interstitial error', code, AD_ERR[code] || res?.errMsg, res);
    });
    this.interstitialAd.load?.().catch(() => {
      this.interstitialAvailable = false;
    });
  }

  canShowRewarded() {
    if (this.shouldMockRewarded()) {
      return true;
    }
    return !!this.rewardedAd;
  }

  getDebugError() {
    return this.lastError;
  }

  getDebugInfo() {
    return {
      isWechat: this.isWechat,
      isTourist: this.isTourist,
      rewardedUnitId: this.rewardedUnitId,
      interstitialUnitId: this.interstitialUnitId,
      rewardedAvailable: this.rewardedAvailable,
      interstitialAvailable: this.interstitialAvailable,
      mock: this.shouldMockRewarded(),
      lastError: this.lastError,
    };
  }

  /**
   * 播放激励视频。
   * - 真机正式/体验版 + 有效 adUnit：wx.createRewardedVideoAd，onClose.isEnded 才 true
   * - 预览/桌面/游客/强制 mock：全屏模拟层
   */
  showRewarded() {
    this.init();
    return new Promise<boolean>((resolve) => {
      if (this.shouldMockRewarded()) {
        this.showMockRewarded(resolve);
        return;
      }
      if (!this.rewardedAd) {
        this.initRewarded();
      }
      if (!this.rewardedAd) {
        this.showMockRewarded(resolve);
        return;
      }

      const ad = this.rewardedAd;
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          ad.offClose?.(onClose);
        } catch {
          /* ignore */
        }
        resolve(ok);
        // 关闭后预加载下一条（官方推荐）
        ad.load?.()
          .then(() => {
            this.rewardedAvailable = true;
          })
          .catch(() => {
            this.rewardedAvailable = false;
          });
      };

      const onClose = (result: any) => {
        // 官方：res.isEnded 为 true 才发奖
        finish(!!(result && result.isEnded));
      };

      // 必须先 onClose 再 show，否则关广告时可能丢回调
      try {
        ad.offClose?.(onClose);
      } catch {
        /* ignore */
      }
      ad.onClose?.(onClose);

      const showOnce = () => ad.show();

      // 对齐 demo：show 失败 → load 再 show；仍失败则 mock 兜底（避免复活按钮假死）
      showOnce()
        .catch(() => (ad.load ? ad.load().then(() => showOnce()) : Promise.reject(new Error('no load'))))
        .catch((err: any) => {
          console.warn('[AdManager] rewarded show failed → mock fallback', err);
          try {
            ad.offClose?.(onClose);
          } catch {
            /* ignore */
          }
          if (typeof wx !== 'undefined' && wx.showToast) {
            const msg = AD_ERR[err?.errCode] || err?.errMsg || '广告拉起失败，使用模拟广告';
            wx.showToast({ title: String(msg).slice(0, 20), icon: 'none' });
          }
          // finish 尚未 settle 时走 mock；mock 内部 resolve
          if (!settled) {
            settled = true;
            this.showMockRewarded(resolve);
          }
        });
    });
  }

  private showMockRewarded(resolve: (ok: boolean) => void) {
    const canvas = find('Canvas');
    if (!canvas) {
      setTimeout(() => resolve(true), AD_DEFAULTS.mockRewardedSeconds * 1000);
      return;
    }

    this.closeMockLayer();
    const layer = new Node('MockRewardedAd');
    layer.layer = canvas.layer;
    const ui = layer.addComponent(UITransform);
    const cw = canvas.getComponent(UITransform)?.width || 720;
    const ch = canvas.getComponent(UITransform)?.height || 1560;
    ui.setContentSize(cw, ch);
    layer.setPosition(0, 0, 0);
    const g = layer.addComponent(Graphics);
    g.clear();
    g.fillColor = new Color(10, 14, 28, 245);
    g.rect(-cw / 2, -ch / 2, cw, ch);
    g.fill();
    layer.addComponent(BlockInputEvents);
    const opacity = layer.addComponent(UIOpacity);
    opacity.opacity = 255;

    const title = new Node('title');
    title.layer = canvas.layer;
    title.addComponent(UITransform).setContentSize(500, 80);
    title.setPosition(0, 80, 0);
    const titleLabel = title.addComponent(Label);
    titleLabel.string = this.isWechat ? '模拟激励广告（游客/预览）' : '模拟激励广告';
    titleLabel.fontSize = 36;
    titleLabel.color = Color.WHITE;
    titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    layer.addChild(title);

    const tip = new Node('tip');
    tip.layer = canvas.layer;
    tip.addComponent(UITransform).setContentSize(560, 140);
    tip.setPosition(0, 0, 0);
    const tipLabel = tip.addComponent(Label);
    tipLabel.string = this.isWechat && this.isTourist
      ? `当前为游客 AppId，无法播流量主广告\n请用正式/体验版 + 自己的 adunit\n等待 ${AD_DEFAULTS.mockRewardedSeconds}s 后点「已看完」`
      : `预览环境无真实广告\n请等待 ${AD_DEFAULTS.mockRewardedSeconds} 秒后点击「已看完」`;
    tipLabel.fontSize = 24;
    tipLabel.lineHeight = 34;
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

  /** 插屏：官方 demo 为 show，失败再 load。无实例则静默跳过。 */
  showInterstitial() {
    this.init();
    if (!this.interstitialAd) {
      return;
    }
    this.interstitialAd
      .show()
      .catch(() => this.interstitialAd.load?.().then(() => this.interstitialAd.show()))
      .catch((err: any) => {
        console.warn('[AdManager] interstitial show fail', err?.errCode, AD_ERR[err?.errCode] || err?.errMsg);
      });
  }
}

export default new AdManager();
