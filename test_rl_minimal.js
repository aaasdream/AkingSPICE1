/**
 * 極簡 RL 測試 - 找出性能瓶頸
 */

const path = require('path');
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { InductorFactory } = require(path.join(modulePath, 'components/passive/inductor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('極簡 RL 測試 - 只模擬 1µs');

const engine = new CircuitSimulationEngine({
  endTime: 1e-6,  // 只跑 1µs
  voltageToleranceAbs: 1e-3,
  currentToleranceAbs: 1e-4,
  maxNewtonIterations: 50,
  minTimeStep: 1e-11,
  maxTimeStep: 5e-7,
  verboseLogging: true,  // 開啟詳細日誌
  enableLogging: true
});

const v_supply = VoltageSourceFactory.createDC('VDD', ['0', '1'], 12);
const v_gate = VoltageSourceFactory.createDC('VGATE', ['0', '2'], 5);
const mosfet = NgDeviceFactory.createNMOS('M1', '3', '2', '4', '0', {
  VTO: 1.0, KP: 10e-3, LAMBDA: 0.01, W: 10e-6, L: 10e-6, PHI: 0.6, GAMMA: 0.3
});
const r_drain = ResistorFactory.create('RD', ['1', '3'], 5);
const inductor = InductorFactory.create('L1', ['4', '5'], 100e-6);
const r_source = ResistorFactory.create('RS', ['5', '0'], 5);

engine.addDevices([v_supply, v_gate, mosfet, r_drain, inductor, r_source]);

const startTime = Date.now();
let lastUpdate = startTime;
let stepCount = 0;

// 超時保護
const timeout = setTimeout(() => {
  console.error(`\n超時！已執行 ${(Date.now() - startTime) / 1000}s`);
  console.error(`完成步數: ${stepCount}`);
  process.exit(1);
}, 30000);

engine.runSimulation()
  .then(result => {
    clearTimeout(timeout);
    const elapsed = (Date.now() - startTime) / 1000;
    
    console.log(`\n✅ 完成！時間: ${elapsed.toFixed(2)}s`);
    console.log(`步數: ${stepCount}`);
    
    if (result.waveformData && result.waveformData.time) {
      console.log(`數據點: ${result.waveformData.time.length}`);
    }
    
    process.exit(0);
  })
  .catch(error => {
    clearTimeout(timeout);
    console.error('錯誤:', error.message);
    process.exit(1);
  });

// 監控進度
setInterval(() => {
  const now = Date.now();
  if (now - lastUpdate > 2000) {
    console.log(`[${((now - startTime) / 1000).toFixed(1)}s] 仍在運行...`);
    lastUpdate = now;
  }
}, 2000);
