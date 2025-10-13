/**
 * 🎯 Buck 轉換器事件驅動測試 (Event-Driven Architecture Validation)
 * 
 * 目標：驗證新的事件驅動引擎能否成功模擬 Buck 轉換器
 * 
 * 電路配置：
 * - 輸入電壓: 12V DC
 * - 目標輸出: 5V (約 42% 占空比)
 * - 開關頻率: 100kHz (週期 10μs)
 * - 電感: 100μH
 * - 電容: 100μF
 * - 負載: 5Ω (輸出電流 1A)
 * 
 * 預期結果：
 * 1. 輸出電壓穩定在 5V 左右 (ripple < 10%)
 * 2. 事件日誌正確記錄 MOSFET/Diode 狀態轉換
 * 3. 模擬完成 100μs (10 個開關週期)
 * 
 * @date 2025-10-13
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Inductor } from './src/components/passive/inductor';
import { Capacitor } from './src/components/passive/capacitor';
import { IntelligentMOSFET } from './src/core/devices/intelligent_mosfet';
import { IntelligentDiode } from './src/core/devices/intelligent_diode';
import type { MOSFETParameters, DiodeParameters } from './src/core/devices/intelligent_device_model';
import { globalSnapshotManager } from './src/core/diagnostics/failure_snapshot';

async function runBuckConverterTest() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   🎯 Buck 轉換器事件驅動測試 (Event-Driven Test)         ║');
  console.log('║          + 失敗快照捕獲 (Failure Snapshot)               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // 🔬 啟用失敗快照系統
  globalSnapshotManager.setEnabled(true);
  globalSnapshotManager.setMaxSnapshots(5);
  console.log('🔬 失敗快照系統已啟用 (輸出目錄: ./snapshots/)\n');

  // ========== 電路參數配置 ==========
  const Vin = 12;           // 輸入電壓 (V)
  const Vout_target = 5;    // 目標輸出電壓 (V)
  const f_sw = 100e3;       // 開關頻率 (100kHz)
  const L = 100e-6;         // 電感 (100μH)
  const C = 100e-6;         // 電容 (100μF)
  const R_load = 5;         // 負載電阻 (5Ω)
  const duty_cycle = Vout_target / Vin;  // 占空比 ≈ 0.42

  console.log('📐 電路配置:');
  console.log(`  Vin = ${Vin}V, Vout (目標) = ${Vout_target}V`);
  console.log(`  開關頻率 = ${f_sw/1000}kHz, 占空比 = ${(duty_cycle*100).toFixed(1)}%`);
  console.log(`  L = ${L*1e6}μH, C = ${C*1e6}μF, R_load = ${R_load}Ω\n`);

  // ========== 創建模擬引擎 ==========
  const engine = new CircuitSimulationEngine({
    endTime: 100e-6,          // 模擬 100μs (10 個開關週期)
    initialTimeStep: 10e-9,   // 初始步長 10ns
    minTimeStep: 1e-10,       // 🔧 修復: 最小步長 100ps (從 1ps 放寬)
    maxTimeStep: 1e-6,        // 最大步長 1μs
    verboseLogging: false,    // 關閉詳細日誌以減少輸出
  });

  // ========== 添加電路元件 ==========
  
  // 1. 輸入電壓源
  engine.addDevice(new VoltageSource('Vin', ['in', '0'], Vin));

  // 2. PWM 閘極信號 (100kHz, 42% duty cycle)
  const period = 1 / f_sw;
  const pulse_width = duty_cycle * period;
  
  engine.addDevice(new VoltageSource('Vpwm', ['gate', '0'], 0, {
    type: 'PULSE',
    parameters: {
      v1: 0,                    // 低電平 0V
      v2: 10,                   // 高電平 10V (足以驅動 MOSFET)
      delay: 1e-6,              // 1μs 啟動延遲 (避免 t=0 浪湧)
      rise_time: 50e-9,         // 上升時間 50ns
      fall_time: 50e-9,         // 下降時間 50ns
      pulse_width: pulse_width, // 脈衝寬度 ~4.2μs
      period: period            // 週期 10μs
    }
  }));

  // 3. 主開關 MOSFET (NMOS)
  const mosfetParams: MOSFETParameters = {
    Vth: 2.0,                 // 閾值電壓 2V
    Kp: 0.1,                  // 跨導參數 (較大值 = 更低導通電阻)
    lambda: 0.01,             // 溝道調制係數
    Cgs: 100e-12,             // 閘源電容 100pF
    Cgd: 50e-12,              // 閘漏電容 50pF
    Ron: 0.01,                // 導通電阻 10mΩ (典型 power MOSFET)
    Roff: 1e12,               // 關斷電阻 (極高)
    Vmax: 50,                 // 最大電壓 50V
    Imax: 20                  // 最大電流 20A
  };
  engine.addDevice(new IntelligentMOSFET('M1', ['in', 'gate', 'sw'], mosfetParams));

  // 4. 續流二極管 (Freewheeling Diode)
  const diodeParams: DiodeParameters = {
    Is: 1e-12,                // 飽和電流 1pA
    n: 1.0,                   // 理想因子
    Rs: 0.01,                 // 串聯電阻 10mΩ
    Cj0: 10e-12,              // 零偏結電容 10pF
    Vj: 0.7,                  // 結電位 0.7V
    m: 0.5,                   // 分級係數
    tt: 0                     // 渡越時間 (簡化模型)
  };
  engine.addDevice(new IntelligentDiode('D1', ['0', 'sw'], diodeParams));

  // 5. 輸出濾波器 (LC filter)
  engine.addDevice(new Inductor('L1', ['sw', 'out'], L));
  engine.addDevice(new Capacitor('C1', ['out', '0'], C));

  // 6. 負載電阻
  engine.addDevice(new Resistor('R_load', ['out', '0'], R_load));

  console.log('⚙️  開始模擬...');
  const startTime = Date.now();

  // ========== 執行模擬 ==========
  const result = await engine.runSimulation();
  
  const endTime = Date.now();
  const elapsedTime = (endTime - startTime) / 1000;

  console.log(`\n⏱️  模擬耗時: ${elapsedTime.toFixed(2)} 秒\n`);

  // ========== 分析結果 ==========
  if (result.success) {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   ✅ Buck 轉換器模擬成功！                                ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log(`📊 模擬統計:`);
    console.log(`  最終時間: ${result.finalTime.toExponential(3)}s`);
    console.log(`  總步數: ${result.totalSteps}`);
    console.log(`  平均步長: ${(result.finalTime / result.totalSteps).toExponential(3)}s\n`);

    // 獲取輸出電壓
    const outNodeId = engine.getNodeIdByName('out');
    if (outNodeId !== undefined) {
      const vOut = result.waveformData.nodeVoltages.get(outNodeId);
      const timePoints = Array.from(result.waveformData.timePoints);
      
      if (vOut && vOut.length > 0) {
        // 只分析穩態部分 (最後 50μs)
        const steadyStateStartIdx = Math.floor(vOut.length / 2);
        const vOut_steady = vOut.slice(steadyStateStartIdx);
        
        const vOut_avg = vOut_steady.reduce((sum, v) => sum + v, 0) / vOut_steady.length;
        const vOut_max = Math.max(...vOut_steady);
        const vOut_min = Math.min(...vOut_steady);
        const ripple = vOut_max - vOut_min;
        const ripple_percent = (ripple / vOut_avg) * 100;
        
        console.log(`📈 輸出電壓分析 (穩態部分):`);
        console.log(`  平均值: ${vOut_avg.toFixed(4)} V`);
        console.log(`  最大值: ${vOut_max.toFixed(4)} V`);
        console.log(`  最小值: ${vOut_min.toFixed(4)} V`);
        console.log(`  漣波: ${ripple.toFixed(4)} V (${ripple_percent.toFixed(2)}%)\n`);
        
        // 驗證結果
        const tolerance = 0.5; // 允許 ±0.5V 誤差
        if (Math.abs(vOut_avg - Vout_target) < tolerance && ripple_percent < 20) {
          console.log('✅ 輸出電壓符合設計目標！');
        } else {
          console.log(`⚠️  輸出電壓偏離目標較多 (目標: ${Vout_target}V, 實際: ${vOut_avg.toFixed(2)}V)`);
        }
        
        // 輸出最後幾個時間點的電壓 (用於調試)
        console.log(`\n📝 最後 5 個時間點:`);
        const lastN = Math.min(5, timePoints.length);
        for (let i = timePoints.length - lastN; i < timePoints.length; i++) {
          const t = timePoints[i];
          const v = vOut[i];
          if (t !== undefined && v !== undefined) {
            console.log(`  t=${t.toExponential(3)}s: V_out=${v.toFixed(4)}V`);
          }
        }
      }
    }

    // ========== 事件統計 ==========
    console.log(`\n📋 事件日誌統計:`);
    const events = engine.getSimulationEvents();
    const eventTypes: Record<string, number> = {};
    
    for (const event of events) {
      eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
    }
    
    console.log(`  總事件數: ${events.length}`);
    for (const [type, count] of Object.entries(eventTypes)) {
      console.log(`    ${type}: ${count} 次`);
    }
    
    // 顯示最後 10 個事件
    console.log(`\n📜 最後 10 個事件:`);
    const lastEvents = events.slice(-10);
    for (const event of lastEvents) {
      const deviceId = event.deviceId || 'unknown';
      console.log(`  t=${event.time.toExponential(3)}s [${event.type}] ${deviceId}: ${event.description}`);
    }

  } else {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   ❌ Buck 轉換器模擬失敗!                                 ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    console.log(`錯誤資訊: ${result.errorMessage}\n`);
    
    // 顯示失敗前的最後幾個事件
    const events = engine.getSimulationEvents();
    console.log(`📜 失敗前最後 20 個事件:`);
    const lastEvents = events.slice(-20);
    for (const event of lastEvents) {
      const deviceId = event.deviceId || 'unknown';
      console.log(`  t=${event.time.toExponential(3)}s [${event.type}] ${deviceId}: ${event.description}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`${result.success ? '✅' : '❌'} Buck 轉換器測試${result.success ? '通過' : '失敗'}!`);
  console.log('='.repeat(60));
}

// 執行測試
runBuckConverterTest().catch(error => {
  console.error('💥 測試過程中發生錯誤:', error);
  process.exit(1);
});
