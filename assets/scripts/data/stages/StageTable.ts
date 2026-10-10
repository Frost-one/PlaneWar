// data/stages/StageTable.ts
// 关卡聚合表（有序数组 = 为将来多关预留；v1 只用 [0]）。
import { Stage_1 } from './Stage_1'
import { StageData } from './StageTypes'

export const STAGE_TABLE: readonly StageData[] = [Stage_1]

/** 按索引取关卡；越界返回最后一关（v1 不会发生，留作防御） */
export const getStage = (i: number): StageData =>
  STAGE_TABLE[Math.min(i, STAGE_TABLE.length - 1)]
