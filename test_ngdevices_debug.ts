/**
 * NGDevices 基礎 DC 測試 - 調試版本
 * 目標：找出為什麼 Gmin Stepping 會失敗
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';

console.log('=== NGDevices DC 調試測試 ===\n');

// Helper function
function getNodeVoltage(engine: CircuitSimulationEngine, result: any, nodeName: string): number {
  const nodeMapping = (engine as any)['_nodeMapping'];
  const nodeIdx = nodeMapping.get(nodeName);
  if (nodeIdx === undefined) return 0;
  return result.waveformData.nodeVoltages.get(nodeIdx)?.[0] || 0;
}

// 測試 1: 最簡單的二極體電路
console.log('測試 1: 簡單二極體電路');
console.log('電路: V1(5V) -> D1 -> R1(1k) -> GND\n');

(async () => {
  try {
    const v1 = new VoltageSource('V1', ['n1', '0'], 5.0);
    const d1 = NgDeviceFactory.createDiode('D1', 'n1', 'n2', {
      IS: 1e-12,      // 非常大的飽和電流
      N: 2.0,         // 大理想因子
      RS: 10,         // 大串聯電阻
      BV: 100
    });
    const r1 = new Resistor('R1', ['n2', '0'], 1000);

    const engine = new CircuitSimulationEngine({
      endTime: 0,              // DC 分析
      maxNewtonIterations: 20, // 減少迭代
      voltageToleranceAbs: 1e-3, // 更寬鬆
      verboseLogging: false
    });
    
    engine.addDevice(v1);
    engine.addDevice(d1);
    engine.addDevice(r1);

    console.log('執行 DC 分析...');
    console.log('注意觀察 Gmin Stepping 過程...\n');
    
    const result = await engine.runSimulation();

    if (result.success) {
      console.log('✓ DC 分析收斂！');
      const v_n1 = getNodeVoltage(engine, result, 'n1');
      const v_n2 = getNodeVoltage(engine, result, 'n2');
      console.log(`  V(n1) = ${v_n1.toFixed(3)}V`);
      console.log(`  V(n2) = ${v_n2.toFixed(3)}V`);
      console.log(`  VD = ${(v_n1 - v_n2).toFixed(3)}V\n`);
    } else {
      console.log('✗ DC 分析失敗\n');
    }
  } catch (error: any) {
    console.error('測試失敗:', error.message);
    console.error('Stack:', error.stack);
  }

  console.log('=== 測試完成 ===');
  
  // 強制退出以避免掛起
  setTimeout(() => {
    console.log('\n[自動退出]');
    process.exit(0);
  }, 5000);
})();
