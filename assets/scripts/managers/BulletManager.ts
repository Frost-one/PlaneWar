import { _decorator, Component, Node, Prefab } from 'cc'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { Bullet, BulletSpawnParams } from '../entities/Bullet'
import { poolManager } from '../core/PoolManager'
const { ccclass, property } = _decorator

/**
 * 子弹管理器
 * - 统一负责子弹的【生成】与【回收】（节点来自对象池 poolManager，按 prefab 复用）
 * - 子弹统一挂到专用容器 bulletContainer 下，便于整体清场
 * - 状态迁移时按「时间停止」语义决定是否清场（与 EnemyManager 规则一致）
 *
 * 职责边界：只管生成与回收，不干涉子弹自身的移动与碰撞（那是 Bullet 组件的事）。
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
   * 仅用于追踪与统一回收；实际节点来自 poolManager（按 prefab 复用），不再每次 instantiate。
   */
  private bullets: Node[] = []

  protected onLoad(): void {
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 状态切换：仅 PLAYING 时飞行（其余状态冻结）。
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
   * 生成一颗子弹并放到指定位置。
   *
   * 本类【刻意不认识武器】：散射有几颗、各自偏多少度，全部由 Player 算好后
   * 通过 params 传进来。这样将来加贯穿 / 激光时，这里一行都不用改。
   *
   * 节点优先从对象池借出（poolManager.acquire），池空才新建。
   *
   * @param x 出生点 x（相对容器的局部坐标）
   * @param y 出生点 y（相对容器的局部坐标）
   * @param params 本次飞行的参数（偏角 / 速度）
   * @returns 生成的子弹节点；预制体缺失时返回 null
   */
  public spawnBullet(x: number, y: number, params: BulletSpawnParams): Node | null {
    if (!this.bulletPrefab) return null

    // 未指定容器时退回本组件所在节点
    const container = this.bulletContainer ?? this.node

    // 优先从对象池借出节点（池空才新建），而非每次 instantiate
    const bullet = poolManager.acquire(this.bulletPrefab, container)
    bullet.setPosition(x, y)

    // 注入管理者引用 + 本次飞行参数：
    // - 管理者引用用于自行回收时把自己从追踪列表中摘除
    // - 参数决定这颗子弹往哪飞、飞多快
    const bulletComp = bullet.getComponent(Bullet)
    if (bulletComp) bulletComp.init(this, params)

    // 纳入追踪列表，供后续统一回收
    this.bullets.push(bullet)
    return bullet
  }

  // ==================== 回收 ====================

  /**
   * 统一回收接口：把一颗子弹归还到对象池（而非销毁），供后续复用。
   * 先把它从追踪列表摘除，再按 prefab 还回对应的池。
   *
   * @param bullet 待回收的子弹节点
   */
  public releaseBullet(bullet: Node): void {
    // 先从追踪列表摘除（找不到也无妨，说明已被回收过）
    this.unregisterBullet(bullet)
    // 归还到对象池：poolManager 按 prefab 找到对应的 ObjectPool 并 put 回去
    if (this.bulletPrefab) poolManager.release(this.bulletPrefab, bullet)
  }

  /**
   * 清空全部子弹。
   * 以追踪列表为准（而非遍历容器子节点），因此不依赖容器的子节点构成。
   * 全部归还到对象池复用，不销毁。
   */
  private clearBullets(): void {
    // 拷贝一份再遍历：releaseBullet 会修改原数组
    const list = this.bullets.slice()
    for (const bullet of list) {
      this.releaseBullet(bullet)
    }
    // 保险：清理可能遗漏的无效引用
    this.bullets.length = 0
  }

  /**
   * 从追踪列表摘除某颗子弹（不销毁节点）。
   * 供 Bullet 脚本在自行回收前调用，避免列表残留失效引用。
   *
   * @param bullet 要摘除的子弹节点
   */
  private unregisterBullet(bullet: Node): void {
    const idx = this.bullets.indexOf(bullet)
    if (idx >= 0) this.bullets.splice(idx, 1)
  }
}
