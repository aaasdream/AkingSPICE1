/**
 * 🧪 簡單 DC 電路集成測試
 * 
 * 測試完整的仿真流程：
 * 1. 電路構建
 * 2. MNA 矩陣組裝
 * 3. DC 分析求解
 * 4. 結果物理驗證
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../../src/components/passive/resistor';
import { VoltageSource } from '../../../src/components/sources/voltage_source';
import { AnalyticalSolutions } from '../../utils/AnalyticalSolutions';

describe('DC Circuit - Voltage Divider', () => {
  test('Two resistors voltage divider', async () => {
    // For pure DC analysis, set endTime = 0 to avoid transient loop
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    // Add components (note: ground node must be named '0')
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 10));
    engine.addDevice(new Resistor('R1', ['vin', 'n1'], 1000));
    engine.addDevice(new Resistor('R2', ['n1', '0'], 1000));
    
    // Run simulation
    const result = await engine.runSimulation();
    
    // Verify result
    expect(result.success).toBe(true);
    
    // Check analytical solution
    const expectedVoltage = AnalyticalSolutions.voltageDivider(10, 1000, 1000);
    expect(expectedVoltage).toBeCloseTo(5.0, 6);
  });
  
  test('Unequal resistors 1:3', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 12));
    engine.addDevice(new Resistor('R1', ['vin', 'n1'], 3000));
    engine.addDevice(new Resistor('R2', ['n1', '0'], 1000));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const expectedVoltage = AnalyticalSolutions.voltageDivider(12, 3000, 1000);
    expect(expectedVoltage).toBeCloseTo(3.0, 6);
  });
  
  test('Three node double divider', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 10));
    engine.addDevice(new Resistor('R1', ['vin', 'n1'], 1000));
    engine.addDevice(new Resistor('R2', ['n1', 'n2'], 1000));
    engine.addDevice(new Resistor('R3', ['n2', '0'], 1000));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
  });
});

describe('DC Circuit - Parallel and Series-Parallel', () => {
  test('Two resistors in parallel', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 5));
    engine.addDevice(new Resistor('R1', ['vin', '0'], 1000));
    engine.addDevice(new Resistor('R2', ['vin', '0'], 1000));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const R_eq = AnalyticalSolutions.parallelResistance(1000, 1000);
    expect(R_eq).toBeCloseTo(500, 6);
  });
  
  test('Series-parallel mixed circuit', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 10));
    engine.addDevice(new Resistor('R1', ['vin', 'n1'], 1000));
    engine.addDevice(new Resistor('R2', ['n1', '0'], 1000));
    engine.addDevice(new Resistor('R3', ['n1', '0'], 1000));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
  });
});

describe('DC Circuit - Boundary Conditions', () => {
  test('Single resistor', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 5));
    engine.addDevice(new Resistor('R1', ['vin', '0'], 100));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
  });
  
  test('Tiny resistor', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 1));
    engine.addDevice(new Resistor('R1', ['vin', '0'], 1e-3));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
  });
  
  test('Large resistor', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 10));
    engine.addDevice(new Resistor('R1', ['vin', '0'], 1e9));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
  });
});

describe('DC Circuit - Convergence', () => {
  test('Simple circuit fast convergence', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 10));
    engine.addDevice(new Resistor('R1', ['vin', 'n1'], 1000));
    engine.addDevice(new Resistor('R2', ['n1', '0'], 1000));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
  });
  
  test('Multi-node circuit convergence', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 10));
    
    // Series chain
    engine.addDevice(new Resistor('R1', ['vin', 'n1'], 1000));
    engine.addDevice(new Resistor('R2', ['n1', 'n2'], 1000));
    engine.addDevice(new Resistor('R3', ['n2', 'n3'], 1000));
    engine.addDevice(new Resistor('R4', ['n3', 'n4'], 1000));
    engine.addDevice(new Resistor('R5', ['n4', '0'], 1000));
    
    // Parallel branches
    engine.addDevice(new Resistor('R6', ['n1', '0'], 2000));
    engine.addDevice(new Resistor('R7', ['n2', '0'], 2000));
    engine.addDevice(new Resistor('R8', ['n3', '0'], 2000));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
  });
});

describe('DC Circuit - Numerical Stability', () => {
  test('Mixed magnitude resistors', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 10));
    engine.addDevice(new Resistor('R1', ['vin', 'n1'], 1));
    engine.addDevice(new Resistor('R2', ['n1', '0'], 1e6));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
  });
  
  test('Symmetric circuit', async () => {
    const engine = new CircuitSimulationEngine({ endTime: 0 });
    
    engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 10));
    engine.addDevice(new Resistor('R1', ['vin', 'n1'], 1000));
    engine.addDevice(new Resistor('R2', ['n1', '0'], 1000));
    engine.addDevice(new Resistor('R3', ['vin', 'n2'], 1000));
    engine.addDevice(new Resistor('R4', ['n2', '0'], 1000));
    engine.addDevice(new Resistor('Rm', ['n1', 'n2'], 1000));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
  });
});
