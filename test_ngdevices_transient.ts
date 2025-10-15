/**
 * NGDevices 瞬態分析測試
 * 驗證動態行為和時域響應
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';
import { Resistor } from './src/components/passive/resistor';
import { Capacitor } from './src/components/passive/capacitor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';

console.log('=== NGDevices 瞬態分析測試 ===\n');

// Helper function
function getNodeVoltage(engine: CircuitSimulationEngine, result: any, nodeName: string, timeIndex: number = 0): number {
  const nodeIndex = (engine as any)['_nodeMapping'].get(nodeName);
  if (nodeIndex === undefined) return 0;
  const voltages = result.waveformData.nodeVoltages.get(nodeIndex);
  return voltages ? voltages[timeIndex] : 0;
}

// 測試 1: RC 電路 + 二極體（階躍響應）
console.log('測試 1: RC + 二極體階躍響應');
console.log('==========================================');
console.log('電路: V1(0→5V) -> D1 -> R1(1k) -> C1(10µF) -> GND\n');

(async () => {
  try {
    const v1 = VoltageSourceFactory.createPulse(
      'V1', ['n1', '0'],
      0,        // v1
      5,        // v2
      1e-6,     // delay
      1e-9,     // rise time
      1e-9,     // fall time
      100e-6,   // pulse width
      200e-6    // period
    );
    
    const d1 = NgDeviceFactory.createDiode('D1', 'n1', 'n2', {
      IS: 1e-14,
      N: 1.0,
      RS: 1
    });
    
    const r1 = new Resistor('R1', ['n2', 'n3'], 1000);
    const c1 = new Capacitor('C1', ['n3', '0'], 10e-6);

    const engine = new CircuitSimulationEngine({
      startTime: 0,
      endTime: 150e-6,     // 150µs 模擬時間
      initialTimeStep: 1e-9,
      maxTimeStep: 1e-6,
      minTimeStep: 1e-12,
      voltageToleranceAbs: 1e-6,
      verboseLogging: false,
      enableAdaptiveTimeStep: true
    });
    
    engine.addDevice(v1);
    engine.addDevice(d1);
    engine.addDevice(r1);
    engine.addDevice(c1);

    console.log('開始瞬態分析...');
    const result = await engine.runSimulation();

    if (result.success) {
      console.log('✓ 瞬態分析成功完成！');
      console.log(`  總時間點數: ${result.waveformData.timePoints.length}`);
      console.log(`  時間範圍: ${result.waveformData.timePoints[0].toExponential(2)} ~ ${result.waveformData.timePoints[result.waveformData.timePoints.length-1].toExponential(2)} s`);
      
      // 檢查關鍵時間點
      const times = result.waveformData.timePoints;
      const midPoint = Math.floor(times.length / 2);
      const endPoint = times.length - 1;
      
      const v_n3_mid = getNodeVoltage(engine, result, 'n3', midPoint);
      const v_n3_end = getNodeVoltage(engine, result, 'n3', endPoint);
      
      console.log(`  V(n3) @ t=${times[midPoint].toExponential(2)}s: ${v_n3_mid.toFixed(4)}V`);
      console.log(`  V(n3) @ t=${times[endPoint].toExponential(2)}s: ${v_n3_end.toFixed(4)}V`);
      console.log();
    } else {
      console.log('✗ 瞬態分析失敗\n');
    }

  } catch (error) {
    console.error('✗ 測試 1 失敗:', error);
  }

  // 測試 2: MOSFET 開關瞬態
  console.log('\n測試 2: NMOS 開關瞬態響應');
  console.log('==========================================');
  console.log('電路: VDD(5V) -> RD(1k) -> NMOS -> GND, VGS(方波 0→5V)\n');

  try {
    const vdd = VoltageSourceFactory.createDC('VDD', ['vdd', '0'], 5.0);
    const vgs = VoltageSourceFactory.createPulse(
      'VGS', ['gate', '0'],
      0,       // v1
      5,       // v2
      1e-6,    // delay
      1e-9,    // rise time
      1e-9,    // fall time
      50e-6,   // pulse width
      100e-6   // period
    );
    
    const rd = new Resistor('RD', ['vdd', 'drain'], 1000);
    const cd = new Capacitor('CD', ['drain', '0'], 1e-9);  // 1nF 負載電容
    
    const m1 = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', {
      VTO: 0.7,
      KP: 2e-4,
      LAMBDA: 0.02,
      W: 100e-6,
      L: 10e-6
    });

    const engine = new CircuitSimulationEngine({
      startTime: 0,
      endTime: 150e-6,
      initialTimeStep: 1e-9,
      maxTimeStep: 1e-6,
      minTimeStep: 1e-12,
      voltageToleranceAbs: 1e-6,
      verboseLogging: false,
      enableAdaptiveTimeStep: true
    });
    
    engine.addDevice(vdd);
    engine.addDevice(vgs);
    engine.addDevice(rd);
    engine.addDevice(cd);
    engine.addDevice(m1);

    console.log('開始瞬態分析...');
    const result = await engine.runSimulation();

    if (result.success) {
      console.log('✓ 瞬態分析成功完成！');
      console.log(`  總時間點數: ${result.waveformData.timePoints.length}`);
      
      const times = result.waveformData.timePoints;
      const quarterPoint = Math.floor(times.length / 4);
      const halfPoint = Math.floor(times.length / 2);
      const threeQuarterPoint = Math.floor(3 * times.length / 4);
      
      const v_drain_q1 = getNodeVoltage(engine, result, 'drain', quarterPoint);
      const v_drain_q2 = getNodeVoltage(engine, result, 'drain', halfPoint);
      const v_drain_q3 = getNodeVoltage(engine, result, 'drain', threeQuarterPoint);
      
      console.log(`  V(drain) @ t=${times[quarterPoint].toExponential(2)}s: ${v_drain_q1.toFixed(4)}V`);
      console.log(`  V(drain) @ t=${times[halfPoint].toExponential(2)}s: ${v_drain_q2.toFixed(4)}V`);
      console.log(`  V(drain) @ t=${times[threeQuarterPoint].toExponential(2)}s: ${v_drain_q3.toFixed(4)}V`);
      console.log();
    } else {
      console.log('✗ 瞬態分析失敗\n');
    }

  } catch (error) {
    console.error('✗ 測試 2 失敗:', error);
  }

  // 測試 3: 二極體整流器瞬態
  console.log('\n測試 3: 二極體半波整流器');
  console.log('==========================================');
  console.log('電路: V1(正弦波) -> D1 -> R1(1k) -> C1(10µF) -> GND\n');

  try {
    const v1 = VoltageSourceFactory.createSine(
      'V1', ['n1', '0'],
      0,      // offset
      5,      // amplitude
      1000    // frequency (Hz)
    );
    
    const d1 = NgDeviceFactory.createDiode('D1', 'n1', 'n2', {
      IS: 1e-14,
      N: 1.0,
      RS: 0.1
    });
    
    const r1 = new Resistor('R1', ['n2', 'n3'], 1000);
    const c1 = new Capacitor('C1', ['n3', '0'], 10e-6);

    const engine = new CircuitSimulationEngine({
      startTime: 0,
      endTime: 3e-3,        // 3ms (3 cycles)
      initialTimeStep: 1e-9,
      maxTimeStep: 10e-6,
      minTimeStep: 1e-12,
      voltageToleranceAbs: 1e-6,
      verboseLogging: false,
      enableAdaptiveTimeStep: true
    });
    
    engine.addDevice(v1);
    engine.addDevice(d1);
    engine.addDevice(r1);
    engine.addDevice(c1);

    console.log('開始瞬態分析...');
    const result = await engine.runSimulation();

    if (result.success) {
      console.log('✓ 瞬態分析成功完成！');
      console.log(`  總時間點數: ${result.waveformData.timePoints.length}`);
      
      // 找出輸出電壓的峰值和穩態值
      const times = result.waveformData.timePoints;
      let maxVout = 0;
      let minVout = 1000;
      
      // 只看後半段（穩態）
      const startIdx = Math.floor(times.length / 2);
      for (let i = startIdx; i < times.length; i++) {
        const v = getNodeVoltage(engine, result, 'n3', i);
        if (v > maxVout) maxVout = v;
        if (v < minVout) minVout = v;
      }
      
      console.log(`  穩態 V(n3) 最大值: ${maxVout.toFixed(4)}V`);
      console.log(`  穩態 V(n3) 最小值: ${minVout.toFixed(4)}V`);
      console.log(`  紋波電壓: ${(maxVout - minVout).toFixed(4)}V`);
      console.log();
    } else {
      console.log('✗ 瞬態分析失敗\n');
    }

  } catch (error) {
    console.error('✗ 測試 3 失敗:', error);
  }

  console.log('=== ✓ 所有瞬態分析測試完成 ===');
  process.exit(0);
})();
