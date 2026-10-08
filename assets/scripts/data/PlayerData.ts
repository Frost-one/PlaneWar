import { eventBus } from '../core/EventBus'
import { DEFAULT_SHIP_ID, getShipOr } from './ships/ShipRegistry'
import type { ShipConfig } from './ships/ShipConfig'

/** 玩家数据字段的形状：用于整份快照、partial 批量设置与存档 */
export interface IPlayerData {
  shipId: string
  /** 武器等级（火力等级）：局内成长，吃 P 道具提升；死亡 / 新局清零。上限 = 当前武器的 levels.length */
  weaponLevel: number
  hp: number
  maxHp: number
  attack: number
  speed: number
  score: number
}

export class PlayerData {
  private shipId: string = DEFAULT_SHIP_ID
  /**
   * 武器等级（即火力等级）：局内成长（吃 P 道具提升），死亡 / 新局清零。
   * 名字里特意带 weapon，因为它的唯一用途就是当"当前火力档位"传给发射器：
   *   FireContext.fireLevel → 各发射器自己取 levels[fireLevel - 1]（越界自行 clamp）
   * 上限不在这里管：上限 = 各发射器自己的 levels 数组长度。
   */
  private weaponLevel: number = 1
  private hp: number = 100
  private maxHp: number = 100
  private attack: number = 100
  private speed: number = 200
  private score: number = 0

  // ---------- 读：整份只读快照（UI 一次性拿全，不逐字段 getter） ----------
  public getSnapshot(): Readonly<IPlayerData> {
    return {
      shipId: this.shipId,
      weaponLevel: this.weaponLevel,
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
    this.applyShip(getShipOr(this.shipId))
    this.weaponLevel = 1
    // this.hp = 100      // 由 applyShip 覆盖：hp = maxHp
    // this.maxHp = 100   // 由 applyShip 覆盖
    // this.attack = 100  // 死字段，暂无读取方
    // this.speed = 300   // 由 applyShip 覆盖：speed = ship.speed
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
    if (data.shipId !== undefined) this.shipId = data.shipId
    if (data.weaponLevel !== undefined) this.weaponLevel = data.weaponLevel
    if (data.hp !== undefined) this.hp = data.hp
    if (data.maxHp !== undefined) this.maxHp = data.maxHp
    if (data.attack !== undefined) this.attack = data.attack
    if (data.speed !== undefined) this.speed = data.speed
    if (data.score !== undefined) this.score = data.score
    eventBus.emit('player_data_change', this.getSnapshot())
  }

  public applyShip(cfg: ShipConfig): void {
    this.shipId = cfg.id
    this.maxHp = cfg.maxHp
    this.hp = cfg.maxHp
    this.speed = cfg.speed
    // ⚠️ 原来这里拼成了 'play_data_change'（少个 er），
    //    导致换机型时 HUD 和 Player 都收不到广播（只有被动读快照的选机界面会更新）
    eventBus.emit('player_data_change', this.getSnapshot())
  }

  // 数据自身的序列化（用于存档）
  public toJSON(): object {
    return {
      shipId: this.shipId,
      weaponLevel: this.weaponLevel,
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
      shipId: this.shipId ?? DEFAULT_SHIP_ID,
      weaponLevel: data.weaponLevel ?? 1,
      hp: data.hp ?? 100,
      maxHp: data.maxHp ?? 100,
      attack: data.attack ?? 100,
      speed: data.speed ?? 300,
      score: data.score ?? 0,
    })
  }
}

export const playerData = new PlayerData()
