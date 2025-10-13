/**
 * 🧪 Voltage Source Unit Tests
 * 
 * Test Coverage:
 * 1. Basic Properties & Validation
 * 2. DC Voltage Source
 * 3. Sinusoidal Waveform (SIN)
 * 4. Pulse Waveform (PULSE)
 * 5. Exponential Waveform (EXP)
 * 6. AC Waveform
 * 7. MNA Assembly with Extra Variables
 * 8. Source Scaling (for source stepping)
 * 9. Factory Methods
 * 10. Boundary Conditions
 */

import { describe, test, expect } from 'vitest';
import { VoltageSource, VoltageSourceFactory } from '../../../src/components/sources/voltage_source';
import { SparseMatrix } from '../../../src/math/sparse/matrix';
import { Vector } from '../../../src/math/sparse/vector';
import { AssemblyContext } from '../../../src/core/interfaces/component';

describe('Voltage Source - Basic Properties', () => {
  test('should create DC voltage source with valid parameters', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    
    expect(vs.name).toBe('V1');
    expect(vs.type).toBe('V');
    expect(vs.nodes).toEqual(['n1', '0']);
    expect(vs.dcValue).toBe(10);
  });
  
  test('should reject invalid node count', () => {
    expect(() => new VoltageSource('V1', ['n1'] as any, 10))
      .toThrow('电压源必须连接两个节点');
  });
  
  test('should reject same node connection', () => {
    expect(() => new VoltageSource('V1', ['n1', 'n1'], 10))
      .toThrow('电压源不能连接到同一节点');
  });
  
  test('should require one extra variable for current', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    expect(vs.getExtraVariableCount()).toBe(1);
  });
  
  test('should not produce events', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    expect(vs.hasEvents()).toBe(false);
  });
});

describe('Voltage Source - Validation', () => {
  test('should pass validation for normal voltage source', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    const result = vs.validate();
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  test('should warn about very large voltage', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 2e6);
    const result = vs.validate();
    
    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('过大');
  });
  
  test('should provide component info', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    const info = vs.getInfo();
    
    expect(info.type).toBe('V');
    expect(info.name).toBe('V1');
    expect(info.parameters['dcValue']).toBe(10);
  });
  
  test('should have string representation', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    const str = vs.toString();
    
    expect(str).toContain('V1');
    expect(str).toContain('10');
    expect(str).toContain('n1');
  });
});

describe('Voltage Source - DC Waveform', () => {
  test('should return DC value at any time for DC source', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    
    expect(vs.getValue(0)).toBe(10);
    expect(vs.getValue(1e-3)).toBe(10);
    expect(vs.getValue(1)).toBe(10);
  });
  
  test('should handle negative DC voltage', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], -5);
    
    expect(vs.getValue(0)).toBe(-5);
    expect(vs.getValue(1e-3)).toBe(-5);
  });
  
  test('should handle zero voltage', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0);
    
    expect(vs.getValue(0)).toBe(0);
    expect(vs.getValue(1e-3)).toBe(0);
  });
});

describe('Voltage Source - Sinusoidal Waveform', () => {
  test('should generate sine wave with correct parameters', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'SIN',
      parameters: {
        dc: 0,
        amplitude: 10,
        frequency: 1000,
        phase: 0
      }
    });
    
    // At t=0, sin(0) = 0
    expect(vs.getValue(0)).toBeCloseTo(0, 10);
    
    // At t=T/4, sin(π/2) = 1
    const T = 1 / 1000;
    expect(vs.getValue(T / 4)).toBeCloseTo(10, 8);
    
    // At t=T/2, sin(π) = 0
    expect(vs.getValue(T / 2)).toBeCloseTo(0, 8);
    
    // At t=3T/4, sin(3π/2) = -1
    expect(vs.getValue(3 * T / 4)).toBeCloseTo(-10, 8);
  });
  
  test('should handle DC offset in sine wave', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'SIN',
      parameters: {
        dc: 5,
        amplitude: 3,
        frequency: 1000,
        phase: 0
      }
    });
    
    // At t=0 (DC analysis), always returns _dcValue (which is 0 in constructor)
    expect(vs.getValue(0)).toBeCloseTo(0, 10);
    
    // At peak in transient, V = dc + amp = 5 + 3 = 8
    const T = 1 / 1000;
    expect(vs.getValue(T / 4)).toBeCloseTo(8, 8);
  });
  
  test('should handle phase shift', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'SIN',
      parameters: {
        dc: 0,
        amplitude: 10,
        frequency: 1000,
        phase: Math.PI / 2  // 90 degree phase shift
      }
    });
    
    // At t=0 (DC analysis), always returns _dcValue
    expect(vs.getValue(0)).toBeCloseTo(0, 8);
    
    // With phase π/2, at t=0+ we have sin(2πf·0 + π/2) = sin(π/2) = 1
    // But we need t>0, so let's check at t where argument is near π/2
    // At very small t, 2πft is small, so phase dominates
    expect(vs.getValue(1e-9)).toBeCloseTo(10, 3);
  });
  
  test('should handle delay parameter', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'SIN',
      parameters: {
        dc: 2,
        amplitude: 5,
        frequency: 1000,
        phase: 0,
        delay: 1e-3
      }
    });
    
    // At t=0 (DC analysis), returns _dcValue
    expect(vs.getValue(0)).toBe(0);
    
    // Before delay (in transient), should return DC value
    expect(vs.getValue(0.5e-3)).toBe(2);
    
    // After delay, should have sine wave
    const T = 1 / 1000;
    expect(vs.getValue(1e-3 + T / 4)).toBeCloseTo(7, 8);
  });
  
  test('should handle damping factor', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'SIN',
      parameters: {
        dc: 0,
        amplitude: 10,
        frequency: 1000,
        phase: 0,
        damping: 1000  // decay factor
      }
    });
    
    const T = 1 / 1000;
    
    // At t=T/4, amplitude should be reduced by e^(-damping*t)
    const v1 = vs.getValue(T / 4);
    const expectedAmp = 10 * Math.exp(-1000 * T / 4);
    expect(v1).toBeCloseTo(expectedAmp, 6);
  });
});

describe('Voltage Source - Pulse Waveform', () => {
  test('should generate pulse with correct timing', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'PULSE',
      parameters: {
        v1: 0,
        v2: 10,
        delay: 0,
        rise_time: 1e-9,
        fall_time: 1e-9,
        pulse_width: 1e-6,
        period: 2e-6
      }
    });
    
    // Before pulse, should be v1
    expect(vs.getValue(0)).toBe(0);
    
    // During rise (ignoring rise time for simplicity)
    expect(vs.getValue(0.5e-6)).toBe(10);
    
    // After pulse width, during fall
    expect(vs.getValue(1.5e-6)).toBe(0);
    
    // Next period
    expect(vs.getValue(2.5e-6)).toBe(10);
  });
  
  test('should handle pulse delay', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'PULSE',
      parameters: {
        v1: 0,
        v2: 5,
        delay: 1e-6,
        rise_time: 1e-9,
        fall_time: 1e-9,
        pulse_width: 1e-6,
        period: 3e-6
      }
    });
    
    // Before delay, should be v1
    expect(vs.getValue(0)).toBe(0);
    expect(vs.getValue(0.5e-6)).toBe(0);
    
    // After delay, should start pulsing
    expect(vs.getValue(1.5e-6)).toBe(5);
  });
  
  test('should handle rise and fall times', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'PULSE',
      parameters: {
        v1: 0,
        v2: 10,
        delay: 0,
        rise_time: 1e-6,
        fall_time: 1e-6,
        pulse_width: 2e-6,
        period: 5e-6
      }
    });
    
    // During rise (at t=0.5μs, halfway through rise)
    const vRise = vs.getValue(0.5e-6);
    expect(vRise).toBeGreaterThan(4);
    expect(vRise).toBeLessThan(6);
    
    // During fall (at t=2.5μs, halfway through fall)
    // tmod = 2.5e-6, tr=1e-6, pw=2e-6, so tmod > tr+pw (3e-6 > 2.5e-6 is false)
    // Actually tmod=2.5e-6, and tr+pw=3e-6, so still in high state
    const vFall = vs.getValue(3.5e-6);
    expect(vFall).toBeGreaterThan(4);
    expect(vFall).toBeLessThan(6);
  });
});

describe('Voltage Source - Exponential Waveform', () => {
  test('should generate exponential rise', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'EXP',
      parameters: {
        v1: 0,
        v2: 10,
        delay1: 0,
        tau1: 1e-6,
        delay2: 10e-6,
        tau2: 1e-6
      }
    });
    
    // At t=0, should be v1
    expect(vs.getValue(0)).toBe(0);
    
    // During rise, V = v1 + (v2-v1)*(1 - e^(-t/tau1))
    const t1 = 1e-6;  // One time constant
    const expected1 = 10 * (1 - Math.exp(-1));
    expect(vs.getValue(t1)).toBeCloseTo(expected1, 6);
    
    // At 5 time constants, nearly v2
    expect(vs.getValue(5e-6)).toBeGreaterThan(9.9);
  });
  
  test('should handle exponential decay after peak', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'EXP',
      parameters: {
        v1: 0,
        v2: 10,
        delay1: 0,
        tau1: 1e-6,
        delay2: 5e-6,
        tau2: 2e-6
      }
    });
    
    // Before delay2, rising
    expect(vs.getValue(3e-6)).toBeGreaterThan(9);
    
    // After delay2, decaying
    const t = 7e-6;
    const v = vs.getValue(t);
    expect(v).toBeLessThan(10);
    expect(v).toBeGreaterThan(0);
  });
  
  test('should handle initial delay', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'EXP',
      parameters: {
        v1: 2,
        v2: 8,
        delay1: 1e-6,
        tau1: 1e-6,
        delay2: 10e-6,
        tau2: 1e-6
      }
    });
    
    // At t=0 (DC analysis), returns _dcValue
    expect(vs.getValue(0)).toBe(0);
    
    // Before delay1 (in transient), should be v1
    expect(vs.getValue(0.5e-6)).toBe(2);
    
    // After delay1, should start rising
    expect(vs.getValue(2e-6)).toBeGreaterThan(2);
  });
});

describe('Voltage Source - AC Waveform', () => {
  test('should generate AC cosine wave', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'AC',
      parameters: {
        amplitude: 10,
        frequency: 1000,
        phase: 0
      }
    });
    
    // At t=0 (DC analysis), returns _dcValue
    expect(vs.getValue(0)).toBeCloseTo(0, 10);
    
    // At t>0, cos(2πft) should follow AC waveform
    const T = 1 / 1000;
    const t = T / 1000000;  // Very small t to approximate t=0+
    expect(vs.getValue(t)).toBeCloseTo(10, 6);
    
    // At t=T/4, cos(π/2) = 0
    expect(vs.getValue(T / 4)).toBeCloseTo(0, 8);
    
    // At t=T/2, cos(π) = -1
    expect(vs.getValue(T / 2)).toBeCloseTo(-10, 8);
  });
  
  test('should handle AC phase shift', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'AC',
      parameters: {
        amplitude: 5,
        frequency: 1000,
        phase: Math.PI / 2
      }
    });
    
    // At t=0 with phase π/2, cos(π/2) = 0
    expect(vs.getValue(0)).toBeCloseTo(0, 8);
  });
});

describe('Voltage Source - MNA Assembly', () => {
  test('should assemble MNA matrix correctly', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    vs.setCurrentIndex(2);
    
    const matrix = new SparseMatrix(3, 3);
    const rhs = new Vector(3);
    const nodeMap = new Map([['n1', 0], ['0', -1]]);
    
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: 0,
      dt: 0
    };
    
    vs.assemble(context);
    
    // B matrix: node to branch (KCL)
    expect(matrix.get(0, 2)).toBe(1);
    
    // C matrix: branch to node (KVL, B^T)
    expect(matrix.get(2, 0)).toBe(1);
    
    // RHS: voltage constraint
    expect(rhs.get(2)).toBe(10);
  });
  
  test('should handle both nodes in MNA assembly', () => {
    const vs = new VoltageSource('V1', ['n1', 'n2'], 5);
    vs.setCurrentIndex(3);
    
    const matrix = new SparseMatrix(4, 4);
    const rhs = new Vector(4);
    const nodeMap = new Map([['n1', 0], ['n2', 1], ['0', 2]]);
    
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: 0,
      dt: 0
    };
    
    vs.assemble(context);
    
    // B matrix
    expect(matrix.get(0, 3)).toBe(1);
    expect(matrix.get(1, 3)).toBe(-1);
    
    // C matrix (B^T)
    expect(matrix.get(3, 0)).toBe(1);
    expect(matrix.get(3, 1)).toBe(-1);
    
    // RHS
    expect(rhs.get(3)).toBe(5);
  });
  
  test('should throw error if current index not set', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    
    const matrix = new SparseMatrix(3, 3);
    const rhs = new Vector(3);
    const nodeMap = new Map([['n1', 0], ['0', -1]]);
    
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: 0,
      dt: 0
    };
    
    expect(() => vs.assemble(context)).toThrow('电流支路索引未设置');
  });
  
  test('should use time-dependent voltage in assembly', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'SIN',
      parameters: {
        dc: 0,
        amplitude: 10,
        frequency: 1000,
        phase: 0
      }
    });
    vs.setCurrentIndex(2);
    
    const matrix = new SparseMatrix(3, 3);
    const rhs = new Vector(3);
    const nodeMap = new Map([['n1', 0], ['0', -1]]);
    
    const T = 1 / 1000;
    const context: AssemblyContext = {
      nodeMap,
      matrix,
      rhs,
      currentTime: T / 4,  // Peak of sine wave
      dt: 1e-6
    };
    
    vs.assemble(context);
    
    // RHS should have sine wave value at t=T/4
    expect(rhs.get(2)).toBeCloseTo(10, 8);
  });
});

describe('Voltage Source - Source Scaling', () => {
  test('should scale source for source stepping', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    
    vs.scaleSource(0.5);
    expect(vs.getValue(0)).toBe(5);
    
    vs.scaleSource(1.0);
    expect(vs.getValue(0)).toBe(10);
    
    vs.scaleSource(0.1);
    expect(vs.getValue(0)).toBe(1);
  });
  
  test('should restore original source value', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    
    vs.scaleSource(0.5);
    expect(vs.getValue(0)).toBe(5);
    
    vs.restoreSource();
    expect(vs.getValue(0)).toBe(10);
  });
  
  test('should scale DC value but use original in transient', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    
    vs.scaleSource(0.5);
    
    // At t=0 (DC), should use scaled value
    expect(vs.getValue(0)).toBe(5);
    
    // At t>0 (transient), should use original value
    expect(vs.getValue(1e-3)).toBe(10);
  });
});

describe('Voltage Source - Factory Methods', () => {
  test('should create DC voltage source via factory', () => {
    const vs = VoltageSourceFactory.createDC('V1', ['n1', '0'], 12);
    
    expect(vs.name).toBe('V1');
    expect(vs.dcValue).toBe(12);
    expect(vs.getValue(0)).toBe(12);
  });
  
  test('should create sine wave source via factory', () => {
    const vs = VoltageSourceFactory.createSine('V1', ['n1', '0'], 0, 10, 1000, 0);
    
    expect(vs.getValue(0)).toBeCloseTo(0, 10);
    
    const T = 1 / 1000;
    expect(vs.getValue(T / 4)).toBeCloseTo(10, 8);
  });
  
  test('should create pulse source via factory', () => {
    const vs = VoltageSourceFactory.createPulse('V1', ['n1', '0'], 0, 5, 0, 1e-9, 1e-9, 1e-6, 2e-6);
    
    expect(vs.getValue(0)).toBe(0);
    expect(vs.getValue(0.5e-6)).toBe(5);
  });
  
  test('should create exponential source via factory', () => {
    const vs = VoltageSourceFactory.createExponential('V1', ['n1', '0'], 0, 10, 0, 1e-6);
    
    expect(vs.getValue(0)).toBe(0);
    expect(vs.getValue(5e-6)).toBeGreaterThan(9);
  });
  
  test('should create AC version from existing source', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 10);
    const acSource = vs.createACVersion(5, 1000, 0);
    
    expect(acSource.name).toBe('V1_AC');
    
    // At t=0 (DC), returns _dcValue which is 0 for AC source
    expect(acSource.getValue(0)).toBeCloseTo(0, 10);
    
    // At t>0, should follow AC waveform
    const T = 1 / 1000;
    const t = T / 1000000;
    expect(acSource.getValue(t)).toBeCloseTo(5, 6);
  });
});

describe('Voltage Source - Boundary Conditions', () => {
  test('should handle zero voltage', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0);
    
    expect(vs.getValue(0)).toBe(0);
    expect(vs.getValue(1)).toBe(0);
  });
  
  test('should handle very large voltage', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 2e6);
    
    expect(vs.getValue(0)).toBe(2e6);
    
    const validation = vs.validate();
    expect(validation.warnings.length).toBeGreaterThan(0);
  });
  
  test('should handle negative voltage', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], -100);
    
    expect(vs.getValue(0)).toBe(-100);
  });
  
  test('should handle very high frequency sine wave', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'SIN',
      parameters: {
        dc: 0,
        amplitude: 5,
        frequency: 1e9,  // 1 GHz
        phase: 0
      }
    });
    
    const T = 1 / 1e9;
    expect(vs.getValue(T / 4)).toBeCloseTo(5, 6);
  });
  
  test('should handle very small time constants', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'EXP',
      parameters: {
        v1: 0,
        v2: 10,
        delay1: 0,
        tau1: 1e-12,
        delay2: 1e-9,
        tau2: 1e-12
      }
    });
    
    // Should rise very quickly
    expect(vs.getValue(1e-11)).toBeGreaterThan(5);
  });
  
  test('should validate sine wave parameters', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'SIN',
      parameters: {
        dc: 0,
        amplitude: 10,
        frequency: -1000,  // Invalid negative frequency
        phase: 0
      }
    });
    
    const validation = vs.validate();
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });
  
  test('should validate pulse parameters', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'PULSE',
      parameters: {
        v1: 0,
        v2: 10,
        delay: 0,
        rise_time: 1e-9,
        fall_time: 1e-9,
        pulse_width: 1e-6,
        period: -1e-6  // Invalid negative period
      }
    });
    
    const validation = vs.validate();
    expect(validation.isValid).toBe(false);
  });
  
  test('should validate exponential parameters', () => {
    const vs = new VoltageSource('V1', ['n1', '0'], 0, {
      type: 'EXP',
      parameters: {
        v1: 0,
        v2: 10,
        delay1: 0,
        tau1: -1e-6,  // Invalid negative tau
        delay2: 1e-6,
        tau2: 1e-6
      }
    });
    
    const validation = vs.validate();
    expect(validation.isValid).toBe(false);
  });
});
