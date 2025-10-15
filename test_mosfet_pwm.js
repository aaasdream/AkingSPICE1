/**
 * MOSFET PWM 開關測試 - Buck 變換器簡化版
 * 測試 MOSFET 在 PWM 開關下的收斂性
 */

const path = require('path');
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { InductorFactory } = require(path.join(modulePath, 'components/passive/inductor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('============================================================');
console.log('⚡ MOSFET PWM 開關測試 (簡化 Buck)');
console.log('============================================================\n');

// 電路參數
const VDD = 12;
const F_SW = 100e3;  // 100kHz 開關頻率
const T_SW = 1 / F_SW;  // 10µs 週期
const DUTY = 0.5;  // 50% 占空比
const R_LOAD = 10;
const L_LOAD = 100e-6;
const T_SIM = T_SW * 3;  // 模擬 3 個週期

// PWM 波形參數 (放寬邊緣時間以避免收斂問題)
const TR = 100e-9;  // 上升時間 100ns (was 1ns)
const TF = 100e-9;  // 下降時間 100ns (was 1ns)

console.log('🎯 電路參數：');
console.log(`   VDD = ${VDD}V`);
console.log(`   開關頻率 = ${F_SW / 1000}kHz`);
console.log(`   週期 = ${T_SW * 1e6}µs`);
console.log(`   占空比 = ${DUTY * 100}%`);
console.log(`   L = ${L_LOAD * 1e6}µH`);
console.log(`   R = ${R_LOAD}Ω`);
console.log(`   上升/下降時間 = ${TR * 1e9}ns`);
console.log(`   模擬時間 = ${T_SIM * 1e6}µs (3 週期)`);
console.log();

const engine = new CircuitSimulationEngine({
  endTime: T_SIM,
  voltageToleranceAbs: 1e-3,
  currentToleranceAbs: 1e-4,
  maxNewtonIterations: 50,
  minTimeStep: 1e-11,
  maxTimeStep: T_SW / 100,  // 最大步長 = 週期/100
  initialTimeStep: 1e-10,   // 初始步長 100ps (避免開關瞬間過大)
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
console.log('   VDD → RD → MOSFET(D-S) → L → RS → GND');
console.log('   PWM 脈衝方波驅動 MOSFET 閘極');
console.log();

// 1. VDD 電源
const v_supply = VoltageSourceFactory.createDC('VDD', [gnd, vdd], VDD);

// 2. PWM 脈衝源 (方波)
const v_gate_pwm = VoltageSourceFactory.createPulse(
  'VGATE',      // name
  [gnd, gate],  // nodes
  0,            // v1 - 低電平 (OFF)
  5,            // v2 - 高電平 (ON)  
  0,            // delay - 延遲 0
  TR,           // riseTime - 上升時間 
  TF,           // fallTime - 下降時間
  T_SW * DUTY,  // pulseWidth - 脈寬 = 週期 × 占空比
  T_SW          // period - 週期
);

// 3. MOSFET
const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, source, gnd, {
  VTO: 1.0,
  KP: 10e-3,
  LAMBDA: 0.01,
  W: 10e-6,
  L: 10e-6,
  PHI: 0.6,
  GAMMA: 0.3
});

// 4. 負載電路
const r_drain = ResistorFactory.create('RD', [vdd, drain], R_LOAD / 2);
const inductor = InductorFactory.create('L1', [source, inductor_node], L_LOAD);
const r_source = ResistorFactory.create('RS', [inductor_node, gnd], R_LOAD / 2);

engine.addDevices([v_supply, v_gate_pwm, mosfet, r_drain, inductor, r_source]);

console.log('✅ 電路建立完成，開始模擬...\n');

const startTime = Date.now();

// 超時保護
const timeout = setTimeout(() => {
  console.error(`\n❌ 超時！已執行 ${(Date.now() - startTime) / 1000}s`);
  process.exit(1);
}, 60000);  // 60秒超時

engine.runSimulation()
  .then(result => {
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;
    
    console.log('\n============================================================');
    if (result.success) {
      console.log('✅✅✅ PWM 模擬成功！');
    } else {
      console.log('❌ PWM 模擬失敗');
    }
    console.log('============================================================\n');
    
    console.log('📊 模擬統計：');
    console.log(`   總執行時間: ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);
    
    if (result.waveformData && result.waveformData.time) {
      const times = result.waveformData.time;
      console.log(`   時間步數: ${times.length}`);
      
      if (times.length > 0) {
        const finalTime = times[times.length - 1];
        console.log(`   最終時間: ${(finalTime * 1e6).toFixed(3)}µs`);
        console.log(`   完成週期數: ${(finalTime / T_SW).toFixed(2)}`);
        console.log(`   平均步長: ${(finalTime / times.length * 1e9).toFixed(2)}ns`);
        console.log();
        
        // 找出電感電流
        let i_inductor = null;
        let inductorIndex = -1;
        for (const [key, index] of result.extraVariableMap.entries()) {
          if (key.includes('L1') && key.includes('current')) {
            i_inductor = result.waveformData[`var_${index}`];
            inductorIndex = index;
            break;
          }
        }
        
        if (i_inductor && i_inductor.length > 0) {
          console.log('📈 電感電流分析:');
          console.log(`   電流索引: var_${inductorIndex}`);
          console.log(`   初始值: ${i_inductor[0].toExponential(3)}A`);
          console.log(`   最終值: ${i_inductor[i_inductor.length - 1].toFixed(4)}A`);
          console.log(`   最大值: ${Math.max(...i_inductor).toFixed(4)}A`);
          console.log(`   最小值: ${Math.min(...i_inductor).toFixed(4)}A`);
          console.log(`   峰峰值: ${(Math.max(...i_inductor) - Math.min(...i_inductor)).toFixed(4)}A`);
          console.log();
          
          // 採樣點（每個週期取幾個點）
          console.log('📉 電流波形（每週期採樣）:');
          const pointsPerPeriod = 5;
          const totalPeriods = Math.floor(finalTime / T_SW);
          
          for (let p = 0; p <= totalPeriods; p++) {
            console.log(`\n   週期 ${p}:`);
            for (let s = 0; s < pointsPerPeriod; s++) {
              const targetTime = p * T_SW + s * T_SW / (pointsPerPeriod - 1);
              
              // 找最接近的時間點
              let closestIdx = 0;
              let minDiff = Math.abs(times[0] - targetTime);
              for (let i = 1; i < times.length; i++) {
                const diff = Math.abs(times[i] - targetTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestIdx = i;
                }
                if (times[i] > targetTime) break;
              }
              
              const t_us = times[closestIdx] * 1e6;
              const i_a = i_inductor[closestIdx];
              const phase = ((times[closestIdx] % T_SW) / T_SW * 100).toFixed(0);
              console.log(`     t=${t_us.toFixed(2)}µs (${phase}%): I_L=${i_a.toFixed(4)}A`);
            }
          }
        } else {
          console.log('⚠️  無法找到電感電流數據');
        }
      }
    } else {
      console.log('⚠️  無波形數據');
    }
    
    if (!result.success) {
      console.log(`\n❌ 失敗原因: ${result.errorMessage || '未知'}`);
    }
    
    console.log('\n============================================================\n');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    clearTimeout(timeout);
    console.error('\n❌ 模擬異常:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
