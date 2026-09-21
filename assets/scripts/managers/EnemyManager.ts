import {
  _decorator,
  Component,
  Node,
  Prefab,
  math,
} from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { Enemy } from '../entities/Enemy'
import { poolManager } from '../core/PoolManager'
import { type EnemyConfig } from '../data/enemies/EnemyConfig'
import { ENEMY_REGISTRY } from '../data/enemies/EnemyRegistry'
const { ccclass, property } = _decorator

/**
 * 敌机生成管理器（挂在场景中的一个节点上）
 * - 按固定间隔在屏幕上方随机横向位置生成敌机
 * - 敌机统一挂到 enemyContainer（专用容器 Enemies）下，便于整体清场
 * - 仅在 PLAYING 状态下生成；菜单/暂停/结算时暂停生成
 *
 * 职责边界：本类只负责【生成】与【回收】敌机（节点来自对象池 poolManager，按 prefab 复用），
 * 不干涉敌机自身的移动、碰撞等行为（那是 Enemy 组件的事）。
 */
@ccclass('EnemyManager')
export class EnemyManager extends Component {
  /** 生成间隔（秒）：每隔多少秒生成一架 */
  @property
  spawnInterval = 1

  /** 累计生成计时 */
  private timer = 0

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

  /** 是否处于暂停（冻结）状态；启动时为 true（停在菜单，不生成） */
  private isPaused = true

  /**
   * 敌机专用容器节点（建议拖入 GameRoot/Enemies）。
   * 该节点下应仅存放敌机，以便清场时安全地整体清理。
   *
   * 留空时默认使用本组件所在节点 —— 适合直接把本组件挂在容器节点上的用法
   * （此时连引用都不用拖）。
   */
  @property(Node)
  enemyContainer: Node | null = null

  /**
   * 当前存活的敌机列表。
   * 仅用于追踪与统一回收；实际节点来自 poolManager（按 prefab 复用），不再每次 instantiate。
   */
  private enemyList: Node[] = []

  /**
   * 出生权重（临时，等 WaveManager 时迁走）。
   * 用 id 做 key 的 Record，避免与 ENEMY_CONFIGS 顺序对齐的下标错位隐患。
   */
  private static readonly SPAWN_WEIGHTS: Record<string, number> = {
    e_normal: 6,
    e_elite: 3,
    e_boss: 1,
  }

  /**
   * 启动校验：共享敌机 prefab 现由编辑器拖入，若漏拖则打一条 error。
   * 漏拖时 update 首行的守卫会让生成静默停摆，这里提前给出可读提示，便于排查。
   * （纯同步检查、无异步，因此不再需要 async。）
   */
  protected start(): void {
    if (!this.enemyPrefab) {
      console.error('[EnemyManager] 未在编辑器拖入 enemyPrefab，敌机将不会生成')
    }
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
  }

  /**
   * 状态切换：决定"要不要继续吐敌机"，以及生成计时的生死。
   *
   * 暂停采用「时间停止」语义（整体冻结、恢复后接着走）：
   *   - PLAYING → PAUSED：计时器**冻结、保留余量**
   *   - PAUSED  → PLAYING：计时器**从冻结处接着走**
   *   两者合起来即"时间停止"：暂停期间不推进，恢复后无缝续上。
   *   例：spawnInterval = 1，暂停时已累积 0.9s → 恢复后 0.1s 即出下一架。
   *
   * 其余迁移都视为「本局开始/中断」，计时一律清零：
   *   - → PLAYING（来自 MENU / OVER）：新的一局，给予完整间隔的喘息期
   *   - → MENU / OVER：本局作废，清掉残留进度，避免影响下一局
   */
  private onStateChange({ oldState, newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING

    // 「时间停止」区间：PAUSED 的进入与离开都不动计时器，也不清场
    if (oldState === GameState.PAUSED || newState === GameState.PAUSED) {
      return
    }

    // 其余所有迁移：计时清零
    this.timer = 0

    // 进入 OVER 时暂不清场：保留结算瞬间的战场画面
    if (newState === GameState.OVER) {
      return
    }

    // 其余迁移（新开局 / 回菜单）：清空残留敌机
    this.clearEnemies()
  }

  update(deltaTime: number): void {
    // 编辑器漏拖 prefab 时不生成（start() 已打 error 提醒）
    if (!this.enemyPrefab) return
    if (this.isPaused) return

    this.timer += deltaTime
    if (this.timer >= this.spawnInterval) {
      this.timer -= this.spawnInterval
      this.spawnEnemy()
    }
  }

  /**
   * 按权重随机抽一种敌机，返回对应的配置。
   *
   * 累加区间法：把各 cfg 的 SPAWN_WEIGHTS[id] 首尾相接铺成 [0, total) 上的若干段，
   * 随机点落在哪段就取哪个 cfg。权重用 id 做 key 的 Record（SPAWN_WEIGHTS），
   * 不再与 ENEMY_REGISTRY 顺序对齐，不存在"下标错位"隐患；缺省权重回落 1。
   */
  private rollEnemyConfig(): EnemyConfig {
    let total = 0
    for (const c of ENEMY_REGISTRY) total += EnemyManager.SPAWN_WEIGHTS[c.id] ?? 1
    if (total <= 0) return ENEMY_REGISTRY[0]

    let roll = Math.random() * total
    for (const c of ENEMY_REGISTRY) {
      roll -= EnemyManager.SPAWN_WEIGHTS[c.id] ?? 1
      if (roll < 0) return c
    }
    // 兜底：浮点误差导致未命中任何区间时，取最后一个
    return ENEMY_REGISTRY[ENEMY_REGISTRY.length - 1]
  }

  /** 在屏幕上方随机横向位置生成一架敌机 */
  private spawnEnemy(): void {
    // ① 抽签：按权重决定这一架是哪一种（数值 + 外观一并定下）
    const cfg = this.rollEnemyConfig()
    if (!cfg) return

    // ② 取共享的单一敌机 prefab（三种敌机合并为 1 个，外观靠运行时换 SpriteFrame）
    const prefab = this.enemyPrefab
    if (!prefab) return

    // ③ 根据 prefab【从对象池借出】敌机结点（池空才新建），统一挂到容器下
    const enemy = poolManager.acquire(prefab, this.enemyContainer ?? this.node)
    if (!enemy) return

    // 出生位置：x 随机在玩家横向范围内，y 固定在屏幕上方界外（从屏外滑入）
    //
    // ⚠️ 居中对齐的敌机（如 BOSS，配置里 spawnCentered=true）例外：它不会穿屏，
    //    随机 x 会让它永久歪在屏幕一侧，所以一律取屏幕中心 x=0。
    const spawnX = cfg.spawnCentered
      ? 0
      : math.randomRange(GameConfig.BOUND_MIN_X, GameConfig.BOUND_MAX_X)

    const spawnY = GameConfig.BOUND_MAX_Y + 50
    enemy.setPosition(spawnX, spawnY)

    // 初始化敌机：注入管理者引用 + 所属 prefab（回收时靠它还回正确的池），
    // 并留出运行时属性初始化的扩展点
    const enemyComp = enemy.getComponent(Enemy)
    if (enemyComp) enemyComp.init(this, cfg, prefab)
    // 纳入追踪列表，供后续统一回收
    this.enemyList.push(enemy)
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
