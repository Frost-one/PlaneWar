import { _decorator, Button, Component, Label } from 'cc'
import { gameManager } from '../managers/GameManager'
const { ccclass, property } = _decorator

/**
 * 游戏暂停页面
 * - 只做展示与按钮转发：点击"继续"交回 GameManager（其内部仅切状态，不重置数据）
 */
@ccclass('GamePauseView')
export class GamePauseView extends Component {
  @property(Label) titleLabel: Label | null = null
  @property(Button) resumeBtn: Button | null = null

  protected onLoad(): void {
    if (this.titleLabel) {
      this.titleLabel.string = '游戏暂停'
    }
    if (this.resumeBtn) {
      this.resumeBtn.node.on(Button.EventType.CLICK, this.onResumeClick, this)
    }
  }

  protected onDestroy(): void {
    if (this.resumeBtn) {
      this.resumeBtn.node.off(Button.EventType.CLICK, this.onResumeClick, this)
    }
  }

  /** 继续游戏：仅解冻，不重置数据（区别于 startGame） */
  private onResumeClick(): void {
    gameManager.resumeGame()
  }
}
