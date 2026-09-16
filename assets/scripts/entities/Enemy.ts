import { _decorator, Collider2D, Component, Contact2DType } from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { EnemyMovePattern } from '../data/config/EnemyConfig'
// 仅用于类型标注，编译后不产生真实 import，避免与 EnemyManager 形成循环依赖
import type { EnemyManager } from '../managers/EnemyManager'
import type { EnemyConfig } from '../data/config/EnemyConfig'
import { Bullet } from './Bullet'
import { PHYSICS_GROUP } from '../data/config/PhysicsGroups'
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
  // —— 数值（由 init 从 cfg 拷入）——
  private speed = 0            // ← 替代原来的 @property speed，把那个 @property 删掉
  private maxHp = 1
  private hp = 1
  private score = 0
  private collideDamage = 0

  // —— 轨迹（由 init 从 cfg 拷入）——
  private movePattern = EnemyMovePattern.Straight
  private sineAmplitude = 0
  private sineFrequency = 0
  /**
   * 悬停线（px）。null = 该敌机【没有】悬停需求 → 变 Hover 退化为直线穿屏。
   *
   * ⚠️ 不能用 0 当"未配置"：y=0 是屏幕正中，会被误认为一条真实的悬停线。
   *    必须用 null 才能区分"没配"与"配在屏幕中央"。
   */
  private hoverY: number | null = null

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
   * @param manager 生成该敌机的敌机管理器
   */
  public init(manager: EnemyManager, cfg: EnemyConfig): void {
    this.manager = manager

    // 1. 数值
    this.speed = cfg.speed
    this.maxHp = cfg.maxHp
    this.hp = cfg.maxHp          // 当前血量从满血开始
    this.score = cfg.score
    this.collideDamage = cfg.collideDamage

    // 2. 轨迹
    this.movePattern = cfg.movePattern
    this.sineAmplitude = cfg.sineAmplitude ?? 0
    this.sineFrequency = cfg.sineFrequency ?? 0
    this.hoverY = cfg.hoverY ?? null

    // 3. ⚠️ 运行时状态【每次都必须复位】—— 对象池复用会反复调用 init
    this.elapsed = 0
    this.spawnX = this.node.position.x   // ← 必须在 setPosition 之后调用 init！
    this.isPaused = false                // ← 若在暂停中被回收，取出后会一直冻结
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

  /**
   * 每帧推进轨迹。
   *
   * 职责分工的两层写法：
   *   1. update 只管【通用部分】—— 暂停判定、推进 elapsed、算出本帧的位移增量
   *   2. TRAJECTORIES 分派表只管【每种轨迹的位移规律】—— 拿到 dt 算出该往哪挪
   *
   * 这样三种轨迹共享同一套"暂停 / 计时 / 回收"骨架，
   * 新增轨迹只需在表里加一行，不用再碰 update。
   */
  protected update(deltaTime: number): void {
    // 暂停/非游玩状态（菜单/暂停/结算）时冻结，不向下飞
    if (this.isPaused) return

    // elapsed 是【世界时间】的累积 —— 冻结时上面已 return，天然不推进，
    // 所以 sin(…) 的相位在暂停期间原地保留，恢复后从原处继续摆。
    this.elapsed += deltaTime

    const step = this.speed * deltaTime
    const move = Enemy.TRAJECTORIES[this.movePattern](this, step)

    // —— 超出玩家可视区下界则回收 ——
    // ⚠️ 用"本帧的 y"判断，而不是 y 的增量 —— 悬停机不再下落，增量恒为 0
    if (move.y < GameConfig.BOUND_MIN_Y - Enemy.DESTROY_EXTRA) {
      this.despawn()
      return
    }

    this.node.setPosition(move.x, move.y)
  }

  /**
   * 轨迹函数：给定本帧的【步长】step（= speed · dt，px），返回本帧应处的节点坐标。
   *
   * 用"返回目标坐标"而不是"直接改节点"，是为了让【回收判定】能在 update 里
   * 统一做 —— 各轨迹只表达"我该在哪"，不关心"我是否出界了"。
   *
   * ⚠️ step 是由 speed · dt 得来的，因此各轨迹不用再乘 dt；
   *    需要时间的（Sine）读 this.elapsed（已由 update 累加好）。
   */
  private static readonly TRAJECTORIES: Record<
    EnemyMovePattern,
    (e: Enemy, step: number) => { x: number; y: number }
  > = {
    /** 直线下坠：x 不变，y 每帧减 step */
    [EnemyMovePattern.Straight]: (e, step) => {
      const p = e.node.position
      return { x: p.x, y: p.y - step }
    },

    /**
     * 正弦横摆：以【出生点 x】为基准左右摆，同时持续下坠。
     *
     *   x = spawnX + amplitude · sin(2π · frequency · t)
     *
     * 与直线同速下坠 → 精英机只是"画着波浪往下走"，不会因为摆尾而变慢。
     * 用 spawnX 而不累加上一帧的 x：若拿上一帧位置累加，振幅会随帧数漂移。
     *
     * ⚠️ 摆动会越界：出生点靠边时（如 x=374、幅度 120）波峰会跑到 494，整机飘出屏外。
     *    这里用【对称夹紧】而不是直接 clamp —— 直接 clamp 会把波峰削平成一段直线。
     *    夹紧后摆幅变小、但波形仍是正弦，观感自然。
     */
    [EnemyMovePattern.Sine]: (e, step) => {
      const p = e.node.position
      const phase = 2 * Math.PI * e.sineFrequency * e.elapsed

      // 可用摆动幅度 = min(配置幅度, 到左右边界最近的那一侧的距离)
      const room = Math.min(
        e.spawnX - GameConfig.BOUND_MIN_X,
        GameConfig.BOUND_MAX_X - e.spawnX,
      )
      const amplitude = Math.min(e.sineAmplitude, Math.max(0, room))

      return {
        x: e.spawnX + amplitude * Math.sin(phase),
        y: p.y - step,
      }
    },

    /**
     * 悬停：正常下坠，降到 hoverY 后【停住】不再下落；
     * 未配 hoverY 时退化为直线穿屏（配置表约定：省略 = 不悬停）。
     *
     * 语义 = "降到 hoverY 就停"，不是"最多降到 hoverY"——
     * 所以出生点若已在 hoverY 之下，会直接原地悬停，不会上浮。
     * ⚠️ 停下后不再出界，只有被击杀或撞机才会消失。
     */
    [EnemyMovePattern.Hover]: (e, step) => {
      const p = e.node.position
      const y = p.y - step
      if (e.hoverY === null) return { x: p.x, y }
      return { x: p.x, y: Math.max(y, e.hoverY) }
    },
  }

  /**
   * 统一的自我销毁入口。
   * 先通知管理器将自身移出追踪列表，再销毁节点 ——
   * 避免管理器列表里残留已销毁的失效引用。
   */
  private despawn(): void {
    this.manager?.unregisterEnemy(this.node)
    if (this.node.isValid) this.node.destroy()
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
        damage: this.collideDamage
      })

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

      this.scheduleOnce(() => {
        this.despawn()
      }, 0)
    }
  }
}
