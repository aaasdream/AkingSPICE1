/**
 * 🔬 最簡單的瞬態測試 - 純阻性電路
 * 
 * 電路：VDD (12V) -- R (1Ω) -- GND
 * 
 * 目的：驗證基本的瞬態分析功能（無電感、無MOSFET）
 */

const path = require('path');

const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('='.repeat(60));
console.log('🔬 最簡單瞬態測試 - VDD + R');
console.log('='.repeat(60));
console.log('電路: 12V -- 1Ω -- GND');
console.log('預期電流: 12A (恒定)\n');

const engine = new CircuitSimulationEngine({
  endTime: 1e-6,  // 1µs
  voltageToleranceAbs: 1e-4,
  maxNewtonIterations: 50,
  minTimeStep: 1e-12,
  maxTimeStep: 1e-7,
  verboseLogging: false,
  enableLogging: true
});

// 簡單電路
const vdd = VoltageSourceFactory.createDC('VDD', ['0', '1'], 12);
const r = ResistorFactory.create('R1', ['1', '0'], 1.0);

engine.addDevices([vdd, r]);

console.log('🚀 開始仿真...\n');

const startTime = Date.now();

engine.runSimulation()
  .then((result) => {
    const elapsedTime = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(60));
    if (result.success) {
      console.log('✅✅✅ 仿真成功！');
      console.log('='.repeat(60));
      console.log(`執行時間: ${elapsedTime}ms`);
      console.log(`時間步數: ${result.results.length}`);
      console.log(`節點1電壓: ${result.results[result.results.length-1].variables[1].toFixed(6)}V`);
    } else {
      console.log('❌ 仿真失敗');
      console.log(`失敗原因: ${result.error || '未知'}`);
    }
  })
  .catch((error) => {
    console.error('\n💥 異常:', error.message);
    process.exit(1);
  });
