/**
 * 調試版本的 NgMosfet DC 測試
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgMosfet } from './src/core/ngdevices/ng_mosfet';

async function testDebug() {
  console.log('='.repeat(80));
  console.log('調試：檢查 MOSFET 矩陣組裝');
  console.log('='.repeat(80));

  const mosfetParams = {
    TYPE: 'NMOS' as const,
    VTO: 2.0,
    KP: 50e-3,
    W: 100e-6,
    L: 10e-6,
    LAMBDA: 0.01,
    PHI: 0.6,
    GAMMA: 0
  };

  const vdd = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], 12);
  const vgate = VoltageSourceFactory.createDC('Vgate', ['gate', '0'], 10);
  const resistor = ResistorFactory.create('R1', ['vdd', 'n_drain'], 1);
  const mosfet = new NgMosfet('M1', 'n_drain', 'gate', '0', '0', mosfetParams);

  const engine = new CircuitSimulationEngine({
    endTime: 0,
    initialTimeStep: 0
  });

  engine.addDevices([vdd, vgate, resistor, mosfet]);

  console.log('\n節點映射:');
  const nodeMap = engine['_nodeMapping'] as Map<string, number>;
  nodeMap.forEach((idx, name) => {
    console.log(`  ${name} -> ${idx}`);
  });

  console.log('\n手動計算預期值:');
  console.log('  假設 MOSFET 在飽和區:');
  console.log('  V_GS = 10V, V_OV = 10-2 = 8V');
  const beta = mosfetParams.KP * (mosfetParams.W / mosfetParams.L);
  console.log(`  β = KP * W/L = ${beta * 1e3}mA/V²`);
  const iD_sat = 0.5 * beta * 8 * 8;
  console.log(`  I_D(sat) = 0.5 * β * V_OV² = ${(iD_sat * 1e3).toFixed(3)}mA`);
  const vD_sat = 12 - iD_sat * 1;
  console.log(`  V_D = Vdd - I_D*R = ${vD_sat.toFixed(3)}V`);
  console.log(`  V_DS = V_D - 0 = ${vD_sat.toFixed(3)}V`);
  
  if (vD_sat > 8) {
    console.log(`  ✓ V_DS (${vD_sat.toFixed(1)}V) > V_OV (8V) -> 確實在飽和區`);
  } else {
    console.log(`  ✗ V_DS (${vD_sat.toFixed(1)}V) < V_OV (8V) -> 應該在線性區`);
  }

  console.log('\n開始仿真...\n');

  try {
    const result = await engine.runSimulation();

    if (result.success && result.waveformData) {
      const { nodeVoltages } = result.waveformData;
      
      console.log('\n實際仿真結果:');
      const drainIdx = nodeMap.get('n_drain');
      const vddIdx = nodeMap.get('vdd');
      const gateIdx = nodeMap.get('gate');
      
      if (drainIdx !== undefined && vddIdx !== undefined && gateIdx !== undefined) {
        const vD = nodeVoltages.get(drainIdx)?.[0] || 0;
        const vVdd = nodeVoltages.get(vddIdx)?.[0] || 0;
        const vG = nodeVoltages.get(gateIdx)?.[0] || 0;
        
        console.log(`  V_vdd節點: ${vVdd.toFixed(3)}V`);
        console.log(`  V_gate節點: ${vG.toFixed(3)}V`);
        console.log(`  V_drain節點: ${vD.toFixed(3)}V`);
        console.log(`  電阻壓降: ${(vVdd - vD).toFixed(3)}V`);
        console.log(`  電流: ${((vVdd - vD) / 1.0 * 1000).toFixed(3)}mA`);
        
        // 檢查 MOSFET 內部狀態
        const info = mosfet.getInfo();
        console.log('\nMOSFET 內部狀態:');
        console.log(`  vgs: ${info.parameters?.vgs?.toFixed(3)}V`);
        console.log(`  vds: ${info.parameters?.vds?.toFixed(3)}V`);
        console.log(`  id: ${(info.parameters?.id as number * 1000).toFixed(3)}mA`);
        console.log(`  mode: ${info.parameters?.mode}`);
        
        const expectedSign = vD > 0 ? '+' : '-';
        const actualSign = vD > 0 ? '+' : '-';
        console.log(`\n極性檢查:`);
        console.log(`  預期 V_drain: ${expectedSign} (應該是正的，接近 ${vD_sat.toFixed(1)}V)`);
        console.log(`  實際 V_drain: ${actualSign}${Math.abs(vD).toFixed(3)}V`);
        
        if (vD < 0) {
          console.log('\n❌ 錯誤！V_drain 是負值，這表示電流方向錯誤');
          console.log('   可能的原因：');
          console.log('   1. 矩陣組裝時符號錯誤');
          console.log('   2. RHS 向量的電流方向錯誤');
          console.log('   3. Mode 判斷或 xnrm/xrev 邏輯錯誤');
        } else if (Math.abs(vD - vD_sat) < 0.5) {
          console.log('\n✓ V_drain 值合理，接近理論值');
        } else {
          console.log(`\n⚠️ V_drain 與理論值差距較大 (誤差: ${Math.abs(vD - vD_sat).toFixed(3)}V)`);
        }
      }
    } else {
      console.error('\n仿真失敗:', result.errorMessage);
    }
  } catch (error) {
    console.error('\n異常:', error);
  }
}

testDebug().catch(console.error);
