import { _decorator, Collider, Collider2D, Component, Contact2DType } from 'cc'
import { GameConfig } from '../data/GameConfig'
import { eventBus } from '../core/EventBus'
const { ccclass, property } = _decorator

/**
 * 敌机实体组件（挂在 Enemy Prefab 上）
 * - 每帧向下飞行（朝屏幕下方移动，与玩家子弹向上相反）
 * - 飞出玩家可视区域下界后自行销毁，避免节点残留堆积
 * @property speed 敌机向下飞行速度（像素/秒），可在 Enemy Prefab / Inspector 中调整
 */
@ccclass('Enemy')
export class Enemy extends Component {
  /** 敌机向下飞行速度（像素/秒） */
  @property
  speed = 150

  /** 飞出下界时额外再让出一点屏距，保证整机完全离屏才销毁 */
  private static readonly DESTROY_EXTRA = 40

  protected onLoad(): void {
    const collider = this.getComponent(Collider2D)
    collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)
  }

  protected onDestroy(): void {
    const collider = this.getComponent(Collider2D)
    collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)
  }

  protected update(deltaTime: number): void {
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
    if (otherCollider.node.name === 'Bullet_1') {
      // 敌机被命中
      this.scheduleOnce(() => {
        selfCollider.node.destroy()
      }, 0)

      eventBus.emit('enemy_die', {
        bulletNode: otherCollider.node,
        enemyNode: selfCollider.node
      })
    }
  }
}
