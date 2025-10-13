/**
 * 🔢 数值稳定性工具 - AkingSPICE 2.1
 * 
 * 提供数值计算中的稳定性检查和安全处理函数
 */

/**
 * 🔍 数值有效性检查
 */
export namespace NumericalSafety {
  
  /**
   * 检查数值是否有效（非 NaN 且有限）
   */
  export function isValidNumber(value: number): boolean {
    return isFinite(value) && !isNaN(value);
  }
  
  /**
   * 安全的数值设置，如果无效则使用默认值
   */
  export function safeNumber(value: number, defaultValue: number = 0.0, componentName?: string): number {
    if (isValidNumber(value)) {
      return value;
    }
    
    if (componentName) {
      console.warn(`组件 ${componentName} 检测到无效数值: ${value}，使用默认值: ${defaultValue}`);
    }
    
    return defaultValue;
  }
  
  /**
   * 安全的时间步长检查
   */
  export function safeTimeStep(dt: number, minDt: number = 1e-15, maxDt: number = 1.0): number {
    if (!isValidNumber(dt)) {
      throw new Error(`时间步长无效: ${dt}`);
    }
    
    if (dt <= 0) {
      throw new Error(`时间步长必须为正数: ${dt}`);
    }
    
    if (dt < minDt) {
      console.warn(`时间步长过小，可能导致数值精度问题: ${dt}，建议最小值: ${minDt}`);
    }
    
    if (dt > maxDt) {
      console.warn(`时间步长过大，可能导致数值不稳定: ${dt}，建议最大值: ${maxDt}`);
    }
    
    return dt;
  }
  
  /**
   * 安全的除法运算，避免除零
   */
  export function safeDivide(numerator: number, denominator: number, epsilon: number = 1e-15): number {
    if (Math.abs(denominator) < epsilon) {
      if (Math.abs(numerator) < epsilon) {
        return 0.0; // 0/0 -> 0
      } else {
        return numerator > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      }
    }
    return numerator / denominator;
  }
  
  /**
   * 限制数值在合理范围内
   */
  export function clampValue(value: number, min: number = -1e12, max: number = 1e12): number {
    if (!isValidNumber(value)) {
      return 0.0;
    }
    return Math.max(min, Math.min(max, value));
  }
  
  /**
   * 检查矩阵索引有效性
   */
  export function validateMatrixIndex(index: number | undefined, maxIndex: number, componentName: string): number {
    if (index === undefined) {
      throw new Error(`组件 ${componentName} 的矩阵索引未设置`);
    }
    
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`组件 ${componentName} 的矩阵索引无效: ${index}`);
    }
    
    if (index >= maxIndex) {
      throw new Error(`组件 ${componentName} 的矩阵索引超出范围: ${index} >= ${maxIndex}`);
    }
    
    return index;
  }
  
  /**
   * 相对容差检查
   */
  export function isNearlyEqual(a: number, b: number, relativeTolerance: number = 1e-9, absoluteTolerance: number = 1e-15): boolean {
    if (!isValidNumber(a) || !isValidNumber(b)) {
      return false;
    }
    
    const diff = Math.abs(a - b);
    const maxValue = Math.max(Math.abs(a), Math.abs(b));
    
    return diff <= absoluteTolerance || diff <= relativeTolerance * maxValue;
  }
  
  /**
   * 安全的指数计算，避免溢出
   */
  export function safeExp(x: number, maxExp: number = 700): number {
    if (!isValidNumber(x)) {
      return 1.0;
    }
    
    if (x > maxExp) {
      return Number.POSITIVE_INFINITY;
    }
    
    if (x < -maxExp) {
      return 0.0;
    }
    
    return Math.exp(x);
  }
  
  /**
   * 安全的对数计算
   */
  export function safeLog(x: number, epsilon: number = 1e-15): number {
    if (!isValidNumber(x) || x <= 0) {
      if (x <= 0) {
        return Math.log(epsilon);
      }
      return Number.NaN;
    }
    
    return Math.log(Math.max(x, epsilon));
  }
}

/**
 * 🎯 组件参数验证工具
 */
export namespace ComponentValidation {
  
  /**
   * 验证被动组件参数（电阻、电感、电容）
   */
  export function validatePassiveValue(
    value: number, 
    componentType: string, 
    componentName: string,
    minValue: number = 1e-15,
    maxValue: number = 1e12
  ): void {
    if (!NumericalSafety.isValidNumber(value)) {
      throw new Error(`${componentType} ${componentName} 的值必须为有效数值: ${value}`);
    }
    
    if (value <= 0) {
      throw new Error(`${componentType} ${componentName} 的值必须为正数: ${value}`);
    }
    
    if (value < minValue) {
      console.warn(`${componentType} ${componentName} 的值过小，可能导致数值问题: ${value}`);
    }
    
    if (value > maxValue) {
      console.warn(`${componentType} ${componentName} 的值过大，可能导致数值问题: ${value}`);
    }
  }
  
  /**
   * 验证节点连接
   */
  export function validateNodes(
    nodes: readonly string[], 
    expectedCount: number, 
    componentName: string,
    allowSameNode: boolean = false
  ): void {
    if (nodes.length !== expectedCount) {
      throw new Error(`组件 ${componentName} 必须连接 ${expectedCount} 个节点，实际: ${nodes.length}`);
    }
    
    if (!allowSameNode) {
      const uniqueNodes = new Set(nodes);
      if (uniqueNodes.size !== nodes.length) {
        throw new Error(`组件 ${componentName} 的节点不能重复: [${nodes.join(', ')}]`);
      }
    }
    
    // 检查节点名称有效性
    for (const node of nodes) {
      if (typeof node !== 'string' || node.trim().length === 0) {
        throw new Error(`组件 ${componentName} 的节点名称无效: "${node}"`);
      }
    }
  }
  
  /**
   * 验证比例参数（如变压器匝数比）
   */
  export function validateRatio(
    ratio: number, 
    componentName: string,
    minRatio: number = 1e-6,
    maxRatio: number = 1e6
  ): void {
    if (!NumericalSafety.isValidNumber(ratio)) {
      throw new Error(`组件 ${componentName} 的比例参数必须为有效数值: ${ratio}`);
    }
    
    if (ratio <= 0) {
      throw new Error(`组件 ${componentName} 的比例参数必须为正数: ${ratio}`);
    }
    
    if (ratio < minRatio) {
      console.warn(`组件 ${componentName} 的比例参数过小，可能导致数值问题: ${ratio}`);
    }
    
    if (ratio > maxRatio) {
      console.warn(`组件 ${componentName} 的比例参数过大，可能导致数值问题: ${ratio}`);
    }
  }
}

/**
 * 🔧 MNA 矩阵装配辅助工具
 */
export namespace MNAStampingHelpers {
  
  /**
   * 安全的矩阵元素添加
   */
  export function safeMatrixAdd(
    matrix: any, // SparseMatrix
    row: number | undefined, 
    col: number | undefined, 
    value: number,
    componentName: string
  ): void {
    if (row === undefined || row < 0) {
      console.warn(`组件 ${componentName} 的行索引无效: ${row}`);
      return;
    }
    
    if (col === undefined || col < 0) {
      console.warn(`组件 ${componentName} 的列索引无效: ${col}`);
      return;
    }
    
    if (!NumericalSafety.isValidNumber(value)) {
      console.warn(`组件 ${componentName} 尝试添加无效矩阵元素 [${row},${col}]: ${value}`);
      return;
    }
    
    // 检查值是否过大
    if (Math.abs(value) > 1e12) {
      console.warn(`组件 ${componentName} 的矩阵元素值过大 [${row},${col}]: ${value}`);
    }
    
    matrix.add(row, col, value);
  }
  
  /**
   * 安全的向量元素添加
   */
  export function safeVectorAdd(
    vector: any, // Vector
    index: number | undefined, 
    value: number,
    componentName: string
  ): void {
    if (index === undefined || index < 0) {
      console.warn(`组件 ${componentName} 的向量索引无效: ${index}`);
      return;
    }
    
    if (!NumericalSafety.isValidNumber(value)) {
      console.warn(`组件 ${componentName} 尝试添加无效向量元素 [${index}]: ${value}`);
      return;
    }
    
    vector.add(index, value);
  }
}

/**
 * 🚨 数值问题诊断工具
 */
export namespace NumericalDiagnostics {
  
  /**
   * 诊断矩阵的数值特性
   */
  export function diagnoseMatrix(matrix: any, componentName?: string): {
    hasNaN: boolean;
    hasInfinite: boolean;
    largeElements: Array<{row: number, col: number, value: number}>;
    conditionEstimate?: number;
  } {
    const diagnosis = {
      hasNaN: false,
      hasInfinite: false,
      largeElements: [] as Array<{row: number, col: number, value: number}>
    };
    
    // 检查矩阵是否存在且具有访问方法
    if (!matrix || typeof matrix !== 'object') {
      if (componentName) {
        console.warn(`诊断组件 ${componentName} 时矩阵为空或无效`);
      }
      return diagnosis;
    }
    
    // 如果矩阵有遍历方法（假设稀疏矩阵实现了 forEach 或类似方法）
    if (typeof matrix.forEach === 'function') {
      matrix.forEach((value: number, row: number, col: number) => {
        if (isNaN(value)) {
          diagnosis.hasNaN = true;
        }
        if (!isFinite(value)) {
          diagnosis.hasInfinite = true;
        }
        if (Math.abs(value) > 1e12) {
          diagnosis.largeElements.push({ row, col, value });
        }
      });
    } else if (typeof matrix.getSize === 'function' && typeof matrix.get === 'function') {
      // 如果矩阵提供大小和访问方法
      const size = matrix.getSize();
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const value = matrix.get(i, j);
          if (value !== 0) { // 只检查非零元素
            if (isNaN(value)) {
              diagnosis.hasNaN = true;
            }
            if (!isFinite(value)) {
              diagnosis.hasInfinite = true;
            }
            if (Math.abs(value) > 1e12) {
              diagnosis.largeElements.push({ row: i, col: j, value });
            }
          }
        }
      }
    } else {
      // 如果没有标准访问方法，记录警告
      if (componentName) {
        console.warn(`组件 ${componentName} 的矩阵类型不支持诊断：缺少访问方法`);
      }
    }
    
    // 记录诊断结果
    if (componentName) {
      if (diagnosis.hasNaN) {
        console.error(`矩阵诊断 [${componentName}]: 检测到 NaN 值`);
      }
      if (diagnosis.hasInfinite) {
        console.error(`矩阵诊断 [${componentName}]: 检测到无穷大值`);
      }
      if (diagnosis.largeElements.length > 0) {
        console.warn(`矩阵诊断 [${componentName}]: 检测到 ${diagnosis.largeElements.length} 个大数值元素 (>1e12)`);
      }
    }
    
    return diagnosis;
  }
  
  /**
   * 记录数值警告
   */
  export function logNumericalWarning(
    componentName: string, 
    operation: string, 
    details: string
  ): void {
    console.warn(`🔢 数值警告 [${componentName}:${operation}]: ${details}`);
  }
  
  /**
   * 记录数值错误
   */
  export function logNumericalError(
    componentName: string, 
    operation: string, 
    details: string
  ): void {
    console.error(`❌ 数值错误 [${componentName}:${operation}]: ${details}`);
  }
}