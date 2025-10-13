/**
 * 🐛 Debug Matrix Structure
 */

import { describe, test } from 'vitest';
import { CircuitSimulationEngine } from '../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../src/components/passive/resistor';
import { VoltageSource } from '../../src/components/sources/voltage_source';

describe('Matrix Structure Debug', () => {
  test('should print matrix structure', async () => {
    const engine = new CircuitSimulationEngine({
      endTime: 0, // DC only first
      initialTimeStep: 1e-6,
      maxTimeStep: 1e-5,
      minTimeStep: 1e-7,
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
    engine.addDevice(new Resistor('R2', ['n2', '0'], 2000));
    
    const result = await engine.runSimulation();
    
    console.log('\n📊 DC Analysis Result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Node n1 voltage: ${result.waveformData.nodeVoltages.get(engine.getNodeIdByName('n1')!)?.[0]}V`);
    console.log(`   Node n2 voltage: ${result.waveformData.nodeVoltages.get(engine.getNodeIdByName('n2')!)?.[0]}V`);
  });
});
