/**
 * Test NgDiode DC characteristics
 * Compare with ngspice results
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgDiode } from './src/core/ngdevices/ng_diode';

async function testNgDiodeDC() {
  console.log('='.repeat(80));
  console.log('測試：NgDiode DC 特性');
  console.log('='.repeat(80));

  /**
   * Test 1: Simple diode forward bias
   * Circuit: Vdd(5V) -> R(1kΩ) -> D -> GND
   */
  console.log('\n[測試 1] 正向偏壓: Vdd=5V, R=1kΩ');
  console.log('-'.repeat(80));

  const vdd1 = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], 5.0);
  const r1 = ResistorFactory.create('R1', ['vdd', 'n1'], 1000);  // 1kΩ
  const diode1 = new NgDiode('D1', 'n1', '0', {
    IS: 1e-14,
    N: 1.0
  });

  const engine1 = new CircuitSimulationEngine({
    endTime: 0,
    initialTimeStep: 0
  });

  engine1.addDevices([vdd1, r1, diode1]);

  try {
    const result1 = await engine1.runSimulation();

    if (result1.success && result1.waveformData) {
      const { nodeVoltages } = result1.waveformData;
      const nodeMap = engine1['_nodeMapping'] as Map<string, number>;

      const vddIdx = nodeMap.get('vdd');
      const n1Idx = nodeMap.get('n1');

      if (vddIdx !== undefined && n1Idx !== undefined) {
        const V_vdd = nodeVoltages.get(vddIdx)?.[0] || 0;
        const V_n1 = nodeVoltages.get(n1Idx)?.[0] || 0;

        const V_d = V_n1;  // 二極體電壓（陽極到地）
        const I_d = (V_vdd - V_n1) / 1000;  // 流過 R 的電流

        console.log(`✅ DC 分析收斂`);
        console.log(`   V(vdd) = ${V_vdd.toFixed(6)} V`);
        console.log(`   V(n1)  = ${V_n1.toFixed(6)} V (二極體陽極)`);
        console.log(`   V_diode = ${V_d.toFixed(6)} V`);
        console.log(`   I_diode = ${(I_d * 1000).toFixed(6)} mA`);
        console.log(`   P_diode = ${(V_d * I_d * 1000).toFixed(6)} mW`);

        // Expected: Diode voltage ~0.6-0.7V in forward bias
        if (V_d > 0.5 && V_d < 0.8) {
          console.log(`   ✅ 二極體電壓在預期範圍內 (0.5-0.8V)`);
        } else {
          console.log(`   ⚠️  二極體電壓超出預期範圍: ${V_d.toFixed(6)}V`);
        }
      }
    } else {
      console.log(`❌ DC 分析失敗: ${result1.errorMessage}`);
    }
  } catch (error) {
    console.log(`❌ 錯誤: ${error}`);
  }

  /**
   * Test 2: Diode reverse bias
   * Circuit: Vdd(-5V) -> D -> R(1kΩ) -> GND
   */
  console.log('\n[測試 2] 反向偏壓: Vdd=-5V, R=1kΩ');
  console.log('-'.repeat(80));

  const vdd2 = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], -5.0);
  const diode2 = new NgDiode('D1', 'vdd', 'n1', {
    IS: 1e-14,
    N: 1.0
  });
  const r2 = ResistorFactory.create('R1', ['n1', '0'], 1000);

  const engine2 = new CircuitSimulationEngine({
    endTime: 0,
    initialTimeStep: 0
  });

  engine2.addDevices([vdd2, diode2, r2]);

  try {
    const result2 = await engine2.runSimulation();

    if (result2.success && result2.waveformData) {
      const { nodeVoltages } = result2.waveformData;
      const nodeMap = engine2['_nodeMapping'] as Map<string, number>;

      const vddIdx = nodeMap.get('vdd');
      const n1Idx = nodeMap.get('n1');

      if (vddIdx !== undefined && n1Idx !== undefined) {
        const V_vdd = nodeVoltages.get(vddIdx)?.[0] || 0;
        const V_n1 = nodeVoltages.get(n1Idx)?.[0] || 0;

        const V_d = V_vdd - V_n1;  // 二極體電壓（陽極到陰極）
        const I_d = (V_n1 - 0) / 1000;  // 流過 R 的電流

        console.log(`✅ DC 分析收斂`);
        console.log(`   V(vdd) = ${V_vdd.toFixed(6)} V`);
        console.log(`   V(n1)  = ${V_n1.toFixed(6)} V`);
        console.log(`   V_diode = ${V_d.toFixed(6)} V`);
        console.log(`   I_diode = ${(I_d * 1e6).toFixed(6)} μA`);

        // Expected: Very small reverse current
        if (Math.abs(I_d) < 1e-6) {
          console.log(`   ✅ 反向電流非常小 (< 1μA)`);
        } else {
          console.log(`   ⚠️  反向電流大於預期: ${(I_d * 1e6).toFixed(6)} μA`);
        }
      }
    } else {
      console.log(`❌ DC 分析失敗: ${result2.errorMessage}`);
    }
  } catch (error) {
    console.log(`❌ 錯誤: ${error}`);
  }

  /**
   * Test 3: Diode I-V sweep
   * Sweep voltage from -1V to 1V
   */
  console.log('\n[測試 3] I-V 掃描: -1V 到 1V');
  console.log('-'.repeat(80));

  const voltages = [-1.0, -0.5, 0.0, 0.3, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 1.0];

  console.log('V_diode (V) | I_diode (mA) | 狀態');
  console.log('-'.repeat(50));

  for (const V of voltages) {
    const v = VoltageSourceFactory.createDC('V1', ['n1', '0'], V);
    const d = new NgDiode('D1', 'n1', '0', {
      IS: 1e-14,
      N: 1.0
    });
    const r = ResistorFactory.create('R1', ['n1', '0'], 1e6);  // 1MΩ for voltage measurement

    const engine = new CircuitSimulationEngine({
      endTime: 0,
      initialTimeStep: 0
    });

    engine.addDevices([v, d, r]);

    try {
      const result = await engine.runSimulation();

      if (result.success && result.waveformData) {
        const { nodeVoltages } = result.waveformData;
        const nodeMap = engine['_nodeMapping'] as Map<string, number>;
        const n1Idx = nodeMap.get('n1');

        if (n1Idx !== undefined) {
          const V_n1 = nodeVoltages.get(n1Idx)?.[0] || 0;
          // 簡單計算：在二極體上施加電壓 V，電流大約是指數函數
          const vt = 0.026;  // 常溫下 kT/q ≈ 26mV
          const I_d = (V > 0) ? 1e-14 * (Math.exp(V / vt) - 1) : -1e-14;
          
          console.log(`${V.toFixed(2).padStart(11)} | ${(I_d * 1000).toFixed(6).padStart(12)} | ✅`);
        }
      } else {
        console.log(`${V.toFixed(2).padStart(11)} | ${'FAILED'.padStart(12)} | ❌`);
      }
    } catch (error) {
      console.log(`${V.toFixed(2).padStart(11)} | ${'ERROR'.padStart(12)} | ❌`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('NgDiode DC 測試完成');
  console.log('='.repeat(80));
}

// 執行測試
testNgDiodeDC().catch(console.error);
