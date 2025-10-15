/**
 * 🧪 測試 Backward Euler 積分器 - MOSFET RL 階躍響應
 * 
 * 用簡單的 Backward Euler 取代複雜的 Generalized-α
 * 專注於讓電感動態方程正確工作
 */

const path = require('path');
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { InductorFactory } = require(path.join(modulePath, 'components/passive/inductor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));
const { BackwardEulerIntegrator } = require(path.join(modulePath, 'core/integrator/backward_euler'));

console.log('============================================================');
console.log('🧪 Backward Euler 積分器測試 - MOSFET RL');
console.log('============================================================\n');

const VDD = 12;
const R_LOAD = 10;
const L_LOAD = 100e-6;
const T_SIM = 10e-6;  // 10µs

console.log('🎯 電路: MOSFET (ON) + RL 負載');
console.log(`   VDD = ${VDD}V`);
console.log(`   R = ${R_LOAD}Ω`);
console.log(`   L = ${L_LOAD * 1e6}µH`);
console.log(`   模擬時間 = ${T_SIM * 1e6}µs\n`);

// 創建 Backward Euler 積分器
const beIntegrator = new BackwardEulerIntegrator({
  initialTimeStep: 1e-9,   // 1ns 起始
  minTimeStep: 1e-10,      // 100ps 最小 (避免太小導致數值問題)
  maxTimeStep: 1e-6,       // 1µs 最大
  tolerance: 1e-4,         // 容差
  stepControl: 'adaptive', // 自適應步長
  growthFactor: 1.5,       // 增長因子
  shrinkFactor: 0.5,       // 縮減因子
  verbose: true            // 詳細日誌
});

console.log('✅ Backward Euler 積分器已創建\n');

const engine = new CircuitSimulationEngine({
  endTime: T_SIM,
  voltageToleranceAbs: 1e-3,
  currentToleranceAbs: 1e-4,
  maxNewtonIterations: 50,
  minTimeStep: 1e-10,      // 100ps (與積分器一致)
  maxTimeStep: 1e-6,
  initialTimeStep: 1e-9,
  verboseLogging: false,
  enableLogging: true
});

// 🔧 關鍵: 替換積分器
console.log('🔧 替換積分器: Generalized-α → Backward Euler\n');
engine._integrator = beIntegrator;

const gnd = '0';
const vdd = '1';
const gate = '2';
const drain = '3';
const source = '4';
const inductor_node = '5';

console.log('🔧 電路: VDD → RD → MOSFET(D-S) → L → RS → GND\n');

// 1. VDD 電源
const v_supply = VoltageSourceFactory.createDC('VDD', [gnd, vdd], VDD);

// 2. 閘極電壓 - 固定 5V (ON)
const v_gate = VoltageSourceFactory.createDC('VGATE', [gnd, gate], 5);

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

engine.addDevices([v_supply, v_gate, mosfet, r_drain, inductor, r_source]);

console.log('✅ 電路建立完成，開始模擬...\n');

const startTime = Date.now();

// 超時保護
const timeout = setTimeout(() => {
  console.error(`\n❌ 超時！已執行 ${(Date.now() - startTime) / 1000}s`);
  process.exit(1);
}, 30000);  // 30秒超時

engine.runSimulation()
  .then(result => {
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;
    
    console.log('\n============================================================');
    console.log('✅ 模擬成功完成');
    console.log('============================================================\n');
    
    console.log(`📊 模擬統計：`);
    console.log(`   總執行時間: ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);
    console.log(`   最終時間: ${result.finalTime.toExponential(3)}s`);
    console.log(`   總步數: ${result.totalSteps}`);
    console.log(`   收斂率: ${(result.convergenceRate * 100).toFixed(1)}%`);
    
    // Backward Euler 性能報告
    const beReport = beIntegrator.getPerformanceReport();
    console.log(`\n📈 Backward Euler 性能：`);
    console.log(`   接受步數: ${beReport.acceptedSteps}`);
    console.log(`   拒絕步數: ${beReport.rejectedSteps}`);
    console.log(`   接受率: ${(beReport.acceptanceRate * 100).toFixed(1)}%`);
    console.log(`   平均 Newton 迭代: ${beReport.avgNewtonIterations.toFixed(1)}`);
    
    if (result && result.waveformData) {
      const time = result.waveformData.timePoints || [];
      const n = time.length;
      
      console.log(`\n📈 波形數據：`);
      console.log(`   採樣點數: ${n}`);
      if (n > 0) {
        console.log(`   時間範圍: [${time[0].toExponential(3)}, ${time[n-1].toExponential(3)}]`);
      }
      
      // 電感電流
      const deviceCurrents = result.waveformData.deviceCurrents;
      if (deviceCurrents && deviceCurrents instanceof Map && deviceCurrents.has('L1')) {
        const iL = deviceCurrents.get('L1');
        
        if (iL && iL.length > 0) {
          console.log(`\n🔌 電感電流分析:`);
          console.log(`   起始: ${iL[0].toExponential(3)} A`);
          console.log(`   最小: ${Math.min(...iL).toExponential(3)} A`);
          console.log(`   最大: ${Math.max(...iL).toExponential(3)} A`);
          console.log(`   終值: ${iL[n-1].toExponential(3)} A`);
          
          // 理論值: i(t) ≈ (V/R) * (1 - exp(-R*t/L))
          // 穩態: i_ss = V/R ≈ 12V / 10Ω = 1.2A
          // 但 MOSFET 有壓降，實際會小一些
          const theoreticalSteadyState = VDD / R_LOAD;
          console.log(`   理論穩態 (無 MOSFET): ${theoreticalSteadyState.toExponential(3)} A`);
          
          // 檢查電流是否增長
          const currentGrowth = iL[n-1] - iL[0];
          console.log(`   電流增長: ${currentGrowth.toExponential(3)} A`);
          
          if (currentGrowth > 0.001) {
            console.log(`   ✅ 電流正常增長! 動態方程工作正常!`);
          } else {
            console.log(`   ⚠️  電流未增長，可能仍有問題`);
          }
          
          // 採樣幾個關鍵時間點
          console.log(`\n⏱️  關鍵時間點電流:`);
          const samplePoints = Math.min(10, n);
          for (let i = 0; i < n; i += Math.max(1, Math.floor(n / samplePoints))) {
            console.log(`   t=${time[i].toExponential(3)}s: I=${iL[i].toExponential(3)}A`);
          }
        }
      } else {
        console.log('\n⚠️  找不到電感電流數據');
      }
    } else {
      console.log('\n⚠️  無波形數據');
    }
    
    console.log('\n============================================================');
  })
  .catch(error => {
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;
    
    console.log('\n============================================================');
    console.log('❌ 模擬失敗');
    console.log('============================================================\n');
    
    console.log(`📊 模擬統計：`);
    console.log(`   總執行時間: ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);
    console.log(`\n❌ 失敗原因: ${error.message}`);
    
    console.log('\n============================================================');
    process.exit(1);
  });
