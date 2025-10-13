/**
 * 🔬 NaN 深度追踪 - 追踪解向量中 NaN 的起源
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { IntelligentDiode } from './src/core/devices/intelligent_diode';
import type { DiodeParameters } from './src/core/devices/intelligent_device_model';

// 🔧 临时 Monkey-Patch：拦截解向量的更新
function patchVector() {
  const VectorModule = require('./src/math/sparse/vector');
  const OriginalVector = VectorModule.Vector;
  
  class TrackedVector extends OriginalVector {
    set(index: number, value: number): void {
      // 检测 NaN 写入
      if (!isFinite(value)) {
        console.error(`🚨 [NaN_DETECTED] Writing NaN/Inf to index ${index}, value=${value}`);
        console.error(`Stack trace:`);
        console.trace();
      }
      super.set(index, value);
    }
  }
  
  VectorModule.Vector = TrackedVector;
}

async function testSimplest() {
  console.log('\n' + '='.repeat(80));
  console.log('🔬 测试：最简单的二极管DC电路（应该工作）');
  console.log('='.repeat(80) + '\n');

  // 应用补丁
  patchVector();

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
    endTime: 0,  // DC only
    initialTimeStep: 1e-6
  });

  engine.addDevice(new VoltageSource('V1', ['n1', '0'], 5));
  engine.addDevice(new IntelligentDiode('D1', ['n1', 'n2'], diodeParams));
  engine.addDevice(new Resistor('R1', ['n2', '0'], 1000));

  console.log('开始 DC 分析...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  console.log(`结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
  if (result.errorMessage) {
    console.log(`错误: ${result.errorMessage}`);
  }
  console.log('='.repeat(80) + '\n');
}

async function testFastPulse() {
  console.log('\n' + '='.repeat(80));
  console.log('🔬 测试：快速脉冲（容易产生 NaN）');
  console.log('='.repeat(80) + '\n');

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
    endTime: 1e-6,  // 1μs (短时间测试)
    initialTimeStep: 10e-9,
    maxTimeStep: 50e-9,
    minTimeStep: 1e-10
  });

  engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10, {
    type: 'PULSE',
    parameters: {
      v1: -5,  // 负起始电压
      v2: 10,
      delay: 0,
      rise_time: 50e-9,
      fall_time: 50e-9,
      pulse_width: 500e-9,
      period: 1e-6
    }
  }));
  engine.addDevice(new IntelligentDiode('D1', ['n1', 'n2'], diodeParams));
  engine.addDevice(new Resistor('R1', ['n2', '0'], 10));

  console.log('开始瞬态分析（快速脉冲）...\n');
  
  try {
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
  } catch (error: any) {
    console.error(`\n❌ 仿真抛出异常: ${error.message}`);
    console.error(`堆栈: ${error.stack}`);
  }
}

async function main() {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(25) + 'NaN 深度追踪报告' + ' '.repeat(26) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('\n');

  // 测试1: 简单DC（不应该有NaN）
  await testSimplest();
  
  // 等待一秒
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 测试2: 快速脉冲（预期会有NaN）
  await testFastPulse();
  
  console.log('\n🔍 **分析结论**:\n');
  console.log('如果看到 "[NaN_DETECTED]" 消息，说明找到了 NaN 的写入位置。');
  console.log('请检查堆栈跟踪，找出是哪个函数产生了 NaN 值。\n');
}

main().then(() => {
  console.log('\n深度追踪完成！\n');
  process.exit(0);
}).catch(error => {
  console.error('\n深度追踪失败:', error);
  process.exit(1);
});
