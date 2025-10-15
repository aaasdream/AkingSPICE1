/**
 * NGDevices 電路模擬測試
 * 測試二極體和 MOSFET 在實際電路中的收斂性
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';
import { Resistor } from './src/components/passive/resistor';
import { VoltageSource } from './src/components/sources/voltage_source';

console.log('=== NGDevices 電路模擬測試 ===\n');

// Helper function to get node voltage
function getNodeVoltage(engine: CircuitSimulationEngine, result: any, nodeName: string): number {
  const nodeIndex = (engine as any)['_nodeMapping'].get(nodeName);
  if (nodeIndex === undefined) return 0;
  return result.waveformData.nodeVoltages.get(nodeIndex)?.[0] || 0;
}

// 測試 1: 簡單二極體電路 (DC 分析)
console.log('測試 1: 二極體 + 電阻電路 (DC 分析)');
console.log('電路: V1(5V) -> D1 -> R1(1k) -> GND\n');

(async () => {
  try {
    // 創建電路元件
    const v1 = new VoltageSource('V1', ['n1', '0'], 5.0);
    const d1 = NgDeviceFactory.createDiode('D1', 'n1', 'n2', {
      IS: 1e-14,
      N: 1.0,
      RS: 0.1,
      BV: 100
    });
    const r1 = new Resistor('R1', ['n2', '0'], 1000);

    // 創建仿真引擎
    const engine = new CircuitSimulationEngine({
      endTime: 0,  // DC 分析
      maxNewtonIterations: 100,
      voltageToleranceAbs: 1e-6,
      verboseLogging: false
    });
    
    engine.addDevice(v1);
    engine.addDevice(d1);
    engine.addDevice(r1);

    console.log('執行 DC 分析...');
    const result = await engine.runSimulation();

    if (result.success) {
      console.log('✓ DC 分析收斂成功！');
      const v_n1 = getNodeVoltage(engine, result, 'n1');
      const v_n2 = getNodeVoltage(engine, result, 'n2');
      console.log('結果:');
      console.log(`  V(n1) = ${v_n1.toFixed(6)} V`);
      console.log(`  V(n2) = ${v_n2.toFixed(6)} V`);
      console.log(`  二極體電壓降 = ${(v_n1 - v_n2).toFixed(6)} V\n`);
    } else {
      console.log('✗ DC 分析未收斂\n');
    }

  } catch (error) {
    console.error('✗ 測試 1 失敗:', error);
    process.exit(1);
  }

  // 測試 2: NMOS 開關電路 (DC 分析)
  console.log('\n測試 2: NMOS 開關電路 (DC 分析)');
  console.log('電路: VDD(5V) -> RD(1k) -> NMOS -> GND, VGS(3V)\n');

  try {
    // 創建電路元件
    const vdd = new VoltageSource('VDD', ['vdd', '0'], 5.0);
    const vgs = new VoltageSource('VGS', ['gate', '0'], 3.0);
    const rd = new Resistor('RD', ['vdd', 'drain'], 1000);
    const m1 = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', {
      VTO: 0.7,
      KP: 2e-5,
      LAMBDA: 0.01
    });

    // 創建仿真引擎
    const engine2 = new CircuitSimulationEngine({
      endTime: 0,  // DC 分析
      maxNewtonIterations: 100,
      voltageToleranceAbs: 1e-6,
      verboseLogging: false
    });
    
    engine2.addDevice(vdd);
    engine2.addDevice(vgs);
    engine2.addDevice(rd);
    engine2.addDevice(m1);

    console.log('執行 DC 分析...');
    const result2 = await engine2.runSimulation();

    if (result2.success) {
      console.log('✓ DC 分析收斂成功！');
      const v_vdd = getNodeVoltage(engine2, result2, 'vdd');
      const v_gate = getNodeVoltage(engine2, result2, 'gate');
      const v_drain = getNodeVoltage(engine2, result2, 'drain');
      console.log('結果:');
      console.log(`  V(vdd) = ${v_vdd.toFixed(6)} V`);
      console.log(`  V(gate) = ${v_gate.toFixed(6)} V`);
      console.log(`  V(drain) = ${v_drain.toFixed(6)} V`);
      console.log(`  VDS = ${v_drain.toFixed(6)} V\n`);
    } else {
      console.log('✗ DC 分析未收斂\n');
    }

  } catch (error) {
    console.error('✗ 測試 2 失敗:', error);
    process.exit(1);
  }

  console.log('=== ✓ 所有電路測試完成 ===');
  process.exit(0);
})();
