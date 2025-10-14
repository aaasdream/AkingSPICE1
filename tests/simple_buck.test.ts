/**
 * 🎯 超簡化 Buck 轉換器測試
 * 
 * 策略：先驗證最基本的 DC 穩態，再逐步加入 PWM
 */

import { describe, expect, test } from 'vitest';
import { CircuitSimulationEngine } from '../src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from '../src/components/sources/voltage_source';
import { Resistor } from '../src/components/passive/resistor';
import { Capacitor } from '../src/components/passive/capacitor';

describe('🚀 超簡化 Buck 轉換器', () => {
  
  test('🔥 測試 1：純 DC 12V → RC 濾波器穩態', async () => {
    // 最簡單測試：純 12V DC 輸入，檢查 RC 濾波後的穩態
    const engine = new CircuitSimulationEngine({
      endTime: 100e-6,
      initialTimeStep: 1e-6,
      maxTimeStep: 5e-6,
      minTimeStep: 100e-9,
    });
    
    // 純 DC 12V，無 PWM
    engine.addDevice(new VoltageSource('Vin', ['n2', '0'], 12));
    engine.addDevice(new Resistor('R1', ['n2', 'n3'], 0.1));
    engine.addDevice(new Capacitor('C1', ['n3', '0'], 100e-6));
    engine.addDevice(new Resistor('Rload', ['n3', '0'], 10));
    
    const result = await engine.runSimulation();
    
    expect(result.success).toBe(true);
    expect(result.finalTime).toBeGreaterThan(50e-6);
    
    // 穩態應該接近 12V (電容充滿)
    const n3_id = engine.getNodeIdByName('n3');
    if (n3_id !== undefined) {
      const voltages = result.waveformData.nodeVoltages.get(n3_id);
      if (voltages && voltages.length > 0) {
        const finalVoltage = voltages[voltages.length - 1];
        console.log(`      >>> DC 12V 穩態輸出: ${finalVoltage.toFixed(3)}V (預期 ~12V)`);
        expect(finalVoltage).toBeGreaterThan(11.5);
        expect(finalVoltage).toBeLessThan(12.5);
      }
    }
  });
});
