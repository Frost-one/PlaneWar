import {
  _decorator,
  Collider2D,
  Component,
  Contact2DType,
  PHYSICS_2D_PTM_RATIO,
  RigidBody2D,
  Vec2,
} from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
// 仅用于类型标注，编译后不产生真实 import，避免与 BulletManager 形成循环依赖
import type { BulletManager } from '../managers/BulletManager'
import { PHYSICS_GROUP } from '../data/config/PhysicsGroups'
const { ccclass, property } = _decorator

/**
 * 子弹的生成参数：由 Player 组装、BulletManager 透传、Bullet 消费。
 *
 * 预制体只提供"壳"（图 / 碰撞体 / 刚体 / 本组件），参数提供"魂"（朝向 / 位置 / 速度）。
 * 散射与贯穿共用这条流水线，差别只在参数组合：
 *   - 散射：多个不同【偏角】，偏移量为 0（扇形铺开）
 *   - 贯穿：偏角都为 0，靠【横向偏移】拉开多条【平行弹道】（等伤害系统一起做 damage / pierce）
 */
export interface BulletSpawnParams {
  /** 偏角（度），向右为正；0 = 垂直向上 */
  angleDeg: number
  /**
   * 相对出生原点的【横向偏移】（px，右为正）；0 = 不偏移。
   *
   * 用于"多弹道并列射"：如贯穿没有角度，但一次发 3 条平行弹道 → offsetX = -18 / 0 / +18。
   * ⚠️ 这是相对玩家机头的偏移，**不是绝对坐标** ——
   *    绝对位置 = 发射瞬间的玩家 x + offsetX。这样发射端的 builder 就不需要知道玩家在哪。
   */
  damage: number // 伤害
  offsetX: number
  /** 飞行速度（px/s，设计单位）；写入刚体时才 ÷ PHYSICS_2D_PTM_RATIO */
  speed: number
  pierce: number  // 贯穿数量，表示命中第 pierce + 1 个敌机后就销毁
}

/**
 * 子弹实体组件（挂在 Bullet Prefab 上）
 * - 移动由 RigidBody2D 驱动：按【注入的偏角与速度】做匀速直线运动，不再手动 setPosition
 * - 飞出可视范围、命中敌机时，通过 despawn() 归还到对象池
 * - 仅在 PLAYING 状态下飞行
 *
 * 职责边界：只管自身的运动与消亡，不管生成（那是 BulletManager 的事）。
 */
@ccclass('Bullet')
export class Bullet extends Component {
  /**
   * 飞行速度（px/s，设计单位）。
   * 由生成时注入 —— 不再走 @property，避免与发射器档位构成"双源"。
   */
  private speed = 0
  private damage = 0
  /** 偏角（度，向右为正）；暂停恢复时靠它重建速度方向，所以必须存下来 */
  private angleDeg = 0
  private pierce = 0
  /**
   * 本颗子弹相对出生原点的【横向偏移】（px，右为正）。
   * 存下来有两个用途：
   *   1. init 里据此把自己摆到最终出生位置（“子弹自己决定自己的出生点”）
   *   2. 将来做“汇聚 / 扩散”弹道时需要知道它从哪条弹道出发
   */
  private offsetX = 0

  /** 刚体引用，用于状态切换时暂停/恢复运动 */
  private rigidBody: RigidBody2D | null = null

  /**
   * 是否处于暂停（冻结）状态。
   * 子弹只在 PLAYING 状态下由玩家发射，因此生成时必然处于游玩中，
   * 默认即为 false（未暂停）；之后暂停/恢复由 state_change 事件驱动切换。
   *
   * 采用「时间停止」语义：冻结时把线速度置零，刚体位置原地保留，
   * 恢复后重新赋予速度，从原处继续飞。
   */
  private isPaused = false

  /**
   * 是否已归还对象池：防止「命中即销毁」的 scheduleOnce 回调在节点复用后重复触发 despawn。
   * init 时复位为 false，despawn 时置 true，双重保险。
   */
  private released = false

  /**
   * 所属的子弹管理器，由 BulletManager 在生成时注入。
   * 用于在自身回收前从管理器的追踪列表中摘除，避免残留失效引用。
   */
  private manager: BulletManager | null = null

  /**
   * 由 BulletManager 在生成时调用：注入管理者引用 + 本次飞行的参数。
   *
   * ⚠️ 与 onLoad 的先后顺序：设置 parent 会触发激活，onLoad 可能已跑过、也可能还没。
   * 所以这里不假设刚体已就绪 —— applyVelocity 内部会兜底 getComponent，
   * onLoad 末尾也会补调一次 applyVelocity，两种顺序都能正确起飞。
   *
   * ⚠️ 节点可能来自对象池复用：所有"上一世"的状态必须在此完整复位，否则会出现鬼影子弹。
   */
  public init(manager: BulletManager, params: BulletSpawnParams): void {
    this.manager = manager

    // —— 复用自池中的节点带着「上一世」的全部状态，必须在此完整复位 ——
    this.released = false
    this.isPaused = false
    // 清空上一世残留的定时器（如命中后延迟销毁的 scheduleOnce 回调）
    this.unscheduleAllCallbacks()

    this.speed = params.speed
    this.angleDeg = params.angleDeg
    this.offsetX = params.offsetX
    this.damage = params.damage
    this.pierce = params.pierce

    // 出生位置：BulletManager 的 setPosition 给的是“原点”（玩家机头），
    // 横向偏移由本颗子弹自己补 —— 这样 BulletManager 就不必理解 params 里每个字段的含义
    if (this.offsetX !== 0) {
      const p = this.node.position
      this.node.setPosition(p.x + this.offsetX, p.y)
    }

    // 图与速度方向必须一致：Cocos 的旋转逆时针为正，所以"向右偏"要用负角度
    this.node.angle = -this.angleDeg

    this.applyVelocity()
  }

  /**
   * 按当前的 speed / angleDeg 重建线速度。
   * 生成时与暂停恢复时都走这里 —— 保证"角度 → 速度"全工程只有这一处换算。
   */
  private applyVelocity(): void {
    if (this.speed <= 0) return

    // onLoad 尚未执行时 rigidBody 可能还没拿到，这里兜底一次
    if (!this.rigidBody) this.rigidBody = this.getComponent(RigidBody2D)
    if (!this.rigidBody) return

    const rad = (this.angleDeg * Math.PI) / 180
    this.rigidBody.linearVelocity = new Vec2(
      (this.speed * Math.sin(rad)) / PHYSICS_2D_PTM_RATIO,
      (this.speed * Math.cos(rad)) / PHYSICS_2D_PTM_RATIO,
    )
  }

  protected onLoad(): void {
    const collider = this.getComponent(Collider2D)
    collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)

    // —— 移动交给刚体（物理模型）驱动，不再手动 setPosition ——
    const rigidBody = this.getComponent(RigidBody2D)
    this.rigidBody = rigidBody
    if (rigidBody) {
      // 关闭重力，保证子弹做匀速直线运动（不被全局重力拉弯）
      rigidBody.gravityScale = 0
      // 开启连续碰撞检测（CCD / bullet），防止高速飞行时直接穿透敌机
      rigidBody.bullet = true
      // ⚠️ 这里【不】设置线速度：速度方向由 init 注入，见 applyVelocity
    } else {
      // 兜底：没有刚体就不会移动（不再假装有"手动位移"回退）
      console.warn('[Bullet] 未找到 RigidBody2D，子弹将无法移动')
    }

    eventBus.on('state_change', this.onStateChange, this)

    // 兼容"init 早于 onLoad"的顺序（详见 init 的说明）
    this.applyVelocity()
  }

  protected onDestroy(): void {
    const collider = this.getComponent(Collider2D)
    collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 状态切换：仅 PLAYING 时飞行（其余状态冻结）。
   * 「时间停止」：冻结时线速度置零，刚体位置原地保留，恢复后从原处继续飞。
   */
  private onStateChange({ newState }: StateChangePayload): void {
    const paused = newState !== GameState.PLAYING
    if (paused === this.isPaused) return
    this.isPaused = paused

    if (paused) {
      // 冻结：线速度置零，刚体位置原地保留
      if (this.rigidBody) this.rigidBody.linearVelocity = new Vec2(0, 0)
    } else {
      // 恢复：按存储的偏角重建速度方向 —— 不能写死 (0, speed)
      this.applyVelocity()
    }
  }

  protected update(): void {
    // 移动已交由 RigidBody2D 驱动，这里仅做边界回收。
    // ⚠️ 散射的子弹是【斜着飞】的：除了上界还要判左右，
    //    否则偏角最大的那几颗会从屏幕两侧飞出去却永不销毁，越积越多。
    const p = this.node.position
    if (
      p.y > GameConfig.BOUND_MAX_Y + 5 ||
      Math.abs(p.x) > GameConfig.BOUND_MAX_X + 50
    ) {
      this.despawn()
    }
  }

  /**
   * 统一的归还对象池入口。
   * 交给管理器把自身从追踪列表摘除，并按 prefab 还回对应的池（管理器内部决定复用或销毁）。
   * released 标志防止「命中即销毁」的延迟回调在复用后重复触发。
   */
  private despawn(): void {
    // 防止同一颗子弹在「复用后」被上一世的延迟销毁回调再次回收
    if (this.released) return
    this.released = true
    // 交给管理器归还到对象池（管理器会把它从追踪列表摘除 + 按 prefab 回池）
    this.manager?.releaseBullet(this.node)
  }

  onBeginContact(selfCollider2D: Collider2D, otherCollider: Collider2D) {
    if (otherCollider.group !== PHYSICS_GROUP.ENEMY) return

    if (this.pierce <= 0) {
      this.scheduleOnce(() => {
        this.despawn()
      }, 0)
    } else {
      this.pierce--
    }
  }

  getDamage(): number {
    return this.damage
  }
}
