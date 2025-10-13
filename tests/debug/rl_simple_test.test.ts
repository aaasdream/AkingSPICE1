/**
 * 🧪 RL 簡單電路調試測試
 * 
 * 測試電感電流是否被正確記錄
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from '../../src/components/sources/voltage_source';
import { Resistor } from '../../src/components/passive/resistor';
import { Inductor } from '../../src/components/passive/inductor';

describe('Debug: Simple RL Circuit', () => {
  test('should simulate simple RL current rise', async () => {
    // τ = L/R = 10mH / 100Ω = 100μs
    const tau = 100e-6;
    
    const engine = new CircuitSimulationEngine({
      endTime: 5 * tau,
      initialTimeStep: tau / 100,
      maxTimeStep: tau / 50,
      minTimeStep: tau / 200,
      verboseLogging: false, // 先關閉詳細日誌,只看結果
    });
    
    const L1 = new Inductor('L1', ['n2', '0'], 10e-3); // 10mH
    
    engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
    engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
    engine.addDevice(L1);
    
    console.log('🚀 Starting RL simulation...');
    const result = await engine.runSimulation();
    console.log('🏁 Simulation ended');
    
    console.log(`Result success: ${result.success}`);
    if (result.errorMessage) {
      console.log(`Error message: ${result.errorMessage}`);
      console.log(`Full error:`, result.errorMessage);
    }
    console.log(`Final time: ${result.finalTime}`);
    console.log(`Total steps: ${result.totalSteps}`);
    console.log(`Time points: ${result.waveformData.timePoints.length}`);
    
    // Check if device currents were recorded
    console.log(`\nDevice currents recorded: ${result.waveformData.deviceCurrents.size}`);
    for (const [deviceId, currents] of result.waveformData.deviceCurrents) {
      console.log(`  ${deviceId}: ${currents.length} points`);
      if (currents.length > 0) {
        console.log(`    Initial: ${currents[0].toExponential(4)}`);
        console.log(`    Final: ${currents[currents.length - 1].toExponential(4)}`);
      }
    }
    
    expect(result.success).toBe(true);
    
    // Get inductor current from device currents
    const currents = result.waveformData.deviceCurrents.get(L1.name);
    
    console.log(`\nInductor current array exists: ${currents !== undefined}`);
    expect(currents).toBeDefined();
    
    if (currents) {
      const times = result.waveformData.timePoints;
      const If = 10 / 100; // Final current 0.1A
      
      console.log('\n📊 電流隨時間變化:');
      // 檢查幾個關鍵時間點
      for (let k = 1; k <= 5; k++) {
        const targetTime = k * tau;
        let closestIdx = 0;
        let minDiff = Math.abs(times[0] - targetTime);
        
        for (let j = 1; j < times.length; j++) {
          const diff = Math.abs(times[j] - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = j;
          }
        }
        
        const current = currents[closestIdx] || 0;
        const expected = If * (1 - Math.exp(-k));
        const errorPercent = Math.abs(current - expected) / expected * 100;
        
        console.log(`t=${k}τ (${targetTime * 1e6}μs): I=${current.toFixed(6)}A, expected=${expected.toFixed(6)}A, error=${errorPercent.toFixed(2)}%`);
      }
      
      const finalCurrent = currents[currents.length - 1] || 0;
      const expectedFinal = If * (1 - Math.exp(-5));
      console.log(`\nFinal current: ${finalCurrent.toExponential(4)}`);
      console.log(`Expected final: ${expectedFinal.toExponential(4)} A`);
      
      // At 5τ, current should be ~99% of final value (V/R = 10/100 = 0.1A)
      expect(finalCurrent).toBeGreaterThan(0.095); // > 95% of 0.1A
      expect(finalCurrent).toBeLessThan(0.105);    // < 105% of 0.1A
    }
  });
});
