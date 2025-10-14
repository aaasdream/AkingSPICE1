/**
 * 調試 PWM 電壓源的 getValue() 行為
 * 直接測試 VoltageSource 類的 PULSE 功能
 */

import { describe, it, expect } from 'vitest';
import { VoltageSourceFactory } from '../src/components/sources/voltage_source.js';

describe('🔍 PWM VoltageSource getValue() 調試', () => {

  it('應在 PULSE 開始前返回 V1', () => {
    // PULSE(0 5 1u 1u 1u 50u 100u)
    const pwm = VoltageSourceFactory.createPulse(
      'Vtest',
      ['n1', '0'],
      0,    // v1 = 0V
      5,    // v2 = 5V
      1e-6, // delay = 1μs
      1e-6, // rise_time = 1μs
      1e-6, // fall_time = 1μs
      50e-6,// pulse_width = 50μs
      100e-6 // period = 100μs
    );

    // t < td: 應返回 V1 = 0V
    expect(pwm.getValue(0)).toBe(0);
    expect(pwm.getValue(0.5e-6)).toBe(0);
    expect(pwm.getValue(0.999e-6)).toBe(0);
  });

  it('應在上升沿期間線性增加', () => {
    const pwm = VoltageSourceFactory.createPulse(
      'Vtest',
      ['n1', '0'],
      0,    // v1 = 0V
      5,    // v2 = 5V
      1e-6, // delay = 1μs
      1e-6, // rise_time = 1μs
      1e-6, // fall_time = 1μs
      50e-6,// pulse_width = 50μs
      100e-6 // period = 100μs
    );

    // t = 1.001μs: tmod = 0.001μs, V = 0 + 5 * (0.001 / 1.0) = 0.005V = 5mV
    const v1 = pwm.getValue(1.001e-6);
    console.log(`t=1.001μs: V=${v1} (expected 0.005V)`);
    expect(v1).toBeCloseTo(0.005, 6);

    // t = 1.002μs: tmod = 0.002μs, V = 0 + 5 * (0.002 / 1.0) = 0.010V = 10mV
    const v2 = pwm.getValue(1.002e-6);
    console.log(`t=1.002μs: V=${v2} (expected 0.010V)`);
    expect(v2).toBeCloseTo(0.010, 6);

    // t = 1.003μs: tmod = 0.003μs, V = 0 + 5 * (0.003 / 1.0) = 0.015V = 15mV
    const v3 = pwm.getValue(1.003e-6);
    console.log(`t=1.003μs: V=${v3} (expected 0.015V)`);
    expect(v3).toBeCloseTo(0.015, 6);

    // t = 1.5μs: tmod = 0.5μs, V = 0 + 5 * (0.5 / 1.0) = 2.5V
    const v4 = pwm.getValue(1.5e-6);
    console.log(`t=1.5μs: V=${v4} (expected 2.5V)`);
    expect(v4).toBeCloseTo(2.5, 6);

    // t = 2.0μs: tmod = 1.0μs = tr, 應達到 V2 = 5V
    const v5 = pwm.getValue(2.0e-6);
    console.log(`t=2.0μs: V=${v5} (expected 5.0V)`);
    expect(v5).toBeCloseTo(5.0, 6);
  });

  it('應在脈衝寬度期間保持 V2', () => {
    const pwm = VoltageSourceFactory.createPulse(
      'Vtest',
      ['n1', '0'],
      0,    // v1 = 0V
      5,    // v2 = 5V
      1e-6, // delay = 1μs
      1e-6, // rise_time = 1μs
      1e-6, // fall_time = 1μs
      50e-6,// pulse_width = 50μs
      100e-6 // period = 100μs
    );

    // t = 10μs: tmod = 9μs, 在 tr+pw = 51μs 範圍內，應保持 V2 = 5V
    const v1 = pwm.getValue(10e-6);
    console.log(`t=10μs: V=${v1} (expected 5.0V)`);
    expect(v1).toBeCloseTo(5.0, 6);

    // t = 30μs: tmod = 29μs, 仍在脈衝期
    const v2 = pwm.getValue(30e-6);
    console.log(`t=30μs: V=${v2} (expected 5.0V)`);
    expect(v2).toBeCloseTo(5.0, 6);
  });

  it('應在下降沿期間線性下降', () => {
    const pwm = VoltageSourceFactory.createPulse(
      'Vtest',
      ['n1', '0'],
      0,    // v1 = 0V
      5,    // v2 = 5V
      1e-6, // delay = 1μs
      1e-6, // rise_time = 1μs
      1e-6, // fall_time = 1μs
      50e-6,// pulse_width = 50μs
      100e-6 // period = 100μs
    );

    // t = 1 + 1 + 50 = 52μs: tmod = 51μs, 開始下降
    // V = 5 - (5-0) * (tmod - tr - pw) / tf
    //   = 5 - 5 * (51 - 1 - 50) / 1 = 5 - 0 = 5V (剛開始)
    const v1 = pwm.getValue(52e-6);
    console.log(`t=52μs: V=${v1} (expected 5.0V)`);
    expect(v1).toBeCloseTo(5.0, 6);

    // t = 52.5μs: tmod = 51.5μs
    // V = 5 - 5 * (51.5 - 51) / 1 = 5 - 2.5 = 2.5V
    const v2 = pwm.getValue(52.5e-6);
    console.log(`t=52.5μs: V=${v2} (expected 2.5V)`);
    expect(v2).toBeCloseTo(2.5, 6);

    // t = 53μs: tmod = 52μs
    // V = 5 - 5 * (52 - 51) / 1 = 5 - 5 = 0V (下降結束)
    const v3 = pwm.getValue(53e-6);
    console.log(`t=53μs: V=${v3} (expected 0.0V)`);
    expect(v3).toBeCloseTo(0.0, 6);
  });

  it('應在周期結束後重複波形', () => {
    const pwm = VoltageSourceFactory.createPulse(
      'Vtest',
      ['n1', '0'],
      0,    // v1 = 0V
      5,    // v2 = 5V
      1e-6, // delay = 1μs
      1e-6, // rise_time = 1μs
      1e-6, // fall_time = 1μs
      50e-6,// pulse_width = 50μs
      100e-6 // period = 100μs
    );

    // t = 101μs: 第二個周期開始
    // tmod = (101 - 1) % 100 = 0
    // V = 0 + 5 * 0 / 1 = 0V
    const v1 = pwm.getValue(101e-6);
    console.log(`t=101μs: V=${v1} (expected 0.0V - 第二周期開始)`);
    expect(v1).toBeCloseTo(0.0, 6);

    // t = 102μs: tmod = 1μs
    // V = 0 + 5 * 1 / 1 = 5V (上升沿結束)
    const v2 = pwm.getValue(102e-6);
    console.log(`t=102μs: V=${v2} (expected 5.0V)`);
    expect(v2).toBeCloseTo(5.0, 6);
  });

  it('🔥 關鍵測試：在 t=1.002μs 和 t=1.003μs 的精確值', () => {
    const pwm = VoltageSourceFactory.createPulse(
      'Vgate',
      ['n_gate', '0'],
      0,    // v1 = 0V
      5,    // v2 = 5V
      1e-6, // delay = 1μs
      1e-6, // rise_time = 1μs
      1e-6, // fall_time = 1μs
      50e-6,// pulse_width = 50μs
      100e-6 // period = 100μs
    );

    // 這是失敗快照的時間點
    const v_1002 = pwm.getValue(1.002e-6);
    const v_1003 = pwm.getValue(1.003e-6);

    console.log(`==========================================`);
    console.log(`🎯 關鍵時間點測試`);
    console.log(`t=1.002μs: getValue() = ${v_1002}V`);
    console.log(`           expected = 0.010V (10mV)`);
    console.log(`t=1.003μs: getValue() = ${v_1003}V`);
    console.log(`           expected = 0.015V (15mV)`);
    console.log(`==========================================`);

    expect(v_1002).toBeCloseTo(0.010, 6);
    expect(v_1003).toBeCloseTo(0.015, 6);
  });
});
