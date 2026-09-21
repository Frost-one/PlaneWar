import { _decorator, Button, Component, Label, Sprite } from 'cc'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import type { IPlayerData } from '../data/PlayerData'
import { cycleShip, getShip, getShipSprite, isShipAssetsLoaded } from '../data/ships/ShipRegistry'
import type { ShipConfig } from '../data/ships/ShipConfig'
const { ccclass, property } = _decorator

/**
 * 选机界面（左右箭头切换）
 *
 * 交互：点左 / 右箭头 → 循环切换到上 / 下一架飞机 → 立即生效并显示。
 *
 * 【职责边界】
 *   本组件只负责"显示当前机型"和"把玩家点选结果交给 PlayerData"。
 *   - 选中的机型状态存在 PlayerData.shipId（跨局保留），**不在本组件里存** ——
 *     否则 Player / HUD 想读当前机型时就得反过来找 UI。
 *   - 不负责把外观应用到 Player 节点：那是 Player 订阅 player_data_change 后自己做的事。
 *
 * 【为什么点箭头就能"立刻看到飞机变了"】
 *   点击 → playerData.applyShip(cfg) → 广播 player_data_change
 *        → 本组件刷新显示（预览图 + 文字）
 *        → Player 组件同时收到广播，换掉自己身上的 Sprite 图
 *   也就是说：菜单里的预览图和场景里的真飞机是【同一条数据链】驱动的，不会不一致。
 */
@ccclass('ShipSelectView')
export class ShipSelectView extends Component {
  /** 机型预览图节点（挂 Sprite 组件）—— 切换时改它的 spriteFrame */
  @property(Sprite)
  previewSprite: Sprite | null = null

  /** 机型名称（显示 SHIP_CONFIGS[].name） */
  @property(Label)
  nameLabel: Label | null = null

  /** 开火风格（显示机型自己声明的 fireStyleName，如"散射"/"贯穿"/"激光"） */
  @property(Label)
  weaponLabel: Label | null = null

  /** 属性描述（生命 / 速度） */
  @property(Label)
  infoLabel: Label | null = null

  /** 左箭头：切上一架 */
  @property(Button)
  leftButton: Button | null = null

  /** 右箭头：切下一架 */
  @property(Button)
  rightButton: Button | null = null

  /**
   * 订阅与按钮监听一律跟随【激活状态】，与 onDisable 严格对称。
   *
   * 为什么不用 onLoad / onDestroy：
   *   本面板由 UIManager 反复切换 active，隐藏期间不该继续收广播、也不该刷新；
   *   放在 onLoad 会让隐藏的面板一直挂着订阅（白干活，且逻辑上属于"还在监听一个看不见的界面"）。
   */
  protected onEnable(): void {
    if (this.leftButton) {
      this.leftButton.node.on(Button.EventType.CLICK, this.onPrev, this)
    }
    if (this.rightButton) {
      this.rightButton.node.on(Button.EventType.CLICK, this.onNext, this)
    }

    // 玩家数据：别处（存档、默认值、reset）改了机型也能同步刷新
    eventBus.on('player_data_change', this.onPlayerDataChange, this)
    // 资源是异步加载的，可能在本面板首次激活之后才就绪 —— 靠这条广播补一次刷新
    eventBus.on('ship_assets_ready', this.onShipAssetsReady, this)

    // 激活时主动拉一次快照：可能已经错过了之前的广播
    this.onPlayerDataChange(playerData.getSnapshot())
  }

  protected onDisable(): void {
    if (this.leftButton) {
      this.leftButton.node.off(Button.EventType.CLICK, this.onPrev, this)
    }
    if (this.rightButton) {
      this.rightButton.node.off(Button.EventType.CLICK, this.onNext, this)
    }
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
    eventBus.off('ship_assets_ready', this.onShipAssetsReady, this)
  }

  /** 资源异步加载完成 → 用当前快照补一次刷新 */
  private onShipAssetsReady(): void {
    // 异步广播到达时，节点可能已经被销毁或回收 —— 先确认还活着再操作
    if (!this.node?.isValid) return
    this.onPlayerDataChange(playerData.getSnapshot())
  }

  // ==================== 交互 ====================

  /** 左箭头：切到上一架（到头则绕回最后一架） */
  private onPrev(): void {
    this.selectByOffset(-1)
  }

  /** 右箭头：切到下一架（到尾则绕回第一架） */
  private onNext(): void {
    this.selectByOffset(1)
  }

  /**
   * 按偏移量切换机型（取模的坑已收进 ShipRegistry.cycleShip）。
   *
   * 循环（而非到头就停）的原因：只有 3 架，循环后"左右都能一直点"，
   * 玩家想从第 1 架到第 3 架只需按一次左箭头。
   */
  private selectByOffset(offset: number): void {
    this.select(cycleShip(playerData.getSnapshot().shipId, offset))
  }

  /** 选中某架飞机：写入数据层（applyShip 会改属性并广播，本组件再被动刷新显示） */
  private select(cfg: ShipConfig): void {
    // 同一架就不重复写：applyShip 会把血量补满，重复点会把受伤状态洗掉
    if (playerData.getSnapshot().shipId === cfg.id) return

    playerData.applyShip(cfg)
    console.log(`[ShipSelectView] 切换机型 → ${cfg.name}（${cfg.id}）`)
  }

  // ==================== 显示 ====================

  /** 玩家数据变化 → 按 shipId 刷新预览图与文字 */
  private onPlayerDataChange(data: Readonly<IPlayerData>): void {
    const cfg = getShip(data.shipId)
    if (!cfg) {
      console.warn(`[ShipSelectView] 找不到机型配置：${data.shipId}`)
      return
    }

    // 外观：取这架飞机的【第 1 档】贴图（选机界面只展示初始形态）。
    // 升级后的形态由 Player 自己按火力等级切换，与本预览无关。
    //
    // 取不到图有两种原因，处理方式相反：
    //   ① 资源还在加载（本面板的 onEnable 会早于 loadShipAssets 完成）
    //      → 什么都不做，等 `ship_assets_ready` 广播唤醒即可；
    //   ② 加载已结束却仍没有 → 这才是真的缺资源，保留 prefab 原样并警告。
    // 不区分二者的话，每次进菜单都会先打一条误导性的"资源没放好"警告。
    const frame = getShipSprite(cfg.id)
    if (frame) {
      if (this.previewSprite) this.previewSprite.spriteFrame = frame
    } else if (isShipAssetsLoaded()) {
      console.warn(`[ShipSelectView] 机型贴图未加载：${cfg.id}（检查 assets/resources/ 下是否放了资源）`)
    }

    if (this.nameLabel) this.nameLabel.string = cfg.name
    if (this.infoLabel) {
      this.infoLabel.string = `生命 ${cfg.maxHp}　速度 ${cfg.speed}`
    }
    // 开火风格：机型自己声明的显示名（各机型的弹道数值已下沉到飞船文件，这里只读名字）
    if (this.weaponLabel) this.weaponLabel.string = cfg.fireStyleName
  }
}