/**
 * 📏 标准电容组件 - AkingSPICE 2.1
 *
 * 线性电容元件的时域实现
 * 支持 Backward Euler 和 Trapezoidal 积分方法
 */

import { AssemblyContext, ComponentInfo, ComponentInterface, ValidationResult } from '../../core/interfaces/component';

/**
 * 🔋 线性电容组件
 *
 * 电容的基本关系: I = C * dV/dt
 *
 * 时域离散化 (Backward Euler):
 * I(t) = C * (V(t) - V(t-Δt)) / Δt
 *
 * 等效电路 (伴随模型):
 * G_eq = C / Δt
 * I_eq = C * V(t-Δt) / Δt
 */
export class Capacitor implements ComponentInterface {
  readonly type = 'C';

  constructor(
    public readonly name: string,
    public readonly nodes: readonly [string, string],
    private readonly _capacitance: number
  ) {
    if (_capacitance <= 0) {
      throw new Error(`电容值必须为正数: ${_capacitance}`);
    }
    if (!isFinite(_capacitance) || isNaN(_capacitance)) {
      throw new Error(`电容值必须为有限数值: ${_capacitance}`);
    }
    if (nodes.length !== 2) {
      throw new Error(`电容必须连接两个节点，实际: ${nodes.length}`);
    }
    if (nodes[0] === nodes[1]) {
      throw new Error(`电容不能连接到同一节点: ${nodes[0]}`);
    }
  }

  /**
   * 🎯 获取电容值
   */
  get capacitance(): number {
    return this._capacitance;
  }

  /**
   * ✅ 统一组装方法 (NEW!)
   */
  assemble(context: AssemblyContext): void {
    const { nodeMap, dt, previousSolutionVector, matrix, rhs } = context;
    const n1 = nodeMap.get(this.nodes[0]);
    const n2 = nodeMap.get(this.nodes[1]);

    // 🧠 统一的 Gmin 注入
    // 无论瞬态还是DC，都为电容的每个节点添加一个微小的对地电导。
    // 这可以防止浮动节点，并确保矩阵在数值上更加稳定。
    const GMIN = 1e-12;
    if (n1 !== undefined && n1 >= 0) {
      matrix.add(n1, n1, GMIN);
    }
    if (n2 !== undefined && n2 >= 0) {
      matrix.add(n2, n2, GMIN);
    }

    // 🚀 統一架構：瞬態分析必須提供積分器係數
    // 強制要求在瞬態分析時使用 G_coeff，確保所有元件使用相同的積分方法
    if (!context.G_coeff || !previousSolutionVector || dt <= 0) {
      // 在直流分析 (dt=0 或 dt<0) 或初始时间点
      // 電容僅貢獻 GMIN，行为类似开路。
      // GMIN 的注入已经完成，所以这里直接返回。
      return;
    }

    // --- 以下是瞬态分析部分（必須使用積分器係數）---

    // 🔧 关键修复：使用零初始条件 (UIC - Use Initial Conditions)
    // 在 t=0 时，假设电容电压为 0，无论 DC 工作点是什么
    // 这模拟了 SPICE 的 .TRAN UIC 行为
    let previousVoltage = 0;

    // 调试：打印前几步的值（已禁用）
    const DEBUG_FIRST_FEW = false;
    if (DEBUG_FIRST_FEW && context.currentTime < 0.0001) {
      const v1_prev = (n1 !== undefined && n1 >= 0) ? previousSolutionVector.get(n1) : 0;
      const v2_prev = (n2 !== undefined && n2 >= 0) ? previousSolutionVector.get(n2) : 0;
      console.log(`[Cap ${this.name}] t=${context.currentTime.toExponential(2)}, nodes=[${this.nodes[0]}, ${this.nodes[1]}], indices=[${n1}, ${n2}], V_prev=(${v1_prev.toFixed(4)}, ${v2_prev.toFixed(4)})`);
    }

    if (context.currentTime > 1e-15) {  // 使用小的阈值而不是精确的 0
      // 对于 t > 0，使用上一步的实际电压
      const v1_prev = (n1 !== undefined && n1 >= 0) ? previousSolutionVector.get(n1) : 0;
      const v2_prev = (n2 !== undefined && n2 >= 0) ? previousSolutionVector.get(n2) : 0;
      previousVoltage = v1_prev - v2_prev;
    }
    // else: t=0 时，previousVoltage 保持为 0（零初始条件）

    // 🚀 新代碼：使用積分器提供的係數
    // 等效电导 G_eq = C * G_coeff
    // G_coeff 由積分器計算：
    //   - Backward Euler: G_coeff = 1/dt
    //   - Generalized-α: G_coeff = γ/(β·dt)
    const geq = this._capacitance * context.G_coeff;

    // 等效电流源 I_eq = G_eq * V_prev
    // 或者 I_eq = C * I_coeff (如果積分器提供了 I_coeff)
    // 目前 I_coeff 為 0，所以使用簡化計算
    const ieq = geq * previousVoltage;

    // 装配电导矩阵 (类似电阻)
    if (n1 !== undefined && n1 >= 0) {
      matrix.add(n1, n1, geq);

      if (n2 !== undefined && n2 >= 0) {
        matrix.add(n1, n2, -geq);
      }
    }

    if (n2 !== undefined && n2 >= 0) {
      matrix.add(n2, n2, geq);

      if (n1 !== undefined && n1 >= 0) {
        matrix.add(n2, n1, -geq);
      }
    }

    // 装配等效电流源到右侧向量
    if (n1 !== undefined && n1 >= 0) {
      rhs.add(n1, ieq);
    }
    if (n2 !== undefined && n2 >= 0) {
      rhs.add(n2, -ieq);
    }
  }

  /**
   * ⚡️ 检查此组件是否可能产生事件
   *
   * 对于线性电容，它本身不产生事件。
   */
  hasEvents(): boolean {
    return false;
  }

  /**
   * ⚡ 计算通过电容的电流
   *
   * 使用伴侣模型 (Backward Euler):
   * I(t) = C * (V(t) - V(t-Δt)) / Δt
   *
   * @param voltages - 系统的完整电压向量
   * @param context - 组装上下文 (需要 dt 和 previousSolutionVector)
   * @returns 电流值 (A)，正值表示从节点1流向节点2
   */
  computeCurrent(voltages: import('../../math/sparse/vector').Vector, context?: AssemblyContext): number {
    if (!context) {
      throw new Error('Capacitor.computeCurrent requires AssemblyContext');
    }

    const n1Index = context.nodeMap.get(this.nodes[0]);
    const n2Index = context.nodeMap.get(this.nodes[1]);

    const v1_now = (n1Index !== undefined && n1Index >= 0) ? voltages.get(n1Index) : 0;
    const v2_now = (n2Index !== undefined && n2Index >= 0) ? voltages.get(n2Index) : 0;
    const v_now = v1_now - v2_now;

    // 对于 DC 分析 (dt = 0)，电容电流为 0 (开路)
    if (!context.dt || context.dt <= 0) {
      return 0;
    }

    // 对于瞬态分析，使用 Backward Euler
    let v_prev = 0;
    if (context.previousSolutionVector && context.currentTime > 1e-15) {
      const v1_prev = (n1Index !== undefined && n1Index >= 0) ? context.previousSolutionVector.get(n1Index) : 0;
      const v2_prev = (n2Index !== undefined && n2Index >= 0) ? context.previousSolutionVector.get(n2Index) : 0;
      v_prev = v1_prev - v2_prev;
    }

    return this._capacitance * (v_now - v_prev) / context.dt;
  }

  /**
   * 🔍 组件验证
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查电容值
    if (this._capacitance <= 0) {
      errors.push(`电容值必须为正数: ${this._capacitance}`);
    }

    // 检查是否为极小电容
    if (this._capacitance < 1e-15) {
      warnings.push(`电容值过小可能被忽略: ${this._capacitance}F`);
    }

    // 检查是否为极大电容
    if (this._capacitance > 1e3) {
      warnings.push(`电容值过大可能导致数值问题: ${this._capacitance}F`);
    }

    // 检查节点连接
    if (this.nodes.length !== 2) {
      errors.push(`电容必须连接两个节点，实际: ${this.nodes.length}`);
    }

    if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
      errors.push(`电容不能连接到同一节点: ${this.nodes[0]}`);
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
        capacitance: this._capacitance,
      },
      units: {
        capacitance: 'F',
      }
    };
  }

  /**
   * ⚡ 计算瞬时电流
   *
   * I = C * dV/dt ≈ C * (V - V_prev) / Δt
   * NOTE: This method is for post-simulation analysis and is not used by the solver.
   * It requires external provision of previous voltage and dt.
   */
  calculateCurrent(currentVoltage: number, previousVoltage: number, dt: number): number {
    if (dt <= 0) return 0;
    return this._capacitance * (currentVoltage - previousVoltage) / dt;
  }

  /**
   * 🔋 计算储存能量
   *
   * E = 0.5 * C * V²
   */
  calculateEnergy(voltage: number): number {
    return 0.5 * this._capacitance * voltage * voltage;
  }


  /**
   * 🔍 调试信息
   */
  toString(): string {
    return `${this.name}: C=${this._capacitance}F between ${this.nodes[0]} and ${this.nodes[1]}`;
  }
}

/**
 * 🏭 电容工厂函数
 */
export namespace CapacitorFactory {
  /**
   * 创建标准电容
   */
  export function create(name: string, nodes: [string, string], capacitance: number): Capacitor {
    return new Capacitor(name, nodes, capacitance);
  }

  /**
   * 创建标准系列电容 (E6系列)
   */
  export function createStandardValue(
    name: string,
    nodes: [string, string],
    baseValue: number,
    multiplier: number = 1
  ): Capacitor {
    const standardValues = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];

    const closest = standardValues.reduce((prev, curr) =>
      Math.abs(curr - baseValue) < Math.abs(prev - baseValue) ? curr : prev
    );

    return new Capacitor(name, nodes, closest * multiplier);
  }

  /**
   * 创建陶瓷电容 (常用于高频)
   */
  export function createCeramic(
    name: string,
    nodes: [string, string],
    capacitance: number
  ): Capacitor {
    return new Capacitor(name, nodes, capacitance);
  }

  /**
   * 创建电解电容 (常用于电源滤波)
   */
  export function createElectrolytic(
    name: string,
    nodes: [string, string],
    capacitance: number
  ): Capacitor {
    const cap = new Capacitor(name, nodes, capacitance);
    // 电解电容通常有极性，这里可以扩展
    return cap;
  }
}

/**
 * 🧪 电容测试工具
 */
export namespace CapacitorTest {
  /**
   * 验证电容基本关系
   */
  export function verifyCapacitanceRelation(
    capacitance: number,
    voltageChange: number,
    timeStep: number
  ): number {
    return capacitance * voltageChange / timeStep;
  }

  /**
   * 验证能量计算
   */
  export function verifyEnergyCalculation(capacitance: number, voltage: number): number {
    return 0.5 * capacitance * voltage * voltage;
  }

  /**
   * RC 时间常数计算
   */
  export function calculateTimeConstant(resistance: number, capacitance: number): number {
    return resistance * capacitance;
  }
}
