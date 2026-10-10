import { _decorator, BoxCollider2D, CircleCollider2D, Color, Component, EventKeyboard, Graphics, Input, input, KeyCode, Node, Sprite } from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { BulletManager } from '../managers/BulletManager'
import { EnemyManager } from '../managers/EnemyManager'
import { IPlayerData, playerData } from '../data/PlayerData'
import { getShip, SHIP_REGISTRY } from '../data/ships/ShipRegistry'
import type { ShipPackage } from '../data/ships/ShipRegistry'
import type { Emitter, FireContext, HitQuery } from './emitters/Emitter'
import { NO_MODS } from './emitters/Emitter'
import { PickupType, PickupPayload } from '../data/pickups/PickupConfig'
const { ccclass } = _decorator

/**
 * 玩家飞机控制组件
 *
 * 【职责边界（三层各管一段）】
 *   ShipConfig        —— 装配声明：这个机型用哪些发射器（纯数据）
 *   Emitter           —— 单个发射器：发几颗、什么角度、多久一轮（弹道 + 自己的冷却）
 *   Player（本文件）  —— 时机：能不能开火、从哪个点开火、当前是第几档
 *
 * 每帧就是一句话：**把所有发射器推进一帧**（见 tickEmitters）。
 *
 * ⇒ **新增一种弹道 = 写一个 Emitter 文件 + 在某个机型里装配它。本文件一行都不用改。**
 */
@ccclass('Player')
export class Player extends Component {
  /** 全局唯一实例（供掉落物等查询玩家位置）；由 onLoad 注册 */
  private static instance: Player | null = null

  /** 取玩家组件实例；仅在节点已激活（start 及以后）时可取 */
  public static getInstance(): Player {
    if (!Player.instance) {
      throw new Error('[Player] 场景里没有挂载 Player 节点')
    }
    return Player.instance
  }

  // —— 输入状态（4 个方向布尔）——
  private keyLeft = false
  private keyRight = false
  private keyUp = false
  private keyDown = false

  /** 是否处于暂停（冻结）状态；启动时为 true（停在菜单，不可操作） */
  private isPaused = true

  // —— 射击相关 ——
  /**
   * 子弹管理器（模块级单例，start 里取 —— 注册发生在 BulletManager.onLoad，早于任何 start）。
   * 不再走 @property：本组件在场景里、Enemy 在 prefab 里，prefab 无法通过 @property
   * 引用场景节点，两边用同一套"运行时取单例"才一致。
   */
  private bulletManager: BulletManager | null = null

  /**
   * 命中查询器（激光等"没有飞行体"的武器用），由本机一层包装好后注入 FireContext。
   *
   * 【为什么要在 start 里包一层箭头函数，而不是运行时直接传方法】
   *   ① 不能直接写 `this.enemyManager.queryNearestHit` —— 原型方法脱离 this 调用会拿不到自己的字段；
   *   ② 也不能在 tickEmitters 里临时包闭包 —— 那会【每帧】新建一个函数对象，纯浪费。
   *   绑定一次存成字段，是这两者的唯一交点。
   */
  private hitQuery: HitQuery | null = null

  /**
   * 当前机型（配置 + 资源）大对象；缓存下来避免每帧查表。
   * 配置在启动期即可用；资源是异步加载的，未就绪时 asset 为 null，
   * 等 `ship_assets_ready` 广播（见 onShipAssetsReady）刷新为真实资源。
   */
  private ship: ShipPackage = getShip(playerData.getSnapshot().shipId) ?? getShip(SHIP_REGISTRY[0].id)!

  /** 当前装配的发射器（主机 + 僚机 + 副武器……都在这个数组里） */
  private emitters: readonly Emitter[] = []

  /** 当前装配来自哪个机型；**只有换机型才重建装配**，换火力等级不重建 */
  private loadoutKey = ''

  /** 注册全局实例：节点激活时绑定，供掉落物查询位置 */
  protected onLoad(): void {
    Player.instance = this
  }

  /**
   * 输入监听与事件订阅跟随【激活状态】，与 onDisable 严格对称。
   *
   * 为什么不放 onLoad：非游玩状态下若 Player 被停用，输入与广播都不该继续生效；
   * 放 onLoad 会让停用的组件继续收事件。
   */
  protected onEnable(): void {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this)

    eventBus.on('state_change', this.onStateChange, this)
    eventBus.on('player_data_change', this.onPlayerDataChange, this)
    // 拾取道具 → 按类型生效
    eventBus.on('pickup_collected', this.onPickup, this)
    // 机身贴图是异步加载的，可能在 Player 启动之后才就绪 —— 靠这条广播补一次外观
    eventBus.on('ship_assets_ready', this.onShipAssetsReady, this)
  }

  /**
   * 依赖他人状态的初始化放 start：
   * - 装配与外观要读 playerData 快照
   * - 子弹管理器要等 BulletManager.onLoad 注册完才能取（注册发生在 onLoad，晚于本组件的 onLoad）
   * 这两件都不能放进 onLoad。
   */
  protected start(): void {
    this.bulletManager = BulletManager.getInstance()

    // 敌机管理器同样在 onLoad 注册，这里（start）取一定拿得到。
    const enemyManager = EnemyManager.getInstance()
    this.hitQuery = (rect) => enemyManager.queryNearestHit(rect)

    const snap = playerData.getSnapshot()
    this.applyLoadout(snap)
    this.applyAppearance(snap)
    this.setupHitboxIndicator()
  }

  protected onDisable(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this)
    eventBus.off('state_change', this.onStateChange, this)
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
    eventBus.off('pickup_collected', this.onPickup, this)
    eventBus.off('ship_assets_ready', this.onShipAssetsReady, this)
  }

  protected onDestroy(): void {
    // 兜底注销（off 幂等）：生命周期规范要求 onDestroy 完成"从全局注销"，
    // 不依赖 onDisable 是否被调用过。
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this)
    eventBus.off('state_change', this.onStateChange, this)
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
    eventBus.off('pickup_collected', this.onPickup, this)
    eventBus.off('ship_assets_ready', this.onShipAssetsReady, this)
    if (Player.instance === this) Player.instance = null
  }

  /** 资源异步加载完成 → 刷新 this.ship（asset 变为真实资源）并补一次外观 */
  private onShipAssetsReady(): void {
    // 异步广播到达时节点可能已销毁 —— 先确认还活着
    if (!this.node?.isValid) return
    const s = getShip(playerData.getSnapshot().shipId)
    if (s) this.ship = s
    this.applyAppearance(playerData.getSnapshot())
  }

  /**
   * 状态切换处理。
   *
   * 要区分两类状态：
   * - 按键（keyXxx）是「玩家意图的瞬时快照」，进入非游玩状态一律清空 ——
   *   否则暂停时按着方向键、恢复后会立即朝该方向飞。
   * - 发射器的冷却是「游戏世界的时间进度」，按「时间停止」语义在
   *   PLAYING ↔ PAUSED 之间保留，恢复后接着走；其余迁移才清零。
   */
  private onStateChange({ oldState, newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING

    if (this.isPaused) {
      this.keyLeft = this.keyRight = this.keyUp = this.keyDown = false
    }

    if (oldState === GameState.PAUSED || newState === GameState.PAUSED) {
      return
    }

    // 其余迁移（新局开始 / 本局作废）：清掉所有发射器的计时与持续物（比如光束）
    this.resetEmitters()
  }

  /** 玩家数据变化：机型或火力等级变了就重装发射器 / 换外观 */
  private onPlayerDataChange(data: Readonly<IPlayerData>): void {
    const s = getShip(data.shipId) ?? getShip(SHIP_REGISTRY[0].id)!
    if (s.config.id !== this.ship.config.id) this.ship = s
    this.applyLoadout(data)
    this.applyAppearance(data)
  }

  /**
   * 装配发射器 —— **只在换机型时重建**。
   *
   * 火力等级【不参与】装配：等级是每帧传给发射器的一个数（FireContext.fireLevel），
   * 换它既不该也不需要重建发射器。早期版本把等级拼进装配 key，结果每次升火力
   * 都会换一批发射器对象、丢掉已积累的冷却 → 体感"卡一下才继续射击"。
   *
   * ⚠️ 换装配前必须先 `reset()` 旧的：激光的光束节点是发射器自己建的，
   *    不 reset 就会残留在场上（且不报错，只表现为"换机型后多了一条光束"）。
   */
  private applyLoadout(data: Readonly<IPlayerData>): void {
    const cfg = getShip(data.shipId) ?? getShip(SHIP_REGISTRY[0].id)!
    if (cfg.config.id === this.loadoutKey) return // 加分 / 扣血 / 升级都不会走到下面

    for (const e of this.emitters) e.reset()
    // ⚠️ 配置里的 emitters 是【工厂闭包数组】(每项是 `() => new XxxEmitter(...)`)，
    //   装配时调用闭包生成真正的实例；与敌机共用同一套写法（见 Enemy.init）。
    //   写配置只管 `emitters: [() => new LaneEmitter('main', LEVELS)]`，
    //   不再有 createEmitters 特殊写法，也不再需要 clone() 这种只为模板存在的接口方法。
    this.emitters = cfg.config.emitters ? cfg.config.emitters.map((make) => make()) : []
    this.loadoutKey = cfg.config.id
    // ⚠️ 换机型必须让外观缓存失效：新机型的第 N 档是另一张图，
    //    但 stage 数字可能正好相同（都是 1）→ 不重置就会"换了飞机图没换"。
    this.appliedStage = -1
  }

  /** 清零全部发射器的冷却与持续物（新局开始 / 本局作废时） */
  private resetEmitters(): void {
    for (const e of this.emitters) e.reset()
  }

  /**
   * 拾取道具 → 按类型生效（受当前机型发射器档位数上限约束）。
   * 写回 PlayerData 会广播 player_data_change，外观（机身图 / 体型）自动更新，
   * 且每帧传给发射器的 fireLevel 也随之抬高 → 三档火力 / 机身图 / scalePerLevel 全部生效。
   */
  private onPickup(data: PickupPayload): void {
    switch (data.type) {
      case PickupType.WEAPON_UP: {
        const cur = playerData.getSnapshot().weaponLevel
        let cap = 1
        for (const e of this.emitters) cap = Math.max(cap, e.maxLevel)
        if (cur >= cap) return
        // 升几档由配置字面量 data.levels 决定（不实现其他 buff 时它恒为 1）
        playerData.setPlayerData({ weaponLevel: cur + (data.levels ?? 1) })
        break
      }
      // —— 以下 buff 暂未实现（按约定本次不做；PlayerData 也尚未扩展 heal / shield）——
      // case PickupType.WEAPON_RAMPAGE: 拉满火力（cap = 各发射器 maxLevel 最大值）
      // case PickupType.HEAL:    playerData.heal(data.heal ?? 0)
      // case PickupType.SHIELD:  playerData.addShield(data.shield ?? 0)
    }
  }

  /** 上次应用过的外观档（-1 = 还没应用过）；用来避免每帧重复写 spriteFrame */
  private appliedStage = -1

  /**
   * 按【当前火力等级】换机身外观 —— 升级到一定档位就换个样子。
   *
   * 【外观档怎么来的】火力 3 档 ↔ 机身图 3 张，1:1，所以档号就是 `weaponLevel - 1`。
   *   取图直接走 `this.ship.asset.sprites[stage]`（this.ship 来自 getShip 的嵌套大对象），
   *   本文件不自己算下标，将来档数与图数不等长时再在此处加映射。
   *
   * 【为什么记 appliedStage】
   *   本方法挂在 `player_data_change` 上，而**加分 / 扣血也会广播这个事件** ——
   *   不判重的话每中一枪都白写一次 spriteFrame（会触发一次合批重建）。
   *   外观档没变就直接 return，代价是 1 次整数比较。
   *
   * ⚠️ 这里【不做任何数据写入】：外观是 weaponLevel 的【推导结果】，不是第二份真值。
   *    绝不往 PlayerData 里加 spriteIndex —— 那就是又一个"双源"。
   */
  private applyAppearance(data: Readonly<IPlayerData>): void {
    // 体型：随火力等级【略微变大】—— 基础 scale + 每级增量。
    // 与外观解耦：外观按 stage 变（避免每帧重设 spriteFrame），体型按 level 变（每级都生效）。
    const sizeScale = this.ship.config.scale + (data.weaponLevel - 1) * this.ship.config.scalePerLevel
    this.node.setScale(sizeScale, sizeScale, 1)

    // 机身 Sprite 直接取 Player 节点自身的 Sprite 组件（机身图就挂在这个节点上），
    // 不靠 Inspector 拖引用：旧 shipSprite @property 已删 —— prefab 里该字段始终为 null，
    // 实际一直走这条 getComponent 回退，纯冗余。删后换机型 / 升火力一样看得到贴图变化。
    const sprite = this.getComponent(Sprite)
    if (!sprite) return

    const stage = Math.max(0, data.weaponLevel - 1)
    if (stage === this.appliedStage) return

    // 该档图来自资源包；资源未加载完（asset 为 null）或该档缺图（内容待补）→ 保留当前外观，不要把飞机变成空白
    const frame = this.ship.asset?.sprites[stage] ?? null
    if (!frame) return

    sprite.spriteFrame = frame
    this.appliedStage = stage
  }

  /**
   * 在玩家中心画一个"判定圈"高亮（参考雷霆战机）：
   * 直观告诉玩家【撞到这个圈就会扣血】，而圈远小于机体贴图。
   *
   * 【为什么用 Graphics 现画，而不在 prefab 里拖一个圈】
   *   ① 判定框是运行时随 Collider 走的（玩家改成 CircleCollider 后半径在编辑器里调），
   *      现画保证"画出来的圈 == 实际碰撞圈"，不会出现"显示和实际不一样大"；
   *   ② 玩家 prefab 由编辑器管、AI 不碰 —— 用代码建子节点零编辑器接线。
   *
   * 子节点随玩家移动、并随机型 scale 等比放大，换机型 / 升级变大后圈也跟着变大，永远贴合。
   */
  private setupHitboxIndicator(): void {
    const circle = this.getComponent(CircleCollider2D)
    const box = this.getComponent(BoxCollider2D)
    if (!circle && !box) return

    const indicator = new Node('HitboxIndicator')
    indicator.parent = this.node
    const g = indicator.addComponent(Graphics)

    const RING = new Color(255, 70, 70, 255)
    const FILL = new Color(255, 70, 70, 45)

    if (circle) {
      const r = circle.radius
      const ox = circle.offset.x
      const oy = circle.offset.y
      g.fillColor = FILL
      g.circle(ox, oy, r)
      g.fill()
      g.lineWidth = 2
      g.strokeColor = RING
      g.circle(ox, oy, r)
      g.stroke()
    } else if (box) {
      const w = box.size.width
      const h = box.size.height
      const ox = box.offset.x
      const oy = box.offset.y
      g.fillColor = FILL
      g.rect(ox - w * 0.5, oy - h * 0.5, w, h)
      g.fill()
      g.lineWidth = 2
      g.strokeColor = RING
      g.rect(ox - w * 0.5, oy - h * 0.5, w, h)
      g.stroke()
    }
  }

  /**
   * 把所有发射器推进一帧 —— 每帧的开火其实就这么点事。
   *
   * ⚠️ 将来 BOSS 也要开火时，把本方法整体搬到一个共享的地方（比如 `tickEmitters()`
   * 函数或 FireController 类）即可；**只有一个调用方时不值得先抽象**。
   */
  private tickEmitters(deltaTime: number, fireLevel: number, x: number, y: number): void {
    if (this.emitters.length === 0) return

    // ⚠️ ctx 每帧新建一个对象：这是刻意的 ——
    //    它让发射器无法持有并修改上下文（只读契约），改起来也更安全。
    //    （每帧 1 次小对象分配，对 GC 的压力远小于子弹节点的 instantiate，可接受）
    //
    // mods：飞船升级 / 道具的乘区入口。目前恒为 NO_MODS，
    //       做飞船升级时改成从 PlayerData 读（见 Emitter.ts 的 FireMods）。
    const ctx: FireContext = {
      fireLevel,
      x,
      y,
      // 子弹管理器是单例，start 里取（见 BulletManager.getInstance 的时序说明）。
      // 激光的渲染节点也挂在它的容器节点上 —— 所以不再需要单独的 beamLayer 属性。
      bulletManager: this.bulletManager,
      mods: NO_MODS,
      // 子弹外观来自【当前机型自己的资源】（ShipAsset.bulletPrefab）。
      // 激光机型没有子弹 → 为 null，BeamEmitter 不读这个字段，不受影响。
      // 资源未加载完时 asset 为 null，这里回落 null，等 ship_assets_ready 后下次开火自然取到。
      bulletPrefab: this.ship.asset?.bulletPrefab ?? null,
      // 激光判定入口（实体弹机型不使用它，但传出去无妨 —— 没用到就是 null 的开销）
      hitQuery: this.hitQuery,
    }

    for (const e of this.emitters) {
      e.tick(deltaTime, ctx)
    }
  }

  private onKeyDown(e: EventKeyboard): void {
    switch (e.keyCode) {
      case KeyCode.KEY_W:
        this.keyUp = true
        break
      case KeyCode.KEY_S:
        this.keyDown = true
        break
      case KeyCode.KEY_A:
        this.keyLeft = true
        break
      case KeyCode.KEY_D:
        this.keyRight = true
        break
      default:
        break
    }
  }

  private onKeyUp(e: EventKeyboard): void {
    switch (e.keyCode) {
      case KeyCode.KEY_W:
        this.keyUp = false
        break
      case KeyCode.KEY_S:
        this.keyDown = false
        break
      case KeyCode.KEY_A:
        this.keyLeft = false
        break
      case KeyCode.KEY_D:
        this.keyRight = false
        break
      default:
        break
    }
  }

  /** 移动：依据当前按键方向做归一化匀速位移并约束在边界内 */
  private updateMove(deltaTime: number): void {
    let dirX = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0)
    let dirY = (this.keyUp ? 1 : 0) - (this.keyDown ? 1 : 0)

    if (dirX === 0 && dirY === 0) return

    const len = Math.sqrt(dirX * dirX + dirY * dirY)
    dirX /= len
    dirY /= len

    const p = this.node.position
    // 移速读机型配置（只读模板），不读 PlayerData 里的副本 —— 避免第二份真值
    const speed = this.ship.config.speed
    let newX = p.x + dirX * speed * deltaTime
    let newY = p.y + dirY * speed * deltaTime

    newX = Math.max(GameConfig.BOUND_MIN_X, Math.min(GameConfig.BOUND_MAX_X, newX))
    newY = Math.max(GameConfig.BOUND_MIN_Y, Math.min(GameConfig.BOUND_MAX_Y, newY))

    this.node.setPosition(newX, newY)
  }

  protected update(deltaTime: number): void {
    if (this.isPaused) return

    this.updateMove(deltaTime)

    // 开火：把所有发射器推进一帧，各发射器自己决定发不发、发几颗
    const p = this.node.position
    this.tickEmitters(
      deltaTime,
      playerData.getSnapshot().weaponLevel, // 等级每帧传下去，不参与装配
      p.x,
      p.y + GameConfig.BULLET_SPAWN_OFFSET_Y,
    )
  }
}
