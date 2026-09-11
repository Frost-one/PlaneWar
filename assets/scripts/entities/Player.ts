import {
  _decorator,
  Component,
  EventKeyboard,
  Input,
  input,
  instantiate,
  KeyCode,
  Node,
  Prefab,
} from 'cc'
import { GameConfig } from '../data/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
const { ccclass, property } = _decorator

/**
 * 玩家飞机控制组件
 * - 移动：按键状态 + 每帧综合方向 + 归一化匀速位移
 * - 攻击：按固定间隔自动发射子弹（自动连射），子弹实例取自 bulletPrefab
 * - 状态：仅在 PLAYING 状态下响应输入与射击；其他状态（菜单/暂停/结算）自动冻结
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
  /** 子弹预制体（在场景 Player 节点 Inspector 中拖入 assets/prefabs/Bullet_1.prefab） */
  @property(Prefab)
  bulletPrefab: Prefab | null = null

  /** 发射间隔（秒）：每隔多少秒射出一颗子弹 */
  @property
  shootInterval = 0.2

  /** 累计的射击计时 */
  private shootTimer = 0

  protected onLoad(): void {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this)

    // 订阅状态变化：根据游戏状态决定是否响应操作
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this)
    eventBus.off('state_change', this.onStateChange, this)
  }

  /** 状态切换：仅 PLAYING 时可操作；其余状态视为暂停并清空按键 */
  private onStateChange({ newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING
    if (this.isPaused) {
      // 清空按键状态，避免“暂停时按着方向键，恢复后立即移动”的问题
      this.keyLeft = this.keyRight = this.keyUp = this.keyDown = false
      this.shootTimer = 0
    }
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

  /** 自动连射计时：到点即从机头发射一颗子弹 */
  private updateShoot(deltaTime: number): void {
    if (!this.bulletPrefab) return

    this.shootTimer += deltaTime
    // 达到发射间隔则射出一颗并重置计时
    if (this.shootTimer >= this.shootInterval) {
      this.shootTimer -= this.shootInterval
      this.shoot()
    }
  }

  /** 从玩家机头位置发射一颗子弹 */
  private shoot(): void {
    const bullet = instantiate(this.bulletPrefab)
    if (!bullet) return

    // 子弹放到与玩家同级的场景节点下，使其能独立自由飞行
    const parent = this.node.parent
    if (parent) {
      bullet.parent = parent
    }

    // 子弹起点放玩家机头：同一父节点下，取玩家当前位置再往上偏移一段
    const p = this.node.position
    bullet.setPosition(p.x, p.y + GameConfig.BULLET_SPAWN_OFFSET_Y)
  }

  protected update(deltaTime: number): void {
    // 暂停/非游玩状态（菜单/暂停/结算）不响应移动与射击
    if (this.isPaused) return

    // 移动与攻击相互独立，静止时也应能持续射击，因此都单独调用
    this.updateMove(deltaTime)
    this.updateShoot(deltaTime)
  }
}
