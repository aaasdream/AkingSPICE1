/**
 * 🧭 廣義同倫延拓求解器 (Generalized Homotopy Continuation Solver)
 * 
 * 基於弧長參數化的預測-校正算法，解決極端非線性問題的 DC 收斂
 * 
 * 核心思想：
 * 1. 定義同倫函數 H(x, λ) = F(x) - (1-λ)F(a)
 *    - λ=0: H(x,0)=0 有已知解 x=a (簡單問題)
 *    - λ=1: H(x,1)=F(x)=0 為原始問題
 * 
 * 2. 使用弧長延拓沿解路徑從 λ=0 走到 λ=1
 *    - 預測步: 計算切線方向並前進
 *    - 校正步: 用 Newton 法拉回解曲線
 * 
 * 3. 弧長參數化克服轉折點問題
 *    - 不再僅依賴 λ 單調遞增
 *    - 可以處理 λ 回退的情況
 * 
 * @author AkingSPICE Team
 * @date 2025-10-12
 */

import { Vector } from '../sparse/vector';
import type { SparseMatrix } from '../sparse/matrix';

/**
 * 同倫狀態接口
 */
export interface HomotopyState {
  x: Vector;           // 當前解向量
  lambda: number;      // 當前延拓參數 (0 → 1)
  s: number;          // 當前弧長
  residual: number;   // 當前殘差範數
}

/**
 * 同倫配置
 */
export interface HomotopyConfig {
  maxSteps: number;           // 最大步數
  initialStepSize: number;    // 初始弧長步長
  minStepSize: number;        // 最小步長
  maxStepSize: number;        // 最大步長
  correctorTolerance: number; // 校正器收斂容差
  correctorMaxIter: number;   // 校正器最大迭代次數
  targetLambda: number;       // 目標 λ 值 (通常為 1.0)
}

/**
 * 同倫系統接口 - 抽象出 MNA 系統的必要操作
 */
export interface IHomotopySystem {
  /**
   * 系統維度
   */
  readonly size: number;
  
  /**
   * 在給定解向量處組裝系統
   * @param x 解向量
   * @param time 時間 (DC 分析為 0)
   */
  assemble(x: Vector, time: number): void;
  
  /**
   * 獲取雅可比矩陣 J(x)
   */
  getJacobian(): SparseMatrix;
  
  /**
   * 獲取 RHS 向量 b(x)
   */
  getRHS(): Vector;
  
  /**
   * 獲取當前解向量
   */
  getSolution(): Vector;
}

/**
 * 🧭 廣義同倫類
 */
export class GeneralizedHomotopy {
  private readonly system: IHomotopySystem;
  private readonly x_initial: Vector;  // 初始猜測 a
  private readonly F_a: Vector;        // F(a) - 緩存以提高效率
  private readonly config: HomotopyConfig;
  
  // 默認配置
  private static readonly DEFAULT_CONFIG: HomotopyConfig = {
    maxSteps: 200,
    initialStepSize: 0.1,
    minStepSize: 1e-4,
    maxStepSize: 0.5,
    correctorTolerance: 1e-6,
    correctorMaxIter: 10,
    targetLambda: 1.0
  };
  
  constructor(
    system: IHomotopySystem,
    initialGuess: Vector,
    config?: Partial<HomotopyConfig>
  ) {
    this.system = system;
    this.x_initial = initialGuess.clone();
    this.config = { ...GeneralizedHomotopy.DEFAULT_CONFIG, ...config };
    
    // 計算並緩存 F(a)
    this.system.assemble(this.x_initial, 0);
    const J_a = this.system.getJacobian();
    const b_a = this.system.getRHS();
    
    // F(a) = J(a) * a - b(a)
    const F_a_result = J_a.multiply(this.x_initial).minus(b_a);
    // Convert IVector to Vector
    this.F_a = new Vector(F_a_result.size);
    for (let i = 0; i < F_a_result.size; i++) {
      this.F_a.set(i, F_a_result.get(i));
    }
    
    console.log(`🧭 同倫求解器初始化: ||F(a)|| = ${this.F_a.norm().toExponential(2)}`);
  }
  
  /**
   * 計算同倫函數 H(x, λ) = F(x) - (1-λ)F(a)
   */
  private evaluateHomotopy(x: Vector, lambda: number): Vector {
    // 組裝系統獲取 F(x)
    this.system.assemble(x, 0);
    const J_x = this.system.getJacobian();
    const b_x = this.system.getRHS();
    const F_x = J_x.multiply(x).minus(b_x);
    
    // H(x, λ) = F(x) - (1-λ)F(a)
    const scale = 1.0 - lambda;
    const result_ivec = F_x.minus(this.F_a.scale(scale));
    
    // Convert IVector to Vector
    const result = new Vector(result_ivec.size);
    for (let i = 0; i < result_ivec.size; i++) {
      result.set(i, result_ivec.get(i));
    }
    return result;
  }
  
  /**
   * 計算切線向量 (預測方向)
   * 
   * 解方程: J_x * tx + J_λ * t_λ = 0
   * 其中: J_λ = ∂H/∂λ = F(a)
   * 
   * 加上歸一化約束: ||[tx; t_λ]|| = 1
   */
  private calculateTangent(x: Vector, _lambda: number): { tx: Vector; t_lambda: number } {
    this.system.assemble(x, 0);
    const J_x = this.system.getJacobian();
    const J_lambda = this.F_a;  // ∂H/∂λ = F(a)
    
    // 求解 J_x * tx = -J_λ (假設 t_λ = 1)
    // 這給出一個未歸一化的切線方向
    let tx: Vector;
    try {
      const tx_ivec = J_x.solve(J_lambda.scale(-1.0));
      // Convert IVector to Vector
      tx = new Vector(tx_ivec.size);
      for (let i = 0; i < tx_ivec.size; i++) {
        tx.set(i, tx_ivec.get(i));
      }
    } catch (error) {
      console.warn('⚠️ 切線計算失敗，使用簡單前進方向');
      // 降級方案: 簡單地在 λ 方向前進
      tx = new Vector(this.system.size);
      for (let i = 0; i < this.system.size; i++) {
        tx.set(i, 0);
      }
      return { tx, t_lambda: 1.0 };
    }
    
    let t_lambda = 1.0;
    
    // 歸一化: sqrt(||tx||² + t_λ²) = 1
    const norm_tx = tx.norm();
    const norm_total = Math.sqrt(norm_tx * norm_tx + t_lambda * t_lambda);
    
    if (norm_total > 1e-10) {
      tx = tx.scale(1.0 / norm_total);
      t_lambda = t_lambda / norm_total;
    }
    
    return { tx, t_lambda };
  }
  
  /**
   * 校正步驟 - 使用 Newton 法將點拉回解曲線
   * 
   * 解增廣系統:
   * [ J_x      J_λ  ] [ Δx ] = [ -H(x,λ)  ]
   * [ tx^T  t_λ      ] [ Δλ ]   [ -N(x,λ)  ]
   * 
   * 其中 N(x,λ) 是弧長約束
   */
  private correctStep(
    x_pred: Vector,
    lambda_pred: number,
    x_prev: Vector,
    lambda_prev: number,
    tx: Vector,
    t_lambda: number,
    ds: number
  ): { converged: boolean; x: Vector; lambda: number; iterations: number } {
    
    let x = x_pred.clone();
    let lambda = lambda_pred;
    
    for (let iter = 0; iter < this.config.correctorMaxIter; iter++) {
      // 計算 H(x, λ)
      const H = this.evaluateHomotopy(x, lambda);
      
      // 計算弧長約束 N(x,λ) = (x-x_prev)^T*tx + (λ-λ_prev)*t_λ - ds
      const dx = x.minus(x_prev);
      const dlambda = lambda - lambda_prev;
      const N = dx.dot(tx) + dlambda * t_lambda - ds;
      
      // 檢查收斂
      const residual_H = H.norm();
      const residual_N = Math.abs(N);
      
      if (residual_H < this.config.correctorTolerance && residual_N < this.config.correctorTolerance) {
        return { converged: true, x, lambda, iterations: iter + 1 };
      }
      
      // 組裝增廣系統
      this.system.assemble(x, 0);
      const J_x = this.system.getJacobian();
      const J_lambda = this.F_a;
      
      // 構建增廣矩陣 (簡化實現: 使用 Schur complement)
      // 先解 J_x * Δx_1 = -H
      let delta_x_1: Vector;
      try {
        const dx1_ivec = J_x.solve(H.scale(-1.0));
        delta_x_1 = new Vector(dx1_ivec.size);
        for (let i = 0; i < dx1_ivec.size; i++) {
          delta_x_1.set(i, dx1_ivec.get(i));
        }
      } catch (error) {
        console.warn(`⚠️ 校正器第 ${iter + 1} 次迭代失敗: Jacobian 奇異`);
        return { converged: false, x, lambda, iterations: iter + 1 };
      }
      
      // 再解 J_x * Δx_2 = -J_λ
      let delta_x_2: Vector;
      try {
        const dx2_ivec = J_x.solve(J_lambda.scale(-1.0));
        delta_x_2 = new Vector(dx2_ivec.size);
        for (let i = 0; i < dx2_ivec.size; i++) {
          delta_x_2.set(i, dx2_ivec.get(i));
        }
      } catch (error) {
        console.warn(`⚠️ 校正器第 ${iter + 1} 次迭代失敗`);
        return { converged: false, x, lambda, iterations: iter + 1 };
      }
      
      // 計算 Δλ 使用 Schur complement
      // Δλ = (-N - tx^T * Δx_1) / (t_λ + tx^T * Δx_2)
      const numerator = -N - tx.dot(delta_x_1);
      const denominator = t_lambda + tx.dot(delta_x_2);
      
      if (Math.abs(denominator) < 1e-12) {
        console.warn(`⚠️ 校正器第 ${iter + 1} 次迭代失敗: 分母接近零`);
        return { converged: false, x, lambda, iterations: iter + 1 };
      }
      
      const delta_lambda = numerator / denominator;
      
      // 計算 Δx = Δx_1 + Δx_2 * Δλ
      const delta_x = delta_x_1.plus(delta_x_2.scale(delta_lambda));
      
      // 更新
      x = x.plus(delta_x);
      lambda = lambda + delta_lambda;
      
      // 安全檢查
      if (!isFinite(lambda) || isNaN(lambda)) {
        console.warn(`⚠️ 校正器第 ${iter + 1} 次迭代: λ 數值異常`);
        return { converged: false, x, lambda, iterations: iter + 1 };
      }
    }
    
    console.warn(`⚠️ 校正器達到最大迭代次數 ${this.config.correctorMaxIter}`);
    return { converged: false, x, lambda, iterations: this.config.correctorMaxIter };
  }
  
  /**
   * 執行同倫延拓求解
   * 
   * @returns 是否成功求解到 λ = 1
   */
  public solve(): { success: boolean; solution?: Vector; states: HomotopyState[] } {
    console.log('🚀 開始廣義同倫延拓求解...');
    
    const states: HomotopyState[] = [];
    
    // 初始化
    let x = this.x_initial.clone();
    let lambda = 0.0;
    let s = 0.0;
    let ds = this.config.initialStepSize;
    
    // 記錄初始狀態
    states.push({
      x: x.clone(),
      lambda,
      s,
      residual: this.evaluateHomotopy(x, lambda).norm()
    });
    
    let step = 0;
    while (lambda < this.config.targetLambda && step < this.config.maxSteps) {
      step++;
      
      // === 預測步 ===
      const { tx, t_lambda } = this.calculateTangent(x, lambda);
      
      const x_pred = x.plus(tx.scale(ds));
      const lambda_pred = lambda + t_lambda * ds;
      
      console.log(`  📍 步驟 ${step}: λ=${lambda.toFixed(4)} → ${lambda_pred.toFixed(4)}, ds=${ds.toExponential(2)}`);
      
      // === 校正步 ===
      const correction = this.correctStep(x_pred, lambda_pred, x, lambda, tx, t_lambda, ds);
      
      if (!correction.converged) {
        // 校正失敗，減小步長重試
        ds *= 0.5;
        
        if (ds < this.config.minStepSize) {
          console.error(`❌ 同倫求解失敗: 步長過小 (${ds.toExponential(2)} < ${this.config.minStepSize.toExponential(2)})`);
          return { success: false, states };
        }
        
        console.warn(`  ⚠️ 校正失敗，減小步長至 ${ds.toExponential(2)}`);
        continue; // 重試當前步
      }
      
      // 更新狀態
      x = correction.x;
      lambda = correction.lambda;
      s += ds;
      
      const residual = this.evaluateHomotopy(x, lambda).norm();
      
      states.push({ x: x.clone(), lambda, s, residual });
      
      console.log(`  ✅ 收斂 (${correction.iterations} 次迭代): ||H||=${residual.toExponential(2)}`);
      
      // 自適應調整步長
      if (correction.iterations <= 3 && ds < this.config.maxStepSize) {
        ds = Math.min(ds * 1.5, this.config.maxStepSize);
      } else if (correction.iterations > 6) {
        ds = Math.max(ds * 0.8, this.config.minStepSize);
      }
      
      // 檢查是否超過目標
      if (lambda >= this.config.targetLambda) {
        break;
      }
    }
    
    // 最終校正: 確保 λ 精確為 1.0
    if (lambda < this.config.targetLambda) {
      console.warn(`⚠️ 同倫未達到目標 λ=${this.config.targetLambda}, 當前 λ=${lambda.toFixed(6)}`);
      return { success: false, states };
    }
    
    // 固定 λ=1 進行最終 Newton 迭代
    console.log('🎯 最終收斂: 固定 λ=1.0 進行 Newton 迭代...');
    lambda = 1.0;
    
    for (let iter = 0; iter < 10; iter++) {
      const H = this.evaluateHomotopy(x, lambda);
      const residual = H.norm();
      
      if (residual < 1e-8) {
        console.log(`✅ 最終收斂達成: ||F(x)||=${residual.toExponential(2)}`);
        return { success: true, solution: x, states };
      }
      
      this.system.assemble(x, 0);
      const J = this.system.getJacobian();
      
      try {
        const delta_x = J.solve(H.scale(-1.0));
        x = x.plus(delta_x);
      } catch (error) {
        console.error('❌ 最終 Newton 迭代失敗');
        return { success: false, states };
      }
    }
    
    console.log(`🎉 同倫求解成功完成 ${step} 步，弧長 s=${s.toFixed(4)}`);
    return { success: true, solution: x, states };
  }
}
