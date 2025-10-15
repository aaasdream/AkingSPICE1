/**
 * 🔗 理想变压器组件 - AkingSPICE 2.1
 *
 * 理想变压器的时域实现，适用于 MNA
 * Vp/Vs = n, n*Ip + Is = 0
 */

import { AssemblyContext, ComponentInfo, ComponentInterface, ValidationResult } from '../../core/interfaces/component';
import { ComponentValidation, MNAStampingHelpers } from '../../math/numerical/safety';

export class IdealTransformer implements ComponentInterface {
  readonly type = 'K'; // SPICE中常用 K 表示理想变压器

  // 🔥 樞軸擾動 (Pivot Perturbation) 常數
  // 用於解決擴展MNA中理想變壓器引起的零對角線問題
  private static readonly PIVOT_TOLERANCE = 1e-12;

  // 额外变量索引：初级电流和次级电流
  private _extraVarIndices: number[] = [];

  /**
   * 🔢 Get primary current index (for backward compatibility)
   */
  private get _primaryCurrentIndex(): number | undefined {
    return this._extraVarIndices[0];
  }

  /**
   * 🔢 Get secondary current index (for backward compatibility)
   */
  private get _secondaryCurrentIndex(): number | undefined {
    return this._extraVarIndices[1];
  }

  constructor(
    public readonly name: string,
    public readonly nodes: readonly [string, string, string, string], // [p1, p2, s1, s2]
    private readonly _turnsRatio: number // n = Np / Ns
  ) {
    // 使用数值安全工具验证参数
    ComponentValidation.validateRatio(_turnsRatio, name, 1e-6, 1e6);
    ComponentValidation.validateNodes(nodes, 4, name, false);
  }

  /**
   * 🎯 获取匝数比
   */
  get turnsRatio(): number {
    return this._turnsRatio;
  }

  /**
   * 🔢 设置电流支路索引
   * @deprecated Use setExtraVariableIndices instead
   */
  setCurrentIndices(primaryIndex: number, secondaryIndex: number): void {
    this.setExtraVariableIndices([primaryIndex, secondaryIndex]);
  }

  /**
   * 🔢 统一设置额外变量索引
   */
  setExtraVariableIndices(indices: number[]): void {
    if (indices.length !== 2) {
      throw new Error(`IdealTransformer ${this.name} requires exactly 2 extra variable indices (primary current, secondary current).`);
    }
    if (indices[0]! < 0 || indices[1]! < 0) {
      throw new Error(`变压器 ${this.name} 的电流索引必须为非负数: primary=${indices[0]}, secondary=${indices[1]}`);
    }
    if (indices[0] === indices[1]) {
      throw new Error(`变压器 ${this.name} 的初级和次级电流索引不能相同: ${indices[0]}`);
    }
    this._extraVarIndices = indices;
  }

  /**
   * 🔢 获取额外变量数量
   */
  getExtraVariableCount(): number {
    return 2; // 变压器需要2个额外变量 (初级电流 + 次级电流)
  }

  /**
   * 🔍 检查电流索引是否已设置
   */
  hasCurrentIndicesSet(): boolean {
    return this._primaryCurrentIndex !== undefined && this._secondaryCurrentIndex !== undefined;
  }

  /**
   * 👁️ 检查此组件是否会产生事件
   */
  hasEvents(): boolean {
    return false;
  }

  /**
   * ✅ 统一组装方法 (NEW!)
   */
  assemble(context: AssemblyContext): void {
    const np1 = context.nodeMap.get(this.nodes[0]);
    const np2 = context.nodeMap.get(this.nodes[1]);
    const ns1 = context.nodeMap.get(this.nodes[2]);
    const ns2 = context.nodeMap.get(this.nodes[3]);

    if (this._primaryCurrentIndex === undefined || this._secondaryCurrentIndex === undefined) {
      throw new Error(`变压器 ${this.name} 的电流支路索引未设置`);
    }

    const ip = this._primaryCurrentIndex;
    const is = this._secondaryCurrentIndex;
    const n = this._turnsRatio;

    // KCL 方程贡献
    if (np1 !== undefined) MNAStampingHelpers.safeMatrixAdd(context.matrix, np1, ip, 1, this.name);
    if (np2 !== undefined) MNAStampingHelpers.safeMatrixAdd(context.matrix, np2, ip, -1, this.name);
    if (ns1 !== undefined) MNAStampingHelpers.safeMatrixAdd(context.matrix, ns1, is, 1, this.name);
    if (ns2 !== undefined) MNAStampingHelpers.safeMatrixAdd(context.matrix, ns2, is, -1, this.name);

    // 支路方程 (Branch Equations)
    // 方程1: 电压关系 Vp - n*Vs = 0
    if (np1 !== undefined) MNAStampingHelpers.safeMatrixAdd(context.matrix, ip, np1, 1, this.name);
    if (np2 !== undefined) MNAStampingHelpers.safeMatrixAdd(context.matrix, ip, np2, -1, this.name);
    if (ns1 !== undefined) MNAStampingHelpers.safeMatrixAdd(context.matrix, ip, ns1, -n, this.name);
    if (ns2 !== undefined) MNAStampingHelpers.safeMatrixAdd(context.matrix, ip, ns2, n, this.name);

    // 🔥🔥 關鍵修復：為初級電流支路方程添加樞軸擾動 🔥🔥
    // 原方程: Vp - n*Vs = 0 (對 ip 的偏導數為 0，導致零對角線)
    // 修正後: Vp - n*Vs + (1e-12)*ip = 0 (對角線元素為 1e-12)
    MNAStampingHelpers.safeMatrixAdd(context.matrix, ip, ip, IdealTransformer.PIVOT_TOLERANCE, this.name);

    // 方程2: 电流关系 n*ip + is = 0
    MNAStampingHelpers.safeMatrixAdd(context.matrix, is, ip, n, this.name);
    MNAStampingHelpers.safeMatrixAdd(context.matrix, is, is, 1, this.name);
  }

  /**
   * ⚡ 计算通过变压器的电流
   *
   * 对于理想变压器，返回初级电流
   * @param voltages - 系统的完整电压向量
   * @param context - 组装上下文 (用于获取额外变量)
   * @returns 初级电流 (A)
   */
  computeCurrent(_voltages: import('../../math/sparse/vector').Vector, context?: AssemblyContext): number {
    if (!context || !context.solutionVector) {
      // 如果没有解向量，返回0
      return 0;
    }

    if (this._primaryCurrentIndex === undefined) {
      throw new Error(`Transformer ${this.name}: Primary current index not set`);
    }

    // 从解向量中获取初级电流
    return context.solutionVector.get(this._primaryCurrentIndex);
  }

  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 注意：基本匝数比验证已在构造函数中完成

    // 检查匝数比范围（仅警告，因为构造函数已验证基本有效性）
    if (this._turnsRatio < 1e-6) {
      warnings.push(`匝数比过小可能导致数值问题: ${this._turnsRatio}`);
    }

    if (this._turnsRatio > 1e6) {
      warnings.push(`匝数比过大可能导致数值问题: ${this._turnsRatio}`);
    }

    // 检查节点连接
    if (this.nodes.length !== 4) {
      errors.push(`理想变压器必须连接四个节点，实际: ${this.nodes.length}`);
    }

    // 检查节点是否重复
    const uniqueNodes = new Set(this.nodes);
    if (uniqueNodes.size !== 4) {
      errors.push(`变压器节点不能重复: [${this.nodes.join(', ')}]`);
    }

    // 检查初级和次级绕组是否短路
    if (this.nodes[0] === this.nodes[1]) {
      errors.push(`初级绕组不能短路: ${this.nodes[0]}`);
    }
    if (this.nodes[2] === this.nodes[3]) {
      errors.push(`次级绕组不能短路: ${this.nodes[2]}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  getInfo(): ComponentInfo {
    return {
      type: this.type,
      name: this.name,
      nodes: [...this.nodes],
      parameters: {
        turnsRatio: this._turnsRatio,
        primaryCurrentIndex: this._primaryCurrentIndex,
        secondaryCurrentIndex: this._secondaryCurrentIndex,
      },
      units: {
        turnsRatio: '',
        primaryCurrentIndex: '#',
        secondaryCurrentIndex: '#'
      }
    };
  }

  /**
   * 🔍 调试信息
   */
  toString(): string {
    return `${this.name}: n=${this._turnsRatio} between (${this.nodes[0]},${this.nodes[1]}) and (${this.nodes[2]},${this.nodes[3]})`;
  }

  /**
   * ⚡ 计算次级电压
   *
   * 根据初级电压和匝数比计算次级电压
   * Vs = Vp / n
   */
  calculateSecondaryVoltage(primaryVoltage: number): number {
    return primaryVoltage / this._turnsRatio;
  }

  /**
   * ⚡ 计算初级电流
   *
   * 根据次级电流和匝数比计算初级电流
   * Ip = -Is / n
   */
  calculatePrimaryCurrent(secondaryCurrent: number): number {
    return -secondaryCurrent / this._turnsRatio;
  }

  /**
   * 🔋 功率守恒验证
   *
   * 理想变压器满足功率守恒: Pp = Ps
   * Pp = Vp * Ip, Ps = Vs * Is
   */
  verifyPowerConservation(
    primaryVoltage: number,
    primaryCurrent: number,
    secondaryVoltage: number,
    secondaryCurrent: number,
    toleranceRatio: number = 1e-12  // 使用更严格的容差以匹配SPICE精度
  ): {
    primaryPower: number;
    secondaryPower: number;
    powerDifference: number;
    isConserved: boolean;
    tolerance: number;
  } {
    const primaryPower = primaryVoltage * primaryCurrent;
    const secondaryPower = secondaryVoltage * secondaryCurrent;
    const powerDifference = Math.abs(primaryPower - secondaryPower);

    // 使用相对和绝对容差的组合
    const maxPower = Math.max(Math.abs(primaryPower), Math.abs(secondaryPower));
    const relativeTolerance = toleranceRatio * maxPower;
    const absoluteTolerance = 1e-15; // 极小功率时的绝对容差
    const tolerance = Math.max(relativeTolerance, absoluteTolerance);

    return {
      primaryPower,
      secondaryPower,
      powerDifference,
      isConserved: powerDifference <= tolerance || maxPower < absoluteTolerance,
      tolerance
    };
  }

  /**
   * 🎛️ 获取等效阻抗
   *
   * 从初级看到次级的等效阻抗变换
   * Z_eq = n² * Z_s
   */
  transformImpedance(secondaryImpedance: number): number {
    return this._turnsRatio * this._turnsRatio * secondaryImpedance;
  }
}

/**
 * 🏭 变压器工厂函数
 */
export namespace TransformerFactory {
  /**
   * 创建理想变压器
   */
  export function create(
    name: string,
    primaryNodes: [string, string],
    secondaryNodes: [string, string],
    turnsRatio: number
  ): IdealTransformer {
    const nodes: [string, string, string, string] = [
      primaryNodes[0], primaryNodes[1],
      secondaryNodes[0], secondaryNodes[1]
    ];
    return new IdealTransformer(name, nodes, turnsRatio);
  }

  /**
   * 创建标准电力变压器
   */
  export function createPowerTransformer(
    name: string,
    primaryNodes: [string, string],
    secondaryNodes: [string, string],
    primaryVoltage: number,
    secondaryVoltage: number
  ): IdealTransformer {
    const turnsRatio = primaryVoltage / secondaryVoltage;
    return create(name, primaryNodes, secondaryNodes, turnsRatio);
  }

  /**
   * 创建升压变压器
   */
  export function createStepUpTransformer(
    name: string,
    primaryNodes: [string, string],
    secondaryNodes: [string, string],
    stepUpRatio: number
  ): IdealTransformer {
    return create(name, primaryNodes, secondaryNodes, stepUpRatio);
  }

  /**
   * 创建降压变压器
   */
  export function createStepDownTransformer(
    name: string,
    primaryNodes: [string, string],
    secondaryNodes: [string, string],
    stepDownRatio: number
  ): IdealTransformer {
    const turnsRatio = 1 / stepDownRatio;
    return create(name, primaryNodes, secondaryNodes, turnsRatio);
  }

  /**
   * 创建隔离变压器 (1:1)
   */
  export function createIsolationTransformer(
    name: string,
    primaryNodes: [string, string],
    secondaryNodes: [string, string]
  ): IdealTransformer {
    return create(name, primaryNodes, secondaryNodes, 1.0);
  }
}

/**
 * 🧪 变压器测试工具
 */
export namespace TransformerTest {
  /**
   * 验证电压变换关系
   */
  export function verifyVoltageTransformation(
    turnsRatio: number,
    primaryVoltage: number,
    expectedSecondaryVoltage: number,
    tolerance: number = 1e-9
  ): boolean {
    const calculatedSecondaryVoltage = primaryVoltage / turnsRatio;
    return Math.abs(calculatedSecondaryVoltage - expectedSecondaryVoltage) <= tolerance;
  }

  /**
   * 验证电流变换关系
   */
  export function verifyCurrentTransformation(
    turnsRatio: number,
    secondaryCurrent: number,
    expectedPrimaryCurrent: number,
    tolerance: number = 1e-9
  ): boolean {
    const calculatedPrimaryCurrent = -secondaryCurrent / turnsRatio;
    return Math.abs(calculatedPrimaryCurrent - expectedPrimaryCurrent) <= tolerance;
  }

  /**
   * 验证阻抗变换关系
   */
  export function verifyImpedanceTransformation(
    turnsRatio: number,
    secondaryImpedance: number,
    expectedPrimaryImpedance: number,
    tolerance: number = 1e-9
  ): boolean {
    const calculatedPrimaryImpedance = turnsRatio * turnsRatio * secondaryImpedance;
    return Math.abs(calculatedPrimaryImpedance - expectedPrimaryImpedance) <= tolerance;
  }

  /**
   * 创建测试电路
   */
  export function createTestCircuit(
    transformerName: string,
    turnsRatio: number
  ): {
    transformer: IdealTransformer;
    primaryNodes: [string, string];
    secondaryNodes: [string, string];
  } {
    const primaryNodes: [string, string] = ['n1', 'n2'];
    const secondaryNodes: [string, string] = ['n3', 'n4'];
    const transformer = TransformerFactory.create(
      transformerName,
      primaryNodes,
      secondaryNodes,
      turnsRatio
    );

    return {
      transformer,
      primaryNodes,
      secondaryNodes
    };
  }
}
