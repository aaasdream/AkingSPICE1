/**
 * 測試 RC 電路瞬態分析
 * 
 * 電路：Vdd(12V) -> R(10Ω) -> C(1μF) -> GND
 * 
 * 預期：V(n1) = 12V * (1 - e^(-t/RC))，其中 RC = 10Ω * 1μF = 10μs
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { CapacitorFactory } from './src/components/passive/capacitor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';

async function testRCTransient() {
  console.log('測試 RC 電路瞬態分析...\n');

  const vdd = VoltageSourceFactory.createDC('Vdd', ['n1', '0'], 12);
  const resistor = ResistorFactory.create('R1', ['n1', 'n2'], 10);
  const capacitor = CapacitorFactory.create('C1', ['n2', '0'], 1e-6);

  const engine = new CircuitSimulationEngine({
    endTime: 50e-6,  // 5 個時間常數
    initialTimeStep: 1e-6,
    maxTimeStep: 1e-6,
    minTimeStep: 1e-9
  });

  engine.addDevices([vdd, resistor, capacitor]);

  const result = await engine.runSimulation();

  if (result.success && result.waveformData) {
    const nodeMap = engine['_nodeMapping'] as Map<string, number>;
    const n2_idx = nodeMap.get('n2');
    
    if (n2_idx !== undefined) {
      const times = result.waveformData.timePoints;
      const voltages = result.waveformData.nodeVoltages.get(n2_idx) || [];
      
      console.log('\n時間 (μs) | V(n2) (V) | 理論值 (V) | 誤差 (%)');
      console.log('----------|-----------|-----------|----------');
      
      for (let i = 0; i < Math.min(times.length, 10); i += Math.floor(times.length / 10)) {
        const t = times[i];
        const v = voltages[i];
        const tau = 10e-6;  // RC = 10μs
        const v_theory = 12 * (1 - Math.exp(-t / tau));
        const error = Math.abs(v - v_theory) / v_theory * 100;
        
        console.log(`${(t*1e6).toFixed(1).padStart(9)} | ${v.toFixed(3).padStart(9)} | ${v_theory.toFixed(3).padStart(9)} | ${error.toFixed(2).padStart(8)}`);
      }
      
      // 最後一個點
      const lastIdx = times.length - 1;
      const v_final = voltages[lastIdx];
      const v_theory_final = 12 * (1 - Math.exp(-times[lastIdx] / 10e-6));
      
      console.log(`\n最終電壓: V(n2) = ${v_final.toFixed(3)}V (理論: ${v_theory_final.toFixed(3)}V)`);
      console.log(`數據點: ${times.length}`);
      
      if (Math.abs(v_final - v_theory_final) < 0.5) {
        console.log('\n✅ 測試通過：RC 瞬態分析正常');
      } else {
        console.log('\n❌ 測試失敗：電壓誤差過大');
      }
    } else {
      console.log('❌ 無法找到節點 n2');
    }
  } else {
    console.log(`❌ 仿真失敗: ${result.errorMessage}`);
  }
}

testRCTransient().catch(console.error);
