import { _decorator, Component, Node, Prefab, instantiate } from 'cc'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { Bullet } from '../entities/Bullet'
const { ccclass, property } = _decorator

/**
 * 子弹管理器
 * - 统一负责子弹的【生成】与【销毁/回收】
 * - 子弹统一挂到专用容器 bulletContainer 下，便于整体清场
 * - 状态迁移时按「时间停止」语义决定是否清场（与 EnemyManager 规则一致）
 *
 * 职责边界：只管生成与销毁，不干涉子弹自身的移动与碰撞（那是 Bullet 组件的事）。
 */
@ccclass('BulletManager')
export class BulletManager extends Component {
  /** 子弹预制体（拖入 Bullet_1.prefab） */
  @property(Prefab)
  bulletPrefab: Prefab | null = null

  /**
   * 子弹专用容器节点（建议拖入 GameRoot/Bullets）。
   * 该节点下应仅存放子弹，便于清场时安全地整体清理。
   *
   * 留空时默认使用本组件所在节点 —— 适合直接把本组件挂在容器节点上的用法
   * （此时连引用都不用拖）。
   */
  @property(Node)
  bulletContainer: Node | null = null

  /**
   * 当前存活的子弹列表。
   * 用于快速遍历与统一回收；配合 isValid 判断可容忍"子弹自行销毁"造成的失效引用。
   * 后续接入对象池时，这里可直接改为持有可复用的子弹实例。
   */
  private bullets: Node[] = []

  protected onLoad(): void {
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 状态切换：清场规则与 EnemyManager 保持一致。
   *
   * 「时间停止」区间（PLAYING ↔ PAUSED）：不清场 ——
   *   子弹由 Bullet 自身把线速度置零原地冻结，恢复后从原处继续飞。
   * 进入 OVER：暂不清场，保留结算瞬间的战场画面。
   * 其余迁移（新开局 / 回菜单）：清空残留子弹，避免上一局的子弹飞进新一局。
   */
  private onStateChange({ oldState, newState }: StateChangePayload): void {
    if (oldState === GameState.PAUSED || newState === GameState.PAUSED) {
      return
    }
    if (newState === GameState.OVER) {
      return
    }
    this.clearBullets()
  }

  /**
   * 生成一颗子弹并放到指定位置
   * @param x 出生点 x（相对容器的局部坐标）
   * @param y 出生点 y（相对容器的局部坐标）
   * @returns 生成的子弹节点；预制体缺失时返回 null
   */
  public spawnBullet(x: number, y: number): Node | null {
    if (!this.bulletPrefab) return null

    // 未指定容器时退回本组件所在节点
    const container = this.bulletContainer ?? this.node

    const bullet = instantiate(this.bulletPrefab)
    bullet.parent = container
    bullet.setPosition(x, y)

    // 注入管理者引用：子弹自行回收时（飞出上界 / 命中敌机）
    // 会通过它把自己从追踪列表中摘除，避免残留失效引用
    const bulletComp = bullet.getComponent(Bullet)
    if (bulletComp) bulletComp.init(this)

    // 纳入追踪列表，供后续统一回收
    this.bullets.push(bullet)
    return bullet
  }

  // ==================== 销毁 / 回收 ====================

  /**
   * 统一回收接口：销毁一颗子弹并将其移出追踪列表。
   * 后续接入对象池时，只需把 destroy() 换成回池操作。
   *
   * @param bullet 待回收的子弹节点
   */
  public destroyBullet(bullet: Node): void {
    // 先从追踪列表摘除（找不到也无妨，说明已被回收过）
    this.unregisterBullet(bullet)

    // isValid 判断：子弹可能已被自身 destroy，避免重复销毁报错
    if (bullet.isValid) bullet.destroy()
  }

  /**
   * 清空全部子弹。
   * 以追踪列表为准（而非遍历容器子节点），因此不依赖容器的子节点构成。
   */
  private clearBullets(): void {
    // 拷贝一份再遍历：destroyBullet 会修改原数组
    const list = this.bullets.slice()
    for (const bullet of list) {
      this.destroyBullet(bullet)
    }
    // 保险：清理可能遗漏的无效引用
    this.bullets.length = 0
  }

  /**
   * 从追踪列表摘除某颗子弹（不销毁节点）。
   * 供 Bullet 脚本在自行销毁前调用，避免列表残留失效引用。
   *
   * @param bullet 要摘除的子弹节点
   */
  public unregisterBullet(bullet: Node): void {
    const idx = this.bullets.indexOf(bullet)
    if (idx >= 0) this.bullets.splice(idx, 1)
  }
}
