/**
 * 矩陣診斷測試 - 檢查為什麼求解器失敗
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';

console.log('=== 矩陣診斷測試 ===\n');

// 測試 1：只有電壓源和電阻（已確認成功）
console.log('測試 1：V1(5V) -> R1(1k) -> GND (線性電路)\n');

(async () => {
  try {
    const v1 = new VoltageSource('V1', ['n1', '0'], 5.0);
    const r1 = new Resistor('R1', ['n1', '0'], 1000);

    const engine = new CircuitSimulationEngine({
      endTime: 0,
      maxNewtonIterations: 10,
      voltageToleranceAbs: 1e-3,
      verboseLogging: false
    });
    
    engine.addDevice(v1);
    engine.addDevice(r1);
    
    const result = await engine.runSimulation();
    console.log(result.success ? '✅ 測試 1 成功\n' : '❌ 測試 1 失敗\n');
  } catch (error: any) {
    console.error('❌ 測試 1 異常:', error.message, '\n');
  }

  // 測試 2：帶二極體的簡單電路
  console.log('測試 2：V1(5V) -> D1 -> R1(1k) -> GND (非線性電路)\n');
  
  try {
    const v1 = new VoltageSource('V1', ['n1', '0'], 5.0);
    const d1 = NgDeviceFactory.createDiode('D1', 'n1', 'n2', {
      IS: 1e-12,      // 非常大的飽和電流（更容易導通）
      N: 2.0,         // 大理想因子（降低靈敏度）
      RS: 10,         // 大串聯電阻（增加穩定性）
    });
    const r1 = new Resistor('R1', ['n2', '0'], 1000);

    const engine2 = new CircuitSimulationEngine({
      endTime: 0,
      maxNewtonIterations: 20,  // 給非線性電路更多迭代
      voltageToleranceAbs: 1e-3,
      currentToleranceAbs: 1e-6,
      verboseLogging: false
    });
    
    engine2.addDevice(v1);
    engine2.addDevice(d1);
    engine2.addDevice(r1);

    console.log('開始 DC 分析（非線性電路）...');
    const result2 = await engine2.runSimulation();
    
    if (result2.success) {
      console.log('✅ 測試 2 成功！\n');
      
      // 檢查結果
      const nodeMapping = (engine2 as any)['_nodeMapping'];
      const n1Idx = nodeMapping.get('n1');
      const n2Idx = nodeMapping.get('n2');
      
      const v_n1 = result2.waveformData.nodeVoltages.get(n1Idx)?.[0] || 0;
      const v_n2 = result2.waveformData.nodeVoltages.get(n2Idx)?.[0] || 0;
      
      console.log(`  V(n1) = ${v_n1.toFixed(3)}V`);
      console.log(`  V(n2) = ${v_n2.toFixed(3)}V`);
      console.log(`  二極體壓降 = ${(v_n1 - v_n2).toFixed(3)}V\n`);
    } else {
      console.log('❌ 測試 2 失敗\n');
    }
  } catch (error: any) {
    console.error('❌ 測試 2 異常:', error.message);
    console.error('詳細:', error.stack?.split('\n').slice(0, 3).join('\n'), '\n');
  }

  console.log('=== 所有測試完成 ===');
  setTimeout(() => process.exit(0), 2000);
})();
