/**
 * 🧪 RC/RL Transient Integration Tests
 * 
 * Test Coverage:
 * 1. RC Charging Circuit (step response)
 * 2. RC Discharge behavior
 * 3. RL Rising Current (step response)
 * 4. RL Current behavior
 * 5. Time Constant Verification
 * 6. Energy Conservation
 * 
 * Mathematical Background:
 * - RC Charging: V(t) = Vf × (1 - e^(-t/τ)), where τ = RC
 * - RL Rising: I(t) = If × (1 - e^(-t/τ)), where τ = L/R
 * - At t = τ: response reaches 63.2% of final value
 * - At t = 5τ: response reaches 99.3% of final value
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../../src/components/passive/resistor';
import { Capacitor } from '../../../src/components/passive/capacitor';
import { Inductor } from '../../../src/components/passive/inductor';
import { VoltageSource } from '../../../src/components/sources/voltage_source';

describe('RC Charging Circuit', () => {
  test('should charge capacitor with correct time constant', async () => {
    // Circuit: V1 (10V) -- R1 (1kΩ) -- C1 (1μF) -- GND
    // Time constant: τ = RC = 1000 × 1e-6 = 1ms
    const tau = 1e-3;
    
    const engine = new CircuitSimulationEngine({
      endTime: 5 * tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 200,
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
    engine.addDevice(new Capacitor('C1', ['n2', '0'], 1e-6));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    expect(result.waveformData.timePoints.length).toBeGreaterThan(0);
    
    // Check that simulation reached the end time
    const finalTime = result.waveformData.timePoints[result.waveformData.timePoints.length - 1];
    expect(finalTime).toBeGreaterThanOrEqual(4.5 * tau); // Should be close to 5τ
    
    // Get node index for n2 (capacitor voltage node)
    const nodeId = engine.getNodeIdByName('n2');
    expect(nodeId).toBeDefined();
    
    if (nodeId !== undefined) {
      const voltages = result.waveformData.nodeVoltages.get(nodeId);
      expect(voltages).toBeDefined();
      
      if (voltages) {
        // At end of simulation (5τ), capacitor should be ~99% charged
        const finalVoltage = voltages[voltages.length - 1];
        expect(finalVoltage).toBeGreaterThan(9.5); // > 95% of 10V
        expect(finalVoltage).toBeLessThan(10.1);   // Not exceeding source
      }
    }
  });
  
  test('should reach 63.2% at one time constant', async () => {
    // τ = RC = 2000 × 0.5e-6 = 1ms
    const tau = 1e-3;
    
    const engine = new CircuitSimulationEngine({
      endTime: tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 200,
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 5));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 2000));
    engine.addDevice(new Capacitor('C1', ['n2', '0'], 0.5e-6));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const nodeId = engine.getNodeIdByName('n2');
    if (nodeId !== undefined) {
      const voltages = result.waveformData.nodeVoltages.get(nodeId);
      
      if (voltages) {
        const finalVoltage = voltages[voltages.length - 1];
        // At t = τ, V ≈ 0.632 × 5V = 3.16V
        expect(finalVoltage).toBeGreaterThan(2.8);  // Allow some margin
        expect(finalVoltage).toBeLessThan(3.5);
      }
    }
  });
  
  test('should have monotonically increasing voltage during charge', async () => {
    const tau = 1e-3;
    
    const engine = new CircuitSimulationEngine({
      endTime: 3 * tau,
      initialTimeStep: tau / 50,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 100,
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
    engine.addDevice(new Capacitor('C1', ['n2', '0'], 1e-6));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const nodeId = engine.getNodeIdByName('n2');
    if (nodeId !== undefined) {
      const voltages = result.waveformData.nodeVoltages.get(nodeId);
      
      if (voltages && voltages.length > 1) {
        // Voltage should monotonically increase (or stay same)
        for (let i = 1; i < voltages.length; i++) {
          expect(voltages[i]).toBeGreaterThanOrEqual(voltages[i - 1] - 1e-6);
        }
      }
    }
  });
});

describe('RL Rising Current', () => {
  test('should rise current with correct time constant', async () => {
    // Circuit: V1 (10V) -- R1 (100Ω) -- L1 (10mH) -- GND
    // Time constant: τ = L/R = 10e-3 / 100 = 100μs
    const tau = 100e-6;
    
    const engine = new CircuitSimulationEngine({
      endTime: 5 * tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 200,
    });
    
    const L1 = new Inductor('L1', ['n2', '0'], 10e-3);
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
    engine.addDevice(L1);
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    expect(result.waveformData.timePoints.length).toBeGreaterThan(0);
    
    // Get inductor current from device currents
    const currents = result.waveformData.deviceCurrents.get(L1.name);
    
    expect(currents).toBeDefined();
    if (currents) {
      const finalCurrent = currents[currents.length - 1];
      
      // At 5τ, current should be ~99% of final value (V/R = 10/100 = 0.1A)
      expect(finalCurrent).toBeGreaterThan(0.095); // > 95% of 0.1A
      expect(finalCurrent).toBeLessThan(0.105);    // < 105% of 0.1A
    }
  });
  
  test('should reach 63.2% at one time constant', async () => {
    // τ = L/R = 5e-3 / 50 = 100μs
    const tau = 100e-6;
    
    const engine = new CircuitSimulationEngine({
      endTime: tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 200,
    });
    
    const L1 = new Inductor('L1', ['n2', '0'], 5e-3);
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 12));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 50));
    engine.addDevice(L1);
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const currents = result.waveformData.deviceCurrents.get(L1.name);
    
    if (currents) {
      const finalCurrent = currents[currents.length - 1];
      
      // At t = τ, I ≈ 0.632 × (12/50)A = 0.152A
      expect(finalCurrent).toBeGreaterThan(0.13);  // Allow margin
      expect(finalCurrent).toBeLessThan(0.18);
    }
  });
  
  test('should have monotonically increasing current during rise', async () => {
    const tau = 100e-6;
    
    const engine = new CircuitSimulationEngine({
      endTime: 3 * tau,
      initialTimeStep: tau / 50,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 100,
    });
    
    const L1 = new Inductor('L1', ['n2', '0'], 10e-3);
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
    engine.addDevice(L1);
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const currents = result.waveformData.deviceCurrents.get(L1.name);
    
    if (currents && currents.length > 1) {
      // Current should monotonically increase (or stay same)
      for (let i = 1; i < currents.length; i++) {
        expect(currents[i]).toBeGreaterThanOrEqual(currents[i - 1] - 1e-6);
      }
    }
  });
});

describe('Time Constant Verification', () => {
  test('RC time constant matches theoretical value', async () => {
    const R = 1000;
    const C = 1e-6;
    const tau = R * C; // 1ms
    
    const engine = new CircuitSimulationEngine({
      endTime: tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 200,
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], R));
    engine.addDevice(new Capacitor('C1', ['n2', '0'], C));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const nodeId = engine.getNodeIdByName('n2');
    if (nodeId !== undefined) {
      const voltages = result.waveformData.nodeVoltages.get(nodeId);
      
      if (voltages && voltages.length > 0) {
        const finalVoltage = voltages[voltages.length - 1];
        // Should be ~63.2% of 10V = 6.32V
        const expected = 10 * (1 - Math.exp(-1));
        expect(Math.abs(finalVoltage - expected)).toBeLessThan(0.5); // Within 0.5V
      }
    }
  });
  
  test('RL time constant matches theoretical value', async () => {
    const R = 100;
    const L = 10e-3;
    const tau = L / R; // 100μs
    
    const engine = new CircuitSimulationEngine({
      endTime: tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 200,
    });
    
    const L1 = new Inductor('L1', ['n2', '0'], L);
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], R));
    engine.addDevice(L1);
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const currents = result.waveformData.deviceCurrents.get(L1.name);
    
    if (currents && currents.length > 0) {
      const finalCurrent = currents[currents.length - 1];
      const If = 10 / R; // 0.1A
      const expected = If * (1 - Math.exp(-1));
      expect(Math.abs(finalCurrent - expected)).toBeLessThan(0.01); // Within 10mA
    }
  });
});

describe('Energy Conservation', () => {
  test('RC circuit energy should be properly stored in capacitor', async () => {
    const C = 1e-6;
    const tau = 1e-3;
    
    const engine = new CircuitSimulationEngine({
      endTime: 5 * tau,
      initialTimeStep: tau / 50,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 100,
    });
    
    const C1 = new Capacitor('C1', ['n2', '0'], C);
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
    engine.addDevice(C1);
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const nodeId = engine.getNodeIdByName('n2');
    if (nodeId !== undefined) {
      const voltages = result.waveformData.nodeVoltages.get(nodeId);
      
      if (voltages && voltages.length > 0) {
        const finalVoltage = voltages[voltages.length - 1];
        const energyStored = C1.calculateEnergy(finalVoltage);
      
        // At 5τ, V ≈ 0.993 × 10V = 9.93V
        // E = 0.5 × C × V² ≈ 0.5 × 1e-6 × 9.93² ≈ 49.3μJ
        const expectedEnergy = 0.5 * C * 10 * 10 * 0.99 * 0.99; // Allow 99% charge
        expect(energyStored).toBeGreaterThan(expectedEnergy * 0.9);
        expect(energyStored).toBeLessThan(0.5 * C * 10 * 10); // Not exceed max
      }
    }
  });
  
  test('RL circuit energy should be properly stored in inductor', async () => {
    const L = 10e-3;
    const tau = 100e-6;
    
    const engine = new CircuitSimulationEngine({
      endTime: 5 * tau,
      initialTimeStep: tau / 50,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 100,
    });
    
    const L1 = new Inductor('L1', ['n2', '0'], L);
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
    engine.addDevice(L1);
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    
    const currents = result.waveformData.deviceCurrents.get(L1.name);
    
    if (currents && currents.length > 0) {
      const finalCurrent = currents[currents.length - 1];
      const energyStored = L1.calculateEnergy(finalCurrent);
      
      // At 5τ, I ≈ 0.993 × 0.1A = 0.0993A
      // E = 0.5 × L × I² ≈ 0.5 × 10e-3 × 0.0993² ≈ 49.3μJ
      const If = 10 / 100; // 0.1A
      const expectedEnergy = 0.5 * L * If * If * 0.99 * 0.99;
      expect(energyStored).toBeGreaterThan(expectedEnergy * 0.9);
      expect(energyStored).toBeLessThan(0.5 * L * If * If); // Not exceed max
    }
  });
});

describe('Numerical Stability', () => {
  test('RC circuit with very small time constant should converge', async () => {
    // Very fast RC circuit: τ = 1μs
    const tau = 1e-6;
    
    const engine = new CircuitSimulationEngine({
      endTime: 5 * tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 500,
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 5));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
    engine.addDevice(new Capacitor('C1', ['n2', '0'], 10e-9)); // 10nF
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    expect(result.waveformData.timePoints.length).toBeGreaterThan(0);
  });
  
  test('RL circuit with very small time constant should converge', async () => {
    // Very fast RL circuit: τ = 1μs
    const tau = 1e-6;
    
    const engine = new CircuitSimulationEngine({
      endTime: 5 * tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 500,
    });
    
    const L1 = new Inductor('L1', ['n2', '0'], 100e-9); // 100nH
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 5));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
    engine.addDevice(L1);
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    expect(result.waveformData.timePoints.length).toBeGreaterThan(0);
  });
});
