/**
 * 🔬 MOSFET PWM RL 電路測試
 * 
 * 電路拓撲：
 * VDD (12V) -- [NMOS] -- [R=1Ω] -- [L=100µH] -- GND
 *               |
 *             Gate (PWM: 0V/5V, 1kHz, 50% duty)
 * 
 * 目的：測試 NgMosfet 在 PWM 開關應用中的收斂性
 */

const path = require('path');

// 載入模組
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { InductorFactory } = require(path.join(modulePath, 'components/passive/inductor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('========================================');
console.log('🔬 MOSFET PWM RL 電路測試');
console.log('========================================\n');

// 電路參數
const VDD = 12.0;      // 電源電壓 12V
const R_LOAD = 1.0;    // 負載電阻 1Ω
const L_LOAD = 100e-6; // 負載電感 100µH
const F_PWM = 1000;    // PWM 頻率 1kHz
const DUTY = 0.5;      // 占空比 50%
const T_PWM = 1 / F_PWM; // PWM 週期 1ms

console.log('📊 電路參數：');
console.log(`   VDD = ${VDD}V`);
console.log(`   R_load = ${R_LOAD}Ω`);
console.log(`   L_load = ${L_LOAD * 1e6}µH`);
console.log(`   PWM 頻率 = ${F_PWM}Hz`);
console.log(`   占空比 = ${DUTY * 100}%`);
console.log(`   PWM 週期 = ${T_PWM * 1e3}ms\n`);

// 建立仿真引擎
const engine = new CircuitSimulationEngine({
  endTime: T_PWM * 3,        // 模擬 3 個 PWM 週期
  initialTimeStep: T_PWM / 1000, // 初始步長 = 週期/1000
  minTimeStep: 1e-9,         // 最小步長 1ns
  maxTimeStep: T_PWM / 100,  // 最大步長 = 週期/100
  voltageToleranceAbs: 1e-4, // 0.1mV (放寬容差)
  currentToleranceAbs: 1e-6, // 1µA
  verboseLogging: false,     // 關閉詳細日誌（太多了）
  enableLogging: true
});

// 節點定義
const gnd = '0';
const vdd = '1';
const gate = '2';   // PWM gate signal
const drain = '3';  // MOSFET drain (connects to VDD)
const source = '4'; // MOSFET source (connects to RL load)
const load = '5';   // RL負載另一端（接地）

// 正確的拓撲：
// VDD -- [NMOS D-S] -- [R] -- [L] -- GND
//          |
//        Gate (PWM)

// 1. 電源
const v_supply = VoltageSourceFactory.createDC('VDD', [gnd, vdd], VDD);

// 2. PWM 門極驅動信號 (PULSE)
const v_gate = VoltageSourceFactory.createPulse(
  'VGATE',
  [gnd, gate],
  0,                    // V_low = 0V (OFF)
  5,                    // V_high = 5V (ON)
  0,                    // delay = 0
  1e-9,                 // rise time = 1ns
  1e-9,                 // fall time = 1ns
  T_PWM * DUTY,         // pulse width = 0.5ms (50%)
  T_PWM                 // period = 1ms
);

// 3. NMOS (Drain接VDD, Source接負載)
const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, source, gnd, {
  VTO: 1.0,    // 閾值電壓 1V (容易導通)
  KP: 100e-3,  // 100 mA/V² (較強的驅動能力)
  LAMBDA: 0.01 // 通道調製係數
});

// 4. 負載電阻 (Source → load)
const r_load = ResistorFactory.create('RLOAD', [source, load], R_LOAD);

// 5. 負載電感 (load → GND)
const l_load = InductorFactory.create('LLOAD', [load, gnd], L_LOAD);

// 6. 將 Drain 連接到 VDD (透過一個極小的電阻模擬導線)
const r_wire = ResistorFactory.create('RWIRE', [vdd, drain], 0.001); // 1mΩ

// 添加所有元件
console.log('🔧 建立電路...');
engine.addDevices([v_supply, v_gate, mosfet, r_load, l_load, r_wire]);
console.log('✅ 電路建立完成\n');

// 🔍 Debug: 打印變數映射
console.log('📋 變數映射 (節點 + 額外變數):');
const nodeMap = engine._nodeMapping;
const extraVarMgr = engine._extraVariableManager;
console.log('  節點:', Array.from(nodeMap.entries()));
if (extraVarMgr) {
  console.log('  額外變數總數:', extraVarMgr._variables.length);
  extraVarMgr._variables.forEach((v, idx) => {
    console.log(`    [${v.index}] ${v.componentName}.${v.type}`);
  });
}
console.log();

console.log('🚀 開始仿真...');
console.log(`   模擬時間: ${T_PWM * 3 * 1e3}ms (3 個 PWM 週期)`);
console.log(`   預期切換次數: ${3 * 2} 次\n`);

const startTime = Date.now();

// 運行仿真
engine.runSimulation()
  .then((result) => {
    const elapsedTime = Date.now() - startTime;
    
    console.log('\n========================================');
    if (result.success) {
      console.log('✅✅✅ 仿真成功！');
      console.log('========================================\n');
      
      console.log('📊 仿真統計：');
      console.log(`   執行時間: ${elapsedTime}ms`);
      console.log(`   時間點數: ${result.waveformData?.timePoints?.length || 0}`);
      
      // 分析電流波形
      if (result.waveformData?.deviceCurrents) {
        const inductorCurrent = result.waveformData.deviceCurrents.get('LLOAD');
        if (inductorCurrent && inductorCurrent.length > 0) {
          const i_min = Math.min(...inductorCurrent);
          const i_max = Math.max(...inductorCurrent);
          const i_avg = inductorCurrent.reduce((a, b) => a + b, 0) / inductorCurrent.length;
          const i_final = inductorCurrent[inductorCurrent.length - 1];
          
          console.log(`\n   電感電流統計：`);
          console.log(`     最小值: ${i_min.toFixed(6)}A`);
          console.log(`     最大值: ${i_max.toFixed(6)}A`);
          console.log(`     平均值: ${i_avg.toFixed(6)}A`);
          console.log(`     最終值: ${i_final.toFixed(6)}A`);
          
          // 理論計算：穩態時 I_avg = VDD * Duty / R
          const i_theory = VDD * DUTY / R_LOAD;
          console.log(`     理論平均值: ${i_theory.toFixed(6)}A`);
          console.log(`     誤差: ${Math.abs(i_avg - i_theory).toFixed(6)}A (${(Math.abs(i_avg - i_theory) / i_theory * 100).toFixed(2)}%)`);
        }
      }
      
      // 分析 MOSFET 狀態
      if (result.waveformData?.nodeVoltages) {
        const v_gate_data = result.waveformData.nodeVoltages.get(gate);
        const v_drain_data = result.waveformData.nodeVoltages.get(drain);
        
        if (v_gate_data && v_drain_data) {
          // 計算導通時的平均漏極電壓
          let on_count = 0;
          let v_drain_on_sum = 0;
          
          for (let i = 0; i < v_gate_data.length; i++) {
            if (v_gate_data[i] > 2.5) { // 門極 > 2.5V 認為是導通
              on_count++;
              v_drain_on_sum += v_drain_data[i];
            }
          }
          
          if (on_count > 0) {
            const v_drain_on_avg = v_drain_on_sum / on_count;
            console.log(`\n   MOSFET 統計：`);
            console.log(`     導通時平均漏極電壓: ${v_drain_on_avg.toFixed(3)}V`);
            console.log(`     導通電阻估計: ${(v_drain_on_avg / 6).toFixed(3)}Ω (假設 I≈6A)`);
          }
        }
      }
      
      console.log(`\n   性能指標：`);
      console.log(`     失敗步數: ${result.performanceMetrics?.failedSteps || 0}`);
      console.log(`     平均 Newton 迭代: ${result.performanceMetrics?.averageIterationsPerStep?.toFixed(2) || 'N/A'}`);
      
    } else {
      console.log('❌ 仿真失敗');
      console.log('========================================\n');
      console.log(`   錯誤訊息: ${result.errorMessage}`);
      console.log(`   執行時間: ${elapsedTime}ms`);
    }
    
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    const elapsedTime = Date.now() - startTime;
    console.error('\n========================================');
    console.error('❌❌❌ 仿真發生異常！');
    console.error('========================================\n');
    console.error('錯誤訊息:', error.message);
    console.error(`執行時間: ${elapsedTime}ms`);
    if (error.stack) {
      console.error('\n錯誤堆疊:');
      console.error(error.stack);
    }
    process.exit(1);
  });
