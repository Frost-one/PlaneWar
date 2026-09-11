import { _decorator, Button, Component, Node } from 'cc'
import { eventBus } from '../core/EventBus'
import { gameManager } from '../managers/GameManager'
import { StateChangePayload, GameState } from '../data/GameState'
const { ccclass, property } = _decorator

/**
 * 主菜单界面
 * - 只做展示与按钮转发：订阅 state_change，进入 MENU 时显示菜单
 * - 不持有游戏数据，点击"开始游戏"交给 GameManager 处理（其内部会重置数据并进入 PLAYING）
 *
 * 使用：把本组件挂在"菜单面板"节点（或其父节点）上，
 * 并把 panel / startBtn 在 Inspector 中拖好引用。
 */
@ccclass('MenuView')
export class MenuView extends Component {
  /** 整个菜单面板节点（含标题、按钮），进入 MENU 时显示、其他状态隐藏 */
  @property(Node) panel: Node | null = null

  /** "开始游戏"按钮 */
  @property(Button) startBtn: Button | null = null

  protected onLoad(): void {
    eventBus.on('state_change', this.onStateChange, this)

    if (this.startBtn) {
      this.startBtn.node.on(Button.EventType.CLICK, this.onStart, this)
    }

    // 依据当前状态初始化显隐（避免启动时状态已是 MENU 却未收到广播）
    this.onStateChange(gameManager.getStateSnapshot())
  }

  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)

    if (this.startBtn) {
      this.startBtn.node.off(Button.EventType.CLICK, this.onStart, this)
    }
  }

  /** 状态变化：仅在 MENU 时展示菜单面板 */
  private onStateChange({ state }: StateChangePayload): void {
    if (!this.panel) return
    this.panel.active = state === GameState.MENU
  }

  /** 开始游戏：交回 GameManager（重置数据 + 进入 PLAYING） */
  private onStart(): void {
    gameManager.startGame()
  }
}
