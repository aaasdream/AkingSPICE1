/**
 * Debug VoltageSource in transient analysis
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { ResistorFactory } from './src/components/passive/resistor';

async function test() {
  console.log('='.repeat(80));
  console.log('DEBUG: VoltageSource 瞬态分析');
  console.log('='.repeat(80));

  // 简单电路: V_ac -> R -> GND
  const vac = VoltageSourceFactory.createSine(
    'Vac',
    ['n1', '0'],
    0,     // DC offset
    12,    // amplitude
    60     // frequency
  );

  const r1 = ResistorFactory.create('R1', ['n1', '0'], 1000);

  const engine = new CircuitSimulationEngine({
    endTime: 1e-3,
    initialTimeStep: 1e-4,
    maxTimeStep: 1e-4,
    minTimeStep: 1e-5
  });

  engine.addDevices([vac, r1]);

  console.log('\n开始瞬态分析...');
  const result = await engine.runSimulation();

  if (result.success && result.waveformData) {
    const { timePoints, nodeVoltages } = result.waveformData;
    const nodeMap = engine['_nodeMapping'] as Map<string, number>;

    console.log(`\n节点映射:`);
    for (const [node, idx] of nodeMap.entries()) {
      console.log(`  ${node} -> ${idx}`);
    }

    const n1Idx = nodeMap.get('n1');
    if (n1Idx !== undefined) {
      const V_n1 = nodeVoltages.get(n1Idx) || [];
      
      console.log(`\n前 10 个时间点:`);
      for (let i = 0; i < Math.min(10, timePoints.length); i++) {
        const t = timePoints[i];
        const v = V_n1[i];
        console.log(`  t=${(t*1000).toFixed(3)}ms: V(n1)=${v.toFixed(6)}V`);
      }
    }
  } else {
    console.error('仿真失败!');
  }
}

test().catch(console.error);
