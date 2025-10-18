/**
 * 超簡單的 NgMosfet DC 測試
 * 
 * 電路：Vdd(12V) -> R(1Ω) -> MOSFET(D-S) -> GND
 * Gate: 固定 10V (應該導通)
 * 
 * 目的：驗證 MOSFET 基本工作
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgMosfet } from './src/core/ngdevices/ng_mosfet';

async function testNgMosfetSimpleDC() {
  console.log('='.repeat(80));
  console.log('測試：NgMosfet 超簡單 DC 測試');
  console.log('='.repeat(80));

  // MOSFET 參數
  const mosfetParams = {
    TYPE: 'NMOS' as const,
    VTO: 2.0,          // 閾值電壓 2V
    KP: 50e-3,         // 50mA/V²
    W: 100e-6,         // 100μm 寬度
    L: 10e-6,          // 10μm 長度
    LAMBDA: 0.01,
    PHI: 0.6,
    GAMMA: 0
  };

  console.log('\n電路參數:');
  console.log(`  Vdd: 12V`);
  console.log(`  R: 1Ω`);
  console.log(`  V_gate: 10V (固定)`);
  console.log('\nMOSFET 參數:');
  console.log(`  VTO: ${mosfetParams.VTO}V`);
  console.log(`  KP: ${mosfetParams.KP * 1e3}mA/V²`);
  console.log(`  W/L: ${mosfetParams.W / mosfetParams.L}`);

  // 創建電路組件
  const vdd = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], 12);
  const vgate = VoltageSourceFactory.createDC('Vgate', ['gate', '0'], 10); // 固定 10V
  const resistor = ResistorFactory.create('R1', ['vdd', 'n_drain'], 1);
  
  // 創建 MOSFET (D, G, S, B)
  const mosfet = new NgMosfet(
    'M1',
    'n_drain',  // Drain
    'gate',     // Gate
    '0',        // Source (接地)
    '0',        // Bulk (接地)
    mosfetParams
  );

  // 配置仿真引擎 - 只進行 DC 分析
  const engine = new CircuitSimulationEngine({
    endTime: 0,                // DC 分析
    initialTimeStep: 0
  });

  // 添加組件
  engine.addDevices([vdd, vgate, resistor, mosfet]);

  console.log('\n開始 DC 分析...');
  const startTime = Date.now();

  try {
    const result = await engine.runSimulation();
    const endTime = Date.now();

    console.log('\n仿真結果:');
    console.log(`  狀態: ${result.success ? '✓ 成功' : '✗ 失敗'}`);
    console.log(`  耗時: ${(endTime - startTime) / 1000}秒`);

    if (result.success && result.waveformData) {
      const { nodeVoltages } = result.waveformData;
      
      // 獲取節點映射
      const nodeMap = engine['_nodeMapping'] as Map<string, number>;
      
      console.log('\nDC 工作點:');
      console.log(`  V_dd: 12.000V (電源)`);
      console.log(`  V_gate: 10.000V (電源)`);
      
      const drainIdx = nodeMap.get('n_drain');
      if (drainIdx !== undefined) {
        const vDrain = nodeVoltages.get(drainIdx)?.[0] || 0;
        console.log(`  V_drain: ${vDrain.toFixed(3)}V`);
        
        // 計算電流
        const vR = 12 - vDrain;
        const iD = vR / 1.0;  // I = (Vdd - Vdrain) / R
        console.log(`  I_drain: ${(iD * 1000).toFixed(3)}mA`);
        
        // 計算 VGS 和 VDS
        const vGS = 10 - 0;  // Gate - Source
        const vDS = vDrain - 0;  // Drain - Source
        console.log(`  V_GS: ${vGS.toFixed(3)}V`);
        console.log(`  V_DS: ${vDS.toFixed(3)}V`);
        
        // 判斷工作區域
        const vOV = vGS - mosfetParams.VTO;  // 過驅動電壓
        console.log(`  過驅動電壓: ${vOV.toFixed(3)}V`);
        
        if (vGS < mosfetParams.VTO) {
          console.log(`  工作區: 截止區 (Cutoff)`);
        } else if (vDS < vOV) {
          console.log(`  工作區: 線性區 (Triode)`);
        } else {
          console.log(`  工作區: 飽和區 (Saturation)`);
        }
        
        // 理論計算
        const beta = mosfetParams.KP * (mosfetParams.W / mosfetParams.L);
        let iDtheory = 0;
        if (vGS > mosfetParams.VTO) {
          if (vDS < vOV) {
            // 線性區
            iDtheory = beta * ((vOV - 0.5 * vDS) * vDS) * (1 + mosfetParams.LAMBDA * vDS);
          } else {
            // 飽和區
            iDtheory = 0.5 * beta * vOV * vOV * (1 + mosfetParams.LAMBDA * vDS);
          }
        }
        console.log(`  理論 I_drain: ${(iDtheory * 1000).toFixed(3)}mA`);
        console.log(`  誤差: ${(Math.abs(iD - iDtheory) / iDtheory * 100).toFixed(1)}%`);
      }

      console.log('\n' + '='.repeat(80));
      console.log('測試結果: ✓ DC 分析成功');
      console.log('='.repeat(80));

    } else {
      console.error('\n錯誤:', result.errorMessage);
      console.log('\n' + '='.repeat(80));
      console.log('測試結果: ✗ 失敗');
      console.log('='.repeat(80));
    }

  } catch (error) {
    console.error('\n仿真過程中發生異常:', error);
    if (error instanceof Error) {
      console.error('錯誤堆疊:', error.stack);
    }
    console.log('\n' + '='.repeat(80));
    console.log('測試結果: ✗ 失敗');
    console.log('='.repeat(80));
  }
}

// 執行測試
testNgMosfetSimpleDC().catch(console.error);
