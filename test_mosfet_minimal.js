/**
 * 最小化 MOSFET 測試 - 1µs，診斷模式
 */

const path = require('path');
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('🔬 最小化 MOSFET 測試 (1µs)');

const VDD = 12;
const V_GATE = 5;
const R_LOAD = 10;  // 增大電阻，降低電流，減少stiffness
const T_SIM = 1e-6;  // 只仿真 1µs

const engine = new CircuitSimulationEngine({
  endTime: T_SIM,
  voltageToleranceAbs: 1e-3,  // 放鬆容差
  maxNewtonIterations: 50,    // 限制Newton迭代
  minTimeStep: 1e-11,
  maxTimeStep: 1e-7,          // 較小的最大步長
  verboseLogging: true,       // 開啟詳細日誌
  enableLogging: true
});

// 節點定義
const gnd = '0';
const vdd = '1';
const gate = '2';
const drain = '3';

console.log('建立電路: VDD-MOSFET-R');

// VDD 電源
engine.addComponent(VoltageSourceFactory.createDC('VDD', [gnd, vdd], VDD));

// 閘極電壓
engine.addComponent(VoltageSourceFactory.createDC('VGATE', [gnd, gate], V_GATE));

// MOSFET (drain=3, gate=2, source=0, bulk=0)
const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, gnd, gnd, {
  VTO: 1.0,
  KP: 10e-3,      // 降低 KP
  LAMBDA: 0.01,
  W: 10e-6,       // 小尺寸
  L: 10e-6,
  PHI: 0.6,
  GAMMA: 0.3      // 降低body effect
});
engine.addComponent(mosfet);

// 負載電阻 (drain -> vdd，形成電流路徑)
engine.addComponent(ResistorFactory.create('R1', drain, vdd, R_LOAD));

console.log(`\n參數: VDD=${VDD}V, VG=${V_GATE}V, R=${R_LOAD}Ω`);
console.log(`預期電流: ~${((V_GATE - 1.0) ** 2 * 10e-3 * 10e-6 / 10e-6 / 2).toFixed(3)}A`);
console.log(`模擬時間: ${T_SIM * 1e6}µs\n`);

let stepCount = 0;
let lastLogTime = Date.now();

const timeout = setTimeout(() => {
  console.log(`\n⚠️ 超時！已完成 ${stepCount} 個時間步`);
  process.exit(1);
}, 30000);  // 30秒超時

engine.runSimulation()
  .then((result) => {
    clearTimeout(timeout);
    
    if (result.success) {
      console.log(`\n✅ 成功！時間步數: ${result.results.length}`);
      console.log(`執行時間: ${Date.now() - lastLogTime}ms`);
      
      if (result.results.length > 0) {
        const finalTime = result.results[result.results.length - 1].time;
        console.log(`最終時間: ${finalTime * 1e6}µs`);
      }
    } else {
      console.log(`\n❌ 失敗: ${result.error}`);
    }
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    clearTimeout(timeout);
    console.error(`\n💥 異常: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
