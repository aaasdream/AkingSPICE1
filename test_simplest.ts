/**
 * 最簡單的測試 - 只有電壓源和電阻
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';

async function testSimplest() {
  console.log('最簡單測試：Vdd -> R -> GND');
  console.log('預期：V(n1) = 12V, I = 12V / 1Ω = 12A');
  
  const vdd = VoltageSourceFactory.createDC('Vdd', ['n1', '0'], 12);
  const r1 = ResistorFactory.create('R1', ['n1', '0'], 1);

  const engine = new CircuitSimulationEngine({
    endTime: 0,
    initialTimeStep: 0
  });

  engine.addDevices([vdd, r1]);

  console.log('\n節點映射:');
  const nodeMap = engine['_nodeMapping'] as Map<string, number>;
  nodeMap.forEach((idx, name) => {
    console.log(`  ${name} -> ${idx}`);
  });

  // 啟用詳細日誌
  (engine as any)._config.debug = true;
  
  const result = await engine.runSimulation();

  if (result.success && result.waveformData) {
    const { nodeVoltages } = result.waveformData;
    
    console.log('\n結果:');
    const n1Idx = nodeMap.get('n1');
    const gndIdx = nodeMap.get('0');
    
    if (n1Idx !== undefined) {
      const v_n1 = nodeVoltages.get(n1Idx)?.[0] || 0;
      console.log(`  V(n1) = ${v_n1.toFixed(3)}V`);
      console.log(`  預期 V(n1) = 12.000V`);
      
      if (Math.abs(v_n1 - 12) < 0.001) {
        console.log('  ✓ 正確！');
      } else {
        console.log(`  ✗ 錯誤！誤差 = ${(v_n1 - 12).toFixed(3)}V`);
      }
    }
    
    if (gndIdx !== undefined) {
      const v_gnd = nodeVoltages.get(gndIdx)?.[0] || 0;
      console.log(`  V(0) = ${v_gnd.toFixed(3)}V`);
      console.log(`  預期 V(0) = 0.000V`);
      
      if (Math.abs(v_gnd) < 0.001) {
        console.log('  ✓ 正確！');
      } else {
        console.log(`  ✗ 錯誤！GND 應該是 0V`);
      }
    }
  } else {
    console.error('仿真失敗:', result.errorMessage);
  }
}

testSimplest().catch(console.error);
