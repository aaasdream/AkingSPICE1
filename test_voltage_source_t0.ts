/**
 * 测试 VoltageSource 在 t=0 时的值
 */

import { VoltageSourceFactory } from './src/components/sources/voltage_source';

console.log('='.repeat(80));
console.log('测试 VoltageSource 在 t=0 时刻的值');
console.log('='.repeat(80));

// 创建 SIN 电压源
const vac = VoltageSourceFactory.createSine(
  'Vac',
  ['n1', '0'],
  0,     // DC offset = 0
  12,    // amplitude = 12V
  60     // frequency = 60Hz
);

console.log('\n测试 SIN 电压源:');
console.log(`  DC offset: 0V`);
console.log(`  Amplitude: 12V`);
console.log(`  Frequency: 60Hz`);

console.log('\n时间点测试:');
for (let t = 0; t <= 1e-3; t += 1e-4) {
  const v = vac.getValue(t);
  console.log(`  t=${(t*1000).toFixed(3)}ms: V=${v.toFixed(6)}V`);
}

console.log('\n理论值:');
console.log(`  V(t) = 0 + 12 * sin(2π * 60 * t)`);
console.log(`  V(0) = 0 + 12 * sin(0) = 0V`);
console.log(`  V(1/240s) = 12 * sin(π/2) = 12V`);
console.log(`  1/240s = ${(1/240*1000).toFixed(3)}ms`);
