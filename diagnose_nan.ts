/**
 * 🔍 NaN 问题诊断工具
 * 
 * 目标：追踪 NaN 出现的确切位置和原因
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Capacitor } from './src/components/passive/capacitor';
import { IntelligentDiode } from './src/core/devices/intelligent_diode';
import { IntelligentMOSFET } from './src/core/devices/intelligent_mosfet';
import type { DiodeParameters, MOSFETParameters } from './src/core/devices/intelligent_device_model';

async function diagnoseNaN_SimplestCase() {
  console.log('='.repeat(80));
  console.log('🔍 诊断 1: 最简单的二极管电路（应该工作）');
  console.log('='.repeat(80));

  const diodeParams: DiodeParameters = {
    Is: 1e-14,
    n: 1.0,
    Rs: 0.1,
    Cj0: 1e-12,
    Vj: 0.7,
    m: 0.5,
    tt: 0
  };

  // 最简单的 DC 电路
  const engine = new CircuitSimulationEngine({
    endTime: 0,  // DC only
    initialTimeStep: 1e-6,
    verboseLogging: true
  });

  engine.addDevice(new VoltageSource('V1', ['n1', '0'], 5));
  engine.addDevice(new IntelligentDiode('D1', ['n1', 'n2'], diodeParams));
  engine.addDevice(new Resistor('R1', ['n2', '0'], 1000));

  console.log('\n开始 DC 分析...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  console.log(`结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
  if (result.errorMessage) {
    console.log(`错误: ${result.errorMessage}`);
  }
  console.log('='.repeat(80) + '\n');

  return result.success;
}

async function diagnoseNaN_SimpleTransient() {
  console.log('='.repeat(80));
  console.log('🔍 诊断 2: 简单瞬态（慢脉冲）');
  console.log('='.repeat(80));

  const diodeParams: DiodeParameters = {
    Is: 1e-14,
    n: 1.0,
    Rs: 0.1,
    Cj0: 1e-12,
    Vj: 0.7,
    m: 0.5,
    tt: 0
  };

  const engine = new CircuitSimulationEngine({
    endTime: 10e-6,  // 10μs
    initialTimeStep: 1e-6,  // 慢速
    maxTimeStep: 2e-6,
    minTimeStep: 1e-7,
    verboseLogging: true
  });

  engine.addDevice(new VoltageSource('V1', ['n1', '0'], 5, {
    type: 'PULSE',
    parameters: {
      v1: 0,
      v2: 5,
      delay: 0,
      rise_time: 1e-6,  // 慢上升
      fall_time: 1e-6,
      pulse_width: 5e-6,
      period: 10e-6
    }
  }));
  engine.addDevice(new IntelligentDiode('D1', ['n1', 'n2'], diodeParams));
  engine.addDevice(new Resistor('R1', ['n2', '0'], 1000));

  console.log('\n开始瞬态分析（慢脉冲）...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  console.log(`结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
  if (result.success) {
    console.log(`完成步数: ${result.totalSteps}`);
  } else {
    console.log(`错误: ${result.errorMessage}`);
  }
  console.log('='.repeat(80) + '\n');

  return result.success;
}

async function diagnoseNaN_FastPulse() {
  console.log('='.repeat(80));
  console.log('🔍 诊断 3: 快速脉冲（容易出现 NaN）');
  console.log('='.repeat(80));

  const diodeParams: DiodeParameters = {
    Is: 1e-15,
    n: 1.0,
    Rs: 0.01,
    Cj0: 1e-11,
    Vj: 0.7,
    m: 0.5,
    tt: 0
  };

  const engine = new CircuitSimulationEngine({
    endTime: 10e-6,
    initialTimeStep: 10e-9,  // 快速
    maxTimeStep: 50e-9,
    minTimeStep: 1e-10,
    verboseLogging: true
  });

  engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10, {
    type: 'PULSE',
    parameters: {
      v1: -5,  // 负起始电压！
      v2: 10,
      delay: 0,
      rise_time: 50e-9,  // 快速边沿
      fall_time: 50e-9,
      pulse_width: 5e-6,
      period: 10e-6
    }
  }));
  engine.addDevice(new IntelligentDiode('D1', ['n1', 'n2'], diodeParams));
  engine.addDevice(new Resistor('R1', ['n2', '0'], 10));

  console.log('\n开始瞬态分析（快速脉冲 + 负电压）...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  console.log(`结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
  if (result.success) {
    console.log(`完成步数: ${result.totalSteps}`);
  } else {
    console.log(`错误: ${result.errorMessage}`);
    console.log(`失败时间: ${result.finalTime.toExponential(3)}s`);
  }
  console.log('='.repeat(80) + '\n');

  return result.success;
}

async function diagnoseNaN_MOSFET_Diode() {
  console.log('='.repeat(80));
  console.log('🔍 诊断 4: MOSFET + 二极管混合电路');
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

  const engine = new CircuitSimulationEngine({
    endTime: 5e-6,  // 缩短时间
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
      pulse_width: 2.5e-6,
      period: 5e-6
    }
  }));

  engine.addDevice(new IntelligentMOSFET('M1', ['n_vdd', 'n_gate', 'n_sw'], mosfetParams));
  engine.addDevice(new IntelligentDiode('D1', ['n_sw', '0'], diodeParams));
  engine.addDevice(new Resistor('R_load', ['n_sw', '0'], 100));
  engine.addDevice(new Capacitor('C_load', ['n_sw', '0'], 1e-6));

  console.log('\n开始混合电路仿真...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  console.log(`结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
  if (result.success) {
    console.log(`完成步数: ${result.totalSteps}`);
  } else {
    console.log(`错误: ${result.errorMessage}`);
    console.log(`失败时间: ${result.finalTime.toExponential(3)}s`);
  }
  console.log('='.repeat(80) + '\n');

  return result.success;
}

// 主诊断流程
async function runDiagnostics() {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(25) + 'NaN 问题诊断报告' + ' '.repeat(26) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('\n');

  const results = {
    simpleDC: false,
    simpleTransient: false,
    fastPulse: false,
    mixedCircuit: false
  };

  try {
    results.simpleDC = await diagnoseNaN_SimplestCase();
    await new Promise(resolve => setTimeout(resolve, 1000));

    results.simpleTransient = await diagnoseNaN_SimpleTransient();
    await new Promise(resolve => setTimeout(resolve, 1000));

    results.fastPulse = await diagnoseNaN_FastPulse();
    await new Promise(resolve => setTimeout(resolve, 1000));

    results.mixedCircuit = await diagnoseNaN_MOSFET_Diode();
  } catch (error) {
    console.error('\n❌ 诊断过程中发生错误:', error);
  }

  // 总结
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(33) + '诊断总结' + ' '.repeat(33) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('\n');

  console.log('测试场景                    结果');
  console.log('-'.repeat(50));
  console.log(`1. 简单 DC 电路            ${results.simpleDC ? '✅ 通过' : '❌ 失败'}`);
  console.log(`2. 慢速瞬态               ${results.simpleTransient ? '✅ 通过' : '❌ 失败'}`);
  console.log(`3. 快速脉冲 + 负电压       ${results.fastPulse ? '✅ 通过' : '❌ 失败'}`);
  console.log(`4. MOSFET + 二极管混合     ${results.mixedCircuit ? '✅ 通过' : '❌ 失败'}`);
  console.log('-'.repeat(50));

  console.log('\n📊 **分析结论**:\n');
  
  if (results.simpleDC && results.simpleTransient && !results.fastPulse) {
    console.log('✅ DC 和慢速瞬态工作正常');
    console.log('❌ 快速信号/负电压导致 NaN');
    console.log('💡 问题根源：二极管模型在负电压或快速变化时数值不稳定');
  } else if (results.simpleDC && !results.simpleTransient) {
    console.log('✅ DC 工作正常');
    console.log('❌ 瞬态分析有问题');
    console.log('💡 问题根源：时间积分或初始条件设置');
  } else if (!results.simpleDC) {
    console.log('❌ DC 分析就失败了');
    console.log('💡 问题根源：基础的雅可比矩阵组装或求解');
  }

  console.log('\n');
}

// 运行诊断
runDiagnostics().then(() => {
  console.log('\n诊断完成！\n');
  process.exit(0);
}).catch(error => {
  console.error('\n诊断失败:', error);
  process.exit(1);
});
