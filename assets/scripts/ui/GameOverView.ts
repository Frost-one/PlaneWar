import { _decorator, Button, Component, Label, Node } from 'cc'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import { gameManager } from '../managers/GameManager'
import { GameState } from '../data/GameState'
const { ccclass, property } = _decorator

/**
 * 结算界面（游戏结束时显示）
 * - 只做展示与按钮转发：订阅 state_change，进入 OVER 时显示面板
 * - 不持有游戏数据，最终分数从数据层 playerData 只读获取
 *
 * 使用：把本组件挂在"结算面板"节点（或其父节点）上，
 * 并把 panel / finalScoreLabel / restartBtn / menuBtn 在 Inspector 中拖好引用。
 */
@ccclass('GameOverView')
export class GameOverView extends Component {
  /** 整个结算面板节点（含背景蒙版），默认隐藏，进入 OVER 时显示 */
  @property(Node) panel: Node | null = null

  /** 显示最终得分的文本 */
  @property(Label) finalScoreLabel: Label | null = null

  /** "重新开始"按钮 */
  @property(Button) restartBtn: Button | null = null

  /** "返回菜单"按钮 */
  @property(Button) menuBtn: Button | null = null

  protected onLoad(): void {
    eventBus.on('state_change', this.onStateChange, this)

    // 按钮点击：统一转发给 GameManager，由它切换状态
    if (this.restartBtn) {
      this.restartBtn.node.on(Button.EventType.CLICK, this.onRestart, this)
    }
    if (this.menuBtn) {
      this.menuBtn.node.on(Button.EventType.CLICK, this.onMenu, this)
    }

    // 初始隐藏，等进入 OVER 再由状态驱动显示
    if (this.panel) this.panel.active = false
  }

  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)

    if (this.restartBtn) {
      this.restartBtn.node.off(Button.EventType.CLICK, this.onRestart, this)
    }
    if (this.menuBtn) {
      this.menuBtn.node.off(Button.EventType.CLICK, this.onMenu, this)
    }
  }

  /** 状态变化：仅在 OVER 时展示结算面板 */
  private onStateChange(state: GameState): void {
    if (!this.panel) return

    if (state === GameState.OVER) {
      // 从数据层只读最新分数用于展示
      if (this.finalScoreLabel) {
        this.finalScoreLabel.string = `最终得分：${playerData.getSnapshot().score}`
      }
      this.panel.active = true
    } else {
      this.panel.active = false
    }
  }

  /** 重新开始：交回 GameManager（其内部会重置数据并进入 PLAYING） */
  private onRestart(): void {
    gameManager.startGame()
  }

  /** 返回主菜单 */
  private onMenu(): void {
    gameManager.backToMenu()
  }
}
