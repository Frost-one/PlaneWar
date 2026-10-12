import { _decorator, Component, Node } from 'cc'
import type { Prefab } from 'cc'
import { eventBus } from '../core/EventBus'
import { GameState } from '../data/GameState'
import type { StateChangePayload } from '../core/GameEvent'
import { Bullet, BulletSpawnParams } from '../entities/Bullet'
import { poolManager } from '../core/PoolManager'
const { ccclass, property } = _decorator

/**
 * 子弹管理器
 * - 统一负责子弹的【生成】与【回收】（节点来自对象池 poolManager，按 prefab 复用）
 * - 子弹统一挂到【本组件所在节点】下，便于整体清场（本组件请挂在专用容器上）
 * - 状态迁移时按「时间停止」语义决定是否清场（与 EnemyManager 规则一致）
 *
 * 职责边界：只管生成与回收，不干涉子弹自身的移动与碰撞（那是 Bullet 组件的事）。
 *
 * 【本类刻意不认识"机型"】
 *   用哪种子弹由调用方通过参数传进来（来源是 FireContext.bulletPrefab，
 *   最终来自该机型的 ShipAsset）。这样 Manager 与机型、玩家数据完全解耦：
 *   将来敌机开火、僚机副武器、多弹种，都只是"换一个 prefab"，本文件不用改。
 */
@ccclass('BulletManager')
export class BulletManager extends Component {
  /**
   * 单例引用：由本组件自己在 onLoad 里注册进来。
   *
   * 不加 `private constructor` —— 组件必须由引擎构造，加了引擎就 new 不出实例。
   * 所以它防不住"别人再往场景里挂一个"，只能靠 onLoad 里的重复检查。
   */
  private static instance: BulletManager | null = null

  /**
   * 取子弹管理器 —— 只能在 **start 及以后** 调用。
   *
   * 【时序契约（别破坏）】
   *   注册发生在 BulletManager.onLoad。Cocos 保证【场景里所有组件的 onLoad 全部跑完，
   *   才开始跑任何一个 start】，所以调用方只要在 start 及以后取用就一定拿得到；
   *   在自己的 onLoad 里取会拿到 null。
   *
   * 未注册时抛异常而不是返回 null：与其在后面某处崩一个看不懂的
   * "Cannot read property of null"，不如在这里把原因直接说清楚。
   */
  public static getInstance(): BulletManager {
    if (!BulletManager.instance) {
      throw new Error('[BulletManager] 场景里没有挂载 BulletManager 的节点')
    }
    return BulletManager.instance
  }

  /**
   * 当前存活的子弹列表。
   * 仅用于追踪与统一回收；实际节点来自 poolManager（按 prefab 复用），不再每次 instantiate。
   */
  private bulletList: Node[] = []

  /**
   * 注册单例。
   *
   * 多个实例时是"最后一个注册者赢"，而容器 = 本组件所在节点 ——
   * 也就是说子弹会静默挂到错的节点下、坐标系整体偏移（不报错，只表现为位置莫名歪了）。
   * 所以这里直接抛异常逼着清理干净，比留一个静默的位置 bug 好排查得多。
   */
  protected onLoad(): void {
    if (BulletManager.instance && BulletManager.instance !== this) {
      throw new Error('[BulletManager] 场景里有多个 BulletManager 节点，请只保留一个')
    }
    BulletManager.instance = this
  }

  /**
   * 订阅跟随【激活状态】，与 onDisable 严格对称（统一走默认模式，不再用常驻例外）。
   * 本组件挂在常驻容器节点上、全程不失活，onDisable 实际不会被调用，
   * 但保持 onEnable/onDisable 配对能与实体/UI 组件完全一致，也避免将来节点被停用时漏退订。
   */
  protected onEnable(): void {
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDisable(): void {
    eventBus.off('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    // 兜底注销（off 幂等），不依赖 onDisable 是否被调用过
    eventBus.off('state_change', this.onStateChange, this)
    if (BulletManager.instance === this) BulletManager.instance = null
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
   * @param bulletPrefab 用哪种子弹（决定外观、也从哪个池取 / 回哪个池）
   * @returns 生成的子弹节点；预制体缺失时返回 null
   */
  public spawnBullet(
    x: number,
    y: number,
    params: BulletSpawnParams,
    bulletPrefab: Prefab,
  ): Node | null {
    if (!bulletPrefab) return null

    // 子弹一律挂到【本组件所在节点】下 —— 本组件就该挂在子弹容器上（场景里是 GameRoot/BulletContainer）。
    //
    // 为什么不再留 @property container：它是 spawnBullet 里 x/y 的【坐标系基准】
    // （x/y 是相对容器的局部坐标，来自 Player 的 position）。交给编辑器拖就有可能
    // 拖成一个父节点不同的节点，结果位置整体偏移 —— 而且不报错，只表现为"子弹莫名歪了"。
    // 固定成自身节点，坐标系永远与组件一致，这条坑从结构上消失。
    const container = this.node

    // 优先从对象池借出节点（池空才新建），而非每次 instantiate
    const bullet = poolManager.acquire(bulletPrefab, container)
    bullet.setPosition(x, y)

    // 注入管理者引用 + 本次飞行参数 + 来源 prefab：
    // - 管理者引用用于自行回收时把自己从追踪列表中摘除
    // - 参数决定这颗子弹往哪飞、飞多快
    // - prefab 决定回收时回到哪个池（Bullet 会记住它）
    const bulletComp = bullet.getComponent(Bullet)
    if (bulletComp) bulletComp.init(this, params, bulletPrefab)

    // 纳入追踪列表，供后续统一回收
    this.bulletList.push(bullet)
    return bullet
  }

  // ==================== 回收 ====================

  /**
   * 统一回收接口：把一颗子弹归还到对象池（而非销毁），供后续复用。
   * 先把它从追踪列表摘除，再归还到对象池对应的 prefab 池。
   *
   * @param bullet 待回收的子弹节点
   * @param bulletPrefab 该子弹的来源预制体（决定回哪个池，由 Bullet 在 init 时记下）
   */
  public releaseBullet(bullet: Node, bulletPrefab: Prefab): void {
    // 先从追踪列表摘除（找不到也无妨，说明已被回收过）
    this.unregisterBullet(bullet)
    // 归还到对象池：按来源 prefab 找到对应的 ObjectPool 并 put 回去
    poolManager.release(bulletPrefab, bullet)
  }

  /**
   * 清空全部子弹。
   * 以追踪列表为准（而非遍历容器子节点），因此不依赖容器的子节点构成。
   * 全部归还到对象池复用，不销毁。
   */
  private clearBullets(): void {
    // 拷贝一份再遍历：releaseBullet 会修改原数组
    const list = this.bulletList.slice()
    for (const bullet of list) {
      // 走 Bullet.despawn()：它持有自己的来源 prefab，能正确还回对应的池
      // （与 EnemyManager 清场时走 Enemy.despawn() 是同一套路）
      bullet.getComponent(Bullet)?.despawn()
    }
    // 保险：清理可能遗漏的无效引用
    this.bulletList.length = 0
  }

  /**
   * 从追踪列表摘除某颗子弹（不销毁节点）。
   * 供 Bullet 脚本在自行回收前调用，避免列表残留失效引用。
   *
   * @param bullet 要摘除的子弹节点
   */
  private unregisterBullet(bullet: Node): void {
    const idx = this.bulletList.indexOf(bullet)
    if (idx >= 0) this.bulletList.splice(idx, 1)
  }
}
