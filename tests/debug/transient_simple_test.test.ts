/**
 * 🐛 Debug: Simple Transient Test
 * 
 * Minimal test to isolate the DC convergence issue in transient simulation
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../src/components/passive/resistor';
import { VoltageSource } from '../../src/components/sources/voltage_source';

describe('Debug: Transient Initialization', () => {
  test('should initialize transient simulation with resistors only', async () => {
    // Simplest possible transient circuit: V-R-GND
    const engine = new CircuitSimulationEngine({
      endTime: 1e-3,  // 1ms
      initialTimeStep: 1e-6,
      maxTimeStep: 1e-5,
      minTimeStep: 1e-9,
      verboseLogging: true,  // Enable verbose logging
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', '0'], 1000));
    
    console.log('🚀 Starting simulation...');
    const result = await engine.runSimulation();
    console.log('🏁 Simulation ended');
    
    console.log('Simulation result:', result.success);
    console.log('Error message:', result.errorMessage);
    console.log('Final time:', result.finalTime);
    console.log('Total steps:', result.totalSteps);
    console.log('Time points:', result.waveformData?.timePoints?.length || 0);
    
    expect(result.success).toBe(true);
  });

  test('should handle DC-only simulation (endTime = 0)', async () => {
    const engine = new CircuitSimulationEngine({
      endTime: 0,  // DC only
    });
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', '0'], 1000));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    console.log('✅ DC-only simulation works');
  });
});
