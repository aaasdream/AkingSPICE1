/**
 * 🔬 診斷第一步瞬態分析失敗
 * 重點：捕獲 Newton 循環內部的完整日誌
 */

const path = require('path');
const { CircuitSimulationEngine } = require('./dist/core/simulation/circuit_simulation_engine');
const { NgDeviceFactory } = require('./dist/core/ngdevices/ng_device_factory');
const { Resistor } = require('./dist/components/basic/resistor');
const { VoltageSource } = require('./dist/components/sources/voltage_source');

console.log('🔬 ========================================');
console.log('🔬 診斷：第一步瞬態分析失敗原因');
console.log('🔬 ========================================\n');

// 建立一個最簡單的 MOSFET 電路
// VDD (10V) -- R (1k) -- D[MOSFET]S -- GND
//                        G -- 0V (cutoff)
console.log('🛠️  電路：MOSFET cutoff 模式（最簡單）');
console.log('   VDD=10V -- R1k -- [D-MOSFET-S] -- GND');
console.log('                      G -- 0V\n');

const circuit = new CircuitSimulationEngine({ enableLogging: true });

// 節點定義
const vdd = 1;
const drain = 2;
const gate = 3;
const source = 4; // 接地

// 電壓源
circuit.addComponent(new VoltageSource('VDD', 0, vdd, 10.0));
circuit.addComponent(new VoltageSource('VG', 0, gate, 0.0)); // Gate = 0V (cutoff)

// 負載電阻
circuit.addComponent(new Resistor('Rload', vdd, drain, 1000));

// NMOS (Gate < Vth → cutoff → Id = 0)
const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, source, 0);
circuit.addComponent(mosfet);

console.log('📊 運行瞬態分析 (0 → 1ns, dt=1ns)...\n');

circuit.transientAnalysis({
  startTime: 0,
  endTime: 1e-9,      // 僅 1 步
  timeStep: 1e-9,     // 步長 1ns
  minTimeStep: 1e-12, // 最小步長 1ps
  tolerance: 1e-8
})
.then(() => {
  console.log('\n✅ 瞬態分析成功！');
})
.catch((error) => {
  console.error('\n❌ 瞬態分析失敗:');
  console.error(error.message);
  console.error('\n錯誤堆疊:');
  console.error(error.stack);
  process.exit(1);
});
