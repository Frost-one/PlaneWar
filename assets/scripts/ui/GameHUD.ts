import { _decorator, Button, Component, Label } from 'cc'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import type { IPlayerData } from '../data/PlayerData'
import { gameManager } from '../managers/GameManager'
const { ccclass, property } = _decorator

@ccclass('GameHUD')
export class GameHUD extends Component {
  @property(Label) scoreLabel: Label | null = null
  @property(Label) hpLabel: Label | null = null
  @property(Label) levelLabel: Label | null = null
  @property(Button) pauseBtn: Button | null = null

  protected onLoad(): void {
    eventBus.on('player_data_change', this.onPlayerDataChange, this)
    if (this.pauseBtn) {
      this.pauseBtn.node.on(Button.EventType.CLICK, this.onPauseBtnClick, this)
    }
    // 首次进入主动拉取一次快照用于显示
    this.onPlayerDataChange(playerData.getSnapshot())
  }

  protected onDestroy(): void {
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
    if (this.pauseBtn) {
      this.pauseBtn.node.off(Button.EventType.CLICK, this.onPauseBtnClick, this)
    }
  }

  onPauseBtnClick(): void {
    gameManager.pauseGame()
  }

  onPlayerDataChange(data: Readonly<IPlayerData>): void {
    if (this.scoreLabel) this.scoreLabel.string = `分数：${data.score}`
    if (this.hpLabel) this.hpLabel.string = `生命值：${data.hp}/${data.maxHp}`
    if (this.levelLabel) this.levelLabel.string = `火力：${data.weaponLevel}`
  }
}
