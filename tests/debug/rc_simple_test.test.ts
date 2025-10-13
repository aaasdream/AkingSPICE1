/**
 * 🐛 Debug: Simple RC Circuit Test
 * 
 * Minimal test to isolate RC charging issue
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../src/components/passive/resistor';
import { Capacitor } from '../../src/components/passive/capacitor';
import { VoltageSource } from '../../src/components/sources/voltage_source';

describe('Debug: Simple RC Circuit', () => {
  test('should simulate simple RC charging circuit', async () => {
    // Circuit: V1 (10V) -- R1 (1kΩ) -- C1 (1μF) -- GND
    // Time constant: τ = RC = 1ms
    const tau = 1e-3;
    
    const engine = new CircuitSimulationEngine({
      endTime: 5 * tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 200,
      voltageToleranceAbs: 1e-3,  // More reasonable tolerance for this test
      verboseLogging: true,  // Enable verbose to see what's happening
    });
    
    const V1 = new VoltageSource('V1', ['n1', '0'], 10);
    const R1 = new Resistor('R1', ['n1', 'n2'], 1000);
    const C1 = new Capacitor('C1', ['n2', '0'], 1e-6);
    
    engine.addDevice(V1);
    engine.addDevice(R1);
    engine.addDevice(C1);
    
    console.log('🚀 Starting RC simulation...');
    const result = await engine.runSimulation();
    console.log('🏁 Simulation ended');
    
    console.log('Result success:', result.success);
    console.log('Error message:', result.errorMessage);
    console.log('Final time:', result.finalTime);
    console.log('Total steps:', result.totalSteps);
    console.log('Time points:', result.waveformData?.timePoints?.length || 0);
    
    if (result.success) {
      const nodeId = engine.getNodeIdByName('n2');
      const timePoints = result.waveformData.timePoints;
      
      if (nodeId !== undefined && timePoints) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        
        if (voltages && voltages.length > 0) {
          console.log('\n📊 電壓變化分析:');
          console.log('Initial voltage:', voltages[0], 'V');
          
          // 找到每個時間常數的電壓
          for (let i = 1; i <= 5; i++) {
            const targetTime = i * tau;
            // 找到最接近的時間點
            let closestIdx = 0;
            let minDiff = Infinity;
            for (let j = 0; j < timePoints.length; j++) {
              const t = timePoints[j];
              if (t !== undefined) {
                const diff = Math.abs(t - targetTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestIdx = j;
                }
              }
            }
            
            const actualV = voltages[closestIdx];
            if (actualV !== undefined) {
              const expectedV = 10 * (1 - Math.exp(-i));
              const errorPercent = Math.abs(actualV - expectedV) / expectedV * 100;
              
              console.log(`t=${i}τ (${targetTime*1000}ms): V=${actualV.toFixed(4)}V, expected=${expectedV.toFixed(4)}V, error=${errorPercent.toFixed(2)}%`);
            }
          }
          
          console.log('\nFinal voltage:', voltages[voltages.length - 1], 'V');
          console.log('Expected final:', 10 * (1 - Math.exp(-5)), 'V');
        }
      }
    }
    
    expect(result.success).toBe(true);
  });
});
