import { _decorator, Component, Node, Sprite, Color } from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { GameState } from '../data/GameState'
import type { StateChangePayload } from '../core/GameEvent'
import { Player } from './Player'
import type { DropManager } from '../managers/DropManager'
import { PickupType } from '../data/pickups/PickupConfig'
import type { PickupPayload } from '../core/GameEvent'
import type { PickupId } from '../data/pickups/PickupConfig'
import { getPickup } from '../data/pickups/PickupRegistry'

const { ccclass } = _decorator

/** 回弹缓动（弹出一个小过冲再落回），让生成有"蹦出来"的手感 */
function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const p = t - 1
  return 1 + c3 * p * p * p + c1 * p * p
}

/**
 * 可拾取道具实体组件（武器升级 / 回血 / 护盾…… 统一由 PickupType 区分）。
 *
 * 行为：
 *  - 从击杀点匀速下落；
 *  - 与玩家做【距离判定】—— 不引入新物理分组，与激光"非物理判定"思路一致；
 *  - 进入磁铁半径且 trackPlayer=true → 改为高速朝玩家移动（每帧重算方向 = 玩家无法躲开，必定被吃）；
 *  - 进入拾取半径 → 广播 `pickup_collected`（载荷含 type + 各类型字面量 levels/heal/shield）→ 回收；
 *  - 自身可自旋（spin）：仅视觉旋转，不影响垂直下落与吸附轨迹。
 *  - 掉出下界也回收。
 *
 * 玩家位置通过 Player.getInstance() 获取（与本项目 Manager 单例风格一致）。
 * 视觉图标与运动参数（spin 等）由 PickupRegistry 按类型驱动，生成时写入。
 *
 * 职责边界：只管自身下落 / 吸附 / 消亡；生成与回收由 DropManager 统一管（对象池）。
 */
@ccclass('Pickup')
export class Pickup extends Component {
  /** 下落速度（px/s） */
  private static readonly FALL_SPEED = 160
  /** 掉出下界再多让出一点屏距，保证完全离屏才回收 */
  private static readonly DESPAWN_EXTRA = 40

  /** 生成弹出时长（秒） */
  private static readonly POP_DUR = 0.28
  /** 呼吸缩放幅度（±10%） */
  private static readonly PULSE_AMP = 0.10
  /** 呼吸角频率（≈1.1s 一个周期） */
  private static readonly PULSE_FREQ = (Math.PI * 2) / 1.1
  /** 道具基础缩放（与 prefab 默认一致；若接入方案 B 放大衬底则改这里） */
  private static readonly BASE_SCALE = 1

  /** 是否冻结（非 PLAYING 时不下落 / 不吸附） */
  private isPaused = false
  /** 归属的管理器，用于回收自身 */
  private manager: DropManager | null = null
  /** 防重入：下落 / 拾取两条路径可能同一帧都触发回收 */
  private released = false
  /** 生成弹出进度（秒）与是否处于弹出阶段 */
  private popT = 0
  private popping = false
  /** 呼吸相位（秒） */
  private pulseT = 0

  // —— 由类型决定的状态（init 时从 PickupRegistry 拷入）——
  private id: PickupId = 'pickup_weapon_up'
  private type: PickupType = PickupType.WEAPON_UP
  private levels: number | undefined = undefined
  private heal: number | undefined = undefined
  private shield: number | undefined = undefined
  private trackPlayer: boolean = true
  private spin: number = 0

  /** 视觉组件（可选；prefab 没带则跳过着色） */
  private sprite: Sprite | null = null

  /** 由 DropManager 在生成（借出对象池）时调用；图标由 getPickup(id).asset 取，占位 tint/label 已移除，无图标时仅显示空 Sprite */
  public init(manager: DropManager, id: PickupId): void {
    this.manager = manager
    this.released = false
    this.isPaused = false
    this.unscheduleAllCallbacks()

    const pkg = getPickup(id)
    if (!pkg) {
      console.warn(`[Pickup] 未知道具 id：${id}`)
      return
    }
    const cfg = pkg.config
    const spriteFrame = pkg.asset?.sprite ?? null
    this.id = cfg.id
    this.type = cfg.type
    this.levels = cfg.levels
    this.heal = cfg.heal
    this.shield = cfg.shield
    this.trackPlayer = cfg.trackPlayer
    this.spin = cfg.spin ?? 0

    // 应用数据驱动视觉：使用图标 SpriteFrame；占位 tint/label 已移除，无图标时仅留空 Sprite
    const labelNode = this.node.getChildByName('Label')
    if (labelNode) labelNode.active = false
    this.sprite = this.getComponent(Sprite)
    if (this.sprite) {
      this.sprite.spriteFrame = spriteFrame
      this.sprite.color = Color.WHITE
    }

    // 生成弹出 + 持续呼吸（纯视觉，不影响下落/吸附轨迹与判定半径）
    this.popT = 0
    this.popping = true
    this.pulseT = 0
    this.node.setScale(0, 0, 1)
  }

  protected onEnable(): void {
    eventBus.on('state_change', this.onStateChange, this)
  }
  protected onDisable(): void {
    eventBus.off('state_change', this.onStateChange, this)
  }
  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)
  }

  private onStateChange({ newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING
  }

  protected update(dt: number): void {
    if (this.isPaused) return

    // 生成弹出 + 呼吸缩放（每帧重算，只改 node 缩放，不干扰位置/角度/判定）
    let s: number
    if (this.popping) {
      this.popT += dt
      const k = Math.min(1, this.popT / Pickup.POP_DUR)
      s = easeOutBack(k) * Pickup.BASE_SCALE
      if (k >= 1) this.popping = false
    } else {
      this.pulseT += dt
      s = (1 + Pickup.PULSE_AMP * Math.sin(this.pulseT * Pickup.PULSE_FREQ)) * Pickup.BASE_SCALE
    }
    this.node.setScale(s, s, 1)

    // 玩家位置（单例）；拿不到就只下落
    const player = Player.getInstance()
    const pp = player?.node?.isValid ? player.node.position : null

    if (pp) {
      const dx = pp.x - this.node.x
      const dy = pp.y - this.node.y
      const dist = Math.hypot(dx, dy)

      // 进入拾取半径 → 直接拾取
      if (dist <= GameConfig.PICKUP_RADIUS) {
        this.collect()
        return
      }

      // 进入磁铁半径且本类型允许吸附 → 高速朝玩家当前位置移动
      // （每帧重算方向，玩家无论如何闪避都必定被追上）
      if (this.trackPlayer && dist <= GameConfig.PICKUP_MAGNET_RADIUS) {
        const inv = 1 / (dist || 1)
        this.node.setPosition(
          this.node.x + dx * inv * GameConfig.PICKUP_MAGNET_SPEED * dt,
          this.node.y + dy * inv * GameConfig.PICKUP_MAGNET_SPEED * dt,
        )
        this.checkDespawn()
        this.spinStep(dt) // 吸附飞行中照样自旋（不影响轨迹）
        return
      }
    }

    // 普通下落
    this.node.setPosition(this.node.x, this.node.y - Pickup.FALL_SPEED * dt)
    this.checkDespawn()
    this.spinStep(dt)
  }

  /** 自身自旋（度/秒）；仅视觉，不影响下落与吸附轨迹 */
  private spinStep(dt: number): void {
    if (this.spin) this.node.angle += this.spin * dt
  }

  /** 掉出下界 → 回收（防重入） */
  private checkDespawn(): void {
    if (this.node.position.y < GameConfig.BOUND_MIN_Y - Pickup.DESPAWN_EXTRA) {
      this.release()
    }
  }

  /** 拾取：按类型打包字面量载荷 → 广播 → 回收 */
  private collect(): void {
    const payload: PickupPayload = { id: this.id, type: this.type }
    if (this.levels !== undefined) payload.levels = this.levels
    if (this.heal !== undefined) payload.heal = this.heal
    if (this.shield !== undefined) payload.shield = this.shield
    eventBus.emit('pickup_collected', payload)
    this.release()
  }

  /** 统一回收入口（防重入） */
  private release(): void {
    if (this.released) return
    this.released = true
    this.manager?.releasePickup(this.node)
  }
}
