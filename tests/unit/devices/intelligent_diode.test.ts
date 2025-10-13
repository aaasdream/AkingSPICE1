/**
 * 🧪 Intelligent Diode Unit Tests - AkingSPICE 2.1
 * 
 * 簡化版測試，專注於核心功能驗證
 * 
 * 測試覆蓋：
 * 1. 基本屬性創建
 * 2. 工作狀態檢測
 * 3. 數值穩定性
 * 4. 參數變化處理
 * 
 * @layer Layer 1 - Unit Tests
 * @priority High
 * @author AkingSPICE Team
 * @date 2025-10-12
 */

import { describe, test, expect } from 'vitest';
import { IntelligentDiode, DiodeState } from '../../../src/core/devices/intelligent_diode';
import { SparseMatrix } from '../../../src/math/sparse/matrix';
import { Vector } from '../../../src/math/sparse/vector';
import type { DiodeParameters } from '../../../src/core/devices/intelligent_device_model';

// 輔助函數：創建標準二極體參數
function createStandardParams(): DiodeParameters {
  return {
    Is: 1e-14,    // Saturation current
    n: 1.0,       // Ideality factor
    Rs: 0,        // Series resistance
    Cj0: 1e-12,   // Zero-bias junction capacitance
    Vj: 0.7,      // Junction potential
    m: 0.5,       // Grading coefficient
    tt: 0         // Transit time
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

describe('Intelligent Diode - Basic Properties', () => {
  
  test('should create diode with valid parameters', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['anode', 'cathode'], params);
    
    expect(diode.name).toBe('D1');
    expect(diode.nodes).toEqual(['anode', 'cathode']);
  });

  test('should create diode with different node names', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    
    expect(diode.name).toBe('D1');
    expect(diode.nodes).toEqual(['1', '0']);
  });

  test('should accept various saturation currents', () => {
    const currents = [1e-18, 1e-14, 1e-10];
    
    currents.forEach(Is => {
      const params = { ...createStandardParams(), Is };
      const diode = new IntelligentDiode(`D_${Is}`, ['1', '0'], params);
      expect(diode.name).toContain('D_');
    });
  });

  test('should accept various ideality factors', () => {
    const factors = [1.0, 1.5, 2.0];
    
    factors.forEach(n => {
      const params = { ...createStandardParams(), n };
      const diode = new IntelligentDiode(`D_n${n}`, ['1', '0'], params);
      expect(diode.name).toContain('D_n');
    });
  });
});

describe('Intelligent Diode - Operating State Detection', () => {
  
  test('should detect forward bias state', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    // Forward bias: Va=0.7V, Vc=0V
    const solution = Vector.from([0.7, 0]);
    const mode = diode.getOperatingMode(solution, nodeMap);
    
    expect(mode).toBe(DiodeState.FORWARD_BIAS);
  });

  test('should detect reverse bias state', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    // Reverse bias: Va=0V, Vc=1V
    const solution = Vector.from([0, 1]);
    const mode = diode.getOperatingMode(solution, nodeMap);
    
    expect(mode).toBe(DiodeState.REVERSE_BIAS);
  });

  test('should detect transition state', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    // Small voltage: transition region
    const solution = Vector.from([0.01, 0]);
    const mode = diode.getOperatingMode(solution, nodeMap);
    
    expect(mode).toBe(DiodeState.TRANSITION);
  });

  test('should detect breakdown state', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    // Large reverse voltage: breakdown
    const solution = Vector.from([0, 6]);
    const mode = diode.getOperatingMode(solution, nodeMap);
    
    expect(mode).toBe(DiodeState.BREAKDOWN);
  });
});

describe('Intelligent Diode - Assembly and Stamping', () => {
  
  test('should assemble successfully in forward bias', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const solution = Vector.from([0.6, 0]);
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    
    expect(() => {
      diode.assemble({
        matrix,
        rhs,
        solutionVector: solution,
        nodeMap,
        currentTime: 0,
        dt: 1e-6,
        gmin: 1e-12
      });
    }).not.toThrow();
  });

  test('should assemble successfully in reverse bias', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const solution = Vector.from([0, 1]);
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    
    expect(() => {
      diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
  });

  test('should stamp conductance into matrix', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const solution = Vector.from([0.6, 0]);
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    
    diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    // Matrix should have non-zero entries
    const G00 = matrix.get(0, 0);
    expect(G00).toBeGreaterThan(0);
  });

  test('should produce finite values', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const solution = Vector.from([0.7, 0]);
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    
    diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    // All values should be finite
    expect(Number.isFinite(matrix.get(0, 0))).toBe(true);
    expect(Number.isFinite(rhs.get(0))).toBe(true);
  });
});

describe('Intelligent Diode - Numerical Stability', () => {
  
  test('should handle zero voltage', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const solution = Vector.from([0, 0]);
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    
    expect(() => {
      diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
  });

  test('should handle large forward voltage without overflow', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const solution = Vector.from([5.0, 0]); // Large voltage
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    
    expect(() => {
      diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
    
    // Should produce finite values
    expect(Number.isFinite(matrix.get(0, 0))).toBe(true);
  });

  test('should include Gmin for stability', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const solution = Vector.from([0, 1]); // Reverse bias
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    
    diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    const G = matrix.get(0, 0);
    const gmin = 1e-12;
    // Should have at least Gmin
    expect(G).toBeGreaterThanOrEqual(gmin * 0.9);
  });

  test('should handle very small saturation current', () => {
    const params = { ...createStandardParams(), Is: 1e-18 };
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const solution = Vector.from([0.6, 0]);
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    
    expect(() => {
      diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    }).not.toThrow();
  });
});

describe('Intelligent Diode - Convergence Checking', () => {
  
  test('should check convergence with small voltage changes', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    // Initialize first
    const solution = Vector.from([0.6, 0]);
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    const deltaV = Vector.from([1e-6, 0]);
    const convergenceInfo = diode.checkConvergence(deltaV, nodeMap);
    
    expect(convergenceInfo).toBeDefined();
    expect(convergenceInfo.confidence).toBeGreaterThanOrEqual(0);
  });

  test('should return lower confidence for large changes', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    // Initialize
    const solution1 = Vector.from([0, 1]);
    const matrix1 = new SparseMatrix(2, 2);
    const rhs1 = Vector.zeros(2);
    diode.assemble(createContext(matrix1, rhs1, solution1, nodeMap));
    
    // Large change
    const deltaV = Vector.from([2, -2]);
    const convergenceInfo = diode.checkConvergence(deltaV, nodeMap);
    
    expect(convergenceInfo.confidence).toBeLessThan(0.9);
  });
});

describe('Intelligent Diode - Update Limiting', () => {
  
  test('should limit large voltage updates', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const deltaV = Vector.from([10, 0]);
    const limited = diode.limitUpdate(deltaV, nodeMap);
    
    // Limited update should be smaller or equal
    expect(Math.abs(limited.get(0))).toBeLessThanOrEqual(Math.abs(deltaV.get(0)));
  });

  test('should preserve reasonable updates', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const deltaV = Vector.from([0.05, 0]); // Small update
    const limited = diode.limitUpdate(deltaV, nodeMap);
    
    // Limited update should be reasonable and not inf/nan
    expect(Number.isFinite(limited.get(0))).toBe(true);
    expect(Math.abs(limited.get(0))).toBeLessThanOrEqual(Math.abs(deltaV.get(0)));
  });
});

describe('Intelligent Diode - State Prediction', () => {
  
  test('should predict next state', () => {
    const params = createStandardParams();
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    // Initialize
    const solution = Vector.from([0, 0.05]);
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    const prediction = diode.predictNextState(1e-6);
    
    expect(prediction).toBeDefined();
    expect(prediction.switchingEvents).toBeDefined();
  });

  test('should identify numerical challenges', () => {
    const params = { ...createStandardParams(), Is: 1e-12 }; // Large Is
    const diode = new IntelligentDiode('D1', ['1', '0'], params);
    const nodeMap = new Map([['1', 0], ['0', 1]]);
    
    const solution = Vector.from([0.8, 0]); // High voltage
    const matrix = new SparseMatrix(2, 2);
    const rhs = Vector.zeros(2);
    diode.assemble(createContext(matrix, rhs, solution, nodeMap));
    
    const prediction = diode.predictNextState(1e-6);
    
    expect(prediction.numericalChallenges).toBeDefined();
  });
});
