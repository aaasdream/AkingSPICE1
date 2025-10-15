/**
 * 🔬 MOSFET DC RL 電路測試 (簡化版)
 * 
 * 電路拓撲：
 * VDD (12V) -- [NMOS drain-source] -- [R=1Ω] -- [L=100µH] -- GND
 *               |
 *             Gate (5V DC - 持續導通)
 * 
 * 目的：測試 NgMosfet + RL 負載的瞬態收斂性（去掉PWM簡化）
 */

const path = require('path');

// 載入模組
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { InductorFactory } = require(path.join(modulePath, 'components/passive/inductor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

// 電路參數
const VDD = 12;         // 電源電壓 (V)
const V_GATE = 5;       // 門極電壓 (V, 高於 VTO=1V → 持續導通)
const R_LOAD = 1.0;     // 負載電阻 (Ω)
const L_LOAD = 100e-6;  // 負載電感 (H)

console.log('=' .repeat(60));
console.log('🔬 MOSFET DC RL 電路測試');
console.log('=' .repeat(60));
console.log('🎯 電路參數：');
console.log(`   VDD = ${VDD}V`);
console.log(`   V_GATE = ${V_GATE}V (持續導通)`);
console.log(`   R_load = ${R_LOAD}Ω`);
console.log(`   L_load = ${L_LOAD * 1e6}µH`);
console.log(`   預期穩態電流 = VDD / R = ${VDD / R_LOAD}A`);
console.log(`   L/R 時間常數 = ${(L_LOAD / R_LOAD) * 1e6}µs`);
console.log();

// 仿真設置
const T_SIM = 500e-6;  // 仿真時間 500µs (5倍時間常數)

// 創建仿真引擎
const engine = new CircuitSimulationEngine({
  endTime: T_SIM,
  voltageToleranceAbs: 1e-4,  // 放鬆電壓容差
  maxNewtonIterations: 1000,
  minTimeStep: 1e-12,
  maxTimeStep: 1e-5,
  verboseLogging: false,
  enableLogging: true
});

// 節點定義
const gnd = '0';
const vdd = '1';
const gate = '2';
const drain = '3';
const source = '4';
const load = '5';

// 電路拓撲：
// VDD -- R_wire -- drain[M]source -- R -- L -- GND
//                    |
//                  gate (5V DC)

// 1. 電源
const v_supply = VoltageSourceFactory.createDC('VDD', [gnd, vdd], VDD);

// 2. 門極DC電壓 (持續導通)
const v_gate = VoltageSourceFactory.createDC('VGATE', [gnd, gate], V_GATE);

// 3. NMOS (Drain接VDD, Source接負載)
const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, source, gnd, {
  VTO: 1.0,    // 閾值電壓 1V
  KP: 100e-3,  // 100 mA/V²
  LAMBDA: 0.01
});

// 4. 負載電阻 (Source → load)
const r_load = ResistorFactory.create('RLOAD', [source, load], R_LOAD);

// 5. 負載電感 (load → GND)
const l_load = InductorFactory.create('LLOAD', [load, gnd], L_LOAD);

// 6. 導線電阻 (VDD → Drain)
const r_wire = ResistorFactory.create('RWIRE', [vdd, drain], 0.001); // 1mΩ

// 添加所有元件
console.log('🔧 建立電路...');
engine.addDevices([v_supply, v_gate, mosfet, r_load, l_load, r_wire]);
console.log('✅ 電路建立完成\n');

// 🔍 Debug: 打印變數映射
console.log('📋 變數映射:');
const nodeMap = engine._nodeMapping;
console.log('  節點:', Array.from(nodeMap.entries()));
const extraVarMgr = engine._extraVariableManager;
if (extraVarMgr) {
  console.log('  額外變數:');
  extraVarMgr._variables.forEach((v) => {
    console.log(`    [${v.index}] ${v.componentName}.${v.type}`);
  });
}
console.log();

console.log('🚀 開始仿真...');
console.log(`   模擬時間: ${T_SIM * 1e6}µs`);
console.log();

const startTime = Date.now();

// 運行仿真
engine.runSimulation()
  .then((result) => {
    const elapsedTime = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(60));
    if (result.success) {
      console.log('✅✅✅ 仿真成功！');
      console.log('='.repeat(60) + '\n');
      
      console.log('📊 仿真統計：');
      console.log(`   總執行時間: ${elapsedTime}ms`);
      console.log(`   時間步數: ${result.results.length}`);
      console.log(`   平均步長: ${(T_SIM / result.results.length * 1e9).toFixed(2)}ns\n`);
      
      // 分析電感電流變化
      const times = result.results.map(r => r.time);
      const i_inductor = result.results.map(r => {
        const vars = r.variables;
        // 找到電感電流變數（應該是索引8）
        return vars[8] || 0;
      });
      
      const i_final = i_inductor[i_inductor.length - 1];
      const i_expected = VDD / R_LOAD;
      
      console.log('📈 電感電流分析:');
      console.log(`   初始電流: ${i_inductor[0].toExponential(3)}A`);
      console.log(`   最終電流: ${i_final.toFixed(4)}A`);
      console.log(`   預期穩態: ${i_expected.toFixed(4)}A`);
      console.log(`   誤差: ${Math.abs(i_final - i_expected).toExponential(2)}A\n`);
      
      // 檢查是否達到穩態 (99%)
      const percent_ss = (i_final / i_expected) * 100;
      if (percent_ss >= 99.0 && percent_ss <= 101.0) {
        console.log('✅ 電流已達穩態 (±1%)\n');
      } else {
        console.log('⚠️  電流尚未達穩態\n');
      }
      
      // 打印部分波形
      console.log('📉 電感電流波形（取樣）:');
      const samplePoints = 10;
      const step = Math.floor(result.results.length / samplePoints);
      for (let i = 0; i < result.results.length; i += step) {
        const t_us = times[i] * 1e6;
        const i_a = i_inductor[i];
        console.log(`   t=${t_us.toFixed(1)}µs: I_L=${i_a.toFixed(4)}A`);
      }
      
    } else {
      console.log('❌ 仿真失敗');
      console.log('='.repeat(60));
      console.log(`失敗原因: ${result.error || '未知錯誤'}`);
    }
    
    console.log(`\n⏱️  執行時間: ${elapsedTime}ms`);
  })
  .catch((error) => {
    console.error('\n💥 仿真異常:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
