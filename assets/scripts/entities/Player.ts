import { _decorator, Component, EventKeyboard, Input, input, KeyCode, } from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { BulletManager } from '../managers/BulletManager'
import { DEFAULT_WEAPON_ID } from '../data/config/WeaponConfig'
import { playerData } from '../data/PlayerData'
import { WeaponSystem } from './WeaponSystem'
const { ccclass, property } = _decorator

/**
 * 玩家飞机控制组件
 * - 移动：按键状态 + 每帧综合方向 + 归一化匀速位移
 * - 攻击：交给 WeaponSystem（本文件只负责"何时开火"），一句 weapon.update(...) 完成
 * - 状态：仅在 PLAYING 状态下响应输入与射击；其他状态（菜单/暂停/结算）自动冻结
 *
 * 职责边界（三层各管一段，互不越界）：
 *   Player       —— 何时开火（受游戏状态 / 输入影响）
 *   WeaponSystem —— 发几颗、各自什么角度、间隔多少（武器逻辑，已从这里解耦出去）
 *   BulletManager / Bullet —— 实例化与回收 / 怎么飞
 *
 * 因此：**新增子弹类型只改 WeaponSystem，本文件一行都不用动。**
 */
@ccclass('Player')
export class Player extends Component {
  // —— 输入状态（方案 1：4 个方向布尔）——
  private keyLeft = false
  private keyRight = false
  private keyUp = false
  private keyDown = false

  /** 是否处于暂停（冻结）状态；启动时为 true（停在菜单，不可操作） */
  private isPaused = true

  // —— 射击相关 ——
  /**
   * 子弹管理器（在 Player 节点 Inspector 中，拖入挂有 BulletManager 的节点）。
   * 子弹的生成与回收统一交给它，Player 只负责"何时发射"。
   */
  @property(BulletManager)
  bulletManager: BulletManager | null = null

  /**
   * 当前武器的 id（对应 WeaponConfig）。
   * ⚠️ 过渡写法：等接入"机型选择"后，改为从 ShipConfig.weaponId 读取，本字段即可删除。
   */
  @property
  weaponId: string = DEFAULT_WEAPON_ID

  /**
   * 武器系统实例：计时、按火力等级展开当前武器的发射模式、调用 BulletManager 生成子弹。
   * 玩家侧只保留"什么时候开火"，武器细节全在里面（见 WeaponSystem.ts 的分派表）。
   */
  private readonly weapon = new WeaponSystem()

  protected onLoad(): void {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this)

    // 注入子弹工厂（@property 在反序列化阶段已赋值，onLoad 时必然可用）
    this.weapon.bind(this.bulletManager)

    // 订阅状态变化：根据游戏状态决定是否响应操作
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this)
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 状态切换处理。
   *
   * 要区分两类状态：
   * - 按键（keyXxx）是「玩家意图的瞬时快照」，进入非游玩状态一律清空 ——
   *   否则暂停时按着方向键、恢复后会立即朝该方向飞。
 * - 武器系统的射击计时是「游戏世界的时间进度」，按「时间停止」语义在
   *   PLAYING ↔ PAUSED 之间保留，恢复后接着计时；其余迁移才清零。
   */
  private onStateChange({ oldState, newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING

    // 清空按键：进入任何非游玩状态都执行
    if (this.isPaused) {
      this.keyLeft = this.keyRight = this.keyUp = this.keyDown = false
    }

    // 「时间停止」区间：PLAYING ↔ PAUSED，保留射击计时进度
    if (oldState === GameState.PAUSED || newState === GameState.PAUSED) {
      return
    }

    // 其余迁移（新局开始 / 本局作废）：射击计时清零
    this.weapon.resetTimer()
  }

  /** 按下：把对应方向标记为按下 */
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

  /** 松开：把对应方向标记为松开 */
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
    // 综合方向：右-左 / 上-下，同按自动抵消
    let dirX = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0)
    let dirY = (this.keyUp ? 1 : 0) - (this.keyDown ? 1 : 0)

    // 静止则无需处理（避免无谓计算）
    if (dirX === 0 && dirY === 0) return

    // 归一化：保证斜向与直向速率一致
    const len = Math.sqrt(dirX * dirX + dirY * dirY)
    dirX /= len
    dirY /= len

    // 位移
    const p = this.node.position
    const speed = GameConfig.PLAYER_SPEED
    let newX = p.x + dirX * speed * deltaTime
    let newY = p.y + dirY * speed * deltaTime

    // 边界约束
    newX = Math.max(
      GameConfig.BOUND_MIN_X,
      Math.min(GameConfig.BOUND_MAX_X, newX),
    )
    newY = Math.max(
      GameConfig.BOUND_MIN_Y,
      Math.min(GameConfig.BOUND_MAX_Y, newY),
    )

    this.node.setPosition(newX, newY)
  }

  /**
   * ⚠️ 临时调试：数字键 1~5 直接设置火力等级，用来肉眼确认各等级的散射形态。
   * （散射 lv1 只有 1 颗直射、和升级前长得一样，所以必须能改等级才验证得出来。）
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
    console.log(`[Player][调试] 武器等级 → ${weaponLevel}`)
  }

  protected update(deltaTime: number): void {
    // 暂停/非游玩状态（菜单/暂停/结算）不响应移动与射击
    if (this.isPaused) return

    // 移动与攻击相互独立，静止时也应能持续射击，因此都单独调用
    this.updateMove(deltaTime)

    // 攻击：一句话搞定 —— 计时、展开发射模式、生成子弹全在 WeaponSystem 内部。
    // 出生点定在机头：玩家当前位置再往上偏移一段。
    const p = this.node.position
    this.weapon.update(
      deltaTime,
      this.weaponId,
      playerData.getSnapshot().weaponLevel,
      p.x,
      p.y + GameConfig.BULLET_SPAWN_OFFSET_Y,
    )
  }
}
