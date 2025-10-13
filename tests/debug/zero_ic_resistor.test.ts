/**
 * 🐛 Test Zero IC with pure resistor circuit
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../src/components/passive/resistor';
import { VoltageSource } from '../../src/components/sources/voltage_source';

describe('Zero IC Resistor Test', () => {
  test('should work with resistor-only transient from zero IC', async () => {
    const engine = new CircuitSimulationEngine({
      endTime: 1e-3,
      initialTimeStep: 10e-6,
      maxTimeStep: 100e-6,
      minTimeStep: 1e-6,
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 5));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
    engine.addDevice(new Resistor('R2', ['n2', '0'], 1000));
    
    const result = await engine.runSimulation();
    
    console.log(`Success: ${result.success}, Steps: ${result.totalSteps}, Final time: ${result.finalTime}`);
    
    expect(result.success).toBe(true);
    expect(result.totalSteps).toBeGreaterThan(0);
  });
});
