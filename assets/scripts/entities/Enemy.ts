import { _decorator, Collider, Collider2D, Component, Contact2DType } from 'cc'
import { GameConfig } from '../data/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
const { ccclass, property } = _decorator

/**
 * 敌机实体组件（挂在 Enemy Prefab 上）
 * - 每帧向下飞行（朝屏幕下方移动，与玩家子弹向上相反）
 * - 飞出玩家可视区域下界后自行销毁，避免节点残留堆积
 * - 仅在 PLAYING 状态下飞行
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
   */
  private isPaused = false

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

  /** 状态切换：仅 PLAYING 时不暂停（其余状态视为冻结） */
  private onStateChange({ state }: StateChangePayload): void {
    this.isPaused = state !== GameState.PLAYING
  }

  protected update(deltaTime: number): void {
    // 暂停/非游玩状态（菜单/暂停/结算）时冻结，不向下飞
    if (this.isPaused) return

    const p = this.node.position

    // —— 向下位移（y 减小）——
    const newY = p.y - this.speed * deltaTime

    // —— 超出玩家可视区下界则销毁 ——
    if (newY < GameConfig.BOUND_MIN_Y - Enemy.DESTROY_EXTRA) {
      this.node.destroy()
      return
    }

    this.node.setPosition(p.x, newY)
  }

  onBeginContact(selfCollider: Collider, otherCollider: Collider) {
    console.log('发生了碰撞', selfCollider, otherCollider)

    if (otherCollider.node.name === 'Bullet_1') {
      // 敌机被命中
      this.scheduleOnce(() => {
        selfCollider.node.destroy()
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
        selfCollider.node.destroy()
      }, 0)
    }
  }
}
