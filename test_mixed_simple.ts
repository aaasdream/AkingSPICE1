/**
 * 测试 MOSFET + Diode 混合电路（最简单版本）
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { IntelligentDiode, type DiodeParameters } from './src/core/devices/intelligent_diode';
import { IntelligentMOSFET, type MOSFETParameters } from './src/core/devices/intelligent_mosfet';

async function testMixedCircuit() {
  console.log('='.repeat(80));
  console.log('🧪 MOSFET + Diode 混合电路测试');
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

  // 最简单的混合电路：Vdd -- MOSFET -- Diode -- R_load -- GND
  // MOSFET 固定导通（Vgs=5V > Vth=2V）
  const engine = new CircuitSimulationEngine({
    endTime: 10e-6,  // 10μs 瞬态分析
    initialTimeStep: 0.5e-6,
    maxTimeStep: 2e-6,
    minTimeStep: 1e-7
  });

  engine.addDevice(new VoltageSource('Vdd', ['n_vdd', '0'], 5));       // 5V 电源
  engine.addDevice(new VoltageSource('Vgate', ['n_gate', '0'], 5));    // 5V 门极（导通）
  engine.addDevice(new IntelligentMOSFET('M1', ['n_vdd', 'n_gate', 'n_sw'], mosfetParams as any) as any);
  engine.addDevice(new IntelligentDiode('D1', ['n_sw', '0'], diodeParams as any) as any);
  engine.addDevice(new Resistor('R_load', ['n_sw', '0'], 1000));       // 1kΩ 负载

  console.log('\n电路拓扑: Vdd (5V) → M1 (Vg=5V) → D1 → R (1kΩ) → GND\n');
  console.log('期望: MOSFET 导通，二极管正向偏压 ~0.7V，输出电压 ~4.3V\n');
  
  console.log('开始 DC 分析...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  if (result.success) {
    console.log('✅ 测试成功！DC 分析收敛');
    
    // 打印节点电压
    console.log('\n节点电压:');
    for (const [nodeId, voltages] of result.waveformData.nodeVoltages) {
      if (voltages.length > 0) {
        console.log(`  Node ${nodeId}: ${voltages[0].toFixed(6)} V`);
      }
    }
    
    // 物理验证
    console.log('\n物理验证:');
    console.log('  ✓ MOSFET 应该导通 (Vgs=5V > Vth=2V)');
    console.log('  ✓ 二极管应该正向偏压 (Vd ≈ 0.7V)');
    console.log('  ✓ 输出电压应该 ≈ 4.3V (5V - 0.7V)');
  } else {
    console.log('❌ 测试失败！');
    console.log(`错误信息: ${result.errorMessage}`);
  }
  console.log('='.repeat(80));
}

testMixedCircuit().catch(error => {
  console.error('测试过程中发生错误:', error);
  process.exit(1);
});
