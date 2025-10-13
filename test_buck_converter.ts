/**
 * 🔋 Buck 降壓轉換器測試
 * 
 * 電路拓撲：
 * Vin (12V) -- [MOSFET M1] -- [Diode D1] -- L1 (10μH) -- C1 (100μF) || R_load (5Ω) -- GND
 *                  |                |
 *              PWM Gate         GND (續流)
 * 
 * 設計參數：
 * - 輸入電壓: 12V
 * - 輸出電壓: 5V (目標)
 * - 開關頻率: 100kHz (週期 10μs)
 * - 占空比: 5V/12V ≈ 42%
 * - 負載電流: 5V/5Ω = 1A
 * - 輸出功率: 5W
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { IntelligentMOSFET } from './src/core/devices/intelligent_mosfet';
import { IntelligentDiode } from './src/core/devices/intelligent_diode';
import { Inductor } from './src/components/passive/inductor';
import { Capacitor } from './src/components/passive/capacitor';
import { Resistor } from './src/components/passive/resistor';
import { VoltageSource } from './src/components/sources/voltage_source';
import type { MOSFETParameters, DiodeParameters } from './src/core/devices/intelligent_device_model';

async function testBuckConverter() {
  console.log('🔋 開始測試經典 Buck 降壓轉換器\n');
  
  // MOSFET 參數 (N-channel, power MOSFET)
  const mosfetParams: MOSFETParameters = {
    Vth: 2.0,         // 閾值電壓 2V
    Kp: 0.05,         // 跨導參數 (較大以支持 1A 電流)
    lambda: 0.01,     // 溝道調制係數
    Cgs: 500e-12,     // 閘源電容 500pF
    Cgd: 100e-12,     // 閘漏電容 100pF (Miller 電容)
    Ron: 0.1,         // 導通電阻 100mΩ
    Roff: 1e9,        // 關斷電阻 1GΩ
    Vmax: 50,         // 最大電壓 50V
    Imax: 5           // 最大電流 5A
  };
  
  // 續流二極體參數 (Schottky diode, fast recovery)
  const diodeParams: DiodeParameters = {
    Is: 1e-12,        // 飽和電流 (Schottky 較大)
    n: 1.05,          // 理想因子 (Schottky 接近 1)
    Rs: 0.05,         // 串聯電阻 50mΩ
    Cj0: 100e-12,     // 零偏結電容 100pF
    Vj: 0.4,          // 結電位 (Schottky 約 0.3-0.4V)
    m: 0.5,           // 分級係數
    tt: 10e-9         // 渡越時間 10ns (fast recovery)
  };
  
  // 創建模擬引擎
  const engine = new CircuitSimulationEngine({
    endTime: 100e-6,        // 模擬 100μs (10 個開關週期)
    initialTimeStep: 50e-9, // 初始步長 50ns
    maxTimeStep: 500e-9,    // 最大步長 500ns (開關週期的 1/20)
    minTimeStep: 1e-9       // 最小步長 1ns
  });
  
  console.log('📐 電路配置:');
  console.log('  Vin = 12V');
  console.log('  Vout (目標) = 5V');
  console.log('  開關頻率 = 100kHz (週期 10μs)');
  console.log('  占空比 = 42% (4.2μs on, 5.8μs off)');
  console.log('  L = 10μH, C = 100μF, R_load = 5Ω');
  console.log('  預期輸出電流 = 1A\n');
  
  // 輸入電壓源
  engine.addDevice(new VoltageSource('Vin', ['n_vin', '0'], 12));
  
  // PWM 閘極驅動信號 (100kHz, 42% 占空比)
  // 🔥 關鍵改進: 添加 1μs 延遲,讓電路從 DC 穩態開始
  engine.addDevice(new VoltageSource('V_gate', ['n_gate', '0'], 0, {
    type: 'PULSE',
    parameters: {
      v1: 0,              // 關閉電壓
      v2: 10,             // 導通電壓 (遠大於 Vth)
      delay: 1e-6,        // 🔥 延遲 1μs 啟動,避免 t=0 浪湧
      rise_time: 50e-9,   // 上升時間 50ns (更慢的邊沿)
      fall_time: 50e-9,   // 下降時間 50ns
      pulse_width: 4.2e-6, // 導通時間 4.2μs (42%)
      period: 10e-6       // 週期 10μs (100kHz)
    }
  }));
  
  // 功率開關 MOSFET
  engine.addDevice(new IntelligentMOSFET('M1', ['n_vin', 'n_gate', 'n_sw'], mosfetParams));
  
  // 續流二極體 (陰極接開關節點,陽極接地)
  engine.addDevice(new IntelligentDiode('D1', ['0', 'n_sw'], diodeParams));
  
  // LC 濾波器
  engine.addDevice(new Inductor('L1', ['n_sw', 'n_out'], 10e-6));    // 10μH
  engine.addDevice(new Capacitor('C1', ['n_out', '0'], 100e-6));     // 100μF
  
  // 負載電阻
  engine.addDevice(new Resistor('R_load', ['n_out', '0'], 5));       // 5Ω (1A @ 5V)
  
  console.log('⚙️  開始模擬...\n');
  
  const startTime = Date.now();
  const result = await engine.runSimulation();
  const endTime = Date.now();
  
  console.log(`\n⏱️  模擬耗時: ${(endTime - startTime) / 1000} 秒\n`);
  
  if (!result.success) {
    console.error('❌ Buck 轉換器模擬失敗!');
    console.error(`   原因: ${result.message || '未知錯誤'}`);
    return false;
  }
  
  console.log('✅ Buck 轉換器模擬成功!\n');
  
  // 分析結果
  const nodeOut = engine.getNodeIdByName('n_out');
  const nodeSw = engine.getNodeIdByName('n_sw');
  const timePoints = result.waveformData.timePoints;
  
  if (nodeOut !== undefined && nodeSw !== undefined) {
    const vOut = result.waveformData.nodeVoltages.get(nodeOut);
    const vSw = result.waveformData.nodeVoltages.get(nodeSw);
    
    if (vOut && vSw && timePoints.length > 0) {
      console.log('📊 波形分析:');
      console.log(`   總時間點數: ${timePoints.length}`);
      
      // 輸出電壓統計
      const vOutArray = Array.from(vOut);
      const avgVout = vOutArray.reduce((sum, v) => sum + v, 0) / vOutArray.length;
      const maxVout = Math.max(...vOutArray);
      const minVout = Math.min(...vOutArray);
      const rippleVout = maxVout - minVout;
      
      console.log(`\n   輸出電壓 (n_out):`);
      console.log(`     平均值: ${avgVout.toFixed(3)} V`);
      console.log(`     最大值: ${maxVout.toFixed(3)} V`);
      console.log(`     最小值: ${minVout.toFixed(3)} V`);
      console.log(`     紋波: ${(rippleVout * 1000).toFixed(1)} mV (${(rippleVout / avgVout * 100).toFixed(2)}%)`);
      
      // 開關節點電壓統計
      const vSwArray = Array.from(vSw);
      const avgVsw = vSwArray.reduce((sum, v) => sum + v, 0) / vSwArray.length;
      const maxVsw = Math.max(...vSwArray);
      const minVsw = Math.min(...vSwArray);
      
      console.log(`\n   開關節點電壓 (n_sw):`);
      console.log(`     平均值: ${avgVsw.toFixed(3)} V`);
      console.log(`     最大值: ${maxVsw.toFixed(3)} V`);
      console.log(`     最小值: ${minVsw.toFixed(3)} V`);
      
      // 評估性能
      console.log(`\n🎯 性能評估:`);
      
      const targetVout = 5.0;
      const errorPercent = Math.abs(avgVout - targetVout) / targetVout * 100;
      
      if (errorPercent < 5) {
        console.log(`   ✅ 輸出電壓準確度: ${errorPercent.toFixed(2)}% (優秀)`);
      } else if (errorPercent < 10) {
        console.log(`   ⚠️  輸出電壓準確度: ${errorPercent.toFixed(2)}% (可接受)`);
      } else {
        console.log(`   ❌ 輸出電壓準確度: ${errorPercent.toFixed(2)}% (不合格)`);
      }
      
      if (rippleVout / avgVout < 0.05) {
        console.log(`   ✅ 輸出紋波: ${(rippleVout / avgVout * 100).toFixed(2)}% (優秀)`);
      } else if (rippleVout / avgVout < 0.10) {
        console.log(`   ⚠️  輸出紋波: ${(rippleVout / avgVout * 100).toFixed(2)}% (可接受)`);
      } else {
        console.log(`   ❌ 輸出紋波: ${(rippleVout / avgVout * 100).toFixed(2)}% (過大)`);
      }
      
      // 檢查是否有數值異常
      const hasInvalidVout = vOutArray.some(v => !isFinite(v));
      const hasInvalidVsw = vSwArray.some(v => !isFinite(v));
      
      if (!hasInvalidVout && !hasInvalidVsw) {
        console.log(`   ✅ 數值穩定性: 無 NaN/Inf`);
      } else {
        console.log(`   ❌ 數值穩定性: 存在 NaN/Inf`);
      }
      
      // 輸出最後幾個週期的數據
      console.log(`\n📈 最後一個開關週期的數據 (90-100μs):`);
      const timeArray = Array.from(timePoints);
      for (let i = Math.max(0, timeArray.length - 20); i < timeArray.length; i++) {
        const t = timeArray[i]!;
        if (t >= 90e-6) {
          console.log(`   t = ${(t * 1e6).toFixed(3)} μs: Vout = ${vOutArray[i]!.toFixed(3)} V, Vsw = ${vSwArray[i]!.toFixed(3)} V`);
        }
      }
      
      return errorPercent < 10 && rippleVout / avgVout < 0.10 && !hasInvalidVout && !hasInvalidVsw;
    }
  }
  
  console.log('⚠️  無法獲取輸出電壓數據');
  return false;
}

// 執行測試
testBuckConverter()
  .then(success => {
    console.log('\n' + '='.repeat(60));
    if (success) {
      console.log('🎉 Buck 轉換器測試通過!');
      process.exit(0);
    } else {
      console.log('❌ Buck 轉換器測試失敗!');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('\n💥 測試過程中發生錯誤:');
    console.error(err);
    process.exit(1);
  });
