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
const { ccclass, property } = _decorator

@ccclass('Bullet')
export class Bullet extends Component {
  @property
  speed = 25

  protected onLoad(): void {
    const collider = this.getComponent(Collider2D)
    collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)

    // —— 移动交给刚体（物理模型）驱动，不再手动 setPosition ——
    const rigidBody = this.getComponent(RigidBody2D)
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
  }

  protected onDestroy(): void {
    const collider = this.getComponent(Collider2D)
    collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)
  }

  protected update(): void {
    // 移动已交由 RigidBody2D 驱动，这里仅做边界回收：
    // 飞出上界后销毁，避免节点残留堆积
    if (this.node.position.y > GameConfig.BOUND_MAX_Y + 5) {
      this.node.destroy()
    }
  }

  onBeginContact(selfCollider: Collider, otherCollider: Collider) {
    if (otherCollider.node.name === 'Enemy') {
      // 子弹命中
      this.scheduleOnce(() => {
        selfCollider.node.destroy()
      }, 0)

      eventBus.emit('bullet_hit', {
        bulletNode: selfCollider.node,
        enemyNode: otherCollider.node,
      })
    }
  }
}
