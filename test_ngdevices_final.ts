/**
 * NGDevices 最終驗證測試
 * 快速確認所有修復都有效
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Capacitor } from './src/components/passive/capacitor';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';

console.log('=== NGDevices 最終驗證測試 ===\n');

(async () => {
  let passed = 0;
  let failed = 0;

  // 測試 1: 線性電路 DC
  console.log('測試 1: 線性電路 DC 分析...');
  try {
    const v1 = new VoltageSource('V1', ['n1', '0'], 5.0);
    const r1 = new Resistor('R1', ['n1', '0'], 1000);
    const engine = new CircuitSimulationEngine({ endTime: 0, maxNewtonIterations: 10, verboseLogging: false });
    engine.addDevice(v1);
    engine.addDevice(r1);
    const result = await engine.runSimulation();
    if (result.success) {
      console.log('✅ 測試 1 通過\n');
      passed++;
    } else {
      console.log('❌ 測試 1 失敗\n');
      failed++;
    }
  } catch (e: any) {
    console.log(`❌ 測試 1 異常: ${e.message}\n`);
    failed++;
  }

  // 測試 2: 二極體 DC
  console.log('測試 2: 二極體電路 DC 分析...');
  try {
    const v1 = new VoltageSource('V1', ['n1', '0'], 5.0);
    const d1 = NgDeviceFactory.createDiode('D1', 'n1', 'n2', { IS: 1e-12, N: 2.0, RS: 10 });
    const r1 = new Resistor('R1', ['n2', '0'], 1000);
    const engine = new CircuitSimulationEngine({ endTime: 0, maxNewtonIterations: 30, verboseLogging: false });
    engine.addDevice(v1);
    engine.addDevice(d1);
    engine.addDevice(r1);
    const result = await engine.runSimulation();
    if (result.success) {
      console.log('✅ 測試 2 通過\n');
      passed++;
    } else {
      console.log('❌ 測試 2 失敗\n');
      failed++;
    }
  } catch (e: any) {
    console.log(`❌ 測試 2 異常: ${e.message}\n`);
    failed++;
  }

  // 測試 3: NMOS DC
  console.log('測試 3: NMOS 電路 DC 分析...');
  try {
    const vdd = new VoltageSource('VDD', ['vdd', '0'], 5.0);
    const vgs = new VoltageSource('VGS', ['gate', '0'], 3.0);
    const rd = new Resistor('RD', ['vdd', 'drain'], 1000);
    const m1 = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', { VTO: 0.7, KP: 100e-6, LAMBDA: 0.01 });
    const engine = new CircuitSimulationEngine({ endTime: 0, maxNewtonIterations: 30, verboseLogging: false });
    engine.addDevice(vdd);
    engine.addDevice(vgs);
    engine.addDevice(rd);
    engine.addDevice(m1);
    const result = await engine.runSimulation();
    if (result.success) {
      console.log('✅ 測試 3 通過\n');
      passed++;
    } else {
      console.log('❌ 測試 3 失敗\n');
      failed++;
    }
  } catch (e: any) {
    console.log(`❌ 測試 3 異常: ${e.message}\n`);
    failed++;
  }

  // 測試 4: 線性電路瞬態（短時間）
  console.log('測試 4: RC 充電瞬態分析（簡短版）...');
  try {
    const v1 = new VoltageSource('V1', ['n1', '0'], 5.0);
    const r1 = new Resistor('R1', ['n1', 'n2'], 1000);
    const c1 = new Capacitor('C1', ['n2', '0'], 1e-6);
    const engine = new CircuitSimulationEngine({
      startTime: 0,
      endTime: 1e-3,  // 只模擬 1ms (1 time constant)
      initialTimeStep: 1e-6,
      maxTimeStep: 100e-6,
      minTimeStep: 1e-9,
      voltageToleranceAbs: 1e-4,
      maxNewtonIterations: 20,
      verboseLogging: false,
      enableAdaptiveTimeStep: true
    });
    engine.addDevice(v1);
    engine.addDevice(r1);
    engine.addDevice(c1);
    const result = await engine.runSimulation();
    if (result.success && result.waveformData.timePoints.length > 5) {
      console.log(`✅ 測試 4 通過 (${result.waveformData.timePoints.length} 個時間點)\n`);
      passed++;
    } else {
      console.log('❌ 測試 4 失敗\n');
      failed++;
    }
  } catch (e: any) {
    console.log(`❌ 測試 4 異常: ${e.message}\n`);
    failed++;
  }

  // 總結
  console.log('='.repeat(50));
  console.log(`測試結果: ${passed} 通過, ${failed} 失敗`);
  console.log('='.repeat(50));
  
  if (failed === 0) {
    console.log('\n🎉 所有測試通過！NGDevices 已成功修復！\n');
  } else {
    console.log(`\n⚠️  有 ${failed} 個測試失敗\n`);
  }

  setTimeout(() => process.exit(failed > 0 ? 1 : 0), 2000);
})();
