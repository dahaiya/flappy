import { AudioSource, AudioClip, director, Node, resources } from 'cc';

const RES_PATH = { bgm: 'bgm', pass: 'pass', die: 'die', flap: 'flap' } as const;

const BG_VOLUME = 0.42;
const SFX_VOLUME = 0.85;

/**
 * 全局音频单例：背景音乐常驻循环 + 一次性音效（过柱子 / 拍翅 / 碰撞）。
 *
 * 设计要点：
 * - 用一个 director.addPersistRootNode 的常驻节点承载 AudioSource，
 *   切场景（开始页 <-> 游戏页）时 BGM 不断。
 * - 「音效」开关关闭：拍翅/过柱/碰撞都不发声，背景音乐照常播放。
 * - 「背景音乐」开关关闭：仅停/静音 BGM。
 * - 循环 BGM 用 AudioSource.loop（AudioEngine.play 对循环返回值在部分平台不可靠）。
 */
export class GameAudio {
  static instance: GameAudio | null = null;

  private host: Node | null = null;
  private bgm: AudioSource | null = null;
  private sfx: AudioSource | null = null;

  private bgmClip: AudioClip | null = null;
  private clips: Record<string, AudioClip> = {};
  private bgmVolume = BG_VOLUME;
  private sfxVolume = SFX_VOLUME;
  private bgmWanted = false;
  private bgmPending = false; // clip 还没加载好时的播放挂起标记
  private unlocked = false;

  constructor() {
    GameAudio.instance = this;
  }

  /** 幂等初始化：建常驻节点 + 两个 AudioSource + 加载 clip。 */
  init() {
    if (this.bgm) {
      return;
    }
    const node = new Node('__GameAudio__');
    node.layer = Node.DEFAULT_LAYER;
    director.addPersistRootNode(node);
    this.host = node;

    const bg = new AudioSource();
    bg.playOnAwake = false;
    bg.loop = true;
    bg.volume = this.bgmVolume;
    node.addComponent(bg);
    this.bgm = bg;

    const s = new AudioSource();
    s.playOnAwake = false;
    s.loop = false;
    s.volume = this.sfxVolume;
    node.addComponent(s);
    this.sfx = s;

    this.loadClips();
  }

  private loadClips() {
    for (const key of Object.keys(RES_PATH) as (keyof typeof RES_PATH)[]) {
      const path = RES_PATH[key];
      const k = key;
      resources.load(path, AudioClip, (err, clip) => {
        if (err || !clip) {
          console.warn('[GameAudio] clip load fail:', path, err);
          return;
        }
        this.clips[k] = clip;
        if (k === 'bgm') {
          this.bgmClip = clip;
          if (this.bgmPending && this.bgmWanted && this.bgm) {
            this.bgm.clip = clip;
            this.bgm.volume = this.bgmVolume;
            this.bgm.loop = true;
            this.bgm.play();
          }
        }
      });
    }
  }

  /** 必须挂进用户首次手势回调里：解锁微信音频上下文。 */
  unlock() {
    if (this.unlocked) {
      return;
    }
    this.unlocked = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wx: any = typeof globalThis !== 'undefined' ? (globalThis as any).wx : undefined;
      if (wx && wx.createInnerAudioContext) {
        const probe = wx.createInnerAudioContext();
        probe?.destroy?.();
      }
    } catch {
      // ignore
    }
    this.init();
  }

  // ---------- 音量 / 开关 ----------

  setVolumes(bgmVol: number, sfxVol: number) {
    this.bgmVolume = bgmVol;
    this.sfxVolume = sfxVol;
    if (this.bgm) {
      this.bgm.volume = this.bgmVolume;
    }
    if (this.sfx) {
      this.sfx.volume = this.sfxVolume;
    }
  }

  isBgmEnabled() {
    return this.bgmWanted;
  }

  setBgmEnabled(on: boolean) {
    this.bgmWanted = on;
    if (on) {
      this.playBgm();
    } else {
      this.bgm?.stop();
    }
  }

  /** 开局时调用：背景乐常驻。 */
  startBgm() {
    this.bgmWanted = true;
    this.playBgm();
  }

  /** 停止背景乐（不改变用户开关意图）。 */
  stopBgm() {
    this.bgm?.stop();
  }

  private playBgm() {
    if (!this.bgm) {
      return;
    }
    if (!this.bgmClip) {
      this.bgmPending = true;
      return;
    }
    this.bgm.clip = this.bgmClip;
    this.bgm.loop = true;
    this.bgm.volume = this.bgmVolume;
    if (!this.bgm.isPlaying) {
      this.bgm.play();
    }
  }

  // ---------- 一次性音效 ----------

  /** 播放一次性音效；音效关时仍照常播放（由调用方决定是否调用）。 */
  play(name: 'pass' | 'die' | 'flap') {
    if (!this.sfx) {
      return;
    }
    const clip = this.clips[name];
    if (!clip) {
      return;
    }
    this.sfx.clip = clip;
    this.sfx.loop = false;
    this.sfx.volume = this.sfxVolume;
    this.sfx.play();
  }

  /** 过柱子：音效（音效开时）+ 震动（震动开时）。 */
  playPass(soundOn: boolean, vibrateOn: boolean) {
    if (soundOn) {
      this.play('pass');
    }
    if (vibrateOn) {
      this.vibrate();
    }
  }

  /** 拍翅：仅音效，不震动。 */
  playFlap(soundOn: boolean) {
    if (soundOn) {
      this.play('flap');
    }
  }

  /** 碰撞/失败。 */
  playDie(soundOn: boolean) {
    if (soundOn) {
      this.play('die');
    }
  }

  vibrate() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wx: any = typeof globalThis !== 'undefined' ? (globalThis as any).wx : undefined;
      if (wx && wx.vibrateShort) {
        wx.vibrateShort({ type: 'light', fail: () => {} });
        return;
      }
    } catch {
      // ignore
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(30);
      } catch {
        // ignore
      }
    }
  }

  destroy() {
    this.bgm?.stop();
    this.host?.destroy();
    this.host = null;
    this.bgm = null;
    this.sfx = null;
    this.bgmClip = null;
    this.clips = {};
    if (GameAudio.instance === this) {
      GameAudio.instance = null;
    }
  }
}

export const gameAudio = new GameAudio();
