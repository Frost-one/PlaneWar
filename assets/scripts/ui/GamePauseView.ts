import { _decorator, Button, Component, Label } from 'cc'
import { gameManager } from '../managers/GameManager'
import { validateRequiredProps } from '../core/utils/validate'
const { ccclass, property } = _decorator

/**
 * 游戏暂停页面
 * - 只做展示与按钮转发：点击"继续"交回 GameManager（其内部仅切状态，不重置数据）
 */
@ccclass('GamePauseView')
export class GamePauseView extends Component {
  @property(Label) titleLabel: Label | null = null
  @property(Button) resumeBtn: Button | null = null
  @property(Button) menuBtn: Button | null = null

  /** 必填引用一次性校验（漏了直接抛异常）；静态文案只需设置一次 */
  protected onLoad(): void {
    validateRequiredProps('GamePauseView', {
      titleLabel: this.titleLabel,
      resumeBtn: this.resumeBtn,
      menuBtn: this.menuBtn,
    })
    this.titleLabel.string = '游戏暂停'
  }

  /**
   * 按钮监听跟随【激活状态】，与 onDisable 严格对称。
   * 暂停面板只在 PAUSED 状态显示，隐藏期间不该继续响应点击。
   */
  protected onEnable(): void {
    this.resumeBtn.node.on(Button.EventType.CLICK, this.onResumeClick, this)
    this.menuBtn.node.on(Button.EventType.CLICK, this.onMenuClick, this)
  }

  protected onDisable(): void {
    this.resumeBtn.node.off(Button.EventType.CLICK, this.onResumeClick, this)
    this.menuBtn.node.off(Button.EventType.CLICK, this.onMenuClick, this)
  }

  protected onDestroy(): void {
    // 兜底注销（off 幂等），不依赖 onDisable 是否被调用过
    this.resumeBtn.node.off(Button.EventType.CLICK, this.onResumeClick, this)
    this.menuBtn.node.off(Button.EventType.CLICK, this.onMenuClick, this)
  }

  /** 继续游戏：仅解冻，不重置数据（区别于 startGame） */
  private onResumeClick(): void {
    gameManager.resumeGame()
  }

  // 回到菜单
  private onMenuClick(): void {
    gameManager.backToMenu()
  }
}
