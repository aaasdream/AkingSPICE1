/**
 * 🎛️ 额外变量索引管理器 - AkingSPICE 2.1
 * 
 * 管理扩展 MNA 矩阵中的额外变量索引分配
 * 确保电压源、电感、变压器等组件的电流变量正确分配
 */

/**
 * 🔢 额外变量类型
 */
export enum ExtraVariableType {
  VOLTAGE_SOURCE_CURRENT = 'voltage_source_current',
  INDUCTOR_CURRENT = 'inductor_current',
  TRANSFORMER_PRIMARY_CURRENT = 'transformer_primary_current',
  TRANSFORMER_SECONDARY_CURRENT = 'transformer_secondary_current',
  CCVS_CURRENT = 'ccvs_current',
  CCCS_CURRENT = 'cccs_current',
  VCCS_VOLTAGE = 'vccs_voltage',
}

/**
 * 📋 额外变量信息
 */
export interface ExtraVariableInfo {
  type: ExtraVariableType;
  componentName: string;
  description: string;
  index: number;
}

/**
 * 🎯 额外变量索引管理器
 */
export class ExtraVariableIndexManager {
  private _variables: Map<string, ExtraVariableInfo> = new Map();
  private _nextIndex: number = 0;
  private _baseNodeCount: number = 0;
  
  constructor(baseNodeCount: number) {
    this._baseNodeCount = baseNodeCount;
    this._nextIndex = baseNodeCount;
  }
  
  /**
   * 🆔 分配新的额外变量索引
   */
  allocateIndex(
    type: ExtraVariableType,
    componentName: string,
    description?: string
  ): number {
    const key = `${componentName}_${type}`;
    
    if (this._variables.has(key)) {
      throw new Error(`额外变量已存在: ${key}`);
    }
    
    const index = this._nextIndex++;
    const info: ExtraVariableInfo = {
      type,
      componentName,
      description: description || `${componentName} 的 ${type} 变量`,
      index
    };
    
    this._variables.set(key, info);
    return index;
  }
  
  /**
   * 🔍 获取组件的额外变量索引
   */
  getIndex(componentName: string, type: ExtraVariableType): number | undefined {
    const key = `${componentName}_${type}`;
    return this._variables.get(key)?.index;
  }
  
  /**
   * ✅ 检查索引是否已分配
   */
  hasIndex(componentName: string, type: ExtraVariableType): boolean {
    const key = `${componentName}_${type}`;
    return this._variables.has(key);
  }
  
  /**
   * 📊 获取总的矩阵大小
   */
  getTotalMatrixSize(): number {
    return this._nextIndex;
  }
  
  /**
   * 📈 获取额外变量数量
   */
  getExtraVariableCount(): number {
    return this._nextIndex - this._baseNodeCount;
  }
  
  /**
   * 📋 获取所有额外变量信息
   */
  getAllVariables(): ExtraVariableInfo[] {
    return Array.from(this._variables.values());
  }
  
  /**
   * 🔄 重置管理器
   */
  reset(baseNodeCount?: number): void {
    this._variables.clear();
    if (baseNodeCount !== undefined) {
      this._baseNodeCount = baseNodeCount;
    }
    this._nextIndex = this._baseNodeCount;
  }
}

/**
 * 🏭 额外变量管理器工厂
 */
export namespace ExtraVariableManagerFactory {
  
  /**
   * 为电路创建管理器
   */
  export function createForCircuit(nodeCount: number): ExtraVariableIndexManager {
    return new ExtraVariableIndexManager(nodeCount);
  }
}