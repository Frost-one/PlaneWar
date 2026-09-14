import { _decorator, Collider, Collider2D, Component, Contact2DType } from 'cc'
import { GameConfig } from '../data/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
// 仅用于类型标注，编译后不产生真实 import，避免与 EnemyManager 形成循环依赖
import type { EnemyManager } from '../managers/EnemyManager'
const { ccclass, property } = _decorator

/**
 * 敌机实体组件（挂在 Enemy Prefab 上）
 * - 每帧向下飞行（朝屏幕下方移动，与玩家子弹向上相反）
 * - 飞出玩家可视区域下界、被击中、或撞到玩家时，通过 despawn() 统一销毁
 * - 仅在 PLAYING 状态下飞行
 *
 * 职责边界：只管自身的移动与消亡，不管生成（那是 EnemyManager 的事）。
 * @property speed 敌机向下飞行速度（像素/秒），可在 Enemy Prefab / Inspector 中调整
 */
@ccclass('Enemy')
export class Enemy extends Component {
  /** 敌机向下飞行速度（像素/秒） */
  @property
  speed = 150

  /** 飞出下界时额外再让出一点屏距，保证整机完全离屏才销毁 */
  private static readonly DESTROY_EXTRA = 40

  /**
   * 是否处于暂停（冻结）状态。
   * 敌机只在 PLAYING 状态下由 EnemyManager 生成，因此生成时必然处于游玩中，
   * 默认即为 false（未暂停）；之后暂停/恢复由 state_change 事件驱动切换。
   *
   * 采用「时间停止」语义：冻结时 update 直接 return，位置自然原地保留，
   * 恢复后从原处继续往下飞，无需额外记录进度。
   */
  private isPaused = false

  /**
   * 所属的敌机管理器，由 EnemyManager 在生成时注入。
   * 用于在自身销毁前从管理器的追踪列表中摘除，避免残留失效引用。
   */
  private manager: EnemyManager | null = null

  /**
   * 敌机的初始化入口，由 EnemyManager 在生成后立即调用。
   *
   * 职责：
   * - 注入管理者引用（销毁时用于摘除追踪记录）
   * - 应用运行时才确定的属性（后续扩展点：血量、等级、波次加成等）
   *
   * 注意：不要在这里覆盖 speed 等 @property 字段 ——
   *       那些是编辑器里配置的初始值，覆盖会冲掉 Inspector 设置。
   *       若要支持"动态覆盖"，应另加独立的运行时字段（如 speedBonus）。
   *
   * @param manager 生成该敌机的敌机管理器
   */
  public init(manager: EnemyManager): void {
    this.manager = manager

    // —— 后续在此初始化运行时属性，例如： ——
    // this.hp = this.maxHp * waveMultiplier
  }

  protected onLoad(): void {
    const collider = this.getComponent(Collider2D)
    collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)

    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    const collider = this.getComponent(Collider2D)
    collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 状态切换：仅 PLAYING 时不暂停（其余状态视为冻结）。
   * 「时间停止」靠 update 直接 return 实现：位置原地保留，恢复后继续。
   */
  private onStateChange({ newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING
  }

  protected update(deltaTime: number): void {
    // 暂停/非游玩状态（菜单/暂停/结算）时冻结，不向下飞
    if (this.isPaused) return

    const p = this.node.position

    // —— 向下位移（y 减小）——
    const newY = p.y - this.speed * deltaTime

    // —— 超出玩家可视区下界则回收 ——
    if (newY < GameConfig.BOUND_MIN_Y - Enemy.DESTROY_EXTRA) {
      this.despawn()
      return
    }

    this.node.setPosition(p.x, newY)
  }

  /**
   * 统一的自我销毁入口。
   * 先通知管理器将自身移出追踪列表，再销毁节点 ——
   * 避免管理器列表里残留已销毁的失效引用。
   */
  private despawn(): void {
    this.manager?.unregisterEnemy(this.node)
    this.node.destroy()
  }

  onBeginContact(selfCollider: Collider, otherCollider: Collider) {
    console.log('发生了碰撞', selfCollider, otherCollider)

    if (otherCollider.node.name === 'Bullet_1') {
      // 敌机被命中
      this.scheduleOnce(() => {
        this.despawn()
      }, 0)

      eventBus.emit('enemy_die', {
        bulletNode: otherCollider.node,
        enemyNode: selfCollider.node,
      })
      return
    }

    if (otherCollider.node.name === 'Player') {
      // 敌机撞到玩家：敌机暂无生命值，撞击即同归于尽（自身销毁）；
      // 玩家的扣血/判死规则交由 GameManager 统一处理（数据层唯一写入口）
      eventBus.emit('player_hit', {
        enemyNode: selfCollider.node,
        playerNode: otherCollider.node,
      })

      this.scheduleOnce(() => {
        this.despawn()
      }, 0)
    }
  }
}
