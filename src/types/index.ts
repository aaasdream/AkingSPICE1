/**
 * 🎯 AkingSPICE 核心類型定義
 * 
 * 基於現代 MNA 架構的類型系統
 * 不包含任何 MCP/LCP 相關類型
 */

// 基礎數值類型
export type NodeId = string | number;
export type ComponentId = string;
export type Time = number;
export type Voltage = number;
export type Current = number;
export type Resistance = number;
export type Capacitance = number;
export type Inductance = number;

// 🔥 收敛辅助接口 (MCAS 策略支持)
export type { IConvergenceHelper, NewtonResult, GminEnhancedConfig } from '../core/interfaces/convergence_helper';
export { DEFAULT_GMIN_CONFIG } from '../core/interfaces/convergence_helper';

// 向量接口
export interface IVector {
  readonly size: number;
  
  get(index: number): number;
  set(index: number, value: number): void;
  add(index: number, value: number): void;
  
  norm(): number;
  dot(other: IVector): number;
  
  // 向量运算 (Generalized-α 积分器需要)
  plus(other: IVector): IVector;
  minus(other: IVector): IVector;
  scale(factor: number): IVector;

  // In-place operations for performance
  addInPlace(other: IVector): void;
  subtractInPlace(other: IVector): void;
  scaleInPlace(scalar: number): void;
  
  fill(value: number): void;

  toArray(): number[];
  clone(): IVector;
}

export type VoltageVector = IVector;
export type CurrentVector = IVector;

// 稀疏矩陣接口
export interface ISparseMatrix {
  readonly rows: number;
  readonly cols: number;
  readonly nnz: number;  // 非零元素數量
  
  set(row: number, col: number, value: number): void;
  get(row: number, col: number): number;
  add(row: number, col: number, value: number): void;
  multiply(vector: IVector): IVector;
  
  // 求解接口 (支持異步 KLU)
  factorize(): void;
  solve(rhs: IVector): IVector;
  clone(): ISparseMatrix;
  clear(): void;
  
  // MNA 接地與除錯
  print(): void;
  submatrix(rowsToRemove: number[], colsToRemove: number[]): { matrix: ISparseMatrix, mapping: number[] };

  // 資源管理 (WASM)
  dispose?(): void;
}

// === 事件相關類型 ===

/**
 * 事件類型枚舉
 */
export enum EventType {
  // 通用事件
  StateChange = 'state_change',
  CUSTOM = 'custom',

  // 開關事件
  SWITCH_ON = 'switch_on',
  SWITCH_OFF = 'switch_off',

  // 二極體事件
  DIODE_FORWARD = 'diode_forward',
  DIODE_REVERSE = 'diode_reverse',

  // MOSFET 事件
  MOSFET_CUTOFF = 'mosfet_cutoff',
  MOSFET_LINEAR = 'mosfet_linear',
  MOSFET_SATURATION = 'mosfet_saturation',
}

/**
 * 仿真事件接口
 */
export interface IEvent {
  /** 事件類型 */
  readonly type: EventType | string;
  
  /** 事件發生的約略時間 */
  readonly time: Time;
  
  /** 觸發事件的組件 */
  readonly component: any; // 使用 any 避免循環依賴

  /** 事件优先级 */
  readonly priority: number;

  /** 事件描述 */
  readonly description: string;

  /** 相關數據 */
  readonly data?: any;

  // For event location
  readonly tLow?: Time;
  readonly tHigh?: Time;
  // ✅ 修正：condition 函數現在可以接收 nodeMap
  readonly condition?: (v: IVector, nodeMap: Map<string, number>) => number;
}

/**
 * ADDED: 插值器函数类型
 * 用于在时间步内估算任意时刻的解
 */
export type Interpolator = (time: Time) => IVector;

// === 積分器相關類型 ===

/**
 * 積分器在某個時間點的完整狀態
 */
export interface IntegratorState {
  /** 仿真時間 */
  readonly time: Time;
  
  /** 解向量 (通常是節點電壓) */
  readonly solution: VoltageVector;
  
  /** 解的一階導數 (例如 dV/dt) */
  readonly derivative?: IVector;
}

/**
 * 積分器單步執行的結果
 */
export interface IntegratorResult {
  /** 計算出的新解 */
  readonly solution: VoltageVector;
  
  /** 建議的下一步時間步長 */
  readonly nextDt: Time;
  
  /** 估計的局部截斷誤差 */
  readonly error: number;
  
  /** 該步是否收斂 */
  readonly converged: boolean;
}

/**
 * 積分器接口
 */
export interface IIntegrator {
  /** 積分器階數 */
  readonly order: number;
  
  /** 歷史狀態記錄 */
  readonly history: readonly IntegratorState[];
  
  /**
   * 執行一個積分步
   * @param system MNA 系統
   * @param t 當前時間
   * @param dt 時間步長
   * @param solution 當前解
   */
  step(
    system: IMNASystem,
    t: Time,
    dt: Time,
    solution: VoltageVector
  ): Promise<IntegratorResult>;
  
  /**
   * 估計當前解的誤差
   */
  estimateError(solution: VoltageVector): number;
  
  /**
   * 根據誤差調整時間步長
   */
  adjustTimestep(dt: Time, error: number): Time;
  
  /**
   * 重新啟動積分器
   * @param initialState 初始狀態
   */
  restart(initialState: IntegratorState): Promise<void>;
  
  /**
   * 清空積分器狀態
   */
  clear(): void;

  /**
   * 釋放資源
   */
  dispose?(): void;

  /**
   * ADDED: 在一个时间步内进行插值
   * @param time 要插值的时间点
   * @returns 插值后的解向量
   */
  interpolate(time: Time): IVector;
}

// === MNA 系統接口 ===

/**
 * MNA 系統接口
 * 
 * 抽象了電路在某個工作點的線性化表示
 */
export interface IMNASystem {
  readonly size: number;
  readonly systemMatrix: ISparseMatrix;
  
  /**
   * 獲取右側向量 (RHS)
   */
  getRHS(): IVector;
  
  /**
   * 裝配系統矩陣和向量
   * @param solution 當前解
   * @param time 當前時間
   */
  assemble(solution: VoltageVector, time: Time): void;
}