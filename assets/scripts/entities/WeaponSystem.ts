import { WeaponType, WeaponLevel, getWeaponConfig } from '../data/config/WeaponConfig'
// 仅用于类型标注：import type 编译后不产生真实 import，避免与 BulletManager 形成循环依赖
import type { BulletManager } from '../managers/BulletManager'
import type { BulletSpawnParams } from './Bullet'

/**
 * 武器系统 —— "按当前武器 + 火力等级发射一轮子弹"的全部逻辑都收在这里。
 *
 * 【为什么要单独一个文件】
 * Player 只该关心"什么时候开火"，不该知道散射是几颗、角度怎么摊开。
 * 搬进来之后：**新增一种子弹类型 = 加一个 builder + 在 SHOT_BUILDERS 注册一行，
 * Player 一行都不用改**。
 *
 * 三个职责块（都围绕"武器"这一个概念，故先合在一个文件里）：
 *   1. FirePlan      —— 某个火力等级的"本轮发射方案"（间隔 + 每颗子弹的参数）
 *   2. SHOT_BUILDERS —— 武器类型 → 展开函数 的【分派表】（扩展点就在这里）
 *   3. WeaponSystem  —— 计时 + 调用 BulletManager 生成
 *
 * 本文件不依赖 cc：除了 BulletManager / BulletSpawnParams 的类型标注
 * （用 import type，编译后消失），运行时不引用任何引擎类型。
 */

/** 某一轮发射的方案 */
export interface FirePlan {
  /** 本轮与上一轮之间的间隔（秒） */
  interval: number
  /** 本轮要生成的每一颗子弹的参数（同一出生点、各自不同偏角） */
  shots: BulletSpawnParams[]
}

/** 发射模式构建器：把一个等级的弹道参数展开成"这一轮要发哪些子弹" */
export type ShotBuilder = (levelData: WeaponLevel) => BulletSpawnParams[]

// ==================== 各武器类型的展开函数 ====================

/** 公共：按该等级组装一颗子弹的参数。
 * ⚠️ 将来加 `damage` / `pierce` 也只在这里补一次，所有武器类型同时生效。 */
function makeShot(
  levelData: WeaponLevel,
  angleDeg: number,
  offsetX = 0
): BulletSpawnParams {
  return { angleDeg, offsetX, speed: levelData.speed, damage: levelData.damage, pierce: levelData.pierce }
}

/**
 * 通用"排布"：把 `count` 颗子弹在【两个正交维度】上均分铺开。
 *
 *   spreadAngle  → 各弹的【角度】总跨度（度）；0 = 全部平行
 *   laneWidth    → 各弹的【横向位置】总宽度（px）；0 = 全部从机头同一点发出
 *
 * 两者都是"总跨度"语义，内部按 t ∈ [-0.5, +0.5] 均分：
 *   angleDeg = t · spreadAngle
 *   offsetX  = t · laneWidth
 *
 * 于是三种观感由数据自然组合出来：
 *   平行弹道（贯穿）：angle 0、width > 0 　 count=3, width=36 → offsetX [-18, 0, +18]
 *   扇形（散射）： 　 angle > 0、width 0 　 count=3, angle=18 → angleDeg [-9, 0, +9]
 *   斜向平行：    　 两者都 > 0
 *
 * ⚠️ 早退条件只能是 `count <= 1`，**不能**再看角度 / 宽度是否为 0 ——
 *    否则 `count: 3, spreadAngle: 0`（三条平行弹道）会被错当成单发。
 */
function buildLaneShots(levelData: WeaponLevel): BulletSpawnParams[] {
  const count = levelData.count ?? 1
  if (count <= 1) return [makeShot(levelData, 0)]

  const totalAngle = levelData.spreadAngle ?? 0
  const totalWidth = levelData.laneWidth ?? 0

  const shots: BulletSpawnParams[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1) - 0.5 // -0.5 … +0.5
    shots.push(makeShot(levelData, t * totalAngle, t * totalWidth))
  }
  return shots
}

/**
 * 激光：不走实体弹 —— 返回空数组表示"本轮不生成任何子弹"。
 * P3 做 Beam 通道后由它接管，这里只是把类型占位补齐。
 */
function buildLaserShots(): BulletSpawnParams[] {
  return []
}

// ==================== 分派表（扩展点） ====================

/**
 * 武器类型 → 展开函数。
 * ⚠️ **新增武器类型只需在这里加一行** —— 这是本文件存在的最大理由。
 *
 * 用 Record<WeaponType, ...> 而不是 if / switch：漏了某个类型 TS 会直接报错，
 * 不用等到运行时才发现。
 */
const SHOT_BUILDERS: Record<WeaponType, ShotBuilder> = {
  // 散射与贯穿的【排布】完全相同（都由 count / spreadAngle / laneWidth 驱动），
  // 差别只在子弹自身属性（贯穿会带 pierce）→ 所以指向同一个函数。
  // 什么时候需要拆开？当某种武器的排布规律不再能用这三个参数描述时
  // （例如环形弹幕、螺旋弹幕）。
  [WeaponType.Spread]: buildLaneShots,
  [WeaponType.Pierce]: buildLaneShots,
  [WeaponType.Laser]: buildLaserShots,
}

/**
 * 按 武器 id + 火力等级 组装发射方案。
 * 武器不存在、该等级没配置、或类型没有对应 builder 时返回 null（调用方跳过本轮）。
 */
export function buildFirePlan(weaponId: string, weaponLevel: number): FirePlan | null {
  const weapon = getWeaponConfig(weaponId)
  if (!weapon) {
    console.warn(`[WeaponSystem] 找不到武器配置：${weaponId}`)
    return null
  }

  // 该武器等级对应的弹道参数（配置表里的一"档"）
  const levelData = weapon.levels[weaponLevel - 1]
  if (!levelData) {
    // 典型情况：激光（levels 刻意留空，P3 才做），或等级超出该武器的上限
    console.warn(
      `[WeaponSystem] 武器 ${weapon.id} 没有武器等级 ${weaponLevel} 的弹道配置`,
    )
    return null
  }

  const builder = SHOT_BUILDERS[weapon.type]
  if (!builder) {
    console.warn(`[WeaponSystem] 武器类型 ${weapon.type} 没有对应的展开函数`)
    return null
  }

  return { interval: levelData.interval, shots: builder(levelData) }
}

// ==================== 运行时实例 ====================

/**
 * 武器系统实例（由 Player 持有）。
 * Player 每帧只调一次 update() —— 计时、展开、生成全在这里完成。
 */
export class WeaponSystem {
  /** 子弹工厂（由 Player 注入） */
  private bulletManager: BulletManager | null = null

  /** 距离下一轮发射已积累的时间 */
  private timer = 0

  /** 发射方案缓存：只在"武器 / 火力等级"变化时重算（约定：不在 update 里每帧重算） */
  private cachedKey = ''
  private cachedPlan: FirePlan | null = null

  /** 注入子弹工厂。Player 的 bulletManager 是 @property，onLoad 时已可用 */
  public bind(bulletManager: BulletManager | null): void {
    this.bulletManager = bulletManager
  }

  /**
   * 清零射击计时。
   * ⚠️ 这里只负责"清"这个动作 —— **什么时候该清由调用方决定**：
   *    PLAYING ↔ PAUSED 要保留（「时间停止」语义），其余迁移才清零。
   *    状态语义属于 Player，不该由武器系统自己订阅状态事件。
   */
  public resetTimer(): void {
    this.timer = 0
  }

  /**
   * 每帧调用：到点就发射一轮。
   *
   * @param deltaTime 帧间隔
   * @param weaponId 当前武器 id（过渡期由 Player 提供，将来来自 ShipConfig.weaponId）
   * @param weaponLevel 当前武器等级（= PlayerData.weaponLevel）
   * @param x 出生点 x（世界 / 容器局部坐标，与子弹容器同级）
   * @param y 出生点 y
   */
  public update(
    deltaTime: number,
    weaponId: string,
    weaponLevel: number,
    x: number,
    y: number,
  ): void {
    if (!this.bulletManager) return

    const plan = this.getPlan(weaponId, weaponLevel)
    if (!plan) return

    this.timer += deltaTime
    if (this.timer < plan.interval) return

    // 用"减"而不是"清零"：保留超出的那部分，避免高帧率下射速被悄悄吃掉
    this.timer -= plan.interval

    for (const shot of plan.shots) {
      this.bulletManager.spawnBullet(x, y, shot)
    }
  }

  /** 取发射方案（带缓存：方案是纯数据，不会在飞行中被改动） */
  private getPlan(weaponId: string, weaponLevel: number): FirePlan | null {
    const key = `${weaponId}#${weaponLevel}`
    if (key === this.cachedKey) return this.cachedPlan

    this.cachedKey = key
    this.cachedPlan = buildFirePlan(weaponId, weaponLevel)
    return this.cachedPlan
  }
}
