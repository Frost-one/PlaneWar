import { _decorator, Button, Component, Label } from 'cc'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import type { IPlayerData } from '../data/PlayerData'
import { gameManager } from '../managers/GameManager'
import { validateRequiredProps } from '../core/utils/validate'
const { ccclass, property } = _decorator

@ccclass('GameHUD')
export class GameHUD extends Component {
  @property(Label) scoreLabel: Label | null = null
  @property(Label) hpLabel: Label | null = null
  @property(Label) levelLabel: Label | null = null
  @property(Button) pauseBtn: Button | null = null

  /**
   * 必填引用一次性校验：漏了直接抛异常，后面的代码可以放心当它非空。
   * onLoad 早于同节点的 onEnable，所以订阅与刷新时引用一定已就绪。
   */
  protected onLoad(): void {
    validateRequiredProps('GameHUD', {
      scoreLabel: this.scoreLabel,
      hpLabel: this.hpLabel,
      levelLabel: this.levelLabel,
      pauseBtn: this.pauseBtn,
    })
  }

  /**
   * 订阅与按钮监听跟随【激活状态】，与 onDisable 严格对称。
   * HUD 由 UIManager 切换显隐，隐藏期间不该继续收广播、也不需要刷新文本。
   */
  protected onEnable(): void {
    eventBus.on('player_data_change', this.onPlayerDataChange, this)
    this.pauseBtn.node.on(Button.EventType.CLICK, this.onPauseBtnClick, this)
    // 激活时主动拉一次快照：可能已错过了之前的广播
    this.onPlayerDataChange(playerData.getSnapshot())
  }

  protected onDisable(): void {
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
    this.pauseBtn.node.off(Button.EventType.CLICK, this.onPauseBtnClick, this)
  }

  protected onDestroy(): void {
    // 兜底注销（off 幂等），不依赖 onDisable 是否被调用过
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
    this.pauseBtn.node.off(Button.EventType.CLICK, this.onPauseBtnClick, this)
  }

  onPauseBtnClick(): void {
    gameManager.pauseGame()
  }

  onPlayerDataChange(data: Readonly<IPlayerData>): void {
    this.scoreLabel.string = `分数：${data.score}`
    this.hpLabel.string = `生命值：${data.hp}/${data.maxHp}`
    this.levelLabel.string = `火力：${data.weaponLevel}`
  }
}
