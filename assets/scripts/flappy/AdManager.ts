export const AD_DEFAULTS = {
  rewardedAdUnitId: 'replace-with-your-rewarded-adunit',
  interstitialAdUnitId: 'replace-with-your-interstitial-adunit',
  useMockWhileTourist: true,
};

declare const wx: any;

class AdManager {
  private rewardedAd: any = null;
  private interstitialAd: any = null;
  private rewardedAvailable = false;
  private interstitialAvailable = false;
  private readonly isWechat = typeof wx !== 'undefined';
  private isTourist = true;

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
    if (this.isTourist && AD_DEFAULTS.useMockWhileTourist) {
      return true;
    }
    return !!this.rewardedAd && this.rewardedAvailable;
  }

  showRewarded() {
    return new Promise<boolean>((resolve) => {
      if (this.isTourist && AD_DEFAULTS.useMockWhileTourist) {
        resolve(true);
        return;
      }
      if (!this.rewardedAd) {
        resolve(false);
        return;
      }
      const onClose = (result: any) => {
        this.rewardedAd.offClose?.(onClose);
        resolve(!!(result && result.isEnded));
        this.rewardedAd.load?.().catch(() => { this.rewardedAvailable = false; });
      };
      this.rewardedAd.onClose?.(onClose);
      this.rewardedAd.show()
        .catch(() => this.rewardedAd.load ? this.rewardedAd.load().then(() => this.rewardedAd.show()) : Promise.reject())
        .catch(() => {
          this.rewardedAd.offClose?.(onClose);
          resolve(false);
        });
    });
  }

  showInterstitial() {
    if (!this.interstitialAd) {
      return;
    }
    this.interstitialAd.show().catch(() => undefined);
  }
}

export default new AdManager();
