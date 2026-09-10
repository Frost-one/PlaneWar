import { eventBus } from '../core/EventBus'

/** 玩家数据字段的形状：用于整份快照、partial 批量设置与存档 */
export interface IPlayerData {
  level: number
  hp: number
  maxHp: number
  attack: number
  speed: number
  score: number
}

export class PlayerData {
  private level: number = 1
  private hp: number = 100
  private maxHp: number = 100
  private attack: number = 100
  private speed: number = 200
  private score: number = 0

  // ---------- 读：整份只读快照（UI 一次性拿全，不逐字段 getter） ----------
  public getSnapshot(): Readonly<IPlayerData> {
    return {
      level: this.level,
      hp: this.hp,
      maxHp: this.maxHp,
      attack: this.attack,
      speed: this.speed,
      score: this.score,
    }
  }

  // ---------- 写：语义方法（带规则 + 广播） ----------
  public addScore(n: number): void {
    this.score += n
    eventBus.emit('player_data_change', this.getSnapshot())
  }

  /** 承受伤害：自身扣血（下限 0，不会掉成负数），改完广播 */
  public takeDamage(n: number): void {
    this.hp = Math.max(0, this.hp - n)
    eventBus.emit('player_data_change', this.getSnapshot())
  }

  /** 是否已阵亡（供 GameManager 判定游戏结束） */
  public isDead(): boolean {
    return this.hp <= 0
  }

  public reset(): void {
    this.level = 1
    this.hp = 100
    this.maxHp = 100
    this.attack = 100
    this.speed = 300
    this.score = 0
    // 重置同样广播，保证 UI 立即回到初始显示
    eventBus.emit('player_data_change', this.getSnapshot())
  }

  /**
   * 批量、部分修改玩家数据：只覆盖传入的字段，未传的保持不变。
   * @example setPlayerData({ hp: 80 })              只改生命
   * @example setPlayerData({ hp: 80, attack: 120 }) 同时改多个
   */
  public setPlayerData(data: Partial<IPlayerData>): void {
    if (data.level !== undefined) this.level = data.level
    if (data.hp !== undefined) this.hp = data.hp
    if (data.maxHp !== undefined) this.maxHp = data.maxHp
    if (data.attack !== undefined) this.attack = data.attack
    if (data.speed !== undefined) this.speed = data.speed
    if (data.score !== undefined) this.score = data.score
    eventBus.emit('player_data_change', this.getSnapshot())
  }

  // 数据自身的序列化（用于存档）
  public toJSON(): object {
    return {
      level: this.level,
      hp: this.hp,
      maxHp: this.maxHp,
      attack: this.attack,
      speed: this.speed,
      score: this.score,
    }
  }

  // 读取玩家存档
  public fromJSON(data: any): void {
    this.setPlayerData({
      level: data.level ?? 1,
      hp: data.hp ?? 100,
      maxHp: data.maxHp ?? 100,
      attack: data.attack ?? 100,
      speed: data.speed ?? 300,
      score: data.score ?? 0,
    })
  }
}

export const playerData = new PlayerData()
