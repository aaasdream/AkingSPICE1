/**
 * 🎯 Backward Euler 積分器 - 簡單可靠的一階隱式積分器
 * 
 * 用於取代複雜的 Generalized-α，專注於正確性而非高階精度
 * 
 * 特點：
 * - 無條件穩定 (A-stable)
 * - 一階精度 O(dt)
 * - 實現簡單，易於除錯
 * - 適合含開關元件的硬非線性電路
 * 
 * 公式：
 *   x_{n+1} = x_n + dt * f(t_{n+1}, x_{n+1})  (隱式)
 * 
 * 對於電容：I = C * dV/dt
 *   I ≈ C * (V_{n+1} - V_n) / dt
 *   → 等效導納 G = C / dt
 *   → 等效電流源 I_eq = C * V_n / dt
 * 
 * 對於電感：V = L * dI/dt  
 *   V ≈ L * (I_{n+1} - I_n) / dt
 *   → 等效電阻 R = L / dt
 *   → 等效電壓源 V_eq = L * I_n / dt
 */

import type { Time, VoltageVector, IVector } from '../../types';

/**
 * Backward Euler 積分器選項
 */
export interface BackwardEulerOptions {
  /** 初始時間步長 */
  initialTimeStep?: Time;
  
  /** 最小時間步長 */
  minTimeStep?: Time;
  
  /** 最大時間步長 */
  maxTimeStep?: Time;
  
  /** 局部截斷誤差容差 */
  tolerance?: number;
  
  /** 自適應步長控制策略 */
  stepControl?: 'fixed' | 'adaptive';
  
  /** 步長增長因子 (adaptive 模式) */
  growthFactor?: number;
  
  /** 步長縮減因子 (adaptive 模式) */
  shrinkFactor?: number;
  
  /** 詳細日誌 */
  verbose?: boolean;
}

/**
 * Backward Euler 積分器狀態
 */
export interface BackwardEulerState {
  /** 當前時間 */
  time: Time;
  
  /** 當前解向量 */
  solution: VoltageVector;
  
  /** 當前時間步長 */
  dt: Time;
  
  /** 統計信息 */
  stats: {
    acceptedSteps: number;
    rejectedSteps: number;
    newtonIterations: number;
  };
}

/**
 * 積分步結果
 */
export interface StepResult {
  /** 新解向量 */
  solution: VoltageVector;
  
  /** 下一步建議時間步長 */
  nextDt: Time;
  
  /** 局部截斷誤差估計 */
  error: number;
  
  /** 是否收斂 */
  converged: boolean;
}

/**
 * 系統接口 (簡化版)
 */
export interface ISystem {
  /** 組裝系統方程 F(x) = 0 */
  assemble(solution: IVector, time: Time): void;
  
  /** 獲取系統矩陣 (Jacobian) */
  systemMatrix: any;
  
  /** 獲取右端向量 */
  getRHS(): IVector;
  
  /** 設置積分器係數 */
  setIntegrationCoefficients(G_coeff: number, I_coeff: number, R_coeff: number, V_coeff: number): void;
}

/**
 * 🎯 Backward Euler 積分器實現
 */
export class BackwardEulerIntegrator {
  private _options: Required<BackwardEulerOptions>;
  private _currentState: BackwardEulerState;
  
  // 統計
  private _acceptedSteps = 0;
  private _rejectedSteps = 0;
  private _totalNewtonIterations = 0;

  constructor(options: BackwardEulerOptions = {}) {
    // 設置默認選項
    this._options = {
      initialTimeStep: options.initialTimeStep ?? 1e-9,
      minTimeStep: options.minTimeStep ?? 1e-12,
      maxTimeStep: options.maxTimeStep ?? 1e-6,
      tolerance: options.tolerance ?? 1e-4,
      stepControl: options.stepControl ?? 'adaptive',
      growthFactor: options.growthFactor ?? 1.5,
      shrinkFactor: options.shrinkFactor ?? 0.5,
      verbose: options.verbose ?? false
    };

    // 初始化狀態 (稍後設置)
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
  }

  /**
   * 🚀 執行一個時間步
   */
  async step(
    system: ISystem,
    t: Time,
    dt: Time,
    solution: VoltageVector
  ): Promise<StepResult> {
    const startTime = performance.now();

    this._log(`\n[BE] === 開始時間步 t=${t.toExponential(3)}s, dt=${dt.toExponential(3)}s ===`);

    // 1. 設置積分器係數
    // Backward Euler: G_coeff = 1/dt, R_coeff = 1/dt
    const G_coeff = 1.0 / dt;
    const R_coeff = 1.0 / dt;
    const I_coeff = 0;  // 歷史項通過 previousSolutionVector 處理
    const V_coeff = 0;

    system.setIntegrationCoefficients(G_coeff, I_coeff, R_coeff, V_coeff);
    
    this._log(`[BE] 積分器係數: G=${G_coeff.toExponential(3)}, R=${R_coeff.toExponential(3)}`);

    // 2. Newton-Raphson 迭代求解隱式方程
    let x = solution;  // 初始猜測: 使用上一步的解
    const maxIterations = 50;
    const newtonTol = 1e-7;
    let converged = false;
    let iterations = 0;

    for (iterations = 0; iterations < maxIterations; iterations++) {
      // 組裝系統方程
      system.assemble(x, t + dt);

      // 獲取 Jacobian 和 RHS
      const J = system.systemMatrix;
      const b = system.getRHS();

      // 計算殘量 F = b - J*x (實際上組裝後 J*x - b = 0，所以 F = b)
      // 但這裡 RHS 已經是殘量了
      const residual = b;
      const residualNorm = (residual as IVector).norm();

      this._log(`[BE]   Newton #${iterations}: ||F||=${residualNorm.toExponential(3)}`);

      // 檢查收斂
      if (residualNorm < newtonTol) {
        converged = true;
        this._log(`[BE]   ✅ Newton 收斂: ${iterations} 次迭代`);
        break;
      }

      // 求解線性系統 J * delta = F
      let delta: IVector;
      try {
        delta = (J as any).solve(residual);
      } catch (error) {
        this._log(`[BE]   ❌ 線性求解失敗: ${error}`);
        break;
      }

      // 更新解
      x = (x as IVector).plus(delta) as VoltageVector;

      // 強制接地節點為 0 (如果系統提供了接地索引)
      if ((system as any).getGroundNodeIndex) {
        const groundIndex = (system as any).getGroundNodeIndex();
        if (groundIndex !== undefined) {
          (x as IVector).set(groundIndex, 0.0);
        }
      }
    }

    const solveTime = performance.now() - startTime;

    if (!converged) {
      this._log(`[BE]   ❌ Newton 未收斂 (${iterations} 次迭代)`);
      this._rejectedSteps++;
      
      // 縮小步長重試
      const newDt = dt * this._options.shrinkFactor;
      return {
        solution: solution,  // 返回原始解
        nextDt: Math.max(newDt, this._options.minTimeStep),
        error: Infinity,
        converged: false
      };
    }

    // 3. 估計局部截斷誤差 (簡化: 使用解的變化量)
    const dx = (x as IVector).minus(solution as IVector);
    const lte = dx.norm() / Math.max((x as IVector).norm(), 1e-10);

    this._log(`[BE]   LTE 估計: ${lte.toExponential(3)} (容差: ${this._options.tolerance.toExponential(3)})`);

    // 4. 決定是否接受步長
    const acceptStep = lte <= this._options.tolerance * 1.5;  // 允許 50% 超調

    // 5. 自適應步長調整
    let nextDt = dt;
    if (this._options.stepControl === 'adaptive') {
      if (acceptStep) {
        // LTE 在容差內，可以嘗試增大步長
        if (lte < this._options.tolerance * 0.1) {
          // LTE 遠小於容差，激進增長
          nextDt = dt * this._options.growthFactor * 1.5;
        } else if (lte < this._options.tolerance * 0.5) {
          // LTE 適中，正常增長
          nextDt = dt * this._options.growthFactor;
        }
        // else: LTE 接近容差，保持當前步長
      } else {
        // LTE 超過容差，縮小步長
        nextDt = dt * this._options.shrinkFactor;
      }

      // 限制步長範圍
      nextDt = Math.max(this._options.minTimeStep, Math.min(nextDt, this._options.maxTimeStep));
    }

    if (acceptStep) {
      this._acceptedSteps++;
      this._totalNewtonIterations += iterations;
      this._log(`[BE]   ✅ 步長接受: ${iterations} Newton 迭代, ${solveTime.toFixed(2)}ms`);
      this._log(`[BE]   下一步長: ${nextDt.toExponential(3)}s`);

      // 更新狀態
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
        error: lte,
        converged: true
      };
    } else {
      this._rejectedSteps++;
      this._log(`[BE]   ❌ 步長拒絕 (LTE 過大)，新 dt=${nextDt.toExponential(3)}s`);

      return {
        solution: solution,  // 返回原始解
        nextDt: nextDt,
        error: lte,
        converged: false
      };
    }
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

    this._log(`[BE] 積分器已重置: t=${time}, dt=${this._options.initialTimeStep.toExponential(3)}s`);
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

    this._log(`[BE] 積分器已重新啟動: t=${config.time}, dt=${dt.toExponential(3)}s`);
  }

  /**
   * 插值 (Backward Euler 使用一階線性插值)
   */
  interpolate(time: Time): VoltageVector {
    // 簡單的線性插值
    // 如果沒有歷史狀態，返回當前解
    return this._currentState.solution;
  }

  /**
   * 獲取當前狀態
   */
  getCurrentState(): BackwardEulerState {
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
 * 🏭 Backward Euler 積分器工廠
 */
export class BackwardEulerFactory {
  /**
   * 創建標準 Backward Euler 積分器
   */
  static create(options: BackwardEulerOptions = {}): BackwardEulerIntegrator {
    return new BackwardEulerIntegrator(options);
  }

  /**
   * 創建高精度積分器 (較小步長和容差)
   */
  static createHighPrecision(): BackwardEulerIntegrator {
    return new BackwardEulerIntegrator({
      initialTimeStep: 1e-10,
      minTimeStep: 1e-13,
      maxTimeStep: 1e-7,
      tolerance: 1e-6,
      stepControl: 'adaptive',
      growthFactor: 1.3,
      shrinkFactor: 0.5,
      verbose: false
    });
  }

  /**
   * 創建快速積分器 (較大步長和容差，適合初步測試)
   */
  static createFast(): BackwardEulerIntegrator {
    return new BackwardEulerIntegrator({
      initialTimeStep: 1e-8,
      minTimeStep: 1e-11,
      maxTimeStep: 1e-5,
      tolerance: 1e-3,
      stepControl: 'adaptive',
      growthFactor: 2.0,
      shrinkFactor: 0.5,
      verbose: false
    });
  }
}
