import { _decorator, Component, Label } from 'cc'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import type { IPlayerData } from '../data/PlayerData'
const { ccclass, property } = _decorator

@ccclass('GameHUD')
export class GameHUD extends Component {
  @property(Label) scoreLabel: Label | null = null
  @property(Label) hpLabel: Label | null = null
  @property(Label) levelLabel: Label | null = null

  protected onLoad(): void {
    eventBus.on('player_data_change', this.onPlayerDataChange, this)
    // 首次进入主动拉取一次快照用于显示
    this.onPlayerDataChange(playerData.getSnapshot())
  }

  protected onDestroy(): void {
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
  }

  onPlayerDataChange(data: Readonly<IPlayerData>): void {
    if (this.scoreLabel) this.scoreLabel.string = `分数：${data.score}`
    if (this.hpLabel) this.hpLabel.string = `生命值：${data.hp}/${data.maxHp}`
    if (this.levelLabel) this.levelLabel.string = `等级：${data.level}`
  }
}