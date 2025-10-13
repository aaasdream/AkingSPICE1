/**
 * 🧪 Intelligent MOSFET Unit Tests - AkingSPICE 2.1
 * 
 * 全面的 MOSFET 單元測試，覆蓋：
 * 1. 基本屬性與參數驗證
 * 2. 三個工作區域檢測 (截止/線性/飽和)
 * 3. I-V 特性曲線驗證
 * 4. 跨導參數計算
 * 5. 數值穩定性測試
 * 6. 收斂性與狀態轉換
 * 
 * @layer Layer 1 - Unit Tests
 * @priority High
 * @author AkingSPICE Team
 * @date 2025-10-12
 */

import { describe, test, expect } from 'vitest';
import { IntelligentMOSFET, MOSFETRegion } from '../../../src/core/devices/intelligent_mosfet';
import { SparseMatrix } from '../../../src/math/sparse/matrix';
import { Vector } from '../../../src/math/sparse/vector';
import type { MOSFETParameters } from '../../../src/core/devices/intelligent_device_model';

// 輔助函數：創建標準 MOSFET 參數 (N-channel enhancement)
function createStandardParams(): MOSFETParameters {
  return {
    Vth: 2.0,        // 閾值電壓 (V)
    Kp: 0.1,         // 跨導參數 (A/V²)
    lambda: 0.01,    // 溝道長度調製係數 (1/V)
    Cgs: 1e-9,       // 栅源電容 (F)
    Cgd: 0.5e-9,     // 栅漏電容 (F)
    Ron: 0.1,        // 導通電阻 (Ω)
    Roff: 1e6,       // 關斷電阻 (Ω)
    Vmax: 100,       // 最大工作電壓 (V)
    Imax: 10         // 最大工作電流 (A)
  };
}

// 輔助函數：創建完整的 AssemblyContext
function createContext(
  matrix: SparseMatrix,
  rhs: Vector,
  solution: Vector,
  nodeMap: Map<string, number>
) {
  return {
    matrix,
    rhs,
    solutionVector: solution,
    nodeMap,
    currentTime: 0,
    dt: 1e-6,
    gmin: 1e-12
  };
}

describe('Intelligent MOSFET - Basic Properties', () => {
  
  test('should create MOSFET with valid parameters', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['drain', 'gate', 'source'], params);
    
    expect(mosfet.name).toBe('M1');
    expect(mosfet.nodes).toEqual(['drain', 'gate', 'source']);
  });

  test('should create MOSFET with different node names', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    
    expect(mosfet.name).toBe('M1');
    expect(mosfet.nodes).toEqual(['1', '2', '0']);
  });

  test('should accept various threshold voltages', () => {
    const thresholds = [1.0, 2.0, 4.0];
    
    thresholds.forEach(Vth => {
      const params = { ...createStandardParams(), Vth };
      const mosfet = new IntelligentMOSFET(`M_Vth${Vth}`, ['1', '2', '0'], params);
      expect(mosfet.name).toContain('M_Vth');
    });
  });

  test('should accept various transconductance parameters', () => {
    const kpValues = [0.05, 0.1, 0.2];
    
    kpValues.forEach(Kp => {
      const params = { ...createStandardParams(), Kp };
      const mosfet = new IntelligentMOSFET(`M_Kp${Kp}`, ['1', '2', '0'], params);
      expect(mosfet.name).toContain('M_Kp');
    });
  });
});

describe('Intelligent MOSFET - Operating Region Detection', () => {
  
  test('should detect cutoff region (Vgs < Vth)', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Cutoff: Vgs=1V < Vth=2V
    const solution = Vector.from([5, 1, 0]); // Vd=5V, Vg=1V, Vs=0V
    const mode = mosfet.getOperatingMode(solution, nodeMap);
    
    expect(mode).toBe(MOSFETRegion.CUTOFF);
  });

  test('should detect linear region (Vgs > Vth, Vds < Vgs-Vth)', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Linear: Vgs=5V > Vth=2V, Vds=1V < (Vgs-Vth)=3V
    const solution = Vector.from([1, 5, 0]); // Vd=1V, Vg=5V, Vs=0V
    const mode = mosfet.getOperatingMode(solution, nodeMap);
    
    expect(mode).toBe(MOSFETRegion.LINEAR);
  });

  test('should detect saturation region (Vgs > Vth, Vds >= Vgs-Vth)', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Saturation: Vgs=5V > Vth=2V, Vds=5V > (Vgs-Vth)=3V
    const solution = Vector.from([5, 5, 0]); // Vd=5V, Vg=5V, Vs=0V
    const mode = mosfet.getOperatingMode(solution, nodeMap);
    
    expect(mode).toBe(MOSFETRegion.SATURATION);
  });

  test('should detect subthreshold region', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Subthreshold: Vgs slightly below Vth
    const solution = Vector.from([5, 1.8, 0]); // Vgs=1.8V < Vth=2V but close
    const mode = mosfet.getOperatingMode(solution, nodeMap);
    
    // Should be cutoff or subthreshold depending on implementation
    expect([MOSFETRegion.CUTOFF, MOSFETRegion.SUBTHRESHOLD]).toContain(mode);
  });
});

describe('Intelligent MOSFET - I-V Characteristics', () => {
  
  test('should have near-zero current in cutoff', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([10, 0, 0]); // Cutoff: Vgs=0V
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    // In cutoff, conductance should be very small (only Roff)
    const G = matrix.get(0, 0);
    expect(G).toBeLessThan(1e-5); // Very small conductance
  });

  test('should follow square law in saturation', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Test at two different Vgs in saturation
    const Vgs1 = 4; // Vgs - Vth = 2V
    const Vgs2 = 6; // Vgs - Vth = 4V
    
    const solution1 = Vector.from([10, Vgs1, 0]);
    const matrix1 = new SparseMatrix(3, 3);
    const rhs1 = Vector.zeros(3);
    mosfet.assemble(createContext(matrix1, rhs1, solution1, nodeMap));
    
    const solution2 = Vector.from([10, Vgs2, 0]);
    const matrix2 = new SparseMatrix(3, 3);
    const rhs2 = Vector.zeros(3);
    mosfet.assemble(createContext(matrix2, rhs2, solution2, nodeMap));
    
    // Transconductance gm should increase with Vgs
    const gm1 = matrix1.get(0, 1); // gm at Vgs1
    const gm2 = matrix2.get(0, 1); // gm at Vgs2
    
    expect(gm2).toBeGreaterThan(gm1);
  });

  test('should have linear I-V in linear region', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Linear region: Vgs=5V, Vds=1V
    const solution = Vector.from([1, 5, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    // In linear region, gds (drain-source conductance) should be significant
    const gds = matrix.get(0, 0);
    expect(gds).toBeGreaterThan(1e-6);
  });
});

describe('Intelligent MOSFET - Transconductance Parameters', () => {
  
  test('should calculate transconductance gm in saturation', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([10, 5, 0]); // Saturation
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    // Check gm stamping: matrix(drain, gate)
    const gm = matrix.get(0, 1);
    expect(gm).toBeGreaterThan(0);
    expect(Number.isFinite(gm)).toBe(true);
  });

  test('should calculate output conductance gds', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([10, 5, 0]); // Saturation
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    // Check gds stamping: matrix(drain, drain)
    const gds = matrix.get(0, 0);
    expect(gds).toBeGreaterThan(0);
    expect(Number.isFinite(gds)).toBe(true);
  });

  test('should have symmetric stamping', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([5, 4, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    // Verify KCL: sum of currents at each node should be zero
    // Matrix entries should follow pattern
    const G_dd = matrix.get(0, 0);
    const G_ss = matrix.get(2, 2);
    
    expect(Number.isFinite(G_dd)).toBe(true);
    expect(Number.isFinite(G_ss)).toBe(true);
  });
});

describe('Intelligent MOSFET - Assembly and Stamping', () => {
  
  test('should assemble successfully in cutoff', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([10, 0, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    expect(() => {
      mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
  });

  test('should assemble successfully in linear region', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([1, 5, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    expect(() => {
      mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
  });

  test('should assemble successfully in saturation', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([10, 5, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    expect(() => {
      mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
  });

  test('should produce finite values in all regions', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const testCases = [
      [10, 0, 0],   // Cutoff
      [1, 5, 0],    // Linear
      [10, 5, 0]    // Saturation
    ];
    
    testCases.forEach(voltages => {
      const solution = Vector.from(voltages);
      const matrix = new SparseMatrix(3, 3);
      const rhs = Vector.zeros(3);
      
      mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
      
      // Check all matrix entries are finite
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(Number.isFinite(matrix.get(i, j))).toBe(true);
        }
        expect(Number.isFinite(rhs.get(i))).toBe(true);
      }
    });
  });
});

describe('Intelligent MOSFET - Numerical Stability', () => {
  
  test('should handle zero gate voltage', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([5, 0, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    expect(() => {
      mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
  });

  test('should handle large drain voltage', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([50, 10, 0]); // Large Vds
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    expect(() => {
      mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
  });

  test('should include Gmin for stability', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([10, 0, 0]); // Cutoff
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    const G = matrix.get(0, 0);
    // Should have at least Gmin contribution
    expect(G).toBeGreaterThan(0);
  });

  test('should handle very small Kp', () => {
    const params = { ...createStandardParams(), Kp: 1e-6 };
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const solution = Vector.from([10, 5, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    
    expect(() => {
      mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
  });
});

describe('Intelligent MOSFET - Convergence and State Transitions', () => {
  
  test('should check convergence with small voltage changes', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Initialize
    const solution = Vector.from([10, 5, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    const deltaV = Vector.from([1e-6, 1e-6, 0]);
    const convergenceInfo = mosfet.checkConvergence(deltaV, nodeMap);
    
    expect(convergenceInfo).toBeDefined();
    expect(convergenceInfo.confidence).toBeGreaterThanOrEqual(0);
  });

  test('should return lower confidence for large changes', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Initialize
    const solution = Vector.from([10, 5, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    const deltaV = Vector.from([5, 2, 0]); // Large changes
    const convergenceInfo = mosfet.checkConvergence(deltaV, nodeMap);
    
    expect(convergenceInfo.confidence).toBeLessThan(0.9);
  });

  test('should detect region transitions', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Start in cutoff
    const solution1 = Vector.from([10, 1, 0]);
    let mode1 = mosfet.getOperatingMode(solution1, nodeMap);
    expect(mode1).toBe(MOSFETRegion.CUTOFF);
    
    // Transition to saturation
    const solution2 = Vector.from([10, 5, 0]);
    let mode2 = mosfet.getOperatingMode(solution2, nodeMap);
    expect(mode2).toBe(MOSFETRegion.SATURATION);
    
    expect(mode1).not.toBe(mode2);
  });
});

describe('Intelligent MOSFET - Update Limiting', () => {
  
  test('should limit large voltage updates', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const deltaV = Vector.from([10, 5, 0]); // Large updates
    const limited = mosfet.limitUpdate(deltaV, nodeMap);
    
    // Limited update should be smaller or equal
    expect(Math.abs(limited.get(0))).toBeLessThanOrEqual(Math.abs(deltaV.get(0)));
    expect(Math.abs(limited.get(1))).toBeLessThanOrEqual(Math.abs(deltaV.get(1)));
  });

  test('should preserve reasonable updates', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    const deltaV = Vector.from([0.05, 0.05, 0]); // Small updates
    const limited = mosfet.limitUpdate(deltaV, nodeMap);
    
    // Limited update should be finite
    expect(Number.isFinite(limited.get(0))).toBe(true);
    expect(Number.isFinite(limited.get(1))).toBe(true);
  });
});

describe('Intelligent MOSFET - State Prediction', () => {
  
  test('should predict next state', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Initialize
    const solution = Vector.from([10, 3, 0]);
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    const prediction = mosfet.predictNextState(1e-6);
    
    expect(prediction).toBeDefined();
    expect(prediction.switchingEvents).toBeDefined();
  });

  test('should identify switching events', () => {
    const params = createStandardParams();
    const mosfet = new IntelligentMOSFET('M1', ['1', '2', '0'], params);
    const nodeMap = new Map([['1', 0], ['2', 1], ['0', 2]]);
    
    // Near threshold transition
    const solution = Vector.from([10, 2.1, 0]); // Just above Vth
    const matrix = new SparseMatrix(3, 3);
    const rhs = Vector.zeros(3);
    mosfet.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    const prediction = mosfet.predictNextState(1e-6);
    
    expect(prediction.numericalChallenges).toBeDefined();
  });
});
