/**
 * 机型配置表 —— 玩家飞机数值的唯一权威来源
 *
 * 设计约定（详见记忆 planewar.md「配置表定稿」）：
 * - 速度一律写 px/s（设计单位）。转物理单位只在写入 RigidBody2D.linearVelocity 时
 *   除以 PHYSICS_2D_PTM_RATIO(32)，全工程只有那一处转换。
 * - 只放"换一种机型就会变"的【数值】。
 *
 * 【为什么玩家侧不拆 3 个 prefab，而敌机侧拆了？】
 * 判据 = "换一种"时，除了图片，还有没有别的东西要变？
 *   - 敌机：普通 / 精英 / BOSS 的【尺寸与碰撞体】差异巨大 → 拆 3 个 prefab
 *   - 玩家：3 架飞机素材尺寸相同，且【判定框本来就必须独立配成小圆】与机体无关
 *           → 换机型其实只有"图片"变 → 1 个 Player 节点 + 运行时换 Sprite 图
 *
 * 【另有一个硬性技术理由】
 * prefab 里的 @property 【不能引用场景节点】。若把玩家做成 3 个 prefab 再 instantiate，
 * Player.bulletManager（指向场景的 Bullets 节点）就无法在编辑器里拖好，必须额外写运行时注入。
 * 不拆 prefab 可完全避开这一层复杂度。
 *
 * 【判定框为什么不在这里配】
 * 弹幕 STG 的玩家判定框须【远小于机体】（擦弹手感，雷霆战机 / 东方系列皆然）。
 * 但"判定框多大"属于【碰撞体形状】→ 归场景里的 Player 节点（建议 CircleCollider2D），
 * 与"外观 / 尺寸 / 碰撞体归 prefab"这条规则保持一致。
 * 若将来要按机型区分判定框，再加 hitRadius 字段，并运行时写 radius + collider.apply()。
 */

/** 单架飞机的配置（只读模板） */
export interface ShipConfig {
  /** 唯一标识 */
  readonly id: string
  /** 显示名 */
  readonly name: string
  /** 基础血量：开局写入 PlayerData.maxHp / hp */
  readonly maxHp: number
  /** 移动速度（px/s，设计单位）—— 机型手感差异的来源 */
  readonly speed: number
  /** 初始武器 id，关联 WeaponConfig（靠数据保证 1:1） */
  readonly weaponId: string
  /**
   * 外观序号：对应 Player 上 @property([SpriteFrame]) 数组的下标。
   *
   * 为什么用下标而不是资源路径：assets/res 不是 resources Bundle，运行时无法按路径加载，
   * 只能"在编辑器里拖好资源 + 用下标取"。将来改造成 Bundle 后可换成 spritePath: string。
   */
  readonly spriteIndex: number
}

/** 赤焰（红）：散射 · 中血中速，清杂兵 */
export const SHIP_RED: ShipConfig = {
  id: 'ship_red',
  name: '赤焰',
  maxHp: 120,
  speed: 420,
  weaponId: 'weapon_spread',
  spriteIndex: 0,
}

/** 苍岩（绿）：贯穿 · 高血低速，站桩刚 */
export const SHIP_GREEN: ShipConfig = {
  id: 'ship_green',
  name: '苍岩',
  maxHp: 160,
  speed: 360,
  weaponId: 'weapon_pierce',
  spriteIndex: 1,
}

/** 湛影（蓝）：激光 · 低血高速，走位要求最高 */
export const SHIP_BLUE: ShipConfig = {
  id: 'ship_blue',
  name: '湛影',
  maxHp: 100,
  speed: 480,
  weaponId: 'weapon_laser',
  spriteIndex: 2,
}

/** 全部机型（顺序即 spriteIndex 的约定顺序，须与 Player 上 shipSprites 数组对齐） */
export const SHIP_CONFIGS: readonly ShipConfig[] = [SHIP_RED, SHIP_GREEN, SHIP_BLUE]

/**
 * 按 id 查机型配置。
 * 找不到时返回 null，由调用方决定兜底策略。
 */
export function getShipConfig(id: string): ShipConfig | null {
  return SHIP_CONFIGS.find((config) => config.id === id) ?? null
}

/** 默认机型：还没做选机界面时的兜底 */
export const DEFAULT_SHIP_ID = SHIP_RED.id
