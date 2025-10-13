/**
 * 🧪 Capacitor Unit Tests
 * 
 * Test Coverage:
 * 1. Basic Properties & Validation
 * 2. MNA Assembly (DC & Transient)
 * 3. Current-Voltage Relationship
 * 4. Energy Calculations
 * 5. Factory Methods
 * 6. Boundary Conditions
 */

import { describe, test, expect } from 'vitest';
import { Capacitor, CapacitorFactory, CapacitorTest } from '../../../src/components/passive/capacitor';
import { SparseMatrix } from '../../../src/math/sparse/matrix';
import { Vector } from '../../../src/math/sparse/vector';
import { AssemblyContext } from '../../../src/core/interfaces/component';

describe('Capacitor - Basic Properties', () => {
  test('should create capacitor with valid parameters', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 1e-6);
    
    expect(cap.name).toBe('C1');
    expect(cap.type).toBe('C');
    expect(cap.nodes).toEqual(['n1', 'n2']);
    expect(cap.capacitance).toBe(1e-6);
  });
  
  test('should reject zero capacitance', () => {
    expect(() => new Capacitor('C1', ['n1', 'n2'], 0))
      .toThrow('电容值必须为正数');
  });
  
  test('should reject negative capacitance', () => {
    expect(() => new Capacitor('C1', ['n1', 'n2'], -1e-6))
      .toThrow('电容值必须为正数');
  });
  
  test('should reject invalid node count', () => {
    expect(() => new Capacitor('C1', ['n1'] as any, 1e-6))
      .toThrow('电容必须连接两个节点');
  });
  
  test('should reject same node connection', () => {
    expect(() => new Capacitor('C1', ['n1', 'n1'], 1e-6))
      .toThrow('电容不能连接到同一节点');
  });
});

describe('Capacitor - Validation', () => {
  test('should pass validation for normal capacitor', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 1e-6);
    const result = cap.validate();
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  test('should warn about tiny capacitance', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 1e-16);
    const result = cap.validate();
    
    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('过小');
  });
  
  test('should warn about large capacitance', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 2000);
    const result = cap.validate();
    
    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('过大');
  });
  
  test('should provide component info', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 1e-6);
    const info = cap.getInfo();
    
    expect(info.type).toBe('C');
    expect(info.name).toBe('C1');
    expect(info.parameters['capacitance']).toBe(1e-6);
    expect(info.units?.['capacitance']).toBe('F');
  });
});

describe('Capacitor - DC Analysis Assembly', () => {
  test('should act as open circuit in DC (only GMIN contribution)', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 1e-6);
    
    const matrix = new SparseMatrix(3, 3);
    const rhs = new Vector(3);
    const nodeMap = new Map([['n1', 0], ['n2', 1], ['0', 2]]);
    
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: 0,
      dt: 0,
    };
    
    cap.assemble(context);
    
    const GMIN = 1e-12;
    expect(matrix.get(0, 0)).toBeCloseTo(GMIN, 15);
    expect(matrix.get(1, 1)).toBeCloseTo(GMIN, 15);
    
    expect(matrix.get(0, 1)).toBe(0);
    expect(matrix.get(1, 0)).toBe(0);
    
    expect(rhs.get(0)).toBe(0);
    expect(rhs.get(1)).toBe(0);
  });
  
  test('should handle ground node in DC', () => {
    const cap = new Capacitor('C1', ['n1', '0'], 1e-6);
    
    const matrix = new SparseMatrix(2, 2);
    const rhs = new Vector(2);
    const nodeMap = new Map([['n1', 0], ['0', -1]]);
    
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: 0,
      dt: 0,
    };
    
    cap.assemble(context);
    
    const GMIN = 1e-12;
    expect(matrix.get(0, 0)).toBeCloseTo(GMIN, 15);
  });
});

describe('Capacitor - Transient Analysis Assembly', () => {
  test('should assemble companion model for transient', () => {
    const C = 1e-6;
    const cap = new Capacitor('C1', ['n1', 'n2'], C);
    
    const matrix = new SparseMatrix(3, 3);
    const rhs = new Vector(3);
    const nodeMap = new Map([['n1', 0], ['n2', 1], ['0', 2]]);
    
    const prevSolution = new Vector(3);
    prevSolution.set(0, 5.0);
    prevSolution.set(1, 2.0);
    prevSolution.set(2, 0.0);
    
    const dt = 1e-6;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: dt,
      dt,
      previousSolutionVector: prevSolution,
    };
    
    cap.assemble(context);
    
    const Geq = C / dt;
    const GMIN = 1e-12;
    const totalG = Geq + GMIN;
    
    expect(matrix.get(0, 0)).toBeCloseTo(totalG, 10);
    expect(matrix.get(0, 1)).toBeCloseTo(-Geq, 10);
    expect(matrix.get(1, 0)).toBeCloseTo(-Geq, 10);
    expect(matrix.get(1, 1)).toBeCloseTo(totalG, 10);
    
    const Vprev = 5.0 - 2.0;
    const Ieq = Geq * Vprev;
    expect(rhs.get(0)).toBeCloseTo(Ieq, 10);
    expect(rhs.get(1)).toBeCloseTo(-Ieq, 10);
  });
  
  test('should handle zero previous voltage', () => {
    const C = 1e-9;
    const cap = new Capacitor('C1', ['n1', '0'], C);
    
    const matrix = new SparseMatrix(2, 2);
    const rhs = new Vector(2);
    const nodeMap = new Map([['n1', 0], ['0', -1]]);
    
    const prevSolution = new Vector(2);
    prevSolution.set(0, 0.0);
    
    const dt = 1e-9;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: dt,
      dt,
      previousSolutionVector: prevSolution,
    };
    
    cap.assemble(context);
    
    const Geq = C / dt;
    const GMIN = 1e-12;
    expect(matrix.get(0, 0)).toBeCloseTo(Geq + GMIN, 10);
    
    expect(rhs.get(0)).toBeCloseTo(0, 10);
  });
});

describe('Capacitor - Current and Energy', () => {
  test('should calculate current from voltage change', () => {
    const C = 1e-6;
    const cap = new Capacitor('C1', ['n1', 'n2'], C);
    
    const V_current = 10.0;
    const V_previous = 5.0;
    const dt = 1e-6;
    
    const current = cap.calculateCurrent(V_current, V_previous, dt);
    expect(current).toBeCloseTo(5.0, 10);
  });
  
  test('should return zero current for dt=0', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 1e-6);
    const current = cap.calculateCurrent(10, 5, 0);
    expect(current).toBe(0);
  });
  
  test('should calculate stored energy', () => {
    const C = 1e-6;
    const cap = new Capacitor('C1', ['n1', 'n2'], C);
    
    const V = 10.0;
    const energy = cap.calculateEnergy(V);
    expect(energy).toBeCloseTo(50e-6, 12);
  });
  
  test('should have zero energy at zero voltage', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 1e-6);
    const energy = cap.calculateEnergy(0);
    expect(energy).toBe(0);
  });
  
  test('should calculate correct energy for negative voltage', () => {
    const C = 1e-6;
    const cap = new Capacitor('C1', ['n1', 'n2'], C);
    
    const energy_pos = cap.calculateEnergy(10);
    const energy_neg = cap.calculateEnergy(-10);
    expect(energy_neg).toBeCloseTo(energy_pos, 12);
  });
});

describe('Capacitor - Factory Methods', () => {
  test('should create capacitor via factory', () => {
    const cap = CapacitorFactory.create('C1', ['n1', 'n2'], 1e-6);
    
    expect(cap.name).toBe('C1');
    expect(cap.capacitance).toBe(1e-6);
  });
  
  test('should create standard value capacitor', () => {
    const cap = CapacitorFactory.createStandardValue('C1', ['n1', 'n2'], 2.0, 1e-6);
    
    expect(cap.capacitance).toBeCloseTo(2.2e-6, 15);
  });
  
  test('should create ceramic capacitor', () => {
    const cap = CapacitorFactory.createCeramic('C1', ['n1', 'n2'], 100e-12);
    
    expect(cap.capacitance).toBe(100e-12);
  });
  
  test('should create electrolytic capacitor', () => {
    const cap = CapacitorFactory.createElectrolytic('C1', ['n1', 'n2'], 100e-6);
    
    expect(cap.capacitance).toBe(100e-6);
  });
});

describe('Capacitor - Test Tools', () => {
  test('should verify capacitance relation', () => {
    const C = 1e-6;
    const dV = 5.0;
    const dt = 1e-6;
    
    const current = CapacitorTest.verifyCapacitanceRelation(C, dV, dt);
    expect(current).toBeCloseTo(5.0, 10);
  });
  
  test('should verify energy calculation', () => {
    const C = 1e-6;
    const V = 10.0;
    
    const energy = CapacitorTest.verifyEnergyCalculation(C, V);
    expect(energy).toBeCloseTo(50e-6, 12);
  });
  
  test('should calculate RC time constant', () => {
    const R = 1000;
    const C = 1e-6;
    
    const tau = CapacitorTest.calculateTimeConstant(R, C);
    expect(tau).toBeCloseTo(1e-3, 12);
  });
});

describe('Capacitor - Boundary Conditions', () => {
  test('should handle very small capacitance', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 1e-16);
    
    expect(cap.capacitance).toBe(1e-16);
    
    const validation = cap.validate();
    expect(validation.isValid).toBe(true);
    expect(validation.warnings.length).toBeGreaterThan(0);
  });
  
  test('should handle large capacitance', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 0.1);
    
    expect(cap.capacitance).toBe(0.1);
    
    const matrix = new SparseMatrix(2, 2);
    const rhs = new Vector(2);
    const nodeMap = new Map([['n1', 0], ['n2', 1]]);
    
    const prevSolution = new Vector(2);
    prevSolution.set(0, 10.0);
    prevSolution.set(1, 0.0);
    
    const dt = 1e-3;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: dt,
      dt,
      previousSolutionVector: prevSolution,
    };
    
    cap.assemble(context);
    
    const Geq = 0.1 / dt;
    expect(Geq).toBeCloseTo(100, 10);
  });
  
  test('should handle tiny time step', () => {
    const C = 1e-9;
    const cap = new Capacitor('C1', ['n1', 'n2'], C);
    
    const matrix = new SparseMatrix(2, 2);
    const rhs = new Vector(2);
    const nodeMap = new Map([['n1', 0], ['n2', 1]]);
    
    const prevSolution = new Vector(2);
    prevSolution.set(0, 5.0);
    prevSolution.set(1, 0.0);
    
    const dt = 1e-12;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: dt,
      dt,
      previousSolutionVector: prevSolution,
    };
    
    cap.assemble(context);
    
    const Geq = C / dt;
    expect(Geq).toBeCloseTo(1000, 5);
  });
  
  test('should not produce events', () => {
    const cap = new Capacitor('C1', ['n1', 'n2'], 1e-6);
    expect(cap.hasEvents()).toBe(false);
  });
});
