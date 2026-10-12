import { _decorator, Button, Component } from 'cc'
import { gameManager } from '../managers/GameManager'
import { validateRequiredProps } from '../core/utils/validate'
const { ccclass, property } = _decorator

/**
 * 主菜单界面
 * - 只做按钮转发：点击"开始游戏"交给 GameManager 处理（其内部会重置数据并进入 PLAYING）
 * - ❗ 本组件【不管显隐】：面板的显示/隐藏统一由 UIManager 按游戏状态切换 active。
 *   以前这里有个 `panel` 属性让自己控制显隐 —— 与 UIManager 重复且从未被使用，已删除。
 * - 不持有游戏数据
 *
 * 使用：把本组件挂在"菜单面板"节点（或其父节点）上，并把 startBtn 在 Inspector 中拖好引用。
 */
@ccclass('MenuView')
export class MenuView extends Component {
  /** "开始游戏"按钮 */
  @property(Button) startBtn: Button | null = null

  /** 必填引用一次性校验（漏了直接抛异常） */
  protected onLoad(): void {
    validateRequiredProps('MenuView', { startBtn: this.startBtn })
  }

  /**
   * 按钮监听跟随【激活状态】，与 onDisable 严格对称。
   * 菜单只在 MENU 状态显示，隐藏期间不该继续响应点击。
   */
  protected onEnable(): void {
    this.startBtn.node.on(Button.EventType.CLICK, this.onStart, this)
  }

  protected onDisable(): void {
    this.startBtn.node.off(Button.EventType.CLICK, this.onStart, this)
  }

  protected onDestroy(): void {
    // 兜底注销（off 幂等），不依赖 onDisable 是否被调用过
    this.startBtn.node.off(Button.EventType.CLICK, this.onStart, this)
  }

  /** 开始游戏：交回 GameManager（重置数据 + 进入 PLAYING） */
  private onStart(): void {
    gameManager.startGame()
  }
}
