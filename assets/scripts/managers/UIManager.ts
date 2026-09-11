import { _decorator, Component, Node, Prefab, instantiate } from 'cc'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameResult, GameState } from '../data/GameState'
import { gameManager } from './GameManager'
const { ccclass, property } = _decorator

/**
 * UI 统一管理器
 * - 集中维护"游戏状态 → 面板显隐"的规则，各面板组件不再自行控制显隐
 * - 启动时把各 UI Prefab 实例化到对应 Layer 下并默认隐藏，之后仅切换 active
 *
 * 使用：把本组件挂在场景中一个常驻节点上（如 UI 或 GameEntry 同级），
 * 并在 Inspector 中拖好各 Layer 节点与各 UI Prefab 引用。
 */
@ccclass('UIManager')
export class UIManager extends Component {
  // —— 各 UI 层容器（场景里预先摆好的空节点） ——
  @property(Node) menuLayer: Node | null = null
  @property(Node) gamePausePanel: Node | null = null
  @property(Node) HUDLayer: Node | null = null
  @property(Node) gameResultPanel: Node | null = null

  // —— 各 UI Prefab（编辑器拖入） ——
  @property(Prefab) menuPrefab: Prefab | null = null
  @property(Prefab) gamePausePrefab: Prefab | null = null
  @property(Prefab) HUDPrefab: Prefab | null = null
  @property(Prefab) gameResultPrefab: Prefab | null = null

  // —— 实例缓存（启动时创建，之后只切显隐） ——
  private menu: Node | null = null
  private gamePause: Node | null = null
  private hud: Node | null = null
  private gameResult: Node | null = null

  protected onLoad(): void {
    eventBus.on('state_change', this.onStateChange, this)

    // 启动时一次性实例化所有面板（默认隐藏），避免运行中加载造成卡顿
    this.menu = this.createPanel(this.menuPrefab, this.menuLayer)
    this.gamePause = this.createPanel(this.gamePausePrefab, this.gamePausePanel)
    this.hud = this.createPanel(this.HUDPrefab, this.HUDLayer)
    this.gameResult = this.createPanel(
      this.gameResultPrefab,
      this.gameResultPanel,
    )

    // 依据当前状态做一次初始显隐（避免启动时状态已是某值却未收到广播）
    this.onStateChange(gameManager.getStateSnapshot())
  }

  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 实例化一个 UI Prefab 并挂到指定 Layer 下，默认隐藏
   * @returns 实例节点；prefab 或 layer 缺失时返回 null
   */
  private createPanel(prefab: Prefab | null, layer: Node | null): Node | null {
    if (!prefab || !layer) return null

    const node = instantiate(prefab)
    node.parent = layer
    node.active = false
    return node
  }

  /**
   * 状态变化 → 统一刷新各面板显隐。
   * 完整的"状态-可见性矩阵"集中在这里，新增面板/状态只改此处。
   */
  private onStateChange({ newState }: StateChangePayload): void {
    // HUD：游玩与暂停时可见
    this.setVisible(
      this.hud,
      newState === GameState.PLAYING || newState === GameState.PAUSED,
    )
    // 主菜单：仅菜单状态
    this.setVisible(this.menu, newState === GameState.MENU)
    // 暂停面板：仅暂停状态
    this.setVisible(this.gamePause, newState === GameState.PAUSED)
    // 结算面板：仅结束状态
    this.setVisible(this.gameResult, newState === GameState.OVER)
  }

  private setVisible(node: Node | null, visible: boolean): void {
    if (node && node.active !== visible) {
      node.active = visible
    }
  }
}
