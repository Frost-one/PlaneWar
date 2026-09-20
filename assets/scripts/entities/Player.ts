import {
  _decorator,
  Component,
  EventKeyboard,
  Input,
  input,
  KeyCode,
  Node,
  Sprite,
} from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { BulletManager } from '../managers/BulletManager'
import { IPlayerData, playerData } from '../data/PlayerData'
import { getShipOr, getShipPackageOr, getShipSprite, stageOfLevel } from '../data/ships/ShipRegistry'
import type { ShipConfig } from '../data/ships/ShipConfig'
import type { Emitter, FireContext } from './emitters/Emitter'
import { NO_MODS } from './emitters/Emitter'
const { ccclass, property } = _decorator

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
  // —— 输入状态（4 个方向布尔）——
  private keyLeft = false
  private keyRight = false
  private keyUp = false
  private keyDown = false

  /** 是否处于暂停（冻结）状态；启动时为 true（停在菜单，不可操作） */
  private isPaused = true

  // —— 射击相关 ——
  /**
   * 子弹管理器（在 Player 节点 Inspector 中，拖入挂有 BulletManager 的节点）。
   * 子弹的生成与回收统一交给它。
   */
  @property(BulletManager)
  bulletManager: BulletManager | null = null

  /**
   * 持续型发射器（激光）的挂载层，建议拖入 GameRoot 下的一个空节点（如 Beams）。
   *
   * 只有激光用得到，散射/贯穿可以忽略（留空不报错）。
   * ⚠️ 未拖引用时激光【只警告一次、不显示】，不会崩溃。
   */
  @property(Node)
  beamLayer: Node | null = null

  /**
   * 机身 Sprite（换机型 / 升火力换外观时改它的 spriteFrame）。
   *
   * ⚠️ **没拖也能跑**：为 null 时整条换图链路静默跳过，飞机保持 prefab 里的原图。
   *    这是刻意的 —— 换图属于表现增强，不该因为漏拖一个引用就崩。
   *    但正因如此，忘了拖**不会报错**，只是"升级后外形没变"，排查时先看这里。
   */
  @property(Sprite)
  shipSprite: Sprite | null = null

  /** 当前机型配置；缓存下来，避免每帧查表 */
  private ship: ShipConfig = getShipOr(playerData.getSnapshot().shipId)

  /** 当前装配的发射器（主机 + 僚机 + 副武器……都在这个数组里） */
  private emitters: readonly Emitter[] = []

  /** 当前装配来自哪个机型；**只有换机型才重建装配**，换火力等级不重建 */
  private loadoutKey = ''

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
    // 机身贴图是异步加载的，可能在 Player 启动之后才就绪 —— 靠这条广播补一次外观
    eventBus.on('ship_assets_ready', this.onShipAssetsReady, this)
  }

  /**
   * 依赖他人状态的初始化放 start：装配与外观都要读 playerData 快照。
   * （onLoad 只做同步、无依赖的初始化，本组件没有这类内容，故不写 onLoad。）
   */
  protected start(): void {
    const snap = playerData.getSnapshot()
    this.applyLoadout(snap)
    this.applyAppearance(snap)
  }

  protected onDisable(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this)
    eventBus.off('state_change', this.onStateChange, this)
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
    eventBus.off('ship_assets_ready', this.onShipAssetsReady, this)
  }

  protected onDestroy(): void {
    // 兜底注销（off 幂等）：生命周期规范要求 onDestroy 完成"从全局注销"，
    // 不依赖 onDisable 是否被调用过。
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this)
    eventBus.off('state_change', this.onStateChange, this)
    eventBus.off('player_data_change', this.onPlayerDataChange, this)
    eventBus.off('ship_assets_ready', this.onShipAssetsReady, this)
  }

  /** 资源异步加载完成 → 补刷新一次外观（贴图在启动阶段是异步加载的） */
  private onShipAssetsReady(): void {
    // 异步广播到达时节点可能已销毁 —— 先确认还活着
    if (!this.node?.isValid) return
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
    const cfg = getShipOr(data.shipId)
    if (cfg.id !== this.ship.id) this.ship = cfg
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
    const cfg = getShipOr(data.shipId)
    if (cfg.id === this.loadoutKey) return // 加分 / 扣血 / 升级都不会走到下面

    for (const e of this.emitters) e.reset()
    this.emitters = cfg.emitters
    this.loadoutKey = cfg.id
    // ⚠️ 换机型必须让外观缓存失效：新机型的第 N 档是另一张图，
    //    但 stage 数字可能正好相同（都是 1）→ 不重置就会"换了飞机图没换"。
    this.appliedStage = -1
  }

  /** 清零全部发射器的冷却与持续物（新局开始 / 本局作废时） */
  private resetEmitters(): void {
    for (const e of this.emitters) e.reset()
  }

  /** 上次应用过的外观档（-1 = 还没应用过）；用来避免每帧重复写 spriteFrame */
  private appliedStage = -1

  /**
   * 按【当前火力等级】换机身外观 —— 升级到一定档位就换个样子。
   *
   * 【为什么外观档不等于火力档】
   *   火力有 5 档（数值爽感要细），皮肤只有 3 张（美术成本要省），
   *   两者的对齐关系是【ShipRegistry.STAGE_OF_LEVEL 这张表】，不在这里算 ——
   *   否则 Player / 选机界面 / 将来的皮肤系统会各写一份，早晚不一致。
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
    if (!this.shipSprite) return

    const stage = stageOfLevel(data.weaponLevel)
    if (stage === this.appliedStage) return

    const frame = getShipSprite(this.ship.id, stage)
    // 该档没图（内容待补）→ 保留当前外观，不要把飞机变成空白
    if (!frame) return

    this.shipSprite.spriteFrame = frame
    this.appliedStage = stage
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
      bullets: this.bulletManager,
      beamLayer: this.beamLayer,
      mods: NO_MODS,
      // 子弹外观来自【当前机型自己的资源】（ShipAsset.bulletPrefab）。
      // 激光机型没有子弹 → 为 null，BeamEmitter 不读这个字段，不受影响。
      bulletPrefab: getShipPackageOr(this.ship.id)?.asset.bulletPrefab ?? null,
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
        this.handleDebugKey(e) // ⚠️ 临时调试用，见方法注释
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
    const speed = this.ship.speed
    let newX = p.x + dirX * speed * deltaTime
    let newY = p.y + dirY * speed * deltaTime

    newX = Math.max(GameConfig.BOUND_MIN_X, Math.min(GameConfig.BOUND_MAX_X, newX))
    newY = Math.max(GameConfig.BOUND_MIN_Y, Math.min(GameConfig.BOUND_MAX_Y, newY))

    this.node.setPosition(newX, newY)
  }

  /**
   * ⚠️ 临时调试：数字键 1~5 直接设置火力等级，用来肉眼确认各档的弹道形态。
   * 做完"升级道具（P 道具）"后，请连同 onKeyDown 里的调用一起删掉本方法。
   */
  private handleDebugKey(e: EventKeyboard): void {
    const map: Record<number, number> = {
      [KeyCode.DIGIT_1]: 1,
      [KeyCode.DIGIT_2]: 2,
      [KeyCode.DIGIT_3]: 3,
      [KeyCode.DIGIT_4]: 4,
      [KeyCode.DIGIT_5]: 5,
    }
    const weaponLevel = map[e.keyCode]
    if (weaponLevel === undefined) return

    playerData.setPlayerData({ weaponLevel })
    console.log(`[Player][调试] 火力等级 → ${weaponLevel}`)
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
