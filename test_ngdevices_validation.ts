/**
 * NGDevices 瞬態分析測試 - 保守版本
 * 基於成功的 DC 測試模式，使用更簡單的電路配置
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Capacitor } from './src/components/passive/capacitor';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';

console.log('=== NGDevices 瞬態分析測試（保守版） ===\n');

// Helper function to get node voltage from waveform data
function getNodeVoltages(engine: CircuitSimulationEngine, result: any, nodeName: string): number[] {
  const nodeIndex = (engine as any)['_nodeMapping'].get(nodeName);
  if (nodeIndex === undefined) return [];
  return result.waveformData.nodeVoltages.get(nodeIndex) || [];
}

// ============================================
// 測試 1: 純 RC 充電電路 (無非線性元件)
// ============================================
console.log('測試 1: RC 充電電路 (baseline test)');
console.log('==========================================');
console.log('電路: V1(5V) -> R1(1k) -> C1(1µF) -> GND\n');

(async () => {
  try {
    const v1 = new VoltageSource('V1', ['n1', '0'], 5.0);
    const r1 = new Resistor('R1', ['n1', 'n2'], 1000);
    const c1 = new Capacitor('C1', ['n2', '0'], 1e-6);  // 1µF

    const engine = new CircuitSimulationEngine({
      startTime: 0,
      endTime: 5e-3,        // 5ms (5 time constants, τ=RC=1ms)
      initialTimeStep: 1e-6,
      maxTimeStep: 0.1e-3,  // 0.1ms
      minTimeStep: 1e-9,
      voltageToleranceAbs: 1e-4,  // 更寬鬆
      maxNewtonIterations: 30,     // 減少迭代次數
      verboseLogging: false,
      enableAdaptiveTimeStep: true
    });
    
    engine.addDevice(v1);
    engine.addDevice(r1);
    engine.addDevice(c1);

    console.log('執行瞬態分析...');
    const result = await engine.runSimulation();

    if (result.success) {
      console.log('✓ 瞬態分析成功完成！');
      const timePoints = result.waveformData.timePoints;
      const n2Voltages = getNodeVoltages(engine, result, 'n2');
      
      console.log(`  總時間點數: ${timePoints.length}`);
      
      // 顯示幾個關鍵時間點
      const samples = [0, Math.floor(timePoints.length * 0.2), Math.floor(timePoints.length * 0.5), Math.floor(timePoints.length * 0.8), timePoints.length - 1];
      console.log('\n關鍵時間點：');
      for (const idx of samples) {
        const t = timePoints[idx];
        const v = n2Voltages[idx];
        const expected = 5 * (1 - Math.exp(-t / 1e-3));  // τ = RC = 1ms
        console.log(`  t=${(t * 1e3).toFixed(3)}ms: V(n2)=${v.toFixed(3)}V (預期 ${expected.toFixed(3)}V)`);
      }
      
      const finalV = n2Voltages[n2Voltages.length - 1];
      console.log(`\n最終電壓: ${finalV.toFixed(3)}V (預期 ~4.97V @ 5τ)`);
      
      if (finalV > 4.5 && finalV < 5.5) {
        console.log('✅ RC 充電行為正常\n');
      } else {
        console.log('⚠️  電壓異常\n');
      }
    } else {
      console.log('✗ 瞬態分析失敗\n');
    }
  } catch (error: any) {
    console.error('✗ 測試 1 失敗:', error.message);
  }

  // ============================================
  // 測試 2: 二極體 + 電阻電路 (先做 DC 驗證)
  // ============================================
  console.log('\n測試 2: 二極體 + 電阻電路 (DC 驗證)');
  console.log('==========================================');
  console.log('電路: V1(5V) -> D1 -> R1(1k) -> GND\n');

  try {
    const v1 = new VoltageSource('V1', ['n1', '0'], 5.0);
    const d1 = NgDeviceFactory.createDiode('D1', 'n1', 'n2', {
      IS: 1e-13,    // 較大的飽和電流
      N: 1.5,       // 較大的理想因子
      RS: 5         // 較大的串聯電阻
    });
    const r1 = new Resistor('R1', ['n2', '0'], 1000);

    const engine = new CircuitSimulationEngine({
      endTime: 0,  // DC 分析
      maxNewtonIterations: 50,
      voltageToleranceAbs: 1e-4,
      verboseLogging: false
    });
    
    engine.addDevice(v1);
    engine.addDevice(d1);
    engine.addDevice(r1);

    console.log('執行 DC 分析...');
    const result = await engine.runSimulation();

    if (result.success) {
      console.log('✓ DC 分析收斂成功！');
      
      const nodeMapping = (engine as any)['_nodeMapping'];
      const n1Idx = nodeMapping.get('n1');
      const n2Idx = nodeMapping.get('n2');
      
      const v_n1 = result.waveformData.nodeVoltages.get(n1Idx)?.[0] || 0;
      const v_n2 = result.waveformData.nodeVoltages.get(n2Idx)?.[0] || 0;
      const vd = v_n1 - v_n2;
      
      console.log(`  V(n1) = ${v_n1.toFixed(3)}V`);
      console.log(`  V(n2) = ${v_n2.toFixed(3)}V`);
      console.log(`  二極體壓降 = ${vd.toFixed(3)}V`);
      
      // 預期二極體壓降約 0.6-0.9V (取決於電流和參數)
      if (vd > 0.3 && vd < 2.0) {
        console.log('✅ 二極體壓降合理\n');
      } else {
        console.log(`⚠️  二極體壓降異常 (預期 0.6-0.9V)\n`);
      }
    } else {
      console.log('✗ DC 分析未收斂\n');
    }
  } catch (error: any) {
    console.error('✗ 測試 2 失敗:', error.message);
  }

  // ============================================
  // 測試 3: NMOS 基本 DC 測試
  // ============================================
  console.log('\n測試 3: NMOS 開關電路 (DC 驗證)');
  console.log('==========================================');
  console.log('電路: VDD(5V) -> RD(1k) -> NMOS -> GND, VGS(3V)\n');

  try {
    const vdd = new VoltageSource('VDD', ['vdd', '0'], 5.0);
    const vgs = new VoltageSource('VGS', ['gate', '0'], 3.0);
    const rd = new Resistor('RD', ['vdd', 'drain'], 1000);
    const m1 = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', {
      VTO: 0.7,
      KP: 100e-6,     // 降低跨導
      LAMBDA: 0.01,
      W: 10e-6,
      L: 1e-6
    });

    const engine = new CircuitSimulationEngine({
      endTime: 0,  // DC 分析
      maxNewtonIterations: 50,
      voltageToleranceAbs: 1e-4,
      verboseLogging: false
    });
    
    engine.addDevice(vdd);
    engine.addDevice(vgs);
    engine.addDevice(rd);
    engine.addDevice(m1);

    console.log('執行 DC 分析...');
    const result = await engine.runSimulation();

    if (result.success) {
      console.log('✓ DC 分析收斂成功！');
      
      const nodeMapping = (engine as any)['_nodeMapping'];
      const drainIdx = nodeMapping.get('drain');
      const gateIdx = nodeMapping.get('gate');
      
      const vd = result.waveformData.nodeVoltages.get(drainIdx)?.[0] || 0;
      const vg = result.waveformData.nodeVoltages.get(gateIdx)?.[0] || 0;
      const vgs_val = vg - 0;  // source is GND
      const vds_val = vd - 0;
      
      console.log(`  VGS = ${vgs_val.toFixed(3)}V`);
      console.log(`  VDS = ${vds_val.toFixed(3)}V`);
      console.log(`  VD = ${vd.toFixed(3)}V`);
      
      // 預期：VGS=3V > VTO=0.7V，MOSFET 導通，VD 應該 < 5V
      if (vgs_val > 0.7 && vd < 5.0 && vd > 0.5) {
        console.log('✅ NMOS 行為合理\n');
      } else if (vd >= 5.0) {
        console.log('⚠️  NMOS 可能未導通\n');
      } else {
        console.log('⚠️  NMOS 行為異常\n');
      }
    } else {
      console.log('✗ DC 分析未收斂\n');
    }
  } catch (error: any) {
    console.error('✗ 測試 3 失敗:', error.message);
  }

  console.log('=== 測試完成 ===');
})();
