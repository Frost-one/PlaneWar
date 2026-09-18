import { _decorator, Button, Component, Label, Sprite, SpriteFrame } from 'cc'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import type { IPlayerData } from '../data/PlayerData'
import { cycleShip, getShip } from '../data/ships/ShipTable'
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
  /**
   * 三架飞机的外观图，**顺序必须与 SHIP_CONFIGS 一致**（下标 = ShipConfig.spriteIndex）。
   * 当前显示的那张会按选中机型的 spriteIndex 从这里取。
   */
  @property([SpriteFrame])
  shipSprites: SpriteFrame[] = []

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

  protected onLoad(): void {
    if (this.leftButton) {
      this.leftButton.node.on(Button.EventType.CLICK, this.onPrev, this)
    }
    if (this.rightButton) {
      this.rightButton.node.on(Button.EventType.CLICK, this.onNext, this)
    }

    // 订阅玩家数据：别处（存档、默认值、reset）改了机型也能同步刷新
    eventBus.on('player_data_change', this.onPlayerDataChange, this)

    // 首次进入主动拉一次快照（此时可能还没收到过任何广播）
    this.onPlayerDataChange(playerData.getSnapshot())
  }

  protected onDestroy(): void {
    if (this.leftButton) {
      this.leftButton.node.off(Button.EventType.CLICK, this.onPrev, this)
    }
    if (this.rightButton) {
      this.rightButton.node.off(Button.EventType.CLICK, this.onNext, this)
    }
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
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
   * 按偏移量切换机型（取模的坑已收进 ShipTable.cycleShip）。
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

    // 外观：下标取图，越界/未拖引用时保持原样（不静默换错图）
    const frame = this.shipSprites[cfg.spriteIndex]
    if (this.previewSprite && frame) {
      this.previewSprite.spriteFrame = frame
    }

    if (this.nameLabel) this.nameLabel.string = cfg.name
    if (this.infoLabel) {
      this.infoLabel.string = `生命 ${cfg.maxHp}　速度 ${cfg.speed}`
    }
    // 开火风格：机型自己声明的显示名（各机型的弹道数值已下沉到飞船文件，这里只读名字）
    if (this.weaponLabel) this.weaponLabel.string = cfg.fireStyleName
  }
}