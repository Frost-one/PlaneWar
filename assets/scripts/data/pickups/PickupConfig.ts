
/**
 * 可拾取道具的类型枚举（封闭集合）。
 *
 * 与 ship/enemy 用「字符串 id」不同——道具类型是固定几种、不会由外部数据驱动新增，
 * 用枚举做判别标签最干净：Player.onPickup 用 `switch(type)` 收窄，编译器会逼你覆盖每种类型。
 *
 * 用**数字枚举**（0/1/2/3）而非字符串 id：类型封闭、Player.onPickup 的 `switch(type)` 能被编译器逼着覆盖每种类型。
 * 图标不再走数组：`DropManager` 的 `@property` SpriteFrame 数组已删除，改由 config.spritePath +
 * PickupRegistry 启动期 resources.load 并缓存，运行时经 getPickup(type).asset.sprite 取用
 * （避免"按序拖数组易错位"）。
 */
export enum PickupType {
  WEAPON_UP,
  WEAPON_RAMPAGE,
  HEAL,
  SHIELD,
}

/**
 * 单个拾取类型的配置（数据驱动：类型 → 效果数值 + 外观 + 行为）。
 *
 * 所有具体配置合并写在 PickupRegistry.ts 中，本文件只保留类型与接口定义（零运行时代码），
 * 避免循环依赖并减小模块数量。实体（Pickup）与掉落（DropManager）都不硬编码任何类型细节。
 *
 * 【数值为什么拆成 levels / heal / shield，而不是单一 value】
 *   不同 buff 的"量"语义不同：武器升级是"升几档"、回血是"治疗量"、护盾是"护盾值"。
 *   塞进一个通用 value 会丢失语义，读代码时看不出那是个什么量；按类型给专属可选字段，
 *   Player.onPickup 按 type 取对应字段，零类型断言。将来加新类型只需加一个可选字段（加法扩展）。
 */
export interface PickupConfig {
  /** 自身类型（与 ship/enemy 的 id 同理，留作反查 / 判别） */
  type: PickupType
  /** WEAPON_UP 用：升几档火力（受发射器档位数上限约束） */
  levels?: number
  /** HEAL 用：治疗量（字面量） */
  heal?: number
  /** SHIELD 用：护盾值（字面量） */
  shield?: number
  /** 是否吸附玩家：增益道具=true（必被吃到）；负面道具将来置 false（可躲） */
  trackPlayer: boolean
  /**
   * 自身自旋角速度（度/秒）；省略或 0 = 不旋转。
   * 仅视觉：旋转不影响垂直下落，也不影响吸附轨迹（吸附照样朝玩家走）。
   * 想让某道具"边转边落"就给个正值，例如 WEAPON_RAMPAGE 的演示。
   */
  spin?: number
  /**
   * 图标 SpriteFrame 的 resources 路径（相对 assets/resources/，不带扩展名，取图须带 /spriteFrame 后缀）。
   * 启动期由 PickupRegistry.loadPickupAssets 按此路径 resources.load 并缓存到 spriteCache；
   * 运行时 Pickup 实体经 getPickup(type).asset.sprite 取用。缺图标可留空串回退到 tint+label。
   * 例如 'pickups/pickup_weapon_up/spriteFrame'。
   */
  spritePath: string
}

/**
 * 拾取事件载荷：必有 type，其余按类型带对应字面量（加法扩展，不破坏旧签名）。
 * Player.onPickup 按 data.type 取 levels / heal / shield。
 */
export interface PickupPayload {
  type: PickupType
  levels?: number
  heal?: number
  shield?: number
}
