/**
 * 測試 NgMosfet 的階躍響應（最簡化版本）
 * 
 * 電路：Vdd(12V) -> R(10Ω) -> MOSFET -> GND
 * 閘極：階躍電壓從 0V 跳到 10V
 * 
 * 預期行為：
 * - t < 0: MOSFET 截止，V_drain = 12V
 * - t > 0: MOSFET 導通，V_drain 下降，電流上升
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgMosfet } from './src/core/ngdevices/ng_mosfet';

async function testStepResponse() {
  console.log('='.repeat(80));
  console.log('測試：NgMosfet 階躍響應（無電感，純阻性負載）');
  console.log('='.repeat(80));

  const VDD = 12;
  const R = 10;  // 使用較大的電阻，降低電流
  const V_GATE_LOW = 0;
  const V_GATE_HIGH = 10;
  const T_RISE = 1e-9;  // 1ns 上升時間

  console.log('\n電路參數:');
  console.log(`  Vdd: ${VDD}V`);
  console.log(`  R_load: ${R}Ω`);
  console.log(`  V_gate: ${V_GATE_LOW}V -> ${V_GATE_HIGH}V (階躍)`);
  console.log(`  上升時間: ${T_RISE * 1e9}ns`);

  // MOSFET 參數（合理的 W/L 比值）
  const mosfetParams = {
    TYPE: 'NMOS' as const,
    VTO: 2.0,      // 閾值電壓 2V
    KP: 50e-6,     // 50 μA/V² (典型的 MOS1 參數)
    W: 100e-6,     // 100μm 寬度
    L: 10e-6,      // 10μm 長度 (W/L = 10)
    LAMBDA: 0.01,
    PHI: 0.6,
    GAMMA: 0.5
  };

  console.log('\nMOSFET 參數:');
  console.log(`  VTO: ${mosfetParams.VTO}V`);
  console.log(`  KP: ${mosfetParams.KP * 1e3}mA/V²`);
  console.log(`  W/L: ${mosfetParams.W / mosfetParams.L}`);

  // 預期工作點（導通時）
  const vgs = V_GATE_HIGH;
  const vth = mosfetParams.VTO;
  if (vgs > vth) {
    const vov = vgs - vth;  // 過驅動電壓
    // 飽和區電流：I_D = 0.5 * KP * (W/L) * (Vgs - Vth)^2
    const wl = mosfetParams.W / mosfetParams.L;
    const id_sat = 0.5 * mosfetParams.KP * wl * vov * vov;
    const vds_sat = vov;  // 飽和區邊界
    
    console.log('\n預期導通特性（飽和區）:');
    console.log(`  過驅動電壓: ${vov}V`);
    console.log(`  I_D (飽和): ${(id_sat * 1e3).toFixed(2)}mA`);
    console.log(`  V_DS (飽和邊界): ${vds_sat}V`);
    console.log(`  V_drain (負載線): ${(VDD - id_sat * R).toFixed(2)}V`);
  }

  // 創建電路（無電感，純阻性）
  const vdd = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], VDD);
  
  // 使用 PULSE 產生階躍（從 0V 階躍到 10V）
  const vgate = VoltageSourceFactory.createPulse(
    'Vgate',
    ['gate', '0'],
    V_GATE_LOW,    // v1: 初始低電平
    V_GATE_HIGH,   // v2: 最終高電平
    0,             // td: 無延遲，立即開始
    T_RISE,        // tr: 1ns 上升時間
    1e-3,          // tf: 下降時間（不會用到）
    1,             // pw: 保持高電平 1 秒
    2              // per: 週期 2 秒
  );
  
  const resistor = ResistorFactory.create('R1', ['vdd', 'n_drain'], R);
  const mosfet = new NgMosfet('M1', 'n_drain', 'gate', '0', '0', mosfetParams);

  // 配置仿真：模擬 10μs，觀察階躍響應
  const engine = new CircuitSimulationEngine({
    endTime: 10e-6,           // 10μs
    initialTimeStep: 1e-6,    // 初始步長 1μs（較大）
    maxTimeStep: 1e-6,        // 最大步長 1μs
    minTimeStep: 1e-9         // 最小步長 1ns
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

      console.log('\n關鍵時間點分析:');
      
      // 初始狀態（t ≈ 0）
      const v_gate_0 = getVoltage('gate', 0);
      const v_drain_0 = getVoltage('n_drain', 0);
      console.log(`  t=0: V_gate=${v_gate_0.toFixed(3)}V, V_drain=${v_drain_0.toFixed(3)}V`);
      
      // 中間點
      const midIdx = Math.floor(timePoints.length / 2);
      const t_mid = timePoints[midIdx] * 1e6;
      const v_gate_mid = getVoltage('gate', midIdx);
      const v_drain_mid = getVoltage('n_drain', midIdx);
      console.log(`  t=${t_mid.toFixed(2)}μs: V_gate=${v_gate_mid.toFixed(3)}V, V_drain=${v_drain_mid.toFixed(3)}V`);
      
      // 最終狀態
      const endIdx = timePoints.length - 1;
      const t_end = timePoints[endIdx] * 1e6;
      const v_gate_end = getVoltage('gate', endIdx);
      const v_drain_end = getVoltage('n_drain', endIdx);
      console.log(`  t=${t_end.toFixed(2)}μs: V_gate=${v_gate_end.toFixed(3)}V, V_drain=${v_drain_end.toFixed(3)}V`);

      // 檢查電壓合理性
      console.log('\n驗證:');
      const drain_dropped = v_drain_0 > 10 && v_drain_end < 5;
      const gate_rose = v_gate_0 < 2 && v_gate_end > 8;
      
      console.log(`  V_gate 正確上升: ${gate_rose ? '✓' : '✗'}`);
      console.log(`  V_drain 正確下降: ${drain_dropped ? '✓' : '✗'}`);

      // 檢查數值穩定性
      let hasNaN = false;
      let maxV = 0;
      nodeVoltages.forEach((va) => {
        va.forEach((v) => {
          if (isNaN(v) || !isFinite(v)) hasNaN = true;
          maxV = Math.max(maxV, Math.abs(v));
        });
      });

      console.log(`  無 NaN/Inf: ${hasNaN ? '✗' : '✓'}`);
      console.log(`  最大電壓: ${maxV.toFixed(2)}V (應 < 20V)`);

      const testPassed = result.success && gate_rose && drain_dropped && !hasNaN && maxV < 20;
      
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
    if (error instanceof Error) {
      console.error('堆疊:', error.stack);
    }
    console.log('\n' + '='.repeat(80));
    console.log('測試結果: ✗ 異常');
    console.log('='.repeat(80));
  }
}

testStepResponse().catch(console.error);
