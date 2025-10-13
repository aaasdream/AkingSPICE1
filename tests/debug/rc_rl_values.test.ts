/**
 * 🐛 Debug RC Circuit - Check actual voltage values
 */

import { describe, test } from 'vitest';
import { CircuitSimulationEngine } from '../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../src/components/passive/resistor';
import { Capacitor } from '../../src/components/passive/capacitor';
import { Inductor } from '../../src/components/passive/inductor';
import { VoltageSource } from '../../src/components/sources/voltage_source';

describe('Debug RC Voltage Values', () => {
  test('should show actual RC voltage at tau', async () => {
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
    
    console.log('🔍 RC Circuit Analysis:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Final time: ${result.finalTime}`);
    console.log(`   Total steps: ${result.totalSteps}`);
    console.log(`   Time constant τ = RC = ${tau}s`);
    console.log(`   Expected voltage at τ: ${5 * 0.632}V (63.2%)`);
    
    const nodeId = engine.getNodeIdByName('n2');
    if (nodeId !== undefined) {
      const voltages = result.waveformData.nodeVoltages.get(nodeId);
      const times = result.waveformData.timePoints;
      
      if (voltages && times) {
        console.log(`\n📊 Voltage progression:`);
        
        // Show first few points
        console.log(`   t=0: ${voltages[0]?.toFixed(6)}V`);
        if (voltages.length > 5) {
          console.log(`   t=${times[5]?.toExponential(3)}: ${voltages[5]?.toFixed(6)}V`);
        }
        if (voltages.length > 10) {
          console.log(`   t=${times[10]?.toExponential(3)}: ${voltages[10]?.toFixed(6)}V`);
        }
        
        // Show final point
        const finalIdx = voltages.length - 1;
        console.log(`   t=${times[finalIdx]?.toExponential(3)}: ${voltages[finalIdx]?.toFixed(6)}V`);
        
        // Calculate percentage
        const finalVoltage = voltages[finalIdx] || 0;
        const percentage = (finalVoltage / 5) * 100;
        console.log(`\n✅ Final voltage: ${finalVoltage.toFixed(6)}V (${percentage.toFixed(1)}%)`);
        console.log(`   Expected: 3.16V (63.2%)`);
        console.log(`   Difference: ${(finalVoltage - 3.16).toFixed(6)}V`);
      }
    }
  });
  
  test('should show RL current at tau', async () => {
    const tau = 1e-3;
    
    const engine = new CircuitSimulationEngine({
      endTime: tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 200,
    });
    
    const L1 = new Inductor('L1', ['n1', 'n2'], 1);
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(L1);
    engine.addDevice(new Resistor('R1', ['n2', '0'], 1000));
    
    const result = await engine.runSimulation();
    
    console.log('\n🔍 RL Circuit Analysis:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Final time: ${result.finalTime}`);
    console.log(`   Total steps: ${result.totalSteps}`);
    console.log(`   Time constant τ = L/R = ${tau}s`);
    console.log(`   Expected current at τ: ${10/1000 * 0.632}A (63.2%)`);
    
    const currents = result.waveformData.deviceCurrents.get(L1.name);
    const times = result.waveformData.timePoints;
    
    if (currents && times) {
      console.log(`\n📊 Current progression:`);
      
      // Show first few points
      console.log(`   t=0: ${currents[0]?.toFixed(6)}A`);
      if (currents.length > 5) {
        console.log(`   t=${times[5]?.toExponential(3)}: ${currents[5]?.toFixed(6)}A`);
      }
      if (currents.length > 10) {
        console.log(`   t=${times[10]?.toExponential(3)}: ${currents[10]?.toFixed(6)}A`);
      }
      
      // Show final point
      const finalIdx = currents.length - 1;
      console.log(`   t=${times[finalIdx]?.toExponential(3)}: ${currents[finalIdx]?.toFixed(6)}A`);
      
      // Calculate percentage
      const finalCurrent = currents[finalIdx] || 0;
      const expectedFinal = 10 / 1000;
      const percentage = (finalCurrent / expectedFinal) * 100;
      console.log(`\n✅ Final current: ${finalCurrent.toFixed(6)}A (${percentage.toFixed(1)}%)`);
      console.log(`   Expected: ${(expectedFinal * 0.632).toFixed(6)}A (63.2%)`);
      console.log(`   Difference: ${(finalCurrent - expectedFinal * 0.632).toFixed(6)}A`);
    }
  });
});
