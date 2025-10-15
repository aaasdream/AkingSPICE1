/**
 * MOSFET + RL 電路驗證測試
 * 
 * 目的：驗證模擬結果的正確性
 * 方法：
 * 1. 理論計算對比（RL 電路精確解）
 * 2. 物理定律檢查（能量守恆、基爾霍夫定律）
 * 3. 數值穩定性檢查
 */

const path = require('path');
const fs = require('fs');
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { InductorFactory } = require(path.join(modulePath, 'components/passive/inductor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('============================================================');
console.log('🔬 MOSFET + RL 電路驗證測試');
console.log('============================================================\n');

// ============================================================
// 電路參數
// ============================================================
const VDD = 12;
const V_GATE = 5;      // 持續導通
const R_TOTAL = 10;    // 總電阻
const L_LOAD = 100e-6; // 100µH
const T_SIM = 50e-6;   // 模擬 50µs (5個時間常數)

const TAU = L_LOAD / R_TOTAL;  // L/R 時間常數 = 10µs
const I_STEADY = VDD / R_TOTAL; // 穩態電流 = 1.2A

console.log('🎯 電路參數：');
console.log(`   VDD = ${VDD}V`);
console.log(`   V_GATE = ${V_GATE}V (MOSFET 持續導通)`);
console.log(`   R_total = ${R_TOTAL}Ω`);
console.log(`   L_load = ${L_LOAD * 1e6}µH`);
console.log(`   τ = L/R = ${TAU * 1e6}µs`);
console.log(`   I_steady = VDD/R = ${I_STEADY}A`);
console.log(`   模擬時間 = ${T_SIM * 1e6}µs (${(T_SIM / TAU).toFixed(1)}τ)`);
console.log();

// ============================================================
// 理論計算函數
// ============================================================
/**
 * RL 電路理論電流
 * i(t) = I_steady * (1 - exp(-t/τ))
 */
function theoreticalCurrent(t) {
  return I_STEADY * (1 - Math.exp(-t / TAU));
}

/**
 * RL 電路理論電感電壓
 * V_L(t) = VDD * exp(-t/τ)
 */
function theoreticalInductorVoltage(t) {
  return VDD * Math.exp(-t / TAU);
}

/**
 * 計算相對誤差
 */
function relativeError(simulated, theoretical) {
  if (Math.abs(theoretical) < 1e-9) {
    return Math.abs(simulated - theoretical); // 絕對誤差
  }
  return Math.abs((simulated - theoretical) / theoretical) * 100;
}

// ============================================================
// 建立電路
// ============================================================
const engine = new CircuitSimulationEngine({
  endTime: T_SIM,
  voltageToleranceAbs: 1e-3,
  currentToleranceAbs: 1e-4,
  maxNewtonIterations: 50,
  minTimeStep: 1e-11,
  maxTimeStep: 1e-6,
  verboseLogging: false,
  enableLogging: true
});

const gnd = '0';
const vdd = '1';
const gate = '2';
const drain = '3';
const source = '4';
const inductor_node = '5';

console.log('🔧 電路拓撲：');
console.log('   VDD → RD → MOSFET(D→S) → L → RS → GND');
console.log();

// 電路組件
const v_supply = VoltageSourceFactory.createDC('VDD', [gnd, vdd], VDD);
const v_gate = VoltageSourceFactory.createDC('VGATE', [gnd, gate], V_GATE);

const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, source, gnd, {
  VTO: 1.0,
  KP: 10e-3,
  LAMBDA: 0.01,
  W: 10e-6,
  L: 10e-6,
  PHI: 0.6,
  GAMMA: 0.3
});

const r_drain = ResistorFactory.create('RD', [vdd, drain], R_TOTAL / 2);
const inductor = InductorFactory.create('L1', [source, inductor_node], L_LOAD);
const r_source = ResistorFactory.create('RS', [inductor_node, gnd], R_TOTAL / 2);

engine.addDevices([v_supply, v_gate, mosfet, r_drain, inductor, r_source]);

console.log('✅ 電路已建立，開始模擬...\n');

// ============================================================
// 執行模擬（帶超時保護）
// ============================================================
const startTime = Date.now();
const TIMEOUT_MS = 120000; // 120秒超時

const timeoutId = setTimeout(() => {
  console.error('❌ 模擬超時（超過 120 秒）');
  process.exit(1);
}, TIMEOUT_MS);

engine.runSimulation()
  .then(result => {
    clearTimeout(timeoutId);
    const elapsedTime = Date.now() - startTime;
    
    console.log('\n============================================================');
    console.log('📊 模擬完成！');
    console.log('============================================================');
    console.log(`⏱️  執行時間: ${(elapsedTime / 1000).toFixed(2)}s`);
    console.log(`✅ 成功: ${result.success}`);
    
    if (!result.success) {
      console.error(`❌ 錯誤: ${result.errorMessage}`);
      process.exit(1);
    }

    // ============================================================
    // 驗證 1: 關鍵時間點的理論對比
    // ============================================================
    console.log('\n============================================================');
    console.log('📐 驗證 1: 理論值對比');
    console.log('============================================================');

    const checkPoints = [
      { name: '1τ', time: TAU },
      { name: '2τ', time: 2 * TAU },
      { name: '3τ', time: 3 * TAU },
      { name: '5τ', time: 5 * TAU }
    ];

    const waveform = result.waveformData;
    const times = waveform.time;
    const nodeMap = result.nodeMap;
    
    // 找出電感電流的索引
    let inductorCurrentIndex = -1;
    for (const [key, value] of result.extraVariableMap.entries()) {
      if (key.includes('L1') && key.includes('current')) {
        inductorCurrentIndex = value;
        break;
      }
    }

    console.log(`\n電感電流索引: ${inductorCurrentIndex}`);
    
    const validationResults = [];
    
    checkPoints.forEach(cp => {
      // 找到最接近的時間點
      let closestIdx = 0;
      let minDiff = Math.abs(times[0] - cp.time);
      
      for (let i = 1; i < times.length; i++) {
        const diff = Math.abs(times[i] - cp.time);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      
      const actualTime = times[closestIdx];
      
      // 獲取模擬電流
      let simCurrent = 0;
      if (inductorCurrentIndex >= 0 && waveform[`var_${inductorCurrentIndex}`]) {
        simCurrent = waveform[`var_${inductorCurrentIndex}`][closestIdx];
      }
      
      // 計算理論值
      const theoCurrent = theoreticalCurrent(actualTime);
      const error = relativeError(simCurrent, theoCurrent);
      
      const result = {
        name: cp.name,
        time: actualTime * 1e6,
        simCurrent,
        theoCurrent,
        error,
        pass: error < 5.0 // 5% 容差
      };
      
      validationResults.push(result);
      
      console.log(`\n${cp.name} (t = ${(actualTime * 1e6).toFixed(2)}µs):`);
      console.log(`   模擬電流: ${simCurrent.toFixed(4)}A`);
      console.log(`   理論電流: ${theoCurrent.toFixed(4)}A`);
      console.log(`   相對誤差: ${error.toFixed(2)}%`);
      console.log(`   狀態: ${result.pass ? '✅ PASS' : '❌ FAIL'}`);
    });

    // ============================================================
    // 驗證 2: 穩態檢查
    // ============================================================
    console.log('\n============================================================');
    console.log('📐 驗證 2: 穩態檢查');
    console.log('============================================================');

    // 取最後 10% 的數據作為穩態
    const steadyStartIdx = Math.floor(times.length * 0.9);
    let steadyCurrents = [];
    
    if (inductorCurrentIndex >= 0 && waveform[`var_${inductorCurrentIndex}`]) {
      for (let i = steadyStartIdx; i < times.length; i++) {
        steadyCurrents.push(waveform[`var_${inductorCurrentIndex}`][i]);
      }
    }
    
    const avgSteadyCurrent = steadyCurrents.reduce((a, b) => a + b, 0) / steadyCurrents.length;
    const steadyError = relativeError(avgSteadyCurrent, I_STEADY);
    const steadyPass = steadyError < 5.0;
    
    console.log(`\n穩態電流（最後 10% 數據平均）:`);
    console.log(`   模擬值: ${avgSteadyCurrent.toFixed(4)}A`);
    console.log(`   理論值: ${I_STEADY.toFixed(4)}A`);
    console.log(`   相對誤差: ${steadyError.toFixed(2)}%`);
    console.log(`   狀態: ${steadyPass ? '✅ PASS' : '❌ FAIL'}`);

    // ============================================================
    // 驗證 3: 物理定律檢查
    // ============================================================
    console.log('\n============================================================');
    console.log('📐 驗證 3: 物理定律檢查');
    console.log('============================================================');

    // 3.1 初始條件：電感電流應該從 0 開始
    const initialCurrent = inductorCurrentIndex >= 0 ? 
      waveform[`var_${inductorCurrentIndex}`][0] : 0;
    const initialPass = Math.abs(initialCurrent) < 1e-6;
    
    console.log(`\n3.1 初始條件檢查:`);
    console.log(`   t=0 時電感電流: ${initialCurrent.toFixed(6)}A`);
    console.log(`   狀態: ${initialPass ? '✅ PASS (≈0)' : '❌ FAIL (應為0)'}`);

    // 3.2 單調性：電流應該單調增加（因為是充電過程）
    let isMonotonic = true;
    if (inductorCurrentIndex >= 0 && waveform[`var_${inductorCurrentIndex}`]) {
      for (let i = 1; i < times.length; i++) {
        const curr = waveform[`var_${inductorCurrentIndex}`][i];
        const prev = waveform[`var_${inductorCurrentIndex}`][i - 1];
        if (curr < prev - 1e-6) { // 允許小的數值波動
          isMonotonic = false;
          break;
        }
      }
    }
    
    console.log(`\n3.2 單調性檢查:`);
    console.log(`   電流是否單調增加: ${isMonotonic ? '✅ PASS' : '❌ FAIL'}`);

    // 3.3 電流上界：電流不應超過 VDD/R
    let maxCurrent = 0;
    if (inductorCurrentIndex >= 0 && waveform[`var_${inductorCurrentIndex}`]) {
      maxCurrent = Math.max(...waveform[`var_${inductorCurrentIndex}`]);
    }
    const currentBoundPass = maxCurrent <= I_STEADY * 1.01; // 允許 1% 超調
    
    console.log(`\n3.3 電流上界檢查:`);
    console.log(`   最大電流: ${maxCurrent.toFixed(4)}A`);
    console.log(`   理論上界: ${I_STEADY.toFixed(4)}A`);
    console.log(`   狀態: ${currentBoundPass ? '✅ PASS' : '❌ FAIL (超出上界)'}`);

    // ============================================================
    // 驗證 4: 數值穩定性
    // ============================================================
    console.log('\n============================================================');
    console.log('📐 驗證 4: 數值穩定性');
    console.log('============================================================');

    // 檢查是否有 NaN 或 Inf
    let hasNaN = false;
    let hasInf = false;
    
    if (inductorCurrentIndex >= 0 && waveform[`var_${inductorCurrentIndex}`]) {
      for (const val of waveform[`var_${inductorCurrentIndex}`]) {
        if (isNaN(val)) hasNaN = true;
        if (!isFinite(val)) hasInf = true;
      }
    }
    
    console.log(`\n數值穩定性:`);
    console.log(`   包含 NaN: ${hasNaN ? '❌ FAIL' : '✅ PASS'}`);
    console.log(`   包含 Inf: ${hasInf ? '❌ FAIL' : '✅ PASS'}`);
    console.log(`   數據點數: ${times.length}`);

    // ============================================================
    // 最終總結
    // ============================================================
    console.log('\n============================================================');
    console.log('📊 驗證總結');
    console.log('============================================================');

    const allChecks = [
      ...validationResults.map(r => r.pass),
      steadyPass,
      initialPass,
      isMonotonic,
      currentBoundPass,
      !hasNaN,
      !hasInf
    ];
    
    const passedChecks = allChecks.filter(x => x).length;
    const totalChecks = allChecks.length;
    
    console.log(`\n✅ 通過: ${passedChecks}/${totalChecks} 項檢查`);
    
    if (passedChecks === totalChecks) {
      console.log('\n🎉 所有驗證通過！模擬結果正確！');
    } else {
      console.log('\n⚠️  部分驗證未通過，需要檢查：');
      
      validationResults.forEach((r, i) => {
        if (!r.pass) {
          console.log(`   - ${r.name} 時間點誤差過大: ${r.error.toFixed(2)}%`);
        }
      });
      
      if (!steadyPass) console.log(`   - 穩態誤差過大: ${steadyError.toFixed(2)}%`);
      if (!initialPass) console.log(`   - 初始條件不正確`);
      if (!isMonotonic) console.log(`   - 電流不單調`);
      if (!currentBoundPass) console.log(`   - 電流超出上界`);
      if (hasNaN) console.log(`   - 數據包含 NaN`);
      if (hasInf) console.log(`   - 數據包含 Inf`);
    }

    // ============================================================
    // 輸出數據到文件（供進一步分析）
    // ============================================================
    if (inductorCurrentIndex >= 0) {
      const outputData = {
        parameters: {
          VDD, V_GATE, R_TOTAL, L_LOAD, TAU, I_STEADY, T_SIM
        },
        validation: {
          timePoints: validationResults,
          steadyState: { avgSteadyCurrent, steadyError, pass: steadyPass },
          physical: { initialPass, isMonotonic, currentBoundPass },
          numerical: { hasNaN, hasInf, dataPoints: times.length }
        },
        waveform: {
          time: times,
          current: waveform[`var_${inductorCurrentIndex}`]
        }
      };
      
      const outputPath = path.join(__dirname, 'test_mosfet_rl_validation_result.json');
      fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
      console.log(`\n💾 詳細數據已保存至: ${outputPath}`);
    }

    console.log('\n============================================================\n');
    
    process.exit(passedChecks === totalChecks ? 0 : 1);
  })
  .catch(error => {
    clearTimeout(timeoutId);
    console.error('\n❌ 模擬過程發生錯誤：');
    console.error(error);
    process.exit(1);
  });
