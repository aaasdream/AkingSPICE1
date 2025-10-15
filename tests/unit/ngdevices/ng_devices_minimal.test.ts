/**
 * NGDevices Simple Standalone Test
 * 
 * Minimal test to verify NGSpice-based devices work without complex dependencies
 */

import { NgDeviceFactory } from '../../../src/core/ngdevices';
import { VoltageSource } from '../../../src/components/sources/voltage_source';
import { Resistor } from '../../../src/components/passive/resistor';
import { SparseMatrix } from '../../../src/math/sparse/matrix';
import { Vector } from '../../../src/math/sparse/vector';
import { AssemblyContext } from '../../../src/core/interfaces/component';

describe('NGDevices Minimal Tests', () => {
  
  it('should create a diode instance', () => {
    const diode = NgDeviceFactory.createDiode('D1', '1', '0', {
      IS: 1e-14,
      N: 1.0
    });
    
    expect(diode).toBeDefined();
    expect(diode.name).toBe('D1');
    expect(diode.type).toBe('D');
    expect(diode.nodes).toEqual(['1', '0']);
  });
  
  it('should create an NMOS instance', () => {
    const nmos = NgDeviceFactory.createNMOS('M1', '3', '2', '0', '0', {
      VTO: 1.0,
      KP: 100e-6,
      W: 10e-6,
      L: 1e-6
    });
    
    expect(nmos).toBeDefined();
    expect(nmos.name).toBe('M1');
    expect(nmos.type).toBe('M');
    expect(nmos.nodes).toEqual(['3', '2', '0', '0']);
  });
  
  it('should create a PMOS instance', () => {
    const pmos = NgDeviceFactory.createPMOS('M2', '3', '2', '0', '0', {
      VTO: -1.0,
      KP: 50e-6
    });
    
    expect(pmos).toBeDefined();
    expect(pmos.name).toBe('M2');
    expect(pmos.type).toBe('M');
  });
  
  it('should assemble diode in forward bias', () => {
    const diode = NgDeviceFactory.createDiode('D1', '1', '0');
    
    const nodeMap = new Map<string, number>([
      ['0', 0],
      ['1', 1],
    ]);
    
    const matrix = new SparseMatrix(2, 2);
    const rhs = new Vector(2);
    const solution = new Vector(2);
    solution.set(1, 0.7);  // Forward bias voltage
    
    const context: AssemblyContext = {
      matrix,
      rhs,
      nodeMap,
      currentTime: 0,
      dt: 0.001,
      solutionVector: solution,
      gmin: 1e-12
    };
    
    // Should not throw
    expect(() => diode.assemble(context)).not.toThrow();
    
    // Check that matrix has been modified
    expect(matrix.get(1, 1)).not.toBe(0);
  });
  
  it('should assemble NMOS', () => {
    const nmos = NgDeviceFactory.createNMOS('M1', '2', '1', '0', '0', {
      VTO: 1.0,
      KP: 100e-6
    });
    
    const nodeMap = new Map<string, number>([
      ['0', 0],
      ['1', 1],  // Gate
      ['2', 2],  // Drain
    ]);
    
    const matrix = new SparseMatrix(3, 3);
    const rhs = new Vector(3);
    const solution = new Vector(3);
    solution.set(1, 3.0);  // VGS = 3V
    solution.set(2, 2.0);  // VDS = 2V
    
    const context: AssemblyContext = {
      matrix,
      rhs,
      nodeMap,
      currentTime: 0,
      dt: 0.001,
      solutionVector: solution,
      gmin: 1e-12
    };
    
    // Should not throw
    expect(() => nmos.assemble(context)).not.toThrow();
  });
  
  it('should compute diode current', () => {
    const diode = NgDeviceFactory.createDiode('D1', '1', '0');
    
    const nodeMap = new Map<string, number>([
      ['0', 0],
      ['1', 1],
    ]);
    
    const voltages = new Vector(2);
    voltages.set(1, 0.7);  // Forward bias
    
    const context: AssemblyContext = {
      matrix: new SparseMatrix(2, 2),
      rhs: new Vector(2),
      nodeMap,
      currentTime: 0,
      dt: 0.001,
      gmin: 1e-12
    };
    
    const current = diode.computeCurrent(voltages, context);
    
    // Forward biased diode should conduct
    expect(current).toBeGreaterThan(0);
    expect(current).toBeLessThan(1);  // Should be reasonable
  });
  
  it('should compute MOSFET current', () => {
    const nmos = NgDeviceFactory.createNMOS('M1', '2', '1', '0', '0', {
      VTO: 1.0,
      KP: 100e-6,
      W: 10e-6,
      L: 1e-6
    });
    
    const nodeMap = new Map<string, number>([
      ['0', 0],
      ['1', 1],
      ['2', 2],
    ]);
    
    const voltages = new Vector(3);
    voltages.set(1, 3.0);  // VGS = 3V (above threshold)
    voltages.set(2, 2.0);  // VDS = 2V
    
    const context: AssemblyContext = {
      matrix: new SparseMatrix(3, 3),
      rhs: new Vector(3),
      nodeMap,
      currentTime: 0,
      dt: 0.001,
      gmin: 1e-12
    };
    
    const current = nmos.computeCurrent(voltages, context);
    
    // MOSFET in saturation should conduct
    expect(current).toBeGreaterThan(0);
  });
  
  it('should show diode blocking in reverse bias', () => {
    const diode = NgDeviceFactory.createDiode('D1', '1', '0');
    
    const nodeMap = new Map<string, number>([
      ['0', 0],
      ['1', 1],
    ]);
    
    const voltages = new Vector(2);
    voltages.set(1, -1.0);  // Reverse bias
    
    const context: AssemblyContext = {
      matrix: new SparseMatrix(2, 2),
      rhs: new Vector(2),
      nodeMap,
      currentTime: 0,
      dt: 0.001,
      gmin: 1e-12
    };
    
    const current = diode.computeCurrent(voltages, context);
    
    // Reverse biased diode should have very small current
    expect(Math.abs(current)).toBeLessThan(1e-6);
  });
  
  it('should show MOSFET cutoff below threshold', () => {
    const nmos = NgDeviceFactory.createNMOS('M1', '2', '1', '0', '0', {
      VTO: 1.0,
      KP: 100e-6,
      W: 10e-6,
      L: 1e-6
    });
    
    const nodeMap = new Map<string, number>([
      ['0', 0],
      ['1', 1],
      ['2', 2],
    ]);
    
    const voltages = new Vector(3);
    voltages.set(1, 0.5);  // VGS = 0.5V (below threshold 1.0V)
    voltages.set(2, 2.0);  // VDS = 2V
    
    const context: AssemblyContext = {
      matrix: new SparseMatrix(3, 3),
      rhs: new Vector(3),
      nodeMap,
      currentTime: 0,
      dt: 0.001,
      gmin: 1e-12
    };
    
    const current = nmos.computeCurrent(voltages, context);
    
    // MOSFET below threshold should be off
    expect(Math.abs(current)).toBeLessThan(1e-9);
  });
});
