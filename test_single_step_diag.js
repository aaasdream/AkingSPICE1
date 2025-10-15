/**
 * 🔬 最簡瞬態測試 - 單步診斷
 * 目的：捕獲第一步瞬態 Newton 循環的完整日誌
 */

const path = require('path');

// 動態載入編譯後的模組
const modulePath = path.join(__dirname, 'dist', 'src');
console.log(`📦 載入模組路徑: ${modulePath}\n`);

const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('===================================');
console.log('🔬 最簡瞬態測試：MOSFET cutoff 單步');
console.log('===================================\n');

// 建立電路 - 根據文件，配置應在構造函數中傳入
const engine = new CircuitSimulationEngine({
  endTime: 1e-9,       // 僅運行到 1ns (單步)
  initialTimeStep: 1e-9,
  minTimeStep: 1e-12,
  voltageToleranceAbs: 1e-4,  // 放寬容差到 0.1mV
  verboseLogging: true,  // 啟用詳細日誌
  enableLogging: true
});

// 節點（使用字符串）
const gnd = '0';
const vdd = '1';
const drain = '2';
const gate = '3';
const source = '4';

// 使用工廠創建元件
const v1 = VoltageSourceFactory.createDC('VDD', [gnd, vdd], 10.0);
const v2 = VoltageSourceFactory.createDC('VG', [gnd, gate], 0.0);
const r1 = ResistorFactory.create('Rload', [vdd, drain], 1000);
const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, source, gnd);

console.log('📊 元件建立完成');
console.log(`   VDD: ${v1.name} (${v1.type})`);
console.log(`   VG: ${v2.name} (${v2.type})`);
console.log(`   Rload: ${r1.name} (${r1.type})`);
console.log(`   MOSFET: ${mosfet.name} (${mosfet.type})\n`);

// 添加元件到引擎
engine.addDevices([v1, v2, r1, mosfet]);

// 添加元件到引擎
engine.addDevices([v1, v2, r1, mosfet]);

console.log('✅ 元件已加入引擎\n');

console.log('🚀 開始運行仿真...\n');

// 運行仿真
engine.runSimulation()
  .then((result) => {
    if (result.success) {
      console.log('\n✅✅✅ 瞬態分析成功！');
      console.log(`   仿真時間: ${result.simulationTime}ms`);
      console.log(`   時間點數: ${result.waveformData?.timePoints?.length || 0}`);
    } else {
      console.log('\n❌ 仿真失敗');
      console.log(`   錯誤: ${result.errorMessage}`);
    }
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n❌❌❌ 仿真過程發生異常！');
    console.error('錯誤訊息:', error.message);
    if (error.stack) {
      console.error('\n錯誤堆疊:');
      console.error(error.stack);
    }
    process.exit(1);
  });
