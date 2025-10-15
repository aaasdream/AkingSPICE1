/**
 * 🧲 标准电感组件 - AkingSPICE 2.1
 *
 * 线性电感元件的时域实现
 * 支持电流型和电压型伴随模型
 */

import { AssemblyContext, ComponentInfo, ComponentInterface, ValidationResult } from '../../core/interfaces/component';

/**
 * ⚡ 线性电感组件
 *
 * 电感的基本关系: V = L * dI/dt
 *
 * 时域离散化 (Backward Euler):
 * V(t) = L * (I(t) - I(t-Δt)) / Δt
 *
 * 等效电路 (伴随模型):
 * R_eq = L / Δt  (等效电阻)
 * V_eq = L * I(t-Δt) / Δt  (等效电压源)
 */
export class Inductor implements ComponentInterface {
  readonly type = 'L';

  // 额外变量索引 (电流)
  private _extraVarIndices: number[] = [];

  /**
   * 🔢 Get current index (for backward compatibility)
   */
  private get _currentIndex(): number | undefined {
    return this._extraVarIndices[0];
  }

  constructor(
    public readonly name: string,
    public readonly nodes: readonly [string, string],
    private readonly _inductance: number
  ) {
    if (_inductance <= 0) {
      throw new Error(`电感值必须为正数: ${_inductance}`);
    }
    if (!isFinite(_inductance) || isNaN(_inductance)) {
      throw new Error(`电感值必须为有限数值: ${_inductance}`);
    }
    if (nodes.length !== 2) {
      throw new Error(`电感必须连接两个节点，实际: ${nodes.length}`);
    }
    if (nodes[0] === nodes[1]) {
      throw new Error(`电感不能连接到同一节点: ${nodes[0]}`);
    }
  }

  /**
   * 🎯 获取电感值
   */
  get inductance(): number {
    return this._inductance;
  }

  /**
   * ✅ 统一组装方法 (重构)
   *
   * 移除了 DC 和瞬态分析的独立逻辑。现在，统一的伴随模型
   * 在 DC 分析 (dt=0) 时，通过将 dt 视为一个极大值来自然处理，
   * 这使得 Req = L/dt 趋近于 0，将电感模拟为理想短路。
   */
  assemble(context: AssemblyContext): void {
    // 🔍 除錯: 檢查 context
    if (!(global as any)._inductorDebugCount2) (global as any)._inductorDebugCount2 = 0;
    if ((global as any)._inductorDebugCount2 < 3) {
      console.log(`[${this.name} assemble entry #${(global as any)._inductorDebugCount2}] R_coeff=${context.R_coeff}, dt=${context.dt}, prevSol=${!!context.previousSolutionVector}`);
      (global as any)._inductorDebugCount2++;
    }
    
    const { matrix, rhs, nodeMap, dt, previousSolutionVector, getExtraVariableIndex } = context;
    const n1 = nodeMap.get(this.nodes[0]);
    const n2 = nodeMap.get(this.nodes[1]);

    // 1. 获取电流支路索引
    if (this._currentIndex === undefined) {
      if (!getExtraVariableIndex) {
        throw new Error(`电感 ${this.name} 需要 getExtraVariableIndex 但未在 context 中提供`);
      }
      // 🔧 关键修复：使用正确的变量类型 'inductor_current' 而不是 'i'
      const index = getExtraVariableIndex(this.name, 'inductor_current');
      if (index === undefined) {
        throw new Error(`无法为电感 ${this.name} 获取电流支路索引`);
      }
      this.setExtraVariableIndices([index]);
    }
    const iL_idx = this._currentIndex!;

    // 2. 计算伴随模型参数
    let Req: number;
    let Veq: number;

    // 🚀 統一架構：瞬態分析必須提供積分器係數
    // 強制要求在瞬態分析時使用 R_coeff，確保所有元件使用相同的積分方法
    if (context.R_coeff && dt > 0 && previousSolutionVector) {
      // 瞬態分析且積分器提供了係數
      // 等效电阻 R_eq = L * R_coeff
      // R_coeff 由積分器計算：
      //   - Backward Euler: R_coeff = 1/dt
      //   - Generalized-α: R_coeff = γ/(β·dt)

      // 🔥 關鍵修正：實現 UIC (零初始條件)
      // 只有在 t > 0 時才使用上一步的電流。在 t=0 的第一步，假設 previousCurrent 為 0。
      let previousCurrent = 0;
      if (context.currentTime && context.currentTime > 1e-15) { // 使用一個小的閾值來判斷是否為第一步
        previousCurrent = previousSolutionVector.get(iL_idx);
      }
      // else: 在第一步 (t=0)，previousCurrent 保持為 0 (UIC)

      Req = this._inductance * context.R_coeff;

      // 等效电压源 V_eq (ngspice 公式)
      // 對於 Trapezoidal Order 1: Veq = -Req * i_prev
      // 對於 Trapezoidal Order 2: Veq 計算更複雜，但目前簡化為 -Req * i_prev
      // 注意：ngspice 的 ceq = ccap - CKTag[0] * qcap，產生負號
      Veq = -Req * previousCurrent;  // 🔧 修正：加上負號！
      
      // 🔍 除錯輸出 (前5次)
      if (!(global as any)._inductorDebugCount) (global as any)._inductorDebugCount = 0;
      if ((global as any)._inductorDebugCount < 5) {
        console.log(`[${this.name} assemble #${(global as any)._inductorDebugCount}] t=${context.currentTime?.toExponential(3)}, dt=${dt.toExponential(3)}, i_prev=${previousCurrent.toExponential(3)}A, Req=${Req.toExponential(3)}Ω, Veq=${Veq.toExponential(3)}V, R_coeff=${context.R_coeff?.toExponential(3)}`);
        (global as any)._inductorDebugCount++;
      }
    } else {
      // DC 分析或初始時間點：電感視為短路
      // 使用一个极小的电阻来保证数值稳定性，而不是理想的0电阻
      Req = 1e-9; // 1 nΩ
      Veq = 0;
    }

    // 3. 填充 MNA 矩阵
    // B 矩阵: 节点到支路的关联矩阵
    if (n1 !== undefined && n1 >= 0) {
      matrix.add(n1, iL_idx, 1);
    }
    if (n2 !== undefined && n2 >= 0) {
      matrix.add(n2, iL_idx, -1);
    }

    // C 矩阵: 支路到节点的关联矩阵 (B^T)
    if (n1 !== undefined && n1 >= 0) {
      matrix.add(iL_idx, n1, 1);
    }
    if (n2 !== undefined && n2 >= 0) {
      matrix.add(iL_idx, n2, -1);
    }

    // D 矩阵: 支路阻抗
    matrix.add(iL_idx, iL_idx, -Req);

    // J 向量: 等效电压源
    // 🧠 关键修复：Backward Euler 伴随模型
    // V = Req * I - Veq  =>  V1 - V2 - Req * I_L = -Veq
    // 因此 RHS 应该是 -Veq
    rhs.add(iL_idx, -Veq);
  }

  /**
   * ⚡️ 检查此组件是否可能产生事件
   *
   * 对于线性电感，它本身不产生事件。
   */
  hasEvents(): boolean {
    return false;
  }

  /**
   * ⚡ 计算通过电感的电流
   *
   * 对于电感，电流作为额外变量存储在扩展 MNA 矩阵中
   *
   * @param voltages - 系统的完整电压向量 (包括额外变量)
   * @param context - 组装上下文 (需要 getExtraVariableIndex)
   * @returns 电流值 (A)，正值表示从节点1流向节点2
   */
  computeCurrent(voltages: import('../../math/sparse/vector').Vector, context?: AssemblyContext): number {
    if (!context || !context.getExtraVariableIndex) {
      throw new Error('Inductor.computeCurrent requires AssemblyContext with getExtraVariableIndex');
    }

    // 获取电流支路索引
    if (this._currentIndex === undefined) {
      const index = context.getExtraVariableIndex(this.name, 'inductor_current');
      if (index === undefined) {
        throw new Error(`无法为电感 ${this.name} 获取电流支路索引`);
      }
      this.setExtraVariableIndices([index]);
    }

    // 从解向量中直接读取电流值
    return voltages.get(this._currentIndex!);
  }

  /**
   * 🔢 设置电流支路索引
   * @deprecated Use setExtraVariableIndices instead
   */
  setCurrentIndex(index: number): void {
    this.setExtraVariableIndices([index]);
  }

  /**
   * 🔢 统一设置额外变量索引
   */
  setExtraVariableIndices(indices: number[]): void {
    if (indices.length !== 1) {
      throw new Error(`Inductor ${this.name} requires exactly 1 extra variable index (current).`);
    }
    if (indices[0]! < 0) {
      throw new Error(`电感 ${this.name} 的电流索引必须为非负数: ${indices[0]}`);
    }
    this._extraVarIndices = indices;
  }

  /**
   * 🔢 获取额外变量数量
   */
  getExtraVariableCount(): number {
    return 1; // 电感需要1个额外变量 (电流)
  }

  /**
   * 🔍 检查电流索引是否已设置
   */
  hasCurrentIndexSet(): boolean {
    return this._currentIndex !== undefined;
  }

  /**
   * 🔍 组件验证
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查电感值
    if (this._inductance <= 0) {
      errors.push(`电感值必须为正数: ${this._inductance}`);
    }

    // 检查是否为极小电感
    if (this._inductance < 1e-12) {
      warnings.push(`电感值过小可能被视为短路: ${this._inductance}H`);
    }

    // 检查是否为极大电感
    if (this._inductance > 1e6) {
      warnings.push(`电感值过大可能导致数值问题: ${this._inductance}H`);
    }

    // 检查节点连接
    if (this.nodes.length !== 2) {
      errors.push(`电感必须连接两个节点，实际: ${this.nodes.length}`);
    }

    if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
      errors.push(`电感不能连接到同一节点: ${this.nodes[0]}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 📊 获取组件信息
   */
  getInfo(): ComponentInfo {
    return {
      type: this.type,
      name: this.name,
      nodes: [...this.nodes],
      parameters: {
        inductance: this._inductance,
        currentIndex: this._currentIndex,
      },
      units: {
        inductance: 'H',
        currentIndex: '#',
      }
    };
  }

  /**
   * ⚡ 计算瞬时电压
   *
   * V = L * dI/dt ≈ L * (I - I_prev) / Δt
   * NOTE: This method is for post-simulation analysis and is not used by the solver.
   * It requires external provision of previous current and dt.
   */
  calculateVoltage(currentCurrent: number, previousCurrent: number, dt: number): number {
    if (dt <= 0) return 0;
    return this._inductance * (currentCurrent - previousCurrent) / dt;
  }

  /**
   * 🧲 计算储存能量
   *
   * E = 0.5 * L * I²
   */
  calculateEnergy(current: number): number {
    return 0.5 * this._inductance * current * current;
  }


  /**
   * 🔍 调试信息
   */
  toString(): string {
    return `${this.name}: L=${this._inductance}H between ${this.nodes[0]} and ${this.nodes[1]}`;
  }
}

/**
 * 🏭 电感工厂函数
 */
export namespace InductorFactory {
  /**
   * 创建标准电感
   */
  export function create(name: string, nodes: [string, string], inductance: number): Inductor {
    return new Inductor(name, nodes, inductance);
  }

  /**
   * 创建标准系列电感 (E12系列)
   */
  export function createStandardValue(
    name: string,
    nodes: [string, string],
    baseValue: number,
    multiplier: number = 1
  ): Inductor {
    const standardValues = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

    const closest = standardValues.reduce((prev, curr) =>
      Math.abs(curr - baseValue) < Math.abs(prev - baseValue) ? curr : prev
    );

    return new Inductor(name, nodes, closest * multiplier);
  }

  /**
   * 创建功率电感 (常用于开关电源)
   */
  export function createPowerInductor(
    name: string,
    nodes: [string, string],
    inductance: number,
    _saturationCurrent: number
  ): Inductor {
    const inductor = new Inductor(name, nodes, inductance);
    // 可以扩展饱和电流特性
    return inductor;
  }

  /**
   * 创建空心电感 (低损耗，用于高频)
   */
  export function createAirCore(
    name: string,
    nodes: [string, string],
    inductance: number
  ): Inductor {
    return new Inductor(name, nodes, inductance);
  }
}

/**
 * 🧪 电感测试工具
 */
export namespace InductorTest {
  /**
   * 验证电感基本关系
   */
  export function verifyInductanceRelation(
    inductance: number,
    currentChange: number,
    timeStep: number
  ): number {
    return inductance * currentChange / timeStep;
  }

  /**
   * 验证能量计算
   */
  export function verifyEnergyCalculation(inductance: number, current: number): number {
    return 0.5 * inductance * current * current;
  }

  /**
   * RL 时间常数计算
   */
  export function calculateTimeConstant(resistance: number, inductance: number): number {
    return inductance / resistance;
  }

  /**
   * 谐振频率计算 (LC 电路)
   */
  export function calculateResonantFrequency(inductance: number, capacitance: number): number {
    return 1 / (2 * Math.PI * Math.sqrt(inductance * capacitance));
  }
}
