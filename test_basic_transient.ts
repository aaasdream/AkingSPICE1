/**
 * 測試瞬態分析基本功能
 * 
 * 電路：Vdd(12V) -> R(10Ω) -> GND
 * 
 * 預期：V(n1) = 12V（恆定）
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';

async function testBasicTransient() {
  console.log('測試基本瞬態分析（無 MOSFET）...\n');

  const vdd = VoltageSourceFactory.createDC('Vdd', ['n1', '0'], 12);
  const resistor = ResistorFactory.create('R1', ['n1', '0'], 10);

  const engine = new CircuitSimulationEngine({
    endTime: 1e-6,
    initialTimeStep: 100e-9,
    maxTimeStep: 100e-9,
    minTimeStep: 1e-9
  });

  engine.addDevices([vdd, resistor]);

  const result = await engine.runSimulation();

  if (result.success && result.waveformData) {
    const nodeMap = engine['_nodeMapping'] as Map<string, number>;
    const n1_idx = nodeMap.get('n1');
    const v_n1_0 = n1_idx !== undefined ? (result.waveformData.nodeVoltages.get(n1_idx)?.[0] ?? 0) : 0;
    const lastIdx = result.waveformData.timePoints.length - 1;
    const v_n1_end = n1_idx !== undefined ? (result.waveformData.nodeVoltages.get(n1_idx)?.[lastIdx] ?? 0) : 0;

    console.log(`t=0: V(n1) = ${v_n1_0.toFixed(3)}V`);
    console.log(`t=1μs: V(n1) = ${v_n1_end.toFixed(3)}V`);
    console.log(`數據點: ${result.waveformData.timePoints.length}`);

    if (Math.abs(v_n1_0 - 12) < 0.01 && Math.abs(v_n1_end - 12) < 0.01) {
      console.log('\n✅ 測試通過：瞬態分析基本功能正常');
    } else {
      console.log('\n❌ 測試失敗：電壓不正確');
    }
  } else {
    console.log(`❌ 仿真失敗: ${result.errorMessage}`);
  }
}

testBasicTransient().catch(console.error);
