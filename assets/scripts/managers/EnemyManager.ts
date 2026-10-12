import { _decorator, Component, Node, Prefab, math } from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { GameState } from '../data/GameState'
import type { StateChangePayload } from '../core/GameEvent'
import { Enemy } from '../entities/Enemy'
import { poolManager } from '../core/PoolManager'
import { type EnemyConfig } from '../data/enemies/EnemyConfig'
import { validateRequiredProps } from '../core/utils/validate'
import type { HitRect, HitResult } from '../entities/emitters/Emitter'
const { ccclass, property } = _decorator

/**
 * 敌机生成管理器（挂在场景中的一个节点上）
 * - 【纯生成器】：只负责"造一架敌机 + 池回收 + 维护活体列表 + 激光命中查询"
 * - 敌机统一挂到【本组件所在节点】下，便于整体清场（本组件请挂在专用容器上）
 * - "何时刷 / 刷哪种" 由 WaveManager 驱动（调用本类的 spawn(cfg, x?)），本类不再自主调度
 *
 * 职责边界：本类只负责【生成】与【回收】敌机（节点来自对象池 poolManager，按 prefab 复用），
 * 不干涉敌机自身的移动、碰撞等行为（那是 Enemy 组件的事），也不决定出现时机。
 */
@ccclass('EnemyManager')
export class EnemyManager extends Component {
  /**
   * 单例引用：由本组件自己在 onLoad 里注册进来（写法与 BulletManager 完全一致）。
   *
   * 【为什么需要单例】
   *   活体敌机列表只存在于本组件里，而要用它的 BeamEmitter 不是一个挂在节点上的组件
   *   （它是在 ShipBlue.ts 里 `new` 出来的普通对象）——
   *   **@property 只对组件生效**，对一个 new 出来的对象根本没地方拖引用。
   *   所以只有"运行时按类型取到那个唯一实例"这一条路。
   *
   * 不加 `private constructor` —— 组件必须由引擎构造，加了引擎就 new 不出实例。
   */
  private static instance: EnemyManager | null = null

  /**
   * 取敌机管理器 —— 只能在 **start 及以后** 调用（注册发生在 onLoad，早于任何 start）。
   * 未注册时抛异常，让"忘了挂 EnemyManager 节点"立刻暴露，而不是等到查询时发现场上永远没有敌机。
   */
  public static getInstance(): EnemyManager {
    if (!EnemyManager.instance) {
      throw new Error('[EnemyManager] 场景里没有挂载 EnemyManager 的节点')
    }
    return EnemyManager.instance
  }

  /**
   * 共享敌机 prefab（三种敌机合并为 1 个，外观靠运行时换 SpriteFrame）。
   * 【在编辑器里拖入本字段】，不走 resources.load —— 它小且稳定，
   * 属"@property 更合适"的情形（大资源 / 热更才用 resources.load）。
   *
   * 【为什么由本类持有，而不是 EnemyRegistry】
   *   这是「生成模板」，属于生成器（本类）的职责，不是「实体使用的资源」。
   *   EnemyRegistry 只缓存每类敌机的外观资源（机身图），与 ShipRegistry 严格对称
   *   （ShipRegistry 也绝不持有玩家的 body prefab）。节点生成模板归 spawner 自己持有，
   *   正如 BulletManager 从不拥有子弹 prefab、只接收调用方传入的那一棵。
   *
   * ⚠️ 漏拖会让 update 首行守卫直接拦下，一架敌机都不生成；start() 会打一条 error 提醒。
   */
  @property(Prefab)
  enemyPrefab: Prefab | null = null

  /**
   * 当前存活的敌机列表。
   * 仅用于追踪与统一回收；实际节点来自 poolManager（按 prefab 复用），不再每次 instantiate。
   */
  private enemyList: Node[] = []

  /**
   * 启动校验：共享敌机 prefab 现由编辑器拖入，漏了直接抛异常。
   * 漏拖时 update 首行的守卫会让生成静默停摆（一架敌机都不出来，且不报错），
   * 这里提前崩掉，省得从"为什么没敌机"反推。
   */
  protected onLoad(): void {
    validateRequiredProps('EnemyManager', { enemyPrefab: this.enemyPrefab })

    // 注册单例：挂多个会让"激光该查谁"变得不确定，直接抛异常逼着清理干净
    if (EnemyManager.instance && EnemyManager.instance !== this) {
      throw new Error('[EnemyManager] 场景里有多个 EnemyManager 节点，请只保留一个')
    }
    EnemyManager.instance = this
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
    eventBus.off('state_change', this.onStateChange, this)
    if (EnemyManager.instance === this) EnemyManager.instance = null
  }

  /**
   * 查一块矩形里【最接近发射端】的敌机（激光用），没有则 null。
   *
   * 【最近 = y 最小】光束从机头沿 +y 射出去，所以"挡在最前面"的就是 y 最小的那台；
   *   不贯穿 ⇒ 一个 tick 只结算它，后面的敌机被前面这台挡着。
   *
   * 【为什么连 y 一起返回】发射器要用它当光束的视觉长度（画到目标身上为止），
   *   与其让发射器回头再问一次位置，不如这里一次给全。
   *
   * 【返回的 y 是【碰撞盒底边】，不是敌机中心】
   *   光束从下往上打，真正的接触面是敌机盒子的下边缘；返回中心会让光束"扎进机身半截"。
   *   ⚠️ 但【谁最近】仍然按中心 y 比较（那才是排序用的量），两者不是一回事。
   *
   * @param rect 查询区域（与 ctx.x / ctx.y 同源的局部坐标）
   */
  public queryNearestHit(rect: HitRect): HitResult | null {
    // ⚠️ 必须拷贝一份再遍历：结算过程中敌机可能被打死 → 立刻回收 → 会从 enemyList 里 splice
    const list = this.enemyList.slice()

    let nearest: HitResult | null = null
    let nearestCenterY = Infinity

    for (const node of list) {
      // 池里的节点可能在上一 tick 之后就被回收了
      if (!node?.isValid) continue

      const enemy = node.getComponent(Enemy)
      if (!enemy) continue

      const p = node.position
      const half = enemy.getHitHalfSize()
      // 任一轴不重叠就在框外（两轴都重叠才算命中）
      if (rect.minX >= p.x + half.halfW || rect.maxX <= p.x - half.halfW) continue
      if (rect.minY >= p.y + half.halfH || rect.maxY <= p.y - half.halfH) continue

      if (p.y < nearestCenterY) {
        nearestCenterY = p.y
        // 截断点 = 接触面（盒底边），光束就顶在这里
        nearest = { target: enemy, y: p.y - half.halfH }
      }
    }
    return nearest
  }

  /**
   * 状态切换：只在"本局开始 / 回菜单"时清掉残留敌机；
   * 暂停/恢复不动场上敌机（冻结由实体层各自处理），进入结算保留战场画面。
   * 生成时机已交由 WaveManager 驱动，本类不再自行计时或调度。
   */
  private onStateChange({ oldState, newState }: StateChangePayload): void {
    // 暂停/恢复：不动场上敌机
    if (newState === GameState.PAUSED || oldState === GameState.PAUSED) return
    // 进入结算：保留战场画面
    if (newState === GameState.OVER) return
    // 其余迁移（新开局 / 回菜单）：清空残留敌机
    this.clearEnemies()
  }

  /**
   * 生成一架敌机（对外入口，由 WaveManager 调用）。
   * 不再自主决定时机/种类——调用方传入配置与可选横向位置。
   *
   * @param cfg 敌机配置（决定数值 + 外观）
   * @param x   固定横向位置；省略时：居中对齐敌机取 x=0，其余在玩家横向范围内随机
   */
  public spawn(cfg: EnemyConfig, x?: number): void {
    // 取共享的单一敌机 prefab（三种敌机合并为 1 个，外观靠运行时换 SpriteFrame）
    const prefab = this.enemyPrefab
    if (!prefab) return

    // 根据 prefab【从对象池借出】敌机结点（池空才新建），统一挂到本组件所在节点下
    // （本组件就该挂在专用容器上，场景里是 GameRoot/Enemies）
    const enemy = poolManager.acquire(prefab, this.node)
    if (!enemy) return

    // 出生位置：x 随机在玩家横向范围内，y 固定在屏幕上方界外（从屏外滑入）
    //
    // ⚠️ 居中对齐的敌机（如 BOSS，配置里 spawnCentered=true）例外：它不会穿屏，
    //    随机 x 会让它永久歪在屏幕一侧，所以一律取屏幕中心 x=0。
    const spawnX = x ?? (cfg.spawnCentered
      ? 0
      : math.randomRange(GameConfig.BOUND_MIN_X, GameConfig.BOUND_MAX_X))

    const spawnY = GameConfig.BOUND_MAX_Y + 50
    enemy.setPosition(spawnX, spawnY)

    // 初始化敌机：注入管理者引用 + 所属 prefab（回收时靠它还回正确的池），
    // 并留出运行时属性初始化的扩展点
    const enemyComp = enemy.getComponent(Enemy)
    if (enemyComp) enemyComp.init(this, cfg, prefab)
    // 纳入追踪列表，供后续统一回收
    this.enemyList.push(enemy)
  }

  /**
   * 场上活敌数量（通关判定用）。
   * 直接读 enemyList 长度，O(1)，不每帧遍历节点。
   */
  public getAliveCount(): number {
    return this.enemyList.length
  }

  // ==================== 回收 ====================

  /**
   * 统一回收接口：把一架敌机归还到对象池（而非销毁），供后续复用。
   * 先把它从追踪列表摘除，再按它所属的 prefab 还回对应的池。
   *
   * @param enemy  待回收的敌机节点
   * @param prefab 该敌机所属的预制体（决定回哪个池，由 Enemy 在 init 时记下）
   */
  public releaseEnemy(enemy: Node, prefab: Prefab): void {
    // 先从追踪列表摘除（找不到也无妨，说明已被回收过）
    this.unregisterEnemy(enemy)
    // 归还到对象池：poolManager 按 prefab 找到对应的 ObjectPool 并 put 回去
    poolManager.release(prefab, enemy)
  }

  /**
   * 清空全部敌机。
   * 以追踪列表为准（而非遍历容器子节点），因此不依赖容器的子节点构成。
   * 全部归还到对象池复用，不销毁。
   */
  private clearEnemies(): void {
    // 拷贝一份再遍历：despawn 会修改原数组
    const list = this.enemyList.slice()
    for (const enemy of list) {
      // 走 Enemy.despawn()：它持有自己所属的 prefab，能正确还回对应的池
      enemy.getComponent(Enemy)?.despawn()
    }
    // 保险：清理可能遗漏的无效引用
    this.enemyList.length = 0
  }

  /**
   * 从追踪列表摘除某架敌机（不销毁节点）。
   * 供 Enemy 脚本在自行回收前调用，避免列表残留失效引用。
   *
   * @param enemy 要摘除的敌机节点
   */
  public unregisterEnemy(enemy: Node): void {
    const idx = this.enemyList.indexOf(enemy)
    if (idx >= 0) this.enemyList.splice(idx, 1)
  }
}
