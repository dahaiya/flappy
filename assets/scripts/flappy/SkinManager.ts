import { Color, sys } from 'cc';

const STORAGE_KEYS = {
  selectedSkin: 'flappy_skin_selected',
  trialSkin: 'flappy_skin_trial_name',
  trialCount: 'flappy_skin_trial_left_count',
};

const DEFAULT_SKIN = 'classic';

class SkinManager {
  getSelectedSkin() {
    return sys.localStorage.getItem(STORAGE_KEYS.selectedSkin) || DEFAULT_SKIN;
  }

  setSelectedSkin(skinId: string) {
    sys.localStorage.setItem(STORAGE_KEYS.selectedSkin, skinId);
  }

  startTrial(skinId: string, rounds: number) {
    sys.localStorage.setItem(STORAGE_KEYS.trialSkin, skinId);
    sys.localStorage.setItem(STORAGE_KEYS.trialCount, String(rounds));
    this.setSelectedSkin(skinId);
  }

  getTrialInfo() {
    const skinId = sys.localStorage.getItem(STORAGE_KEYS.trialSkin) || '';
    const leftCount = parseInt(sys.localStorage.getItem(STORAGE_KEYS.trialCount) || '0', 10);
    return { skinId, leftCount: Number.isNaN(leftCount) ? 0 : leftCount };
  }

  consumeTrialRound() {
    const trial = this.getTrialInfo();
    if (!trial.skinId || trial.leftCount <= 0) {
      return trial;
    }
    const nextCount = trial.leftCount - 1;
    sys.localStorage.setItem(STORAGE_KEYS.trialCount, String(nextCount));
    if (nextCount <= 0) {
      sys.localStorage.removeItem(STORAGE_KEYS.trialSkin);
      sys.localStorage.removeItem(STORAGE_KEYS.trialCount);
      this.setSelectedSkin(DEFAULT_SKIN);
    }
    return { skinId: trial.skinId, leftCount: nextCount };
  }

  getSkinConfig(skinId: string) {
    const configs: Record<string, { birdColor: Color; pipeTint: Color }> = {
      classic: { birdColor: new Color(255, 255, 255, 255), pipeTint: new Color(255, 255, 255, 255) },
      space: { birdColor: new Color(132, 210, 255, 255), pipeTint: new Color(180, 180, 255, 255) },
      food: { birdColor: new Color(255, 210, 140, 255), pipeTint: new Color(255, 180, 120, 255) },
    };
    return configs[skinId] || configs[DEFAULT_SKIN];
  }
}

export default new SkinManager();
