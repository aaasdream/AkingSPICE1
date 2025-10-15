/**
 * NGDevices 電路模擬測試
 * 測試二極體和 MOSFET 在實際電路中的收斂性
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';

console.log('=== NGDevices 電路模擬測試 ===\n');

// 測試 1: 簡單二極體電路 (DC 分析)
console.log('測試 1: 二極體 + 電阻電路 (DC 分析)');
console.log('電路: V1(5V) -> D1 -> R1(1k) -> GND\n');

try {
  // 創建電路元件
  const v1 = VoltageSourceFactory.createDC('V1', 'n1', 0, 5.0);
  const d1 = NgDeviceFactory.createDiode('D1', 'n1', 'n2', {
    IS: 1e-14,
    N: 1.0,
    RS: 0,
    BV: 100
  });
  const r1 = ResistorFactory.create('R1', 'n2', 0, 1000);

  // 創建仿真引擎
  const engine = new CircuitSimulationEngine();
  engine.addComponent(v1);
  engine.addComponent(d1);
  engine.addComponent(r1);

  console.log('執行 DC 分析...');
  const dcResult = engine.runDCAnalysis();

  if (dcResult.converged) {
    console.log('✓ DC 分析收斂成功！');
    console.log('結果:');
    console.log(`  V(n1) = ${dcResult.voltages.get('n1')?.toFixed(6)} V`);
    console.log(`  V(n2) = ${dcResult.voltages.get('n2')?.toFixed(6)} V`);
    console.log(`  二極體電壓降 = ${(dcResult.voltages.get('n1')! - dcResult.voltages.get('n2')!).toFixed(6)} V`);
    console.log(`  迭代次數: ${dcResult.iterations}\n`);
  } else {
    console.log('✗ DC 分析未收斂');
    console.log(`  迭代次數: ${dcResult.iterations}\n`);
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
  const vdd = VoltageSourceFactory.createDC('VDD', 'vdd', 0, 5.0);
  const vgs = VoltageSourceFactory.createDC('VGS', 'gate', 0, 3.0);
  const rd = ResistorFactory.create('RD', 'vdd', 'drain', 1000);
  const m1 = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', 0, 0, {
    VTO: 0.7,
    KP: 2e-5,
    LAMBDA: 0.01
  });

  // 創建仿真引擎
  const engine2 = new CircuitSimulationEngine();
  engine2.addComponent(vdd);
  engine2.addComponent(vgs);
  engine2.addComponent(rd);
  engine2.addComponent(m1);

  console.log('執行 DC 分析...');
  const dcResult2 = engine2.runDCAnalysis();

  if (dcResult2.converged) {
    console.log('✓ DC 分析收斂成功！');
    console.log('結果:');
    console.log(`  V(vdd) = ${dcResult2.voltages.get('vdd')?.toFixed(6)} V`);
    console.log(`  V(gate) = ${dcResult2.voltages.get('gate')?.toFixed(6)} V`);
    console.log(`  V(drain) = ${dcResult2.voltages.get('drain')?.toFixed(6)} V`);
    console.log(`  VDS = ${dcResult2.voltages.get('drain')?.toFixed(6)} V`);
    console.log(`  迭代次數: ${dcResult2.iterations}\n`);
  } else {
    console.log('✗ DC 分析未收斂');
    console.log(`  迭代次數: ${dcResult2.iterations}\n`);
  }

} catch (error) {
  console.error('✗ 測試 2 失敗:', error);
  process.exit(1);
}

console.log('=== ✓ 所有電路測試完成 ===');
process.exit(0);
