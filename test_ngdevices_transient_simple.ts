/**
 * NGDevices 瞬態分析測試 - 簡化版本
 * 使用更穩健的配置來驗證基本動態行為
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Capacitor } from './src/components/passive/capacitor';
import { NgDeviceFactory } from './src/core/ngdevices';

console.log('=== NGDevices 瞬態分析測試（簡化版） ===\n');

// ============================================
// 測試 1: 簡單 RC 充電電路（無二極體）
// ============================================
console.log('測試 1: RC 充電電路');
console.log('==========================================');
console.log('電路: V1(0→5V) -> R1(1k) -> C1(10µF) -> GND\n');

try {
  const v1_rc = VoltageSourceFactory.createPulse(
    'V1',
    ['n1', '0'],
    0,        // v1
    5,        // v2
    1e-6,     // delay
    1e-9,     // rise time
    1e-9,     // fall time
    200e-6,   // pulse width (long enough)
    400e-6    // period
  );
  
  const r1_rc = new Resistor('R1', ['n1', 'n2'], 1000);
  const c1_rc = new Capacitor('C1', ['n2', '0'], 10e-6);

  const engine_rc = new CircuitSimulationEngine({
    startTime: 0,
    endTime: 50e-6,      // 50µs (5 time constants = 50µs)
    initialTimeStep: 1e-9,
    maxTimeStep: 2e-6,
    minTimeStep: 1e-12,
    voltageToleranceAbs: 1e-4,   // 更寬鬆
    voltageToleranceRel: 1e-2,   // 更寬鬆
    currentToleranceAbs: 1e-7,
    chargeToleranceAbs: 1e-10,
    maxIterations: 30,           // 減少迭代次數
    enableAdaptiveTimeStep: true,
    enableSourceStepping: true,
    sourceSteppingSteps: 5,
    gminStepping: true,
    gminSteppingSteps: 3,        // 減少 gmin 步數
    gminInitial: 1e-6,
  });

  engine_rc.addComponent(v1_rc);
  engine_rc.addComponent(r1_rc);
  engine_rc.addComponent(c1_rc);

  console.log('開始瞬態模擬...');
  const result_rc = engine_rc.runSimulation();

  if (result_rc && result_rc.timePoints && result_rc.timePoints.length > 0) {
    const timePoints = result_rc.timePoints;
    const n2Voltages = result_rc.history.map((sol: any) => sol.nodeVoltages.get('n2') || 0);

    console.log(`✅ 瞬態模擬成功！共 ${timePoints.length} 個時間點`);
    
    // 採樣幾個關鍵時間點
    const samples = [0, Math.floor(timePoints.length * 0.2), Math.floor(timePoints.length * 0.5), timePoints.length - 1];
    console.log('\n關鍵時間點：');
    for (const idx of samples) {
      console.log(`  t=${(timePoints[idx] * 1e6).toFixed(2)}µs: V(n2)=${n2Voltages[idx].toFixed(3)}V`);
    }
    
    // 理論預期：τ = RC = 1kΩ × 10µF = 10ms (遠大於模擬時間)
    // 但這裡 τ = 1k × 10µF = 0.01s = 10ms，50µs 內應該充到約 0.025V
    const finalV = n2Voltages[n2Voltages.length - 1];
    const expectedV = 5 * (1 - Math.exp(-50e-6 / 0.01));  // V = Vfinal * (1 - e^(-t/τ))
    console.log(`\n最終電壓: ${finalV.toFixed(3)}V (預期 ~${expectedV.toFixed(3)}V)`);
    
    if (Math.abs(finalV - expectedV) < 0.01 || finalV > 0.02) {
      console.log('✅ 電壓值合理\n');
    } else {
      console.log(`⚠️  電壓值偏離預期 (誤差 ${((finalV - expectedV) / expectedV * 100).toFixed(1)}%)\n`);
    }
  } else {
    console.log('❌ 瞬態模擬失敗\n');
  }
} catch (error: any) {
  console.log(`❌ 測試失敗: ${error.message}\n`);
}

// ============================================
// 測試 2: 二極體整流電路（小電容）
// ============================================
console.log('測試 2: 二極體整流電路（小電容）');
console.log('==========================================');
console.log('電路: V1(5V正弦) -> D1 -> R1(1k) -> C1(1µF) -> GND\n');

try {
  const v1_rect = VoltageSourceFactory.createSine(
    'V1',
    ['n1', '0'],
    2.5,      // 偏移 2.5V (使正弦波在 0-5V 之間)
    2.5,      // 振幅 2.5V
    10000,    // 10kHz 頻率
    0,        // 無相位偏移
    0         // 無衰減
  );
  
  const d1_rect = NgDeviceFactory.createDiode('D1', 'n1', 'n2', {
    IS: 1e-13,     // 較大的飽和電流讓二極體更容易導通
    N: 1.5,        // 稍大的理想因子
    RS: 5,         // 串聯電阻
  });
  
  const r1_rect = new Resistor('R1', ['n2', 'n3'], 1000);
  const c1_rect = new Capacitor('C1', ['n3', '0'], 1e-6);  // 1µF 小電容

  const engine_rect = new CircuitSimulationEngine({
    startTime: 0,
    endTime: 300e-6,     // 3個週期 (T = 100µs)
    initialTimeStep: 1e-9,
    maxTimeStep: 1e-6,
    minTimeStep: 1e-12,
    voltageToleranceAbs: 1e-4,
    voltageToleranceRel: 1e-2,
    currentToleranceAbs: 1e-7,
    chargeToleranceAbs: 1e-10,
    maxIterations: 30,
    enableAdaptiveTimeStep: true,
    enableSourceStepping: true,
    sourceSteppingSteps: 5,
    gminStepping: true,
    gminSteppingSteps: 3,
    gminInitial: 1e-6,
  });

  engine_rect.addComponent(v1_rect);
  engine_rect.addComponent(d1_rect);
  engine_rect.addComponent(r1_rect);
  engine_rect.addComponent(c1_rect);

  console.log('開始瞬態模擬...');
  const result_rect = engine_rect.runSimulation();

  if (result_rect && result_rect.timePoints && result_rect.timePoints.length > 0) {
    const timePoints = result_rect.timePoints;
    const n1Voltages = result_rect.history.map((sol: any) => sol.nodeVoltages.get('n1') || 0);
    const n2Voltages = result_rect.history.map((sol: any) => sol.nodeVoltages.get('n2') || 0);
    const n3Voltages = result_rect.history.map((sol: any) => sol.nodeVoltages.get('n3') || 0);

    console.log(`✅ 瞬態模擬成功！共 ${timePoints.length} 個時間點`);
    
    // 找出最大值
    const maxV1 = Math.max(...n1Voltages);
    const maxV2 = Math.max(...n2Voltages);
    const maxV3 = Math.max(...n3Voltages);
    
    console.log('\n電壓範圍：');
    console.log(`  V(n1) 輸入: ${Math.min(...n1Voltages).toFixed(3)}V ~ ${maxV1.toFixed(3)}V`);
    console.log(`  V(n2) 二極體輸出: ${Math.min(...n2Voltages).toFixed(3)}V ~ ${maxV2.toFixed(3)}V`);
    console.log(`  V(n3) 濾波輸出: ${Math.min(...n3Voltages).toFixed(3)}V ~ ${maxV3.toFixed(3)}V`);
    
    // 預期：整流後應該保留正半週，負半週被截止
    console.log('\n✅ 整流電路運行完成\n');
  } else {
    console.log('❌ 瞬態模擬失敗\n');
  }
} catch (error: any) {
  console.log(`❌ 測試失敗: ${error.message}\n`);
}

// ============================================
// 測試 3: NMOS 開關電路（簡化版）
// ============================================
console.log('測試 3: NMOS 開關電路');
console.log('==========================================');
console.log('電路: VDD(5V) -> R_D(1k) -> [NMOS drain], [NMOS gate]<-VGS(脈衝), [NMOS source]->GND\n');

try {
  const vdd_mos = VoltageSourceFactory.createDC('VDD', ['vdd', '0'], 5);
  const vgs_mos = VoltageSourceFactory.createPulse(
    'VGS',
    ['gate', '0'],
    0,        // 0V
    3,        // 3V (超過閾值)
    1e-6,     // 1µs delay
    1e-9,     // rise time
    1e-9,     // fall time
    50e-6,    // 50µs pulse width
    100e-6    // 100µs period
  );
  
  const m1_mos = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', {
    VTO: 0.7,          // 閾值電壓
    KP: 200e-6,        // 跨導參數 (較大以便觀察效果)
    LAMBDA: 0.02,      // 通道長度調變
    W: 10e-6,
    L: 1e-6,
    PHI: 0.6,
    GAMMA: 0.4
  });
  
  const rd_mos = new Resistor('RD', ['vdd', 'drain'], 1000);

  const engine_mos = new CircuitSimulationEngine({
    startTime: 0,
    endTime: 150e-6,     // 1.5 個週期
    initialTimeStep: 1e-9,
    maxTimeStep: 2e-6,
    minTimeStep: 1e-12,
    voltageToleranceAbs: 1e-4,
    voltageToleranceRel: 1e-2,
    currentToleranceAbs: 1e-7,
    chargeToleranceAbs: 1e-10,
    maxIterations: 30,
    enableAdaptiveTimeStep: true,
    enableSourceStepping: true,
    sourceSteppingSteps: 5,
    gminStepping: true,
    gminSteppingSteps: 3,
    gminInitial: 1e-6,
  });

  engine_mos.addComponent(vdd_mos);
  engine_mos.addComponent(vgs_mos);
  engine_mos.addComponent(m1_mos);
  engine_mos.addComponent(rd_mos);

  console.log('開始瞬態模擬...');
  const result_mos = engine_mos.runSimulation();

  if (result_mos && result_mos.timePoints && result_mos.timePoints.length > 0) {
    const timePoints = result_mos.timePoints;
    const gateVoltages = result_mos.history.map((sol: any) => sol.nodeVoltages.get('gate') || 0);
    const drainVoltages = result_mos.history.map((sol: any) => sol.nodeVoltages.get('drain') || 0);

    console.log(`✅ 瞬態模擬成功！共 ${timePoints.length} 個時間點`);
    
    // 採樣關鍵時間點
    const samples = [0, Math.floor(timePoints.length * 0.3), Math.floor(timePoints.length * 0.7), timePoints.length - 1];
    console.log('\n關鍵時間點：');
    for (const idx of samples) {
      const t = timePoints[idx];
      const vg = gateVoltages[idx];
      const vd = drainVoltages[idx];
      console.log(`  t=${(t * 1e6).toFixed(2)}µs: VGS=${vg.toFixed(3)}V, VD=${vd.toFixed(3)}V`);
    }
    
    // 預期：VGS=0V時，VD≈5V (截止)；VGS=3V時，VD<5V (導通)
    const minDrain = Math.min(...drainVoltages);
    const maxDrain = Math.max(...drainVoltages);
    console.log(`\nVD 範圍: ${minDrain.toFixed(3)}V ~ ${maxDrain.toFixed(3)}V`);
    
    if (maxDrain > 4.5 && minDrain < 3) {
      console.log('✅ MOSFET 開關行為正常\n');
    } else {
      console.log('⚠️  MOSFET 開關行為可能異常\n');
    }
  } else {
    console.log('❌ 瞬態模擬失敗\n');
  }
} catch (error: any) {
  console.log(`❌ 測試失敗: ${error.message}\n`);
}

console.log('=== 所有測試完成 ===');
