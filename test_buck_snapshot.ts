#!/usr/bin/env tsx
/**
 * 🔬 測試失敗快照系統
 * 
 * 運行 Buck 轉換器測試並捕獲失敗快照
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Capacitor } from './src/components/passive/capacitor';
import { Inductor } from './src/components/passive/inductor';
import { IntelligentDiode } from './src/core/devices/intelligent_diode';
import { IntelligentMOSFET } from './src/core/devices/intelligent_mosfet';
import { globalSnapshotManager } from './src/core/diagnostics/failure_snapshot';

console.log(`
╔═══════════════════════════════════════════════════════════╗
║   🔬 Buck 轉換器失敗快照測試                             ║
╚═══════════════════════════════════════════════════════════╝
`);

// 啟用快照捕獲
globalSnapshotManager.setEnabled(true);
globalSnapshotManager.setMaxSnapshots(5);

console.log(`📐 電路配置:`);
console.log(`  Vin = 12V, Vout (目標) = 5V`);
console.log(`  開關頻率 = 100kHz, 占空比 = 41.7%`);
console.log(`  L = 100μH, C = 100μF, R_load = 5Ω`);
console.log(``);

// 創建電路
const engine = new CircuitSimulationEngine({
  minTimeStep: 1e-12,
  maxTimeStep: 1e-7,
  adaptiveTimeStep: true,
  convergenceTolerance: 1e-6
});

// 電源
const Vin = new VoltageSource('Vin', 'vin', '0', {
  type: 'DC',
  parameters: { dc_value: 12 }
});

// PWM 閘極信號
const Vpwm = new VoltageSource('Vpwm', 'gate', '0', {
  type: 'PULSE',
  parameters: {
    v1: 0,
    v2: 10,
    delay: 1e-6,        // 1μs 啟動延遲
    rise_time: 50e-9,   // 50ns 上升時間
    fall_time: 50e-9,   // 50ns 下降時間
    pulse_width: 4.17e-6, // 4.17μs (41.7% duty cycle)
    period: 10e-6       // 10μs (100kHz)
  }
});

// MOSFET 開關
const mosfet = new IntelligentMOSFET('M1', 'vin', 'sw', '0', {
  gate: 'gate',
  params: {
    Vth: 2.0,
    Kp: 0.01,
    Roff: 1e10,
    Ron_base: 0.05,
    lambda: 0.01,
    Cgs: 1e-9,
    Cgd: 1e-10
  }
});

// 續流二極體
const diode = new IntelligentDiode('D1', '0', 'sw', {
  Is: 1e-12,
  n: 1.0,
  Rs: 0.01,
  Cj0: 1e-11,
  Vj: 0.7,
  m: 0.33
});

// LC 濾波器
const inductor = new Inductor('L1', 'sw', 'out', { inductance: 100e-6, initial_current: 0 });
const capacitor = new Capacitor('C1', 'out', '0', { capacitance: 100e-6, initial_voltage: 0 });

// 負載電阻
const load = new Resistor('R_load', 'out', '0', { resistance: 5 });

// 添加元件
engine.addComponent(Vin);
engine.addComponent(Vpwm);
engine.addDevice(mosfet);
engine.addDevice(diode);
engine.addComponent(inductor);
engine.addComponent(capacitor);
engine.addComponent(load);

// 運行模擬
(async () => {
  try {
    console.log(`🚀 開始模擬...`);
    const startTime = Date.now();
    
    const result = await engine.runSimulation({
      duration: 100e-6,  // 100μs
      stepSize: 1e-9     // 初始 1ns
    });
    
    const elapsed = (Date.now() - startTime) / 1000;
    
    if (result.success) {
      console.log(`\n✅ 模擬成功！`);
      console.log(`   時間點: ${result.timePoints.length}`);
      console.log(`   耗時: ${elapsed.toFixed(2)}s`);
    } else {
      console.log(`\n❌ 模擬失敗！`);
      console.log(`   失敗時間: ${result.failureTime?.toExponential(3)}s`);
      console.log(`   錯誤: ${result.error}`);
      console.log(`   耗時: ${elapsed.toFixed(2)}s`);
    }
    
    console.log(`\n📊 快照捕獲統計:`);
    console.log(`   快照已保存到: ./snapshots/`);
    console.log(`\n💡 下一步操作:`);
    console.log(`   1. 查看 snapshots/ 目錄中的快照文件`);
    console.log(`   2. 閱讀 *_summary.txt 了解失敗概況`);
    console.log(`   3. 運行 Python 驗證腳本:`);
    console.log(`      cd snapshots`);
    console.log(`      python failure_*_verify.py`);
    console.log(`   4. 檢查生成的條件數和收斂圖`);
    
  } catch (error) {
    console.error(`\n💥 異常錯誤:`, error);
    process.exit(1);
  }
})();
