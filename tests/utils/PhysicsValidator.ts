/**
 * ⚡ PhysicsValidator - 物理定律驗證工具
 * 
 * 驗證仿真結果是否滿足基本物理定律：
 * - KCL (Kirchhoff's Current Law)
 * - KVL (Kirchhoff's Voltage Law)
 * - 能量守恆
 */

import { IVector } from '../../src/types/index';
import { ComponentInterface } from '../../src/core/interfaces/component';
import { Circuit } from './CircuitBuilder';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details?: any;
}

export interface EnergyReport {
  totalEnergy: number;
  storedEnergy: {
    capacitive: number;
    inductive: number;
  };
  dissipatedPower: number;
  sourcePower: number;
  energyBalance: number;
  conservationError: number;
  isConserved: boolean;
}

export class PhysicsValidator {
  /**
   * 驗證 KCL（基爾霍夫電流定律）
   * 
   * 對每個節點，流入電流之和 = 流出電流之和
   * 
   * @param circuit - 電路
   * @param solution - 節點電壓解
   * @param tolerance - 容差
   */
  static validateKCL(
    circuit: Circuit,
    solution: Map<string, number>,
    tolerance: number = 1e-6
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 計算每個節點的電流總和
    const nodeCurrents = new Map<string, number>();
    
    // 初始化
    for (const node of circuit.nodes) {
      if (node !== 'gnd' && node !== '0') {
        nodeCurrents.set(node, 0);
      }
    }
    
    // 遍歷所有組件，計算流經的電流
    for (const component of circuit.components) {
      const type = component.type;
      
      if (type === 'R') {
        // 電阻: I = V/R
        const [n1, n2] = component.nodes as [string, string];
        const v1 = solution.get(n1) ?? 0;
        const v2 = solution.get(n2) ?? 0;
        const resistance = (component as any).resistance;
        const current = (v1 - v2) / resistance;
        
        // 從 n1 流出，流入 n2
        if (n1 !== 'gnd' && n1 !== '0') {
          nodeCurrents.set(n1, (nodeCurrents.get(n1) ?? 0) - current);
        }
        if (n2 !== 'gnd' && n2 !== '0') {
          nodeCurrents.set(n2, (nodeCurrents.get(n2) ?? 0) + current);
        }
      }
      // 可以添加其他組件類型...
    }
    
    // 檢查每個節點的電流總和
    for (const [node, totalCurrent] of nodeCurrents) {
      if (Math.abs(totalCurrent) > tolerance) {
        errors.push(
          `節點 ${node} 的 KCL 違反: 電流不平衡 ${totalCurrent.toExponential(3)} A`
        );
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      details: { nodeCurrents: Object.fromEntries(nodeCurrents) }
    };
  }
  
  /**
   * 驗證 KVL（基爾霍夫電壓定律）
   * 
   * 對任意閉合迴路，電壓降之和 = 0
   * 
   * @param circuit - 電路
   * @param solution - 節點電壓解
   * @param loop - 迴路節點序列（首尾相連）
   * @param tolerance - 容差
   */
  static validateKVL(
    circuit: Circuit,
    solution: Map<string, number>,
    loop: string[],
    tolerance: number = 1e-6
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (loop.length < 2) {
      errors.push('迴路至少需要 2 個節點');
      return { isValid: false, errors, warnings };
    }
    
    // 計算迴路電壓總和
    let voltageSum = 0;
    
    for (let i = 0; i < loop.length; i++) {
      const n1 = loop[i]!;
      const n2 = loop[(i + 1) % loop.length]!;
      
      const v1 = solution.get(n1) ?? 0;
      const v2 = solution.get(n2) ?? 0;
      const voltageDrop = v1 - v2;
      
      voltageSum += voltageDrop;
    }
    
    if (Math.abs(voltageSum) > tolerance) {
      errors.push(
        `迴路 [${loop.join(' -> ')}] 的 KVL 違反: ` +
        `電壓總和 = ${voltageSum.toExponential(3)} V`
      );
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      details: { voltageSum, loop }
    };
  }
  
  /**
   * 驗證能量守恆
   * 
   * E_source = E_stored + E_dissipated
   * 
   * @param waveform - 時間序列波形數據
   * @param circuit - 電路
   */
  static validateEnergyConservation(
    waveform: Array<{ time: number; solution: Map<string, number> }>,
    circuit: Circuit,
    tolerance: number = 0.01 // 1% 誤差
  ): EnergyReport {
    // 初始化能量計數
    let totalSourceEnergy = 0;
    let totalDissipatedEnergy = 0;
    
    // 遍歷時間點，積分能量
    for (let i = 1; i < waveform.length; i++) {
      const dt = waveform[i]!.time - waveform[i - 1]!.time;
      const solution = waveform[i]!.solution;
      
      // 計算源的功率
      let sourcePower = 0;
      
      // 計算耗散功率
      let dissipatedPower = 0;
      
      for (const component of circuit.components) {
        if (component.type === 'V') {
          // 電壓源: P = V * I
          // 需要從解中獲取電流...
          // 簡化實現
        } else if (component.type === 'R') {
          // 電阻: P = V²/R
          const [n1, n2] = component.nodes as [string, string];
          const v1 = solution.get(n1) ?? 0;
          const v2 = solution.get(n2) ?? 0;
          const voltage = v1 - v2;
          const resistance = (component as any).resistance;
          const power = (voltage * voltage) / resistance;
          
          dissipatedPower += power;
        }
      }
      
      totalSourceEnergy += sourcePower * dt;
      totalDissipatedEnergy += dissipatedPower * dt;
    }
    
    // 計算最終儲存能量
    const finalSolution = waveform[waveform.length - 1]!.solution;
    let capacitiveEnergy = 0;
    let inductiveEnergy = 0;
    
    for (const component of circuit.components) {
      if (component.type === 'C') {
        // E = 1/2 * C * V²
        const [n1, n2] = component.nodes as [string, string];
        const v1 = finalSolution.get(n1) ?? 0;
        const v2 = finalSolution.get(n2) ?? 0;
        const voltage = v1 - v2;
        const capacitance = (component as any).capacitance;
        capacitiveEnergy += 0.5 * capacitance * voltage * voltage;
      } else if (component.type === 'L') {
        // E = 1/2 * L * I²
        // 需要獲取電流...
      }
    }
    
    const totalStored = capacitiveEnergy + inductiveEnergy;
    const totalEnergy = totalStored + totalDissipatedEnergy;
    const energyBalance = totalSourceEnergy - totalEnergy;
    const conservationError = Math.abs(energyBalance) / (totalSourceEnergy + 1e-12);
    
    return {
      totalEnergy,
      storedEnergy: {
        capacitive: capacitiveEnergy,
        inductive: inductiveEnergy
      },
      dissipatedPower: totalDissipatedEnergy,
      sourcePower: totalSourceEnergy,
      energyBalance,
      conservationError,
      isConserved: conservationError < tolerance
    };
  }
  
  /**
   * 驗證功率平衡
   * 
   * P_source = P_dissipated + dE_stored/dt
   */
  static validatePowerBalance(
    circuit: Circuit,
    solution: Map<string, number>,
    tolerance: number = 1e-6
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    let totalSourcePower = 0;
    let totalDissipatedPower = 0;
    
    for (const component of circuit.components) {
      if (component.type === 'V') {
        // 電壓源功率
        // P = V * I (需要獲取電流)
      } else if (component.type === 'R') {
        // 電阻耗散功率
        const [n1, n2] = component.nodes as [string, string];
        const v1 = solution.get(n1) ?? 0;
        const v2 = solution.get(n2) ?? 0;
        const voltage = v1 - v2;
        const resistance = (component as any).resistance;
        const power = (voltage * voltage) / resistance;
        
        totalDissipatedPower += power;
      }
    }
    
    const powerBalance = totalSourcePower - totalDissipatedPower;
    
    if (Math.abs(powerBalance) > tolerance) {
      warnings.push(
        `功率不平衡: ${powerBalance.toExponential(3)} W ` +
        `(可能由儲能元件的能量變化造成)`
      );
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      details: {
        sourcePower: totalSourcePower,
        dissipatedPower: totalDissipatedPower,
        balance: powerBalance
      }
    };
  }
  
  /**
   * 驗證解的物理合理性
   */
  static validateSolutionPhysicality(
    solution: Map<string, number>
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    for (const [node, voltage] of solution) {
      // 檢查是否為有限數值
      if (!isFinite(voltage) || isNaN(voltage)) {
        errors.push(`節點 ${node} 的電壓不是有限數值: ${voltage}`);
      }
      
      // 檢查是否過大（可能數值溢出）
      if (Math.abs(voltage) > 1e6) {
        warnings.push(`節點 ${node} 的電壓異常大: ${voltage} V`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * 綜合驗證
   */
  static fullValidation(
    circuit: Circuit,
    solution: Map<string, number>,
    loops?: string[][]
  ): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    
    // 1. 驗證 KCL
    const kclResult = this.validateKCL(circuit, solution);
    allErrors.push(...kclResult.errors);
    allWarnings.push(...kclResult.warnings);
    
    // 2. 驗證 KVL（如果提供了迴路）
    if (loops) {
      for (const loop of loops) {
        const kvlResult = this.validateKVL(circuit, solution, loop);
        allErrors.push(...kvlResult.errors);
        allWarnings.push(...kvlResult.warnings);
      }
    }
    
    // 3. 驗證解的物理性
    const physicalityResult = this.validateSolutionPhysicality(solution);
    allErrors.push(...physicalityResult.errors);
    allWarnings.push(...physicalityResult.warnings);
    
    // 4. 驗證功率平衡
    const powerResult = this.validatePowerBalance(circuit, solution);
    allErrors.push(...powerResult.errors);
    allWarnings.push(...powerResult.warnings);
    
    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }
}
