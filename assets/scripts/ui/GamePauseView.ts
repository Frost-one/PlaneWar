import { _decorator, Button, Component, Enum, Label, Node } from 'cc'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import { gameManager } from '../managers/GameManager'
import { StateChangePayload, GameResult, GameState } from '../data/GameState'
const { ccclass, property } = _decorator

/**
 * 游戏暂停页面
 */
@ccclass('GamePauseView')
export class GamePauseView extends Component {
  @property(Label) titleLabel: Label | null = null
  @property(Button) resumeBtn: Button | null = null

  protected onLoad(): void {
    this.titleLabel.string = '游戏暂停'
    this.resumeBtn.node.on(Button.EventType.CLICK, this.onResumeClick, this)
  }

  protected onDestroy(): void {
    this.resumeBtn.node.off(Button.EventType.CLICK, this.onResumeClick, this)
  }

  onResumeClick(): void {
    gameManager.startGame()
  }
}
