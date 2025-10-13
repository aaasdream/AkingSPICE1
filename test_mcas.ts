/**
 * 🔥 测试 MCAS (Multi-layered Convergence Assurance Strategy)
 * 
 * 验证三层收敛策略：
 * - Layer 1: Standard NR (20 iterations)
 * - Layer 2: Gmin-Enhanced NR (30 iterations)
 * - Layer 3: Phoenix Solver (1000 steps)
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Capacitor } from './src/components/passive/capacitor';
import { IntelligentDiode, type DiodeParameters } from './src/core/devices/intelligent_diode';
import { IntelligentMOSFET, type MOSFETParameters } from './src/core/devices/intelligent_mosfet';

async function testMCAS_MOSFET_Diode() {
  console.log('='.repeat(80));
  console.log('🧪 Testing MCAS - MOSFET + Diode Mixed Circuit');
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

  // 电路：Vdd (15V) -- M1 (开关) -- D1 (钳位) -- R_load (100Ω) || C_load (1μF) -- GND
  const engine = new CircuitSimulationEngine({
    endTime: 40e-6,
    initialTimeStep: 0.5e-6,
    maxTimeStep: 2e-6,
    minTimeStep: 1e-7,
    verboseLogging: true
  });

  engine.addDevice(new VoltageSource('Vdd', ['n_vdd', '0'], 15));
  engine.addDevice(new VoltageSource('Vgate', ['n_gate', '0'], 10, {
    type: 'PULSE',
    parameters: {
      v1: 0,
      v2: 10,
      delay: 0,
      rise_time: 1e-6,
      fall_time: 1e-6,
      pulse_width: 20e-6,
      period: 40e-6
    }
  }));

  engine.addDevice(new IntelligentMOSFET('M1', ['n_vdd', 'n_gate', 'n_sw'], mosfetParams));
  engine.addDevice(new IntelligentDiode('D1', ['n_sw', '0'], diodeParams));
  engine.addDevice(new Resistor('R_load', ['n_sw', '0'], 100));
  engine.addDevice(new Capacitor('C_load', ['n_sw', '0'], 1e-6));

  console.log('\n开始仿真...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  if (result.success) {
    console.log('✅ 测试成功！MCAS 策略有效');
    console.log(`最终时间: ${result.finalTime.toExponential(3)}s`);
    console.log(`总步数: ${result.totalSteps}`);
    console.log(`失败步数: ${result.performanceMetrics?.failedSteps || 0}`);
    
    const nodeSw = engine.getNodeIdByName('n_sw');
    if (nodeSw !== undefined) {
      const vSw = result.waveformData.nodeVoltages.get(nodeSw);
      if (vSw) {
        const maxV = Math.max(...vSw);
        const minV = Math.min(...vSw);
        console.log(`\nn_sw 电压范围: ${minV.toFixed(3)}V ~ ${maxV.toFixed(3)}V`);
      }
    }
  } else {
    console.log('❌ 测试失败！');
    console.log(`错误信息: ${result.errorMessage}`);
  }
  console.log('='.repeat(80));
  
  return result.success;
}

// 运行测试
testMCAS_MOSFET_Diode().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('测试过程中发生错误:', error);
  process.exit(1);
});
