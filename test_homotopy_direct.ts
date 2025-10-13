/**
 * 直接測試同倫求解器
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Capacitor } from './src/components/passive/capacitor';
import { IntelligentDiode, type DiodeParameters } from './src/core/devices/intelligent_diode';
import { IntelligentMOSFET, type MOSFETParameters } from './src/core/devices/intelligent_mosfet';

async function testHomotopySolver() {
  console.log('='.repeat(80));
  console.log('🧪 直接測試同倫求解器');
  console.log('='.repeat(80));

  const diodeParams: DiodeParameters = {
    Is: 1e-14,
    n: 1.0,
    Rs: 0.1,
    Cj0: 10e-12,
    Vj: 0.7,
    m: 0.5,
    tt: 0
  };

  const mosfetParams: MOSFETParameters = {
    Vth: 2.0,
    Kp: 0.02,
    lambda: 0.01,
    Cgs: 100e-12,
    Cgd: 50e-12,
    Ron: 0.1,
    Roff: 1e12,
    Vmax: 50,
    Imax: 10
  };

  // 簡化電路：只測試二極管整流 (先不加 MOSFET)
  const engine = new CircuitSimulationEngine({
    endTime: 0,  // DC 分析only
    initialTimeStep: 0.5e-6,
    maxTimeStep: 2e-6,
    minTimeStep: 1e-7
  });

  engine.addDevice(new VoltageSource('Vin', ['n_in', '0'], 5));  // 5V 正向偏壓
  engine.addDevice(new IntelligentDiode('D1', ['n_in', 'n_out'], diodeParams));
  engine.addDevice(new Resistor('R_load', ['n_out', '0'], 1000));  // 1kΩ 負載

  console.log('\n開始仿真...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  if (result.success) {
    console.log('✅ 測試成功！DC 分析收斂');
    console.log(`最終時間: ${result.finalTime}`);
    console.log(`總步數: ${result.totalSteps}`);
    
    // 打印節點電壓
    console.log('\n節點電壓:');
    for (const [nodeId, voltages] of result.waveformData.nodeVoltages) {
      if (voltages.length > 0) {
        console.log(`  節點 ${nodeId}: ${voltages[0].toFixed(6)} V`);
      }
    }
  } else {
    console.log('❌ 測試失敗！');
    console.log(`錯誤信息: ${result.errorMessage}`);
  }
  console.log('='.repeat(80));
}

testHomotopySolver().catch(error => {
  console.error('測試過程中發生錯誤:', error);
  process.exit(1);
});
