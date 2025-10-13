/**
 * 🧪 Inductor Unit Tests
 * 
 * Test Coverage:
 * 1. Basic Properties & Validation
 * 2. MNA Assembly (DC & Transient)
 * 3. Voltage-Current Relationship
 * 4. Energy Calculations
 * 5. Factory Methods
 * 6. Boundary Conditions
 */

import { describe, test, expect } from 'vitest';
import { Inductor, InductorFactory, InductorTest } from '../../../src/components/passive/inductor';
import { SparseMatrix } from '../../../src/math/sparse/matrix';
import { Vector } from '../../../src/math/sparse/vector';
import { AssemblyContext } from '../../../src/core/interfaces/component';

describe('Inductor - Basic Properties', () => {
  test('should create inductor with valid parameters', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    
    expect(ind.name).toBe('L1');
    expect(ind.type).toBe('L');
    expect(ind.nodes).toEqual(['n1', 'n2']);
    expect(ind.inductance).toBe(1e-3);
  });
  
  test('should reject zero inductance', () => {
    expect(() => new Inductor('L1', ['n1', 'n2'], 0))
      .toThrow('电感值必须为正数');
  });
  
  test('should reject negative inductance', () => {
    expect(() => new Inductor('L1', ['n1', 'n2'], -1e-3))
      .toThrow('电感值必须为正数');
  });
  
  test('should reject invalid node count', () => {
    expect(() => new Inductor('L1', ['n1'] as any, 1e-3))
      .toThrow('电感必须连接两个节点');
  });
  
  test('should reject same node connection', () => {
    expect(() => new Inductor('L1', ['n1', 'n1'], 1e-3))
      .toThrow('电感不能连接到同一节点');
  });
  
  test('should require one extra variable for current', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    expect(ind.getExtraVariableCount()).toBe(1);
  });
});

describe('Inductor - Validation', () => {
  test('should pass validation for normal inductor', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    const result = ind.validate();
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  test('should warn about tiny inductance', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-13);
    const result = ind.validate();
    
    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('过小');
  });
  
  test('should warn about large inductance', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 2e6);
    const result = ind.validate();
    
    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('过大');
  });
  
  test('should provide component info', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    const info = ind.getInfo();
    
    expect(info.type).toBe('L');
    expect(info.name).toBe('L1');
    expect(info.parameters['inductance']).toBe(1e-3);
    expect(info.units?.['inductance']).toBe('H');
  });
});

describe('Inductor - Current Index Management', () => {
  test('should set current index', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    
    expect(ind.hasCurrentIndexSet()).toBe(false);
    
    ind.setCurrentIndex(5);
    expect(ind.hasCurrentIndexSet()).toBe(true);
  });
  
  test('should reject negative current index', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    
    expect(() => ind.setCurrentIndex(-1))
      .toThrow('电流索引必须为非负数');
  });
  
  test('should include current index in component info', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    ind.setCurrentIndex(5);
    
    const info = ind.getInfo();
    expect(info.parameters['currentIndex']).toBe(5);
  });
});

describe('Inductor - DC Analysis Assembly', () => {
  test('should act as short circuit in DC (small resistance)', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    
    const matrix = new SparseMatrix(4, 4);
    const rhs = new Vector(4);
    const nodeMap = new Map([['n1', 0], ['n2', 1], ['0', 2]]);
    
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: 0,
      dt: 0,
      getExtraVariableIndex: () => 3,
    };
    
    ind.assemble(context);
    
    // Check B matrix (node to branch)
    expect(matrix.get(0, 3)).toBe(1);
    expect(matrix.get(1, 3)).toBe(-1);
    
    // Check C matrix (branch to node, B^T)
    expect(matrix.get(3, 0)).toBe(1);
    expect(matrix.get(3, 1)).toBe(-1);
    
    // Check D matrix (branch impedance)
    const Req_dc = 1e-9; // DC: small resistance
    expect(matrix.get(3, 3)).toBeCloseTo(-Req_dc, 12);
    
    // Check J vector (equivalent voltage source)
    expect(rhs.get(3)).toBe(0);
  });
  
  test('should handle ground node in DC', () => {
    const ind = new Inductor('L1', ['n1', '0'], 1e-3);
    
    const matrix = new SparseMatrix(3, 3);
    const rhs = new Vector(3);
    const nodeMap = new Map([['n1', 0], ['0', -1]]);
    
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: 0,
      dt: 0,
      getExtraVariableIndex: () => 2,
    };
    
    ind.assemble(context);
    
    // Only n1 side should be stamped
    expect(matrix.get(0, 2)).toBe(1);
    expect(matrix.get(2, 0)).toBe(1);
    
    // Ground side should not add entries
    expect(matrix.get(1, 2)).toBe(0);
  });
});

describe('Inductor - Transient Analysis Assembly', () => {
  test('should assemble companion model for transient', () => {
    const L = 1e-3;
    const ind = new Inductor('L1', ['n1', 'n2'], L);
    
    const matrix = new SparseMatrix(4, 4);
    const rhs = new Vector(4);
    const nodeMap = new Map([['n1', 0], ['n2', 1], ['0', 2]]);
    
    const prevSolution = new Vector(4);
    prevSolution.set(0, 10.0); // V_n1
    prevSolution.set(1, 5.0);  // V_n2
    prevSolution.set(2, 0.0);  // V_gnd
    prevSolution.set(3, 2.0);  // I_L (previous current)
    
    const dt = 1e-6;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: dt,
      dt,
      previousSolutionVector: prevSolution,
      getExtraVariableIndex: () => 3,
    };
    
    ind.assemble(context);
    
    // Check B matrix
    expect(matrix.get(0, 3)).toBe(1);
    expect(matrix.get(1, 3)).toBe(-1);
    
    // Check C matrix (B^T)
    expect(matrix.get(3, 0)).toBe(1);
    expect(matrix.get(3, 1)).toBe(-1);
    
    // Check D matrix: -Req where Req = L/dt
    const Req = L / dt;
    expect(matrix.get(3, 3)).toBeCloseTo(-Req, 8);
    
    // Check J vector: -Veq where Veq = Req * I_prev
    const I_prev = 2.0;
    const Veq = Req * I_prev;
    expect(rhs.get(3)).toBeCloseTo(-Veq, 8);
  });
  
  test('should handle zero previous current', () => {
    const L = 1e-3;
    const ind = new Inductor('L1', ['n1', '0'], L);
    
    const matrix = new SparseMatrix(3, 3);
    const rhs = new Vector(3);
    const nodeMap = new Map([['n1', 0], ['0', -1]]);
    
    const prevSolution = new Vector(3);
    prevSolution.set(0, 10.0);
    prevSolution.set(2, 0.0); // I_L = 0
    
    const dt = 1e-6;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: dt,
      dt,
      previousSolutionVector: prevSolution,
      getExtraVariableIndex: () => 2,
    };
    
    ind.assemble(context);
    
    const Req = L / dt;
    expect(matrix.get(2, 2)).toBeCloseTo(-Req, 8);
    
    // Veq = Req * I_prev = Req * 0 = 0
    expect(rhs.get(2)).toBeCloseTo(0, 10);
  });
  
  test('should handle negative previous current', () => {
    const L = 1e-3;
    const ind = new Inductor('L1', ['n1', 'n2'], L);
    
    const matrix = new SparseMatrix(4, 4);
    const rhs = new Vector(4);
    const nodeMap = new Map([['n1', 0], ['n2', 1], ['0', 2]]);
    
    const prevSolution = new Vector(4);
    prevSolution.set(3, -1.5); // Negative current
    
    const dt = 1e-6;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: dt,
      dt,
      previousSolutionVector: prevSolution,
      getExtraVariableIndex: () => 3,
    };
    
    ind.assemble(context);
    
    const Req = L / dt;
    const Veq = Req * (-1.5);
    expect(rhs.get(3)).toBeCloseTo(-Veq, 8);
  });
});

describe('Inductor - Voltage and Energy', () => {
  test('should calculate voltage from current change', () => {
    const L = 1e-3;
    const ind = new Inductor('L1', ['n1', 'n2'], L);
    
    const I_current = 5.0;
    const I_previous = 2.0;
    const dt = 1e-6;
    
    const voltage = ind.calculateVoltage(I_current, I_previous, dt);
    
    // V = L * dI/dt = 1e-3 * (5-2) / 1e-6 = 3000 V
    expect(voltage).toBeCloseTo(3000, 8);
  });
  
  test('should return zero voltage for dt=0', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    const voltage = ind.calculateVoltage(5, 2, 0);
    expect(voltage).toBe(0);
  });
  
  test('should calculate stored energy', () => {
    const L = 1e-3;
    const ind = new Inductor('L1', ['n1', 'n2'], L);
    
    const I = 10.0;
    const energy = ind.calculateEnergy(I);
    
    // E = 0.5 * L * I^2 = 0.5 * 1e-3 * 100 = 0.05 J
    expect(energy).toBeCloseTo(0.05, 10);
  });
  
  test('should have zero energy at zero current', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    const energy = ind.calculateEnergy(0);
    expect(energy).toBe(0);
  });
  
  test('should calculate correct energy for negative current', () => {
    const L = 1e-3;
    const ind = new Inductor('L1', ['n1', 'n2'], L);
    
    const energy_pos = ind.calculateEnergy(10);
    const energy_neg = ind.calculateEnergy(-10);
    
    // Energy is always positive (I^2)
    expect(energy_neg).toBeCloseTo(energy_pos, 10);
  });
});

describe('Inductor - Factory Methods', () => {
  test('should create inductor via factory', () => {
    const ind = InductorFactory.create('L1', ['n1', 'n2'], 1e-3);
    
    expect(ind.name).toBe('L1');
    expect(ind.inductance).toBe(1e-3);
  });
  
  test('should create standard value inductor', () => {
    const ind = InductorFactory.createStandardValue('L1', ['n1', 'n2'], 2.0, 1e-3);
    
    // Should round to nearest E12 value: 2.0 is closest to 1.8
    expect(ind.inductance).toBeCloseTo(1.8e-3, 15);
  });
  
  test('should create power inductor', () => {
    const ind = InductorFactory.createPowerInductor('L1', ['n1', 'n2'], 10e-6, 5.0);
    
    expect(ind.inductance).toBe(10e-6);
  });
  
  test('should create air core inductor', () => {
    const ind = InductorFactory.createAirCore('L1', ['n1', 'n2'], 1e-6);
    
    expect(ind.inductance).toBe(1e-6);
  });
});

describe('Inductor - Test Tools', () => {
  test('should verify inductance relation', () => {
    const L = 1e-3;
    const dI = 5.0;
    const dt = 1e-6;
    
    const voltage = InductorTest.verifyInductanceRelation(L, dI, dt);
    expect(voltage).toBeCloseTo(5000, 8);
  });
  
  test('should verify energy calculation', () => {
    const L = 1e-3;
    const I = 10.0;
    
    const energy = InductorTest.verifyEnergyCalculation(L, I);
    expect(energy).toBeCloseTo(0.05, 10);
  });
  
  test('should calculate RL time constant', () => {
    const R = 1000;
    const L = 1e-3;
    
    const tau = InductorTest.calculateTimeConstant(R, L);
    expect(tau).toBeCloseTo(1e-6, 12);
  });
  
  test('should calculate LC resonant frequency', () => {
    const L = 1e-3;
    const C = 1e-6;
    
    const f0 = InductorTest.calculateResonantFrequency(L, C);
    
    // f0 = 1 / (2π√(LC)) = 1 / (2π√(1e-9)) ≈ 5032.92 Hz
    expect(f0).toBeCloseTo(5032.92, 1);
  });
});

describe('Inductor - Boundary Conditions', () => {
  test('should handle very small inductance', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-13);
    
    expect(ind.inductance).toBe(1e-13);
    
    const validation = ind.validate();
    expect(validation.isValid).toBe(true);
    expect(validation.warnings.length).toBeGreaterThan(0);
  });
  
  test('should handle large inductance', () => {
    const L = 10;
    const ind = new Inductor('L1', ['n1', 'n2'], L);
    
    expect(ind.inductance).toBe(10);
    
    const matrix = new SparseMatrix(4, 4);
    const rhs = new Vector(4);
    const nodeMap = new Map([['n1', 0], ['n2', 1], ['0', 2]]);
    
    const prevSolution = new Vector(4);
    prevSolution.set(3, 1.0); // I_prev = 1 A
    
    const dt = 1e-3;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: dt,
      dt,
      previousSolutionVector: prevSolution,
      getExtraVariableIndex: () => 3,
    };
    
    ind.assemble(context);
    
    // Req = L/dt = 10/1e-3 = 10000 Ω
    const Req = L / dt;
    expect(Req).toBeCloseTo(10000, 8);
  });
  
  test('should handle tiny time step', () => {
    const L = 1e-6;
    const ind = new Inductor('L1', ['n1', 'n2'], L);
    
    const matrix = new SparseMatrix(4, 4);
    const rhs = new Vector(4);
    const nodeMap = new Map([['n1', 0], ['n2', 1], ['0', 2]]);
    
    const prevSolution = new Vector(4);
    prevSolution.set(3, 0.5);
    
    const dt = 1e-12;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: dt,
      dt,
      previousSolutionVector: prevSolution,
      getExtraVariableIndex: () => 3,
    };
    
    ind.assemble(context);
    
    // Req = L/dt = 1e-6/1e-12 = 1e6 Ω
    const Req = L / dt;
    expect(Req).toBeCloseTo(1e6, 5);
  });
  
  test('should not produce events', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    expect(ind.hasEvents()).toBe(false);
  });
  
  test('should provide string representation', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    const str = ind.toString();
    
    expect(str).toContain('L1');
    expect(str).toContain('0.001');
    expect(str).toContain('n1');
    expect(str).toContain('n2');
  });
  
  test('should throw error when assembling without getExtraVariableIndex', () => {
    const ind = new Inductor('L1', ['n1', 'n2'], 1e-3);
    
    const matrix = new SparseMatrix(4, 4);
    const rhs = new Vector(4);
    const nodeMap = new Map([['n1', 0], ['n2', 1]]);
    
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: 0,
      dt: 0,
      // Missing getExtraVariableIndex
    };
    
    expect(() => ind.assemble(context))
      .toThrow('需要 getExtraVariableIndex');
  });
});
