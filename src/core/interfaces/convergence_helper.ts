/**
 * 🔥 收敛辅助接口 (Convergence Helper Interface)
 * 
 * 这个接口定义了积分器在标准 Newton-Raphson 失败时，
 * 可以请求电路引擎提供的额外收敛支持方法。
 * 
 * 这是 MCAS (Multi-layered Convergence Assurance Strategy) 的核心桥梁，
 * 保持了积分器的通用性和引擎的控制权。
 * 
 * @author AkingSPICE Team - Phoenix Project
 * @date 2025-10-12
 */

import type { Vector } from '../../math/sparse/vector';
import type { Time } from '../../types';

/**
 * Newton 求解结果
 */
export interface NewtonResult {
  /** 求解的解向量 */
  solution: Vector;
  /** 速度向量（用于积分器状态更新） */
  velocity: Vector;
  /** 加速度向量（用于积分器状态更新） */
  acceleration: Vector;
  /** 是否收敛 */
  converged: boolean;
  /** 实际迭代次数 */
  iterations: number;
  /** 最终残差范数 */
  finalResidual: number;
}

/**
 * Gmin 增强牛顿法的配置
 */
export interface GminEnhancedConfig {
  /** 初始 Gmin 值（用于对角线增强） */
  initialGmin: number;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 收敛容差 */
  tolerance: number;
  /** 如果第一次尝试失败，是否递增 Gmin */
  allowGminIncrease: boolean;
}

/**
 * 收敛辅助器接口
 * 
 * 积分器通过这个接口向电路引擎请求额外的收敛帮助。
 * 引擎实现这些方法，提供特定于电路的收敛策略。
 */
export interface IConvergenceHelper {
  /**
   * 尝试使用 Gmin 增强的牛顿法求解
   * 
   * 在标准 Newton-Raphson 迭代中，动态地向雅可比矩阵的对角线
   * 添加一个小的电导值 (Gmin)，以增强对角占优性，提高数值稳定性。
   * 
   * 这个方法与完整的 Gmin Stepping 不同：
   * - Gmin Stepping: 从大 Gmin 开始，逐步减小到 0（适合 DC 初始化）
   * - Gmin Enhanced: 在单次求解中使用固定的小 Gmin（适合瞬态单步）
   * 
   * @param initialGuess 初始猜测解（通常是上一步的解或预测器的结果）
   * @param time 当前仿真时间
   * @param config Gmin 增强配置
   * @returns 求解结果，如果成功则 converged=true
   */
  tryGminEnhancedNewton(
    initialGuess: Vector,
    time: Time,
    config: GminEnhancedConfig
  ): Promise<NewtonResult>;

  /**
   * 尝试使用 Phoenix 伪瞬态求解器
   * 
   * 当所有标准方法都失败时的最终保障。将代数问题 G(x)=0 转化为
   * 微分问题 dx/dτ + G(x) = 0，通过伪时间步进找到稳态解。
   * 
   * @param initialGuess 初始猜测解
   * @param time 当前仿真时间
   * @param maxSteps Phoenix 最大伪时间步数
   * @returns 求解结果
   */
  tryPhoenixSolver(
    initialGuess: Vector,
    time: Time,
    maxSteps: number
  ): Promise<NewtonResult>;

  /**
   * 获取当前求解器状态（用于状态机）
   * 
   * @returns 'EASY' | 'NORMAL' | 'HARD'
   */
  getSolverState(): 'EASY' | 'NORMAL' | 'HARD';

  /**
   * 报告求解结果（用于状态机更新）
   * 
   * @param converged 是否收敛
   * @param method 使用的方法 ('NR' | 'GMIN' | 'PHOENIX')
   * @param iterations 迭代次数
   */
  reportConvergenceResult(
    converged: boolean,
    method: 'NR' | 'GMIN' | 'PHOENIX',
    iterations: number
  ): void;
}

/**
 * 默认的 Gmin 增强配置
 */
export const DEFAULT_GMIN_CONFIG: GminEnhancedConfig = {
  initialGmin: 1e-6,      // 足够小不影响精度，足够大能稳定矩阵
  maxIterations: 30,       // 中等迭代次数
  tolerance: 1e-10,        // 与标准 Newton 相同的精度要求
  allowGminIncrease: true  // 如果失败，可以尝试更大的 Gmin
};
