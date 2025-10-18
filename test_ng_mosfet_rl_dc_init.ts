/**
 * 測試 NgMosfet RL 電路的 DC 初始條件
 * 目標：確保 DC 工作點正確設置（MOSFET 截止，電感電流為 0）
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { InductorFactory } from './src/components/passive/inductor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgMosfet } from './src/core/ngdevices/ng_mosfet';

async function testDCInit() {
  console.log('='.repeat(80));
  console.log('測試：NgMosfet RL 電路 DC 初始條件');
  console.log('='.repeat(80));

  const VDD = 12;
  const R = 1;
  const L = 1e-3;
  const V_GATE = 0;  // 閘極電壓 = 0V，MOSFET 應該截止

  console.log('\n電路參數:');
  console.log(`  Vdd: ${VDD}V`);
  console.log(`  V_gate: ${V_GATE}V (MOSFET 應截止)`);
  console.log(`  R: ${R}Ω`);
  console.log(`  L: ${L * 1e3}mH`);

  // MOSFET 參數
  const mosfetParams = {
    TYPE: 'NMOS' as const,
    VTO: 4.0,
    KP: 20e-3,
    W: 1.0,
    L: 10e-6,
    LAMBDA: 0.01,
    PHI: 0.6,
    GAMMA: 0.5
  };

  console.log('\nMOSFET 參數:');
  console.log(`  VTO: ${mosfetParams.VTO}V`);
  console.log(`  KP: ${mosfetParams.KP * 1e3}mA/V²`);

  // 創建電路
  const vdd = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], VDD);
  const vgate = VoltageSourceFactory.createDC('Vgate', ['gate', '0'], V_GATE);
  const resistor = ResistorFactory.create('R1', ['vdd', 'n_rl'], R);
  const inductor = InductorFactory.create('L1', ['n_rl', 'n_drain'], L);
  const mosfet = new NgMosfet('M1', 'n_drain', 'gate', '0', '0', mosfetParams);

  // 只做 DC 分析（endTime=0）
  const engine = new CircuitSimulationEngine({
    endTime: 0,
    initialTimeStep: 0
  });

  engine.addDevices([vdd, vgate, resistor, inductor, mosfet]);

  console.log('\n開始 DC 分析...');
  const result = await engine.runSimulation();

  console.log('\n仿真結果:');
  console.log(`  狀態: ${result.success ? '✓ 成功' : '✗ 失敗'}`);

  if (result.success && result.waveformData) {
    const { nodeVoltages } = result.waveformData;
    const nodeMap = engine['_nodeMapping'] as Map<string, number>;

    console.log('\nDC 工作點:');
    const nodes = ['vdd', 'gate', 'n_drain', 'n_rl', '0'];
    for (const nodeName of nodes) {
      const idx = nodeMap.get(nodeName);
      if (idx !== undefined) {
        const v = nodeVoltages.get(idx)?.[0] || 0;
        console.log(`  V(${nodeName}): ${v.toFixed(6)}V`);
      }
    }

    // 驗證預期結果
    const vDrain = nodeVoltages.get(nodeMap.get('n_drain')!)?.[0] || 0;
    const vRL = nodeVoltages.get(nodeMap.get('n_rl')!)?.[0] || 0;
    
    console.log('\n預期行為:');
    console.log(`  MOSFET 截止 (Vgs=${V_GATE}V < VTO=${mosfetParams.VTO}V)`);
    console.log(`  電感電流: 0A`);
    console.log(`  V(n_drain) ≈ V(n_rl) ≈ V(vdd) = ${VDD}V (無電流時)`);

    console.log('\n實際結果:');
    console.log(`  V(n_drain): ${vDrain.toFixed(6)}V`);
    console.log(`  V(n_rl): ${vRL.toFixed(6)}V`);
    
    // 檢查是否合理
    const vDrainOK = Math.abs(vDrain - VDD) < 0.1;  // 應該接近 VDD
    const vRLOK = Math.abs(vRL - VDD) < 0.1;
    
    console.log('\n驗證:');
    console.log(`  V(n_drain) ≈ ${VDD}V: ${vDrainOK ? '✓' : '✗'}`);
    console.log(`  V(n_rl) ≈ ${VDD}V: ${vRLOK ? '✓' : '✗'}`);

    if (vDrainOK && vRLOK) {
      console.log('\n' + '='.repeat(80));
      console.log('測試結果: ✓ DC 初始條件正確');
      console.log('='.repeat(80));
    } else {
      console.log('\n' + '='.repeat(80));
      console.log('測試結果: ✗ DC 初始條件錯誤');
      console.log('='.repeat(80));
    }

  } else {
    console.error('錯誤:', result.errorMessage);
    console.log('\n' + '='.repeat(80));
    console.log('測試結果: ✗ 失敗');
    console.log('='.repeat(80));
  }
}

testDCInit().catch(console.error);
