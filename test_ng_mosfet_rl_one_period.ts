/**
 * 測試 NgMosfet RL 電路的瞬態分析（簡化版）
 * 只模擬 1 個週期，使用較大的初始步長
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { InductorFactory } from './src/components/passive/inductor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgMosfet } from './src/core/ngdevices/ng_mosfet';

async function testOnePeriod() {
  console.log('='.repeat(80));
  console.log('測試：NgMosfet RL 電路 - 單週期瞬態');
  console.log('='.repeat(80));

  const VDD = 12;
  const R = 1;
  const L = 1e-3;
  const PWM_FREQ = 10e3;
  const PWM_PERIOD = 1 / PWM_FREQ;  // 100μs
  const DUTY_CYCLE = 0.5;
  const T_ON = PWM_PERIOD * DUTY_CYCLE;  // 50μs

  console.log('\n電路參數:');
  console.log(`  Vdd: ${VDD}V`);
  console.log(`  R: ${R}Ω`);
  console.log(`  L: ${L * 1e3}mH`);
  console.log(`  PWM: ${PWM_FREQ / 1e3}kHz, ${DUTY_CYCLE * 100}% duty, 週期=${PWM_PERIOD * 1e6}μs`);

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

  // 創建電路
  const vdd = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], VDD);
  const vgate = VoltageSourceFactory.createPulse(
    'Vgate', 
    ['gate', '0'],
    0,        // v1: 低電平 0V
    12,       // v2: 高電平 12V
    0,        // td: 無延遲
    1e-9,     // tr: 1ns
    1e-9,     // tf: 1ns
    T_ON,     // pw: 50μs
    PWM_PERIOD // per: 100μs
  );
  const resistor = ResistorFactory.create('R1', ['vdd', 'n_rl'], R);
  const inductor = InductorFactory.create('L1', ['n_rl', 'n_drain'], L);
  const mosfet = new NgMosfet('M1', 'n_drain', 'gate', '0', '0', mosfetParams);

  // 配置仿真：只模擬1個週期，使用較大的初始步長
  const engine = new CircuitSimulationEngine({
    endTime: PWM_PERIOD,              // 只模擬1個週期 (100μs)
    initialTimeStep: PWM_PERIOD / 100, // 初始步長 = 1μs (較大)
    maxTimeStep: PWM_PERIOD / 50,      // 最大步長 = 2μs
    minTimeStep: 1e-9                  // 最小步長 = 1ns (較大，避免剛性)
  });

  engine.addDevices([vdd, vgate, resistor, inductor, mosfet]);

  console.log('\n開始仿真...');
  const startTime = Date.now();

  try {
    const result = await engine.runSimulation();
    const endTime = Date.now();

    console.log('\n仿真結果:');
    console.log(`  狀態: ${result.success ? '✓ 成功' : '✗ 失敗'}`);
    console.log(`  耗時: ${(endTime - startTime) / 1000}秒`);
    console.log(`  數據點: ${result.waveformData?.timePoints.length || 0}`);

    if (result.success && result.waveformData) {
      const { timePoints, nodeVoltages } = result.waveformData;
      const nodeMap = engine['_nodeMapping'] as Map<string, number>;

      const getNodeVoltages = (nodeName: string): readonly number[] | undefined => {
        const idx = nodeMap.get(nodeName);
        return idx !== undefined ? nodeVoltages.get(idx) : undefined;
      };

      const vGate = getNodeVoltages('gate');
      const vDrain = getNodeVoltages('n_drain');

      console.log('\n關鍵時間點:');
      
      // t=0
      console.log(`  t=0μs: V_gate=${(vGate?.[0] || 0).toFixed(2)}V, V_drain=${(vDrain?.[0] || 0).toFixed(2)}V`);
      
      // 中點
      const midIdx = Math.floor(timePoints.length / 2);
      const tMid = timePoints[midIdx] * 1e6;
      console.log(`  t=${tMid.toFixed(1)}μs: V_gate=${(vGate?.[midIdx] || 0).toFixed(2)}V, V_drain=${(vDrain?.[midIdx] || 0).toFixed(2)}V`);
      
      // 終點
      const endIdx = timePoints.length - 1;
      const tEnd = timePoints[endIdx] * 1e6;
      console.log(`  t=${tEnd.toFixed(1)}μs: V_gate=${(vGate?.[endIdx] || 0).toFixed(2)}V, V_drain=${(vDrain?.[endIdx] || 0).toFixed(2)}V`);

      // 檢查數值穩定性
      let maxV = 0;
      nodeVoltages.forEach((va) => va.forEach((v) => { maxV = Math.max(maxV, Math.abs(v)); }));
      console.log(`\n數值檢查: 最大電壓 = ${maxV.toFixed(2)}V (應 < 20V)`);

      if (maxV < 20) {
        console.log('\n' + '='.repeat(80));
        console.log('測試結果: ✓ 通過');
        console.log('='.repeat(80));
      } else {
        console.log('\n' + '='.repeat(80));
        console.log('測試結果: ✗ 數值異常');
        console.log('='.repeat(80));
      }

    } else {
      console.error('錯誤:', result.errorMessage);
      console.log('\n' + '='.repeat(80));
      console.log('測試結果: ✗ 失敗');
      console.log('='.repeat(80));
    }

  } catch (error) {
    console.error('異常:', error);
    console.log('\n' + '='.repeat(80));
    console.log('測試結果: ✗ 異常');
    console.log('='.repeat(80));
  }
}

testOnePeriod().catch(console.error);
