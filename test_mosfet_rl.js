/**
 * MOSFET + RL 電路測試（帶電感）
 * 基於成功的純電阻測試，現在加入電感
 */

const path = require('path');
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { InductorFactory } = require(path.join(modulePath, 'components/passive/inductor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('============================================================');
console.log('🔬 MOSFET + RL 電路測試');
console.log('============================================================');

const VDD = 12;
const V_GATE = 5;
const R_LOAD = 10;        // 10Ω
const L_LOAD = 100e-6;    // 100µH
const T_SIM = 10e-6;      // 縮短到 10µs (1個時間常數)

const TAU = L_LOAD / R_LOAD;  // L/R 時間常數

console.log('🎯 電路參數：');
console.log(`   VDD = ${VDD}V`);
console.log(`   V_GATE = ${V_GATE}V (持續導通)`);
console.log(`   R_load = ${R_LOAD}Ω`);
console.log(`   L_load = ${L_LOAD * 1e6}µH`);
console.log(`   L/R 時間常數 = ${TAU * 1e6}µs`);
console.log(`   模擬時間 = ${T_SIM * 1e6}µs`);
console.log();

const engine = new CircuitSimulationEngine({
  endTime: T_SIM,
  voltageToleranceAbs: 1e-3,   // 放鬆容差
  currentToleranceAbs: 1e-4,
  maxNewtonIterations: 50,
  minTimeStep: 1e-11,
  maxTimeStep: 1e-6,           // 1µs 最大步長
  verboseLogging: false,
  enableLogging: true
});

const gnd = '0';
const vdd = '1';
const gate = '2';
const drain = '3';
const source = '4';
const inductor_node = '5';

console.log('🔧 建立電路拓撲：');
console.log('   VDD → RD → MOSFET(D-S) → L → RS → GND');
console.log();

// 1. VDD 電源
const v_supply = VoltageSourceFactory.createDC('VDD', [gnd, vdd], VDD);

// 2. 閘極電壓 (持續導通)
const v_gate = VoltageSourceFactory.createDC('VGATE', [gnd, gate], V_GATE);

// 3. MOSFET (drain=3, gate=2, source=4, bulk=0)
const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, source, gnd, {
  VTO: 1.0,
  KP: 10e-3,
  LAMBDA: 0.01,
  W: 10e-6,
  L: 10e-6,
  PHI: 0.6,
  GAMMA: 0.3
});

// 4. 上側電阻 (vdd -> drain)
const r_drain = ResistorFactory.create('RD', [vdd, drain], R_LOAD / 2);

// 5. 電感 (source -> inductor_node)
const inductor = InductorFactory.create('L1', [source, inductor_node], L_LOAD);

// 6. 下側電阻 (inductor_node -> gnd)
const r_source = ResistorFactory.create('RS', [inductor_node, gnd], R_LOAD / 2);

engine.addDevices([v_supply, v_gate, mosfet, r_drain, inductor, r_source]);

console.log('✅ 電路建立完成');
console.log();

const timeout = setTimeout(() => {
  console.log(`\n⚠️ 超時60秒`);
  process.exit(1);
}, 60000);

const startTime = Date.now();

engine.runSimulation()
  .then((result) => {
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(60));
    if (result.success) {
      console.log('✅✅✅ 仿真成功！');
      console.log('='.repeat(60) + '\n');
      
      console.log('📊 仿真統計：');
      console.log(`   總執行時間: ${elapsed}ms`);
      
      // 檢查結果格式
      if (result.waveformData && result.waveformData.time) {
        const times = result.waveformData.time;
        console.log(`   時間步數: ${times.length}`);
        
        if (times.length > 0) {
          const finalTime = times[times.length - 1];
          console.log(`   最終時間: ${(finalTime * 1e6).toFixed(3)}µs`);
          console.log(`   平均步長: ${(finalTime / times.length * 1e9).toFixed(2)}ns`);
          console.log();
          
          // 找出電感電流（從 extraVariableMap 查找）
          let i_inductor = null;
          for (const [key, index] of result.extraVariableMap.entries()) {
            if (key.includes('L1') && key.includes('current')) {
              i_inductor = result.waveformData[`var_${index}`];
              console.log(`   電感電流索引: var_${index}`);
              break;
            }
          }
          
          if (i_inductor && i_inductor.length > 0) {
            const i_final = i_inductor[i_inductor.length - 1];
            const i_expected = VDD / R_LOAD;  // 穩態電流
            
            console.log('📈 電感電流分析:');
            console.log(`   初始電流: ${i_inductor[0].toExponential(3)}A`);
            console.log(`   最終電流: ${i_final.toFixed(4)}A`);
            console.log(`   預期穩態: ${i_expected.toFixed(4)}A`);
            console.log(`   達成率: ${(i_final / i_expected * 100).toFixed(1)}%`);
            console.log();
            
            // 打印電流上升曲線（10個採樣點）
            console.log('📉 電感電流上升曲線:');
            const samplePoints = Math.min(10, times.length);
            const step = Math.max(1, Math.floor(times.length / samplePoints));
            for (let i = 0; i < times.length; i += step) {
              const t_us = times[i] * 1e6;
              const i_a = i_inductor[i];
              const percent = (i_a / i_expected * 100).toFixed(1);
              console.log(`   t=${t_us.toFixed(2)}µs: I_L=${i_a.toFixed(4)}A (${percent}%)`);
            }
          } else {
            console.log('⚠️  無法找到電感電流數據');
          }
        }
      }
      
    } else {
      console.log('❌ 仿真失敗');
      console.log('='.repeat(60));
      console.log(`失敗原因: ${result.error || '未知錯誤'}`);
    }
    
    console.log(`\n⏱️  執行時間: ${elapsed}ms`);
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    clearTimeout(timeout);
    console.error('\n💥 仿真異常:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
