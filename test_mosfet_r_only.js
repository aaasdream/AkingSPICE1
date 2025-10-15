/**
 * 最簡單 MOSFET-R 電路測試
 * 只有 MOSFET + 電阻，沒有電感
 */

const path = require('path');
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('🔬 MOSFET-R 電路測試 (無電感，1µs)');

const VDD = 12;
const V_GATE = 5;
const R_LOAD = 10;
const T_SIM = 1e-6;

const engine = new CircuitSimulationEngine({
  endTime: T_SIM,
  voltageToleranceAbs: 1e-3,
  maxNewtonIterations: 50,
  minTimeStep: 1e-11,
  maxTimeStep: 1e-7,
  verboseLogging: false,
  enableLogging: true
});

const gnd = '0';
const vdd = '1';
const gate = '2';
const drain = '3';
const source = '4';  // MOSFET source節點

console.log('建立電路: VDD-R-MOSFET(D-S)-R-GND\n');

// VDD 電源
const v_supply = VoltageSourceFactory.createDC('VDD', [gnd, vdd], VDD);

// 閘極電壓
const v_gate = VoltageSourceFactory.createDC('VGATE', [gnd, gate], V_GATE);

// MOSFET (drain=3, gate=2, source=4, bulk=0)
const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, source, gnd, {
  VTO: 1.0,
  KP: 10e-3,
  LAMBDA: 0.01,
  W: 10e-6,
  L: 10e-6,
  PHI: 0.6,
  GAMMA: 0.3
});

// 上拉電阻 (vdd -> drain)
const r_drain = ResistorFactory.create('RD', [vdd, drain], R_LOAD);

// 下拉電阻 (source -> gnd) 
const r_source = ResistorFactory.create('RS', [source, gnd], R_LOAD);

engine.addDevices([v_supply, v_gate, mosfet, r_drain, r_source]);

console.log(`參數: VDD=${VDD}V, VG=${V_GATE}V, R=${R_LOAD}Ω`);
console.log(`模擬時間: ${T_SIM * 1e6}µs\n`);

const timeout = setTimeout(() => {
  console.log(`\n⚠️ 超時30秒`);
  process.exit(1);
}, 30000);

const startTime = Date.now();

engine.runSimulation()
  .then((result) => {
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;
    
    if (result.success) {
      console.log(`\n✅ 成功！執行時間: ${elapsed}ms`);
      console.log(`時間步數: ${result.results.length}`);
      if (result.results.length > 0) {
        const finalTime = result.results[result.results.length - 1].time;
        console.log(`最終時間: ${finalTime * 1e9}ns`);
        console.log(`平均步長: ${(finalTime / result.results.length * 1e9).toFixed(2)}ns`);
      }
    } else {
      console.log(`\n❌ 失敗: ${result.error}`);
    }
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    clearTimeout(timeout);
    console.error(`\n💥 異常: ${error.message}`);
    process.exit(1);
  });
