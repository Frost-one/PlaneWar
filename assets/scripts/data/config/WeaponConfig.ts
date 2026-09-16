/**
 * 武器配置表 —— 武器数值与各火力等级弹道参数的唯一权威来源
 *
 * 设计约定（详见记忆 planewar.md「配置表定稿」）：
 * - 速度一律写 px/s（设计单位）。转物理单位只在写入 RigidBody2D.linearVelocity 时
 *   除以 PHYSICS_2D_PTM_RATIO(32)，全工程只有那一处转换。
 * - 只放"换一种武器就会变"的【数值】；子弹的外观 / 尺寸 / 碰撞体形状归各自的 prefab。
 * - 每种子弹一个独立 prefab，由 bulletPrefabIndex 指向 BulletManager 上
 *   @property([Prefab]) 数组的下标（与敌机的 prefabIndex 是同一套模式）。
 *   ⚠️ 同理要求：该数组顺序必须与 WEAPON_CONFIGS 的顺序一致，长度不匹配时应 warn 并回落。
 *
 * 【火力上限不另设常量】：上限 = levels.length。
 * 想调上限（比如 5 级 → 6 级）就增删一条 levels，不用改任何别的地方。
 *
 * 【数值说明】以下全是【占位】数值。真正的平衡必须与 EnemyConfig 的 maxHp 联动复算
 * （校准锚点：普通机 lv1 火力 ~0.4s、精英机 lv3 火力 ~2.5s、BOSS lv5 火力 ~40s）。
 */

/** 武器类型 */
export enum WeaponType {
  /** 散射：多发扇形，覆盖广、单发低 → 清杂兵 */
  Spread = 'Spread',
  /** 贯穿：单发高伤、可穿透 → 打纵队 / 精英 */
  Pierce = 'Pierce',
  /** 激光：持续判定、窄范围（P3 单独做 Beam 通道，不走实体弹） */
  Laser = 'Laser',
}

/**
 * 某个火力等级下的弹道参数。
 *
 * 前三项是实体弹的公共项；带 `?` 的按武器类型取用，用不到的可以省略 ——
 * 这样不用为每种类型写一堆占位的 0。
 */
export interface WeaponLevel {
  /** 单发伤害：该级【最终】值，运行时直接可用，不再二次相乘 */
  readonly damage: number
  /** 发射间隔（秒） */
  readonly interval: number
  /** 子弹飞行速度（px/s，设计单位） */
  readonly speed: number

  // —— 以下按武器类型取用 ——
  /** 单次发射弹数（省略 = 1）。**两种排布共用**，见下面两个字段 */
  readonly count?: number
  /**
   * 各弹【角度】的总跨度（度）；省略 = 0，即全部平行。
   * 与 `laneWidth` **正交、可同时使用**（都是"总跨度"语义，内部均分）：
   *   - 平行弹道：`spreadAngle = 0`、`laneWidth > 0`
   *   - 扇形：    `spreadAngle > 0`、`laneWidth = 0`
   *   - 斜向平行：两者都 > 0
   */
  readonly spreadAngle?: number
  /**
   * 各弹【横向位置】的总宽度（px）；省略 = 0，即全部从机头同一点发出。
   * 例：`count = 3`、`laneWidth = 36` → offsetX = [-18, 0, +18]（全平行）
   */
  readonly laneWidth?: number
  /** 可穿透目标数（Pierce 用；省略 = 0，即不穿透） */
  readonly pierce?: number
  /** 光束宽度，px（Laser 用，P3 再填） */
  readonly width?: number
  /** 伤害结算间隔，秒（Laser 用，P3 再填） */
  readonly tickInterval?: number
}

/** 单把武器的配置（只读模板） */
export interface WeaponConfig {
  /** 唯一标识 */
  readonly id: string
  /** 显示名 */
  readonly name: string
  /** 武器类型 */
  readonly type: WeaponType
  /**
   * 子弹 prefab 序号：对应 BulletManager 上 @property([Prefab]) 数组下标。
   * `null` = 该武器不发射实体弹（目前只有 Laser，它走 Beam 通道）。
   */
  readonly bulletPrefabIndex: number | null
  /** 各武器等级的弹道参数；索引 = weaponLevel - 1；**长度即火力上限** */
  readonly levels: readonly WeaponLevel[]
}

/** 散射（赤焰）：曲线形状 = 弹数变多 + 扇形变宽 + 略微加伤提速（"范围"成长为主） */
export const WEAPON_SPREAD: WeaponConfig = {
  id: 'weapon_spread',
  name: '散射',
  type: WeaponType.Spread,
  bulletPrefabIndex: 0,
  levels: [
    { damage: 8, interval: 0.50, speed: 1000, count: 3, spreadAngle: 36, pierce: 0 },
    { damage: 9, interval: 0.40, speed: 1000, count: 5, spreadAngle: 36, pierce: 0 },
    { damage: 10, interval: 0.30, speed: 1100, count: 7, spreadAngle: 36, pierce: 0 },
    { damage: 11, interval: 0.16, speed: 1200, count: 9, spreadAngle: 36, pierce: 0 },
    { damage: 12, interval: 0.15, speed: 1300, count: 11, spreadAngle: 36, pierce: 0 },
  ],
}

/** 贯穿（苍岩）：曲线形状 = 穿透数 + 单发重伤（"纵深"成长为主） */
export const WEAPON_PIERCE: WeaponConfig = {
  id: 'weapon_pierce',
  name: '贯穿',
  type: WeaponType.Pierce,
  bulletPrefabIndex: 1,
  levels: [
    { damage: 25, interval: 0.32, speed: 900, pierce: 0, count: 1 },
    { damage: 30, interval: 0.31, speed: 910, pierce: 1, count: 2, laneWidth: 24 },
    { damage: 36, interval: 0.3, speed: 920, pierce: 2, count: 3, laneWidth: 48 },
    { damage: 43, interval: 0.29, speed: 930, pierce: 3, count: 3, laneWidth: 64 },
    { damage: 52, interval: 0.28, speed: 940, pierce: 4, count: 3, laneWidth: 80 },
  ],
}

/**
 * 激光（湛影）：P3 单独做 Beam 通道，现在只占位。
 *
 * levels 先留空 —— 激光是"持续判定 + 每帧伤害"，与实体弹是不同模型（没有 interval / speed 的概念，
 * 而是 width + tickInterval），硬填实体弹的字段只会制造一堆无意义的占位数据。
 * 等 P3 做 Beam 时再决定是扩展 WeaponLevel 还是另立一套 beamLevels。
 * ⚠️ 因此：武器系统遇到 type === Laser 时必须先判空，不能直接拿火力等级去索引 levels[]。
 */
export const WEAPON_LASER: WeaponConfig = {
  id: 'weapon_laser',
  name: '激光',
  type: WeaponType.Laser,
  bulletPrefabIndex: null,
  levels: [],
}

/** 全部武器（顺序即 bulletPrefabIndex 的约定顺序，须与 BulletManager 的 prefab 数组对齐） */
export const WEAPON_CONFIGS: readonly WeaponConfig[] = [
  WEAPON_SPREAD,
  WEAPON_PIERCE,
  WEAPON_LASER,
]

/**
 * 按 id 查武器配置。
 * 找不到时返回 null，由调用方决定兜底策略。
 */
export function getWeaponConfig(id: string): WeaponConfig | null {
  return WEAPON_CONFIGS.find((config) => config.id === id) ?? null
}

/** 默认武器：暂时没做武器系统时的兜底 */
export const DEFAULT_WEAPON_ID = WEAPON_SPREAD.id
