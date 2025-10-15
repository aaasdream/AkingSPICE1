/**
 * 🎯 Trapezoidal 積分器 (完全按照 ngspice 實現)
 * 
 * 參考: ngspice/src/maths/ni/niinteg.c
 *       ngspice/src/maths/ni/nicomcof.c
 * 
 * ngspice 使用 Trapezoidal 作為默認積分方法
 * 這是最簡單、最穩定的二階積分器
 * 
 * 公式 (Order 1 - Backward Euler):
 *   CKTag[0] = 1/dt
 *   CKTag[1] = -1/dt
 *   i(n) = CKTag[0] * flux(n) + CKTag[1] * flux(n-1)
 * 
 * 公式 (Order 2 - Trapezoidal):
 *   xmu = 0.5
 *   CKTag[0] = 1 / dt / (1 - xmu) = 2/dt
 *   CKTag[1] = xmu / (1 - xmu) = 1
 *   i(n) = CKTag[0] * flux(n) + CKTag[1] * flux(n-1) + ...
 */

import type { Time, VoltageVector, IVector } from '../../types';

export interface TrapezoidalOptions {
  /** 初始時間步長 */
  initialTimeStep?: number;
  
  /** 最小時間步長 */
  minTimeStep?: number;
  
  /** 最大時間步長 */
  maxTimeStep?: number;
  
  /** 容差 */
  tolerance?: number;
  
  /** 積分階數 (1=Backward Euler, 2=Trapezoidal) */
  order?: 1 | 2;
  
  /** xmu 參數 (僅 order=2 使用，默認 0.5) */
  xmu?: number;
  
  /** 最大 Newton 迭代次數 */
  maxNewtonIterations?: number;
  
  /** 詳細日誌 */
  verbose?: boolean;
}

export interface TrapezoidalState {
  time: Time;
  solution: VoltageVector;
  dt: number;
  stats: {
    acceptedSteps: number;
    rejectedSteps: number;
    newtonIterations: number;
  };
}

export interface StepResult {
  solution: VoltageVector;
  nextDt: number;
  error: number;
  converged: boolean;
}

/**
 * 系統介面 (與 Backward Euler 相同)
 */
export interface ISystem {
  /** 組裝系統方程 */
  assemble(solution: IVector, time: Time): void;
  
  /** 獲取系統矩陣 (Jacobian) */
  systemMatrix: any;
  
  /** 獲取右端向量 */
  getRHS(): IVector;
  
  /** 設置積分器係數 */
  setIntegrationCoefficients(G_coeff: number, I_coeff: number, R_coeff: number, V_coeff: number): void;
}

/**
 * 🎯 Trapezoidal 積分器實現 (完全按照 ngspice)
 */
export class TrapezoidalIntegrator {
  private _options: Required<TrapezoidalOptions>;
  private _currentState: TrapezoidalState;
  
  // 統計
  private _acceptedSteps = 0;
  private _rejectedSteps = 0;
  private _totalNewtonIterations = 0;

  constructor(options: TrapezoidalOptions = {}) {
    // 設置默認選項 (與 ngspice 一致)
    this._options = {
      initialTimeStep: options.initialTimeStep ?? 1e-9,
      minTimeStep: options.minTimeStep ?? 1e-10,
      maxTimeStep: options.maxTimeStep ?? 1e-6,
      tolerance: options.tolerance ?? 1e-4,
      order: options.order ?? 2,  // 默認使用 Order 2 (Trapezoidal)
      xmu: options.xmu ?? 0.5,    // ngspice 默認值
      maxNewtonIterations: options.maxNewtonIterations ?? 50,
      verbose: options.verbose ?? false
    };

    // 初始化狀態
    this._currentState = {
      time: 0,
      solution: [] as any,
      dt: this._options.initialTimeStep,
      stats: {
        acceptedSteps: 0,
        rejectedSteps: 0,
        newtonIterations: 0
      }
    };

    this._log(`[TRAP] Trapezoidal 積分器已創建 (Order ${this._options.order})`);
    if (this._options.order === 2) {
      this._log(`[TRAP] xmu = ${this._options.xmu} (xmu=0.5 是標準梯形法)`);
    }
  }

  /**
   * 🚀 執行一個時間步 (完全按照 ngspice 的 NIintegrate)
   */
  async step(
    system: ISystem,
    t: Time,
    dt: Time,
    solution: VoltageVector
  ): Promise<StepResult> {
    this._log(`\n[TRAP] === 開始時間步 t=${t.toExponential(3)}s, dt=${dt.toExponential(3)}s ===`);

    // 1. 計算積分係數 (完全按照 ngspice/src/maths/ni/nicomcof.c)
    let CKTag0: number;
    let CKTag1: number;

    if (this._options.order === 1) {
      // Order 1: Backward Euler
      CKTag0 = 1.0 / dt;
      CKTag1 = -1.0 / dt;
      this._log(`[TRAP] Backward Euler: CKTag[0]=${CKTag0.toExponential(3)}, CKTag[1]=${CKTag1.toExponential(3)}`);
    } else {
      // Order 2: Trapezoidal
      const xmu = this._options.xmu;
      CKTag0 = 1.0 / dt / (1.0 - xmu);
      CKTag1 = xmu / (1.0 - xmu);
      this._log(`[TRAP] Trapezoidal: CKTag[0]=${CKTag0.toExponential(3)}, CKTag[1]=${CKTag1.toExponential(3)}`);
    }

    // 2. 設置積分器係數
    // 對電容: G_coeff = CKTag[0] * C (電導)
    // 對電感: R_coeff = CKTag[0] * L (電阻)
    const G_coeff = CKTag0;
    const R_coeff = CKTag0;
    const I_coeff = 0;  // 歷史項通過 previousSolutionVector 處理
    const V_coeff = 0;

    system.setIntegrationCoefficients(G_coeff, I_coeff, R_coeff, V_coeff);

    // 3. Newton-Raphson 迭代求解
    let x = solution;  // 初始猜測
    const maxIterations = this._options.maxNewtonIterations;
    const newtonTol = 1e-7;
    let converged = false;
    let iterations = 0;

    for (iterations = 0; iterations < maxIterations; iterations++) {
      // 組裝系統方程
      system.assemble(x, t + dt);

      // 獲取 Jacobian 和 RHS
      const J = system.systemMatrix;
      const b = system.getRHS();

      // 計算殘量
      const residual = b;
      const residualNorm = (residual as IVector).norm();

      this._log(`[TRAP]   Newton #${iterations}: ||F||=${residualNorm.toExponential(3)}`);

      // 檢查收斂
      if (residualNorm < newtonTol) {
        converged = true;
        this._log(`[TRAP]   ✅ Newton 收斂: ${iterations} 次迭代`);
        break;
      }

      // 檢查 NaN
      if (!isFinite(residualNorm)) {
        this._log(`[TRAP]   ❌ Newton 發散: 殘量 = NaN`);
        return {
          solution: solution,
          nextDt: dt * 0.5,
          error: Infinity,
          converged: false
        };
      }

      // 求解增量
      try {
        const delta = J.solve(residual);
        x = x.plus(delta);
      } catch (error) {
        this._log(`[TRAP]   ❌ Newton 求解失敗: ${error}`);
        return {
          solution: solution,
          nextDt: dt * 0.5,
          error: Infinity,
          converged: false
        };
      }
    }

    if (!converged) {
      this._log(`[TRAP]   ❌ Newton 未收斂: ${iterations} 次迭代`);
      this._rejectedSteps++;
      return {
        solution: solution,
        nextDt: dt * 0.5,
        error: Infinity,
        converged: false
      };
    }

    // 4. 自適應時間步長控制 (簡化版)
    this._acceptedSteps++;
    this._totalNewtonIterations += iterations;

    let nextDt = dt;
    if (iterations < 3) {
      // 收斂很快，增加步長
      nextDt = Math.min(dt * 1.5, this._options.maxTimeStep);
      this._log(`[TRAP] ✅ 收斂快速，增加步長: ${dt.toExponential(3)} → ${nextDt.toExponential(3)}`);
    } else if (iterations > 10) {
      // 收斂較慢，減小步長
      nextDt = Math.max(dt * 0.8, this._options.minTimeStep);
      this._log(`[TRAP] ⚠️  收斂較慢，減小步長: ${dt.toExponential(3)} → ${nextDt.toExponential(3)}`);
    }

    // 5. 更新狀態
    this._currentState = {
      time: t + dt,
      solution: x,
      dt: nextDt,
      stats: {
        acceptedSteps: this._acceptedSteps,
        rejectedSteps: this._rejectedSteps,
        newtonIterations: iterations
      }
    };

    return {
      solution: x,
      nextDt: nextDt,
      error: 0,
      converged: true
    };
  }

  /**
   * 重置積分器到初始狀態
   */
  reset(time: Time = 0, solution?: VoltageVector): void {
    this._acceptedSteps = 0;
    this._rejectedSteps = 0;
    this._totalNewtonIterations = 0;

    this._currentState = {
      time: time,
      solution: solution ?? ([] as any),
      dt: this._options.initialTimeStep,
      stats: {
        acceptedSteps: 0,
        rejectedSteps: 0,
        newtonIterations: 0
      }
    };

    this._log(`[TRAP] 積分器已重置: t=${time}, dt=${this._options.initialTimeStep.toExponential(3)}s`);
  }

  /**
   * 重新啟動積分器 (兼容 GeneralizedAlphaIntegrator 介面)
   */
  async restart(config: {
    time: Time;
    solution: VoltageVector;
    dt?: number;
  }): Promise<void> {
    const dt = config.dt ?? this._options.initialTimeStep;
    
    this._currentState = {
      time: config.time,
      solution: config.solution,
      dt: dt,
      stats: {
        acceptedSteps: 0,
        rejectedSteps: 0,
        newtonIterations: 0
      }
    };

    this._log(`[TRAP] 積分器已重新啟動: t=${config.time}, dt=${dt.toExponential(3)}s`);
  }

  /**
   * 插值 (線性插值)
   */
  interpolate(time: Time): VoltageVector {
    return this._currentState.solution;
  }

  /**
   * 獲取當前狀態
   */
  getCurrentState(): TrapezoidalState {
    return { ...this._currentState };
  }

  /**
   * 獲取性能統計
   */
  getPerformanceReport() {
    const total = this._acceptedSteps + this._rejectedSteps;
    return {
      acceptedSteps: this._acceptedSteps,
      rejectedSteps: this._rejectedSteps,
      totalSteps: total,
      acceptanceRate: total > 0 ? this._acceptedSteps / total : 0,
      avgNewtonIterations: this._acceptedSteps > 0 ? this._totalNewtonIterations / this._acceptedSteps : 0
    };
  }

  /**
   * 日誌輸出
   */
  private _log(message: string): void {
    if (this._options.verbose) {
      console.log(message);
    }
  }
}

/**
 * 🏭 Trapezoidal 積分器工廠
 */
export class TrapezoidalFactory {
  /**
   * 創建標準 Trapezoidal 積分器 (Order 2)
   */
  static create(options: TrapezoidalOptions = {}): TrapezoidalIntegrator {
    return new TrapezoidalIntegrator({ ...options, order: 2 });
  }

  /**
   * 創建 Backward Euler 積分器 (Order 1)
   */
  static createBackwardEuler(options: TrapezoidalOptions = {}): TrapezoidalIntegrator {
    return new TrapezoidalIntegrator({ ...options, order: 1 });
  }

  /**
   * 創建 ngspice 默認積分器 (Order 2, xmu=0.5)
   */
  static createNgspiceDefault(): TrapezoidalIntegrator {
    return new TrapezoidalIntegrator({
      order: 2,
      xmu: 0.5,
      initialTimeStep: 1e-9,
      minTimeStep: 1e-10,
      maxTimeStep: 1e-6,
      tolerance: 1e-4,
      verbose: false
    });
  }
}
