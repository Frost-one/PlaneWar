// data/GameConfig.ts
// 全局可调数值集中管理，改手感只动这个文件

export class GameConfig {
  // —— 玩家相关 ——
  /** 玩家移动速度（单位：像素/秒） */
  static readonly PLAYER_SPEED = 400
  /** 屏幕边界：飞机活动范围（相对 GameRoot 父节点坐标）临时用半屏值，预览后按需调 */
  static readonly BOUND_MIN_X = -374
  static readonly BOUND_MAX_X = 374
  static readonly BOUND_MIN_Y = -499
  static readonly BOUND_MAX_Y = 499

  // —— 射击相关 ——
  /** 子弹出生点相对玩家机头的 y 偏移（沿 +y 即屏幕上方，从机头再往上探出一点） */
  static readonly BULLET_SPAWN_OFFSET_Y = 10

  // —— 拾取道具相关 ——
  /** 拾取判定半径（px）：玩家与道具中心距离小于此值即被拾取 */
  static readonly PICKUP_RADIUS = 28
  /** 磁铁吸附触发半径（px）：进入此范围且允许吸附时，道具高速飞向玩家 */
  static readonly PICKUP_MAGNET_RADIUS = 140
  /** 磁铁吸附速度（px/s）：足够快，玩家无法甩开 */
  static readonly PICKUP_MAGNET_SPEED = 620

  // —— 游戏流程 ——
  /** 临时胜利阈值：累计分数达到即通关，等 WaveManager 用"波次清空"判定接管 */
  static readonly WIN_SCORE = 500
}