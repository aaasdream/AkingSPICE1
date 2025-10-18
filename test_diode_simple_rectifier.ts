/**
 * 简化的二极体整流测试 - 只看前几个时间点
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgDiode } from './src/core/ngdevices/ng_diode';

async function test() {
  console.log('='.repeat(80));
  console.log('简化二极体整流测试');
  console.log('='.repeat(80));

  // 电路: V_ac -> D1 -> R -> GND
  const vac = VoltageSourceFactory.createSine(
    'Vac',
    ['n_ac', '0'],
    0,     // DC offset
    12,    // amplitude
    60     // frequency
  );

  const diode = new NgDiode('D1', 'n_ac', 'n_out', {
    IS: 1e-14,
    N: 1.0,
    CJO: 0,  // 暂时不考虑电容
  });

  const rload = ResistorFactory.create('R1', ['n_out', '0'], 1000);

  const engine = new CircuitSimulationEngine({
    endTime: 1e-3,  // 1ms
    initialTimeStep: 1e-4,
    maxTimeStep: 1e-4,
    minTimeStep: 1e-5
  });

  engine.addDevices([vac, diode, rload]);

  console.log('\n开始瞬态分析...');
  const result = await engine.runSimulation();

  if (result.success && result.waveformData) {
    const { timePoints, nodeVoltages } = result.waveformData;
    const nodeMap = engine['_nodeMapping'] as Map<string, number>;

    console.log(`\n节点映射:`);
    console.log(`  n_ac -> ${nodeMap.get('n_ac')}`);
    console.log(`  n_out -> ${nodeMap.get('n_out')}`);
    console.log(`  0 -> ${nodeMap.get('0')}`);

    const acIdx = nodeMap.get('n_ac');
    const outIdx = nodeMap.get('n_out');

    if (acIdx !== undefined && outIdx !== undefined) {
      const V_ac = nodeVoltages.get(acIdx) || [];
      const V_out = nodeVoltages.get(outIdx) || [];

      console.log(`\n前 10 个时间点:`);
      for (let i = 0; i < Math.min(10, timePoints.length); i++) {
        const t = timePoints[i];
        const v_ac = V_ac[i];
        const v_out = V_out[i];
        const v_d = v_ac - v_out;
        console.log(`  t=${(t*1000).toFixed(3)}ms: V_ac=${v_ac.toFixed(6)}V, V_out=${v_out.toFixed(6)}V, V_d=${v_d.toFixed(6)}V`);
      }
    }
  } else {
    console.error('仿真失败!');
  }
}

test().catch(console.error);
