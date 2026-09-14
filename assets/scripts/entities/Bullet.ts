import {
  _decorator,
  Collider,
  Collider2D,
  Component,
  Contact2DType,
  RigidBody2D,
  Vec2,
} from 'cc'
import { GameConfig } from '../data/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
// 仅用于类型标注，编译后不产生真实 import，避免与 BulletManager 形成循环依赖
import type { BulletManager } from '../managers/BulletManager'
const { ccclass, property } = _decorator

/**
 * 子弹实体组件（挂在 Bullet Prefab 上）
 * - 移动由 RigidBody2D 驱动（恒定线速度沿 +Y 上升），不再手动 setPosition
 * - 飞出上界、命中敌机时，通过 despawn() 统一回收
 * - 仅在 PLAYING 状态下飞行
 *
 * 职责边界：只管自身的运动与消亡，不管生成（那是 BulletManager 的事）。
 */
@ccclass('Bullet')
export class Bullet extends Component {
  @property
  speed = 25

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
   * 所属的子弹管理器，由 BulletManager 在生成时注入。
   * 用于在自身销毁前从管理器的追踪列表中摘除，避免残留失效引用。
   */
  private manager: BulletManager | null = null

  /** 由 BulletManager 在生成时调用，注入管理者引用 */
  public init(manager: BulletManager): void {
    this.manager = manager
  }

  protected onLoad(): void {
    const collider = this.getComponent(Collider2D)
    collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)

    // —— 移动交给刚体（物理模型）驱动，不再手动 setPosition ——
    const rigidBody = this.getComponent(RigidBody2D)
    this.rigidBody = rigidBody
    if (rigidBody) {
      // 关闭重力，保证子弹始终沿 +Y 匀速直线上升（不被全局重力拉弯）
      rigidBody.gravityScale = 0
      // 开启连续碰撞检测（CCD / bullet），防止高速飞行时直接穿透敌机
      rigidBody.bullet = true
      // 施加向上的恒定线速度；此后由物理引擎推进
      rigidBody.linearVelocity = new Vec2(0, this.speed)
    } else {
      // 兜底：若场景中未挂刚体，退化为手动位移，保证功能仍可用
      console.warn('[Bullet] 未找到 RigidBody2D，回退为手动位移')
    }

    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    const collider = this.getComponent(Collider2D)
    collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 状态切换：仅 PLAYING 时飞行（其余状态冻结）。
   * 「时间停止」：冻结时线速度置零，刚体位置原地保留，恢复后从原处继续。
   */
  private onStateChange({ newState }: StateChangePayload): void {
    const paused = newState !== GameState.PLAYING
    if (paused === this.isPaused) return
    this.isPaused = paused

    if (this.rigidBody) {
      this.rigidBody.linearVelocity = paused
        ? new Vec2(0, 0)
        : new Vec2(0, this.speed)
    }
  }

  protected update(): void {
    // 移动已交由 RigidBody2D 驱动，这里仅做边界回收：
    // 飞出上界后回收，避免节点残留堆积
    if (this.node.position.y > GameConfig.BOUND_MAX_Y + 5) {
      this.despawn()
    }
  }

  /**
   * 统一的自我回收入口。
   * 先通知管理器将自身移出追踪列表，再销毁节点 ——
   * 避免管理器列表里残留已销毁的失效引用。
   */
  private despawn(): void {
    this.manager?.unregisterBullet(this.node)
    this.node.destroy()
  }

  onBeginContact(selfCollider: Collider, otherCollider: Collider) {
    if (otherCollider.node.name === 'Enemy') {
      // 子弹命中敌机：广播命中，并在本帧末回收自身
      eventBus.emit('bullet_hit', {
        bulletNode: selfCollider.node,
        enemyNode: otherCollider.node,
      })

      this.scheduleOnce(() => {
        this.despawn()
      }, 0)
    }
  }
}
