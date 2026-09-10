/**
 * 游戏全局状态枚举
 * 用于驱动整个游戏的流程切换（GameManager 维护当前状态，UI 依据状态切换显示）。
 */
export enum GameState {
  /** 主菜单 / 标题界面 */
  MENU = 'MENU',
  /** 游戏进行中 */
  PLAYING = 'PLAYING',
  /** 暂停 */
  PAUSED = 'PAUSED',
  /** 游戏结束 */
  OVER = 'OVER',
}