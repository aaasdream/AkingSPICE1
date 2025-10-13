/**
 * 🐛 Debug Matrix Assembly
 */

import { describe, test } from 'vitest';
import { CircuitSimulationEngine } from '../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../src/components/passive/resistor';
import { VoltageSource } from '../../src/components/sources/voltage_source';

describe('Matrix Assembly Debug', () => {
  test('should show matrix structure for simple resistor circuit', async () => {
    const engine = new CircuitSimulationEngine({
      endTime: 1e-6,
      initialTimeStep: 1e-7,
      maxTimeStep: 1e-6,
      minTimeStep: 1e-9,
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
    engine.addDevice(new Resistor('R2', ['n2', '0'], 2000));
    
    try {
      // This will fail but let us see the matrix structure
      await engine.runSimulation();
    } catch (error) {
      console.log('Error (expected):', error);
    }
    
    console.log('\n📊 Matrix structure logged above');
  });
});
