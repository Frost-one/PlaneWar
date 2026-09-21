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
}