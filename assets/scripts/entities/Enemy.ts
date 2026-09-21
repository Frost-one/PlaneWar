import { _decorator, BoxCollider2D, Collider2D, Component, Contact2DType, Node, Prefab, Size, Sprite, UITransform } from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { poolManager } from '../core/PoolManager'
import { type EnemyConfig, type EnemyBounds, type EnemyMover } from '../data/enemies/EnemyConfig'
import type { EnemyManager } from '../managers/EnemyManager'
import { Bullet } from './Bullet'
import { PHYSICS_GROUP } from '../data/config/PhysicsGroups'
import { getEnemySprite } from '../data/enemies/EnemyRegistry'
const { ccclass, property } = _decorator

/**
 * 敌机实体组件（挂在 Enemy Prefab 上）
 * - 每帧向下飞行（朝屏幕下方移动，与玩家子弹向上相反）
 * - 飞出玩家可视区域下界、被击中、或撞到玩家时，通过 despawn() 统一回收（归还对象池）
 * - 仅在 PLAYING 状态下飞行
 *
 * 职责边界：只管自身的移动与消亡，不管生成（那是 EnemyManager 的事）。
 * @property speed 敌机向下飞行速度（像素/秒），可在 Enemy Prefab / Inspector 中调整
 */
@ccclass('Enemy')
export class Enemy extends Component {
  /** 敌机向下飞行速度（像素/秒） */
  // —— 数值（由 init 从 cfg 拷入）——
  private speed = 0            // ← 替代原来的 @property speed，把那个 @property 删掉
  private maxHp = 1
  private hp = 1
  private score = 0
  private damage = 0

  // —— 轨迹（由 init 从 cfg 拷入）——
  private move: EnemyMover | null = null

  /** 可活动边界：每帧传给移动函数，供正弦做对称夹紧 */
  private static readonly BOUNDS: EnemyBounds = {
    minX: GameConfig.BOUND_MIN_X,
    maxX: GameConfig.BOUND_MAX_X,
    minY: GameConfig.BOUND_MIN_Y,
  }

  // —— 轨迹的运行时状态（每次生成都要复位）——
  private spawnX = 0   // Sine 的摆动基准 x
  private elapsed = 0  // 入场后累积的时间

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
   * 用于在自身回收时通过它摘除追踪记录并归还对象池。
   */
  private manager: EnemyManager | null = null

  /** 本敌机所属的预制体，由 init 注入；回收时靠它把节点还回正确的池 */
  private prefab: Prefab | null = null

  /** 是否已归还对象池：防止「出界销毁 / 被击杀 / 撞机」等多条路径重复回收 */
  private released = false

  /**
   * 敌机的初始化入口，由 EnemyManager 在生成后立即调用。
   *
   * 职责：
   * - 注入管理者引用（回收时用于摘除追踪记录 + 归还对象池）
   * - 注入所属 prefab（回收时用于选池）
   * - 应用运行时才确定的属性（数值 / 轨迹 / 复位标志）
   *
   * @param manager 生成该敌机的敌机管理器
   * @param cfg     该敌机的配置
   * @param prefab  该敌机对应的预制体
   */
  public init(manager: EnemyManager, cfg: EnemyConfig, prefab: Prefab): void {
    this.manager = manager
    this.prefab = prefab

    // 对象池复用：先清掉「上一世」可能残留的待执行定时器（如延迟 despawn）
    this.unscheduleAllCallbacks()
    // 复位回收标志：否则复用后首帧若再次触发 despawn 会被旧标志挡掉
    this.released = false

    // 1. 数值
    this.speed = cfg.speed
    this.maxHp = cfg.maxHp
    this.hp = cfg.maxHp          // 当前血量从满血开始
    this.score = cfg.score
    this.damage = cfg.damage

    // 2. 轨迹：直接拷入移动函数，专属参数已写死在各敌机文件的闭包里
    this.move = cfg.move

    // 3. ⚠️ 运行时状态【每次都必须复位】—— 对象池复用会反复调用 init
    this.elapsed = 0
    this.spawnX = this.node.position.x   // ← 必须在 setPosition 之后调用 init！
    this.isPaused = false                // ← 若在暂停中被回收，取出后会一直冻结

    // 4. 外观与体型：三种敌机【共用 1 个 prefab】，靠运行时换 SpriteFrame + 节点缩放区分。
    //    —— 这就是"角色是数据"：size / 贴图全从 cfg 来，prefab 不再区分机型。
    //    节点缩放等比例作用于节点内容（含碰撞体），与 cfg.scale 是一层线性关系、不会二次相乘。
    const sprite = this.getComponent(Sprite)
    if (sprite) sprite.spriteFrame = getEnemySprite(cfg.id)
    this.node.setScale(cfg.scale, cfg.scale, 1)

    // 5. 命中盒同步（修复"碰撞盒与图片错位"）：
    //    TRIMMED 模式的 Sprite 换图后节点的 contentSize 会跟着变，
    //    但 BoxCollider2D.size 是 prefab 里的固定值（24×17），不跟随 spriteFrame，
    //    于是换了裁剪尺寸不同的图（精英 / BOSS）就会和机体错位。
    //    这里在设完 SpriteFrame + 缩放之后，把碰撞盒尺寸现算成
    //    节点 contentSize × cfg.hitScale，保证"碰撞盒永远紧贴机体"。
    //    contentSize / collider.size 都是节点本地坐标、不受 scale 影响，
    //    节点缩放等比例作用于两者，不会二次放大。
    const ui = this.getComponent(UITransform)
    const box = this.getComponent(BoxCollider2D)
    if (ui && box) {
      const k = cfg.hitScale ?? 1
      box.size = new Size(ui.width * k, ui.height * k)
    }
  }

  /**
   * 订阅与碰撞监听跟随【激活状态】，与 onDisable 严格对称。
   *
   * 为什么不放 onLoad：敌机走对象池，回收时只是【停用】并不销毁。
   * 放在 onLoad 会让池里"休眠的敌机"继续收 state_change 广播、继续触发碰撞回调。
   * 首次实例化时 onLoad 早于 onEnable；复用时只走 onEnable —— 两种路径都能订阅上。
   */
  protected onEnable(): void {
    const collider = this.getComponent(Collider2D)
    if (collider) {
      collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)
    }
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDisable(): void {
    const collider = this.getComponent(Collider2D)
    if (collider) {
      collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)
    }
    eventBus.off('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    // 兜底注销：生命周期规范要求 onDestroy 必须完成"从事件总线注销"，
    // 不依赖 onDisable 是否被调用过。off 是幂等的，重复调用无害。
    const collider = this.getComponent(Collider2D)
    if (collider) {
      collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this)
    }
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 状态切换：仅 PLAYING 时不暂停（其余状态视为冻结）。
   * 「时间停止」靠 update 直接 return 实现：位置原地保留，恢复后继续。
   */
  private onStateChange({ newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING
  }

  /**
   * 每帧推进轨迹。
   *
   * 职责分工的两层写法：
   *   1. update 只管【通用部分】—— 暂停判定、推进 elapsed、算出当前位置、出界回收
   *   2. 轨迹形状全在 cfg.move（每个敌机自己写的函数）里 —— 它直接写 node 位置
   *
   * 新增一种轨迹 = 在某个敌机文件里写一个 move 函数，update 与 Enemy 通用骨架一行都不用改。
   */
  protected update(deltaTime: number): void {
    // 暂停/非游玩状态（菜单/暂停/结算）时冻结，不向下飞
    if (this.isPaused) return

    // elapsed 是【世界时间】的累积 —— 冻结时上面已 return，天然不推进，
    // 所以 sin(…) 的相位在暂停期间原地保留，恢复后从原处继续摆。
    this.elapsed += deltaTime

    // —— 调用本敌机自己的移动函数：它直接写 node 位置 ——
    // 通用骨架（暂停 / 计时 / 出界回收）留在 update，轨迹形状全在 cfg.move 里。
    this.move?.(this.node, {
      elapsed: this.elapsed,
      dt: deltaTime,
      startX: this.spawnX,
      speed: this.speed,
      bounds: Enemy.BOUNDS,
    })

    // —— 超出玩家可视区下界则回收 ——
    // ⚠️ 读节点当前 y 判断，而不是移动函数的返回值：移动函数直接写位置，不回传。
    if (this.node.position.y < GameConfig.BOUND_MIN_Y - Enemy.DESTROY_EXTRA) {
      this.despawn()
      return
    }
  }

  /**
   * 轨迹形状不再集中在这里 —— 各敌机的移动函数写在 data/enemies/Enemy* 里（cfg.move），
   * 由 update 每帧调用。要加新轨迹，写个函数即可，本文件不动。
   */

  /**
   * 统一的自我回收入口。
   * 用 released 标志防重入（出界 / 被击杀 / 撞机 / 管理器清场 可能多条路径同时触发），
   * 再通知管理器把自身从追踪列表摘除，并按 prefab 归还对象池复用。
   *
   * 【为什么是 public，而不是 private】
   *   调用方有两类：
   *     ① 自己（出界 / 被击杀 / 撞机 —— 都在本类内部）
   *     ② EnemyManager.clearEnemies()（清场时批量回收）
   *   ② 必须走这个入口，不能自己去调 releaseEnemy —— 因为**只有 Enemy 自己
   *   知道它的 prefab 是什么**（prefab 由 init 注入、存在私有字段里），
   *   而 releaseEnemy 必须拿到 prefab 才能还回正确的池。
   *   所以它不是"内部实现细节"，而是**对外承诺的回收协议**。
   *
   * ⚠️ 不要改成 public 之后又让 Manager 去碰 released / prefab：
   *    防重入标志留在本类，外部只管"叫它回收"，不关心它怎么回收。
   */
  public despawn(): void {
    if (this.released) return
    this.released = true
    this.manager?.releaseEnemy(this.node, this.prefab!)
  }

  onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D) {
    // 1. 撞到的是子弹
    if (otherCollider.group === PHYSICS_GROUP.PLAYER_BULLET) {
      const bulletNode = otherCollider.getComponent(Bullet)
      if (bulletNode) {
        this.takeDamage(bulletNode.getDamage())
      }
      return
    }

    // 2. 撞到的是玩家
    if (otherCollider.group === PHYSICS_GROUP.PLAYER) {
      // 撞到玩家，但是我期望敌机受到等同玩家的飞机的攻击的伤害
      // 但是伤害数值是放在子弹上的，因此此处暂且不多处理
      eventBus.emit('player_hit', {
        enemyNode: selfCollider.node,
        playerNode: otherCollider.node,
        damage: this.damage
      })

      // 在碰撞回调中回收节点不安全，推迟到下一帧（见对象池设计说明）
      this.scheduleOnce(() => {
        this.despawn()
      }, 0)
    }
  }

  // 敌机受到伤害
  takeDamage(d: number) {
    if (this.hp <= 0) return
    this.hp -= d
    if (this.hp <= 0) {
      eventBus.emit('enemy_die', {
        enemyNode: this.node,
        score: this.score
      })

      // 通过回调触发（命中击杀在碰撞回调里，下一帧再回收，避免物理回调中改节点）
      this.scheduleOnce(() => {
        this.despawn()
      }, 0)
    }
  }
}
