import { _decorator, Button, Component, Enum, Label, Node } from 'cc'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import { gameManager } from '../managers/GameManager'
import { StateChangePayload, GameResult, GameState } from '../data/GameState'
const { ccclass, property } = _decorator

/**
 * 结算界面（游戏胜利/失败共用）
 * - 只做展示与按钮转发：订阅 state_change，进入 OVER 且结算结果与本面板匹配时显示
 * - 不持有游戏数据，最终分数从数据层 playerData 只读获取
 * - 胜利/失败面板共用本脚本：在 Inspector 里把 result 分别选为 WIN / LOSE 即可
 *
 * 使用：把本组件挂在"结算面板"节点（或其父节点）上，
 * 并把 panel / finalScoreLabel / restartBtn / menuBtn 在 Inspector 中拖好引用。
 */
@ccclass('GameResultView')
export class GameResultView extends Component {
  /** 各结算结果对应的标题文案（面板无需手拖 titleLabel 也可自动显示） */
  private static readonly TITLES: Record<GameResult, string> = {
    [GameResult.NONE]: '',
    [GameResult.WIN]: '游戏胜利',
    [GameResult.LOSE]: '游戏失败',
  }

  /** 标题文本；留空则按 result 自动填入 TITLES 中的文案 */
  @property(Label) titleLabel: Label | null = null

  /** 显示最终得分的文本 */
  @property(Label) finalScoreLabel: Label | null = null

  /**
   * 本面板对应的结算结果：胜利面板选 WIN、失败面板选 LOSE。
   * 默认 NONE（不匹配任何结果），强制在 Inspector 里显式选择，避免漏选时静默显示错误面板。
   */
  @property({
    type: Enum(GameResult),
  })
  result: GameResult = GameResult.NONE

  /** "重新开始"按钮 */
  @property(Button) restartBtn: Button | null = null

  /** "返回菜单"按钮 */
  @property(Button) menuBtn: Button | null = null

  protected onLoad(): void {
    eventBus.on('state_change', this.onStateChange, this)

    // 按钮点击：统一转发给 GameManager，由它切换状态
    if (this.restartBtn) {
      this.restartBtn.node.on(Button.EventType.CLICK, this.onRestartClick, this)
    }
    if (this.menuBtn) {
      this.menuBtn.node.on(Button.EventType.CLICK, this.onMenuClick, this)
    }
  }

  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)

    if (this.restartBtn) {
      this.restartBtn.node.off(
        Button.EventType.CLICK,
        this.onRestartClick,
        this,
      )
    }
    if (this.menuBtn) {
      this.menuBtn.node.off(Button.EventType.CLICK, this.onMenuClick, this)
    }
  }

  /**
   * 状态变化：进入 OVER 且结算结果与本面板匹配时展示。
   * 若未设置 result（默认 LOSE），则需在 Inspector 中按面板类型选好 WIN / LOSE。
   */
  private onStateChange({ state, result }: StateChangePayload): void {
    console.log('游戏结束：', { state, result });
    
    if (state === GameState.OVER) {
      this.result = result
      // 从数据层只读最新分数用于展示
      if (this.finalScoreLabel) {
        this.finalScoreLabel.string = `最终得分：${playerData.getSnapshot().score}`
      }
      // 标题：未在 Inspector 中指定时，按结算结果自动填入
      if (this.titleLabel) {
        this.titleLabel.string = GameResultView.TITLES[this.result]
      }
    } else {
      this.result = GameResult.NONE
    }
  }

  /** 重新开始：交回 GameManager（其内部会重置数据并进入 PLAYING） */
  private onRestartClick(): void {
    gameManager.startGame()
  }

  /** 返回主菜单 */
  private onMenuClick(): void {
    gameManager.backToMenu()
  }
}
