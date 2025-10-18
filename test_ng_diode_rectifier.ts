/**
 * Test NgDiode Transient Analysis - Half-Wave Rectifier
 * 測試二極體瞬態分析 - 半波整流器
 * 
 * Circuit: AC Source -> D -> R -> GND
 *                       |
 *                       C
 *                       |
 *                      GND
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { CapacitorFactory } from './src/components/passive/capacitor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgDiode } from './src/core/ngdevices/ng_diode';
import * as fs from 'fs';

async function testDiodeRectifier() {
  console.log('='.repeat(80));
  console.log('測試：NgDiode 瞬態分析 - 半波整流器');
  console.log('='.repeat(80));

  console.log('\n電路描述：');
  console.log('  AC 電源（正弦波）-> 二極體 -> 負載電阻 || 濾波電容');
  console.log('  V_ac = 12V peak, f = 60Hz');
  console.log('  D1: IS=1e-14, N=1.0');
  console.log('  R_load = 1kΩ');
  console.log('  C_filter = 100μF');

  // 電路參數
  const V_peak = 12;          // 12V 峰值
  const freq = 60;            // 60Hz
  const R_load = 1000;        // 1kΩ 負載
  const C_filter = 100e-6;    // 100μF 濾波電容

  // 創建 AC 正弦電壓源: V(t) = V_peak * sin(2π*f*t)
  const vac = VoltageSourceFactory.createSine(
    'Vac',
    ['n_ac', '0'],
    0,       // DC offset
    V_peak,  // amplitude
    freq     // frequency
  );

  // 創建二極體
  const diode = new NgDiode('D1', 'n_ac', 'n_out', {
    IS: 1e-14,
    N: 1.0,
    CJO: 100e-12,  // 100pF junction capacitance (典型值)
    VJ: 0.7,       // Junction potential  
    M: 0.5,        // Grading coefficient
    TT: 1e-9       // Transit time 1ns
  });

  // 負載電阻
  const rload = ResistorFactory.create('R_load', ['n_out', '0'], R_load);

  // 濾波電容
  const cfilter = CapacitorFactory.create('C_filter', ['n_out', '0'], C_filter);

  // 仿真時間：3 個週期
  const period = 1 / freq;  // 週期 = 1/60s ≈ 16.67ms
  const endTime = 3 * period;  // 3 個週期 ≈ 50ms
  const timeStep = period / 100;  // 每個週期 100 個點

  console.log('\n仿真參數：');
  console.log(`  週期: ${(period * 1000).toFixed(2)} ms`);
  console.log(`  仿真時間: ${(endTime * 1000).toFixed(2)} ms (3 個週期)`);
  console.log(`  時間步長: ${(timeStep * 1e6).toFixed(2)} μs`);

  // 配置仿真引擎
  const engine = new CircuitSimulationEngine({
    endTime: endTime,
    initialTimeStep: timeStep,
    maxTimeStep: timeStep,
    minTimeStep: timeStep / 10
  });

  // 添加組件
  engine.addDevices([vac, diode, rload, cfilter]);

  console.log('\n開始瞬態分析...');
  const startTime = Date.now();

  try {
    const result = await engine.runSimulation();
    const simTime = Date.now() - startTime;

    console.log('\n仿真結果:');
    console.log(`  狀態: ${result.success ? '✅ 成功' : '❌ 失敗'}`);
    console.log(`  耗時: ${(simTime / 1000).toFixed(2)} 秒`);

    if (result.success && result.waveformData) {
      const { timePoints, nodeVoltages } = result.waveformData;
      const nodeMap = engine['_nodeMapping'] as Map<string, number>;

      console.log(`  數據點數: ${timePoints.length}`);

      // 獲取節點索引
      const acIdx = nodeMap.get('n_ac');
      const outIdx = nodeMap.get('n_out');

      if (acIdx !== undefined && outIdx !== undefined) {
        const V_ac = nodeVoltages.get(acIdx) || [];
        const V_out = nodeVoltages.get(outIdx) || [];

        // 統計分析
        let maxVout = -Infinity;
        let minVout = Infinity;
        let avgVout = 0;
        let maxVac = -Infinity;
        let minVac = Infinity;

        for (let i = 0; i < V_out.length; i++) {
          const vOut = V_out[i];
          const vAc = V_ac[i];
          
          if (!isNaN(vOut) && isFinite(vOut)) {
            maxVout = Math.max(maxVout, vOut);
            minVout = Math.min(minVout, vOut);
            avgVout += vOut;
          }
          
          if (!isNaN(vAc) && isFinite(vAc)) {
            maxVac = Math.max(maxVac, vAc);
            minVac = Math.min(minVac, vAc);
          }
        }
        avgVout /= V_out.length;

        console.log('\n輸入（AC 電壓）:');
        console.log(`  峰值: ${maxVac.toFixed(3)}V`);
        console.log(`  谷值: ${minVac.toFixed(3)}V`);
        console.log(`  峰峰值: ${(maxVac - minVac).toFixed(3)}V`);

        console.log('\n輸出（整流後）:');
        console.log(`  最大值: ${maxVout.toFixed(3)}V`);
        console.log(`  最小值: ${minVout.toFixed(3)}V`);
        console.log(`  平均值: ${avgVout.toFixed(3)}V`);
        console.log(`  紋波: ${(maxVout - minVout).toFixed(3)}V`);
        console.log(`  紋波率: ${((maxVout - minVout) / avgVout * 100).toFixed(1)}%`);

        // 理論計算
        const V_dc_theory = V_peak / Math.PI;  // 半波整流平均值
        const V_peak_theory = V_peak - 0.7;    // 考慮二極體壓降
        
        console.log('\n理論值比較:');
        console.log(`  理論 DC 電壓: ${V_dc_theory.toFixed(3)}V (無電容)`);
        console.log(`  理論峰值電壓: ${V_peak_theory.toFixed(3)}V (Vpeak - 0.7V)`);
        console.log(`  實測峰值: ${maxVout.toFixed(3)}V`);
        console.log(`  誤差: ${(Math.abs(maxVout - V_peak_theory) / V_peak_theory * 100).toFixed(1)}%`);

        // 檢查數據完整性
        let hasNaN = false;
        let hasInf = false;
        
        for (let i = 0; i < V_out.length; i++) {
          if (isNaN(V_out[i])) hasNaN = true;
          if (!isFinite(V_out[i])) hasInf = true;
        }

        if (hasNaN || hasInf) {
          console.log('\n⚠️  警告：');
          if (hasNaN) console.log('  - 數據中包含 NaN');
          if (hasInf) console.log('  - 數據中包含 Infinity');
        } else {
          console.log('\n✅ 數據完整性檢查通過');
        }

        // 輸出到 CSV 文件
        const csvLines = ['time(s),V_ac(V),V_out(V),I_diode(A)'];
        
        for (let i = 0; i < timePoints.length; i++) {
          const t = timePoints[i];
          const vAc = V_ac[i] || 0;
          const vOut = V_out[i] || 0;
          const iDiode = (vAc > vOut) ? (vAc - vOut) / 0.7 : 0;  // 簡化電流估算
          
          csvLines.push(`${t.toExponential(6)},${vAc.toFixed(6)},${vOut.toFixed(6)},${iDiode.toExponential(6)}`);
        }

        const csvContent = csvLines.join('\n');
        fs.writeFileSync('test_diode_rectifier_output.csv', csvContent);
        console.log('\n📁 CSV 文件已保存: test_diode_rectifier_output.csv');

        // 顯示前幾個和後幾個時間點
        console.log('\n前 5 個時間點:');
        console.log('  time(ms)    V_ac(V)    V_out(V)');
        console.log('  ' + '-'.repeat(40));
        for (let i = 0; i < Math.min(5, timePoints.length); i++) {
          const t = timePoints[i] * 1000;
          const vAc = V_ac[i] || 0;
          const vOut = V_out[i] || 0;
          console.log(`  ${t.toFixed(3).padStart(8)}    ${vAc.toFixed(3).padStart(7)}    ${vOut.toFixed(3).padStart(8)}`);
        }

        console.log('\n最後 5 個時間點:');
        console.log('  time(ms)    V_ac(V)    V_out(V)');
        console.log('  ' + '-'.repeat(40));
        for (let i = Math.max(0, timePoints.length - 5); i < timePoints.length; i++) {
          const t = timePoints[i] * 1000;
          const vAc = V_ac[i] || 0;
          const vOut = V_out[i] || 0;
          console.log(`  ${t.toFixed(3).padStart(8)}    ${vAc.toFixed(3).padStart(7)}    ${vOut.toFixed(3).padStart(8)}`);
        }

        // 驗證整流效果
        console.log('\n整流效果驗證:');
        let positiveCount = 0;
        let negativeCount = 0;
        
        for (let i = 0; i < V_out.length; i++) {
          if (V_out[i] > 0.1) positiveCount++;
          if (V_out[i] < -0.1) negativeCount++;
        }

        console.log(`  正電壓點數: ${positiveCount}/${V_out.length} (${(positiveCount/V_out.length*100).toFixed(1)}%)`);
        console.log(`  負電壓點數: ${negativeCount}/${V_out.length} (${(negativeCount/V_out.length*100).toFixed(1)}%)`);

        if (negativeCount === 0 && positiveCount > V_out.length * 0.4) {
          console.log('  ✅ 整流效果良好（無負電壓）');
        } else if (negativeCount > 0) {
          console.log('  ⚠️  警告：輸出包含負電壓');
        }

        // 電容充放電檢查
        console.log('\n電容濾波效果:');
        const rippleVoltage = maxVout - minVout;
        const rcTime = R_load * C_filter;
        console.log(`  RC 時間常數: ${(rcTime * 1000).toFixed(2)} ms`);
        console.log(`  放電時間 (週期): ${(period * 1000).toFixed(2)} ms`);
        console.log(`  時間常數比: ${(rcTime / period).toFixed(2)}`);
        
        if (rcTime > period) {
          console.log('  ✅ RC >> T，濾波效果良好');
        } else {
          console.log('  ⚠️  RC < T，紋波可能較大');
        }

      } else {
        console.log('❌ 無法找到節點索引');
      }

      console.log('\n' + '='.repeat(80));
      console.log('測試結果: ✅ 瞬態分析成功');
      console.log('='.repeat(80));

    } else {
      console.error('\n錯誤:', result.errorMessage);
      console.log('\n' + '='.repeat(80));
      console.log('測試結果: ❌ 失敗');
      console.log('='.repeat(80));
    }

  } catch (error) {
    console.error('\n仿真過程中發生異常:', error);
    if (error instanceof Error) {
      console.error('錯誤堆疊:', error.stack);
    }
    console.log('\n' + '='.repeat(80));
    console.log('測試結果: ❌ 失敗');
    console.log('='.repeat(80));
  }
}

// 執行測試
testDiodeRectifier().catch(console.error);
