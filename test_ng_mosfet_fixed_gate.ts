/**
 * 極簡瞬態測試：固定閘極電壓，不使用階躍
 * 
 * 電路：Vdd(12V) -> R(10Ω) -> MOSFET(固定 Vgs=5V) -> GND
 * 
 * 目的：排除 PWM/階躍導致的問題，純粹測試瞬態積分器
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgMosfet } from './src/core/ngdevices/ng_mosfet';

async function testFixedGate() {
  console.log('='.repeat(80));
  console.log('測試：NgMosfet 固定閘極電壓瞬態');
  console.log('='.repeat(80));

  const VDD = 12;
  const R = 10;
  const V_GATE = 5;  // 固定 5V，MOSFET 應該導通

  console.log('\n電路參數:');
  console.log(`  Vdd: ${VDD}V`);
  console.log(`  R_load: ${R}Ω`);
  console.log(`  V_gate: ${V_GATE}V (固定)`);

  // MOSFET 參數
  const mosfetParams = {
    TYPE: 'NMOS' as const,
    VTO: 2.0,
    KP: 50e-6,     // 50 μA/V²
    W: 100e-6,     // 100μm
    L: 10e-6,      // 10μm (W/L = 10)
    LAMBDA: 0.01,
    PHI: 0.6,
    GAMMA: 0.5
  };

  console.log('\nMOSFET 參數:');
  console.log(`  VTO: ${mosfetParams.VTO}V`);
  console.log(`  KP: ${mosfetParams.KP * 1e6}μA/V²`);
  console.log(`  W/L: ${mosfetParams.W / mosfetParams.L}`);

  // 預期工作點
  const vgs = V_GATE;
  const vth = mosfetParams.VTO;
  const vov = vgs - vth;
  const wl = mosfetParams.W / mosfetParams.L;
  const id_sat = 0.5 * mosfetParams.KP * wl * vov * vov;
  const vds_sat = vov;
  const v_drain_load = VDD - id_sat * R;

  console.log('\n預期導通狀態:');
  console.log(`  過驅動: ${vov}V`);
  console.log(`  I_D (飽和): ${(id_sat * 1e6).toFixed(2)}μA`);
  console.log(`  V_DS (飽和邊界): ${vds_sat}V`);
  console.log(`  V_drain (負載線): ${v_drain_load.toFixed(3)}V`);

  // 創建電路
  const vdd = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], VDD);
  const vgate = VoltageSourceFactory.createDC('Vgate', ['gate', '0'], V_GATE);  // 固定DC
  const resistor = ResistorFactory.create('R1', ['vdd', 'n_drain'], R);
  const mosfet = new NgMosfet('M1', 'n_drain', 'gate', '0', '0', mosfetParams);

  // 配置仿真：只模擬 1μs
  const engine = new CircuitSimulationEngine({
    endTime: 1e-6,            // 1μs
    initialTimeStep: 100e-9,  // 初始步長 100ns
    maxTimeStep: 100e-9,
    minTimeStep: 1e-9
  });

  engine.addDevices([vdd, vgate, resistor, mosfet]);

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

      const getVoltage = (nodeName: string, timeIdx: number): number => {
        const idx = nodeMap.get(nodeName);
        return idx !== undefined ? (nodeVoltages.get(idx)?.[timeIdx] || 0) : 0;
      };

      console.log('\n關鍵時間點:');
      const v_gate_0 = getVoltage('gate', 0);
      const v_drain_0 = getVoltage('n_drain', 0);
      console.log(`  t=0: V_gate=${v_gate_0.toFixed(3)}V, V_drain=${v_drain_0.toFixed(3)}V`);

      const endIdx = timePoints.length - 1;
      const t_end = (timePoints[endIdx] ?? 0) * 1e6;
      const v_gate_end = getVoltage('gate', endIdx);
      const v_drain_end = getVoltage('n_drain', endIdx);
      console.log(`  t=${t_end.toFixed(2)}μs: V_gate=${v_gate_end.toFixed(3)}V, V_drain=${v_drain_end.toFixed(3)}V`);

      // 驗證
      const gate_ok = Math.abs(v_gate_0 - V_GATE) < 0.1;
      const drain_ok = Math.abs(v_drain_0 - v_drain_load) < 0.5;

      console.log('\n驗證:');
      console.log(`  V_gate ≈ ${V_GATE}V: ${gate_ok ? '✓' : '✗'}`);
      console.log(`  V_drain ≈ ${v_drain_load.toFixed(2)}V: ${drain_ok ? '✓' : '✗'}`);

      const testPassed = result.success && gate_ok && drain_ok;
      console.log('\n' + '='.repeat(80));
      console.log(`測試結果: ${testPassed ? '✓ 通過' : '✗ 失敗'}`);
      console.log('='.repeat(80));

    } else {
      console.error('\n錯誤:', result.errorMessage);
      console.log('\n' + '='.repeat(80));
      console.log('測試結果: ✗ 失敗');
      console.log('='.repeat(80));
    }

  } catch (error) {
    console.error('\n異常:', error);
    console.log('\n' + '='.repeat(80));
    console.log('測試結果: ✗ 異常');
    console.log('='.repeat(80));
  }
}

testFixedGate().catch(console.error);
