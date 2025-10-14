/**
 * 最小化測試：PWM 電壓源 + 電阻
 * 隔離 PWM getValue() 和 Newton 求解器的交互
 */

import { describe, it, expect } from 'vitest';
import { SpiceNetlistParser } from '../src/core/parser/spice_netlist_parser.js';
import { CircuitSimulationEngine } from '../src/core/simulation/circuit_simulation_engine.js';

describe('🔬 PWM + Resistor 最小化測試', () => {

  it('PWM 電壓源應能正確驅動電阻負載', async () => {
    const netlist = `
      * Minimal PWM test: just PWM source + resistor
      Vgate n_gate 0 PULSE(0 5 1u 1u 1u 50u 100u)
      R1 n_gate 0 1k
      .tran 1n 10u
    `;

    const parser = new SpiceNetlistParser();
    const parsed = parser.parseNetlist(netlist);
    const devices = parser.createDevicesFromNetlist(parsed);

    const engine = new CircuitSimulationEngine({
      endTime: 10e-6,
      initialTimeStep: 100e-9,  // 100ns 初始步長
      minTimeStep: 1e-9,
      maxTimeStep: 1e-6,
      maxNewtonIterations: 50
    });

    engine.addDevices(devices);

    const gate_node_id = engine.getNodeIdByName('n_gate');
    expect(gate_node_id).toBeDefined();

    const result = await engine.runSimulation();

    console.log(`========================================`);
    console.log(`🎯 PWM + Resistor 測試結果`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Final time: ${result.finalTime.toExponential(3)}s`);
    console.log(`  Time points: ${result.waveformData.timePoints.length}`);
    console.log(`========================================`);

    // 必須成功
    expect(result.success).toBe(true);
    expect(result.finalTime).toBeGreaterThan(9e-6);

    const timePoints = result.waveformData.timePoints;
    const v_gate = result.waveformData.nodeVoltages.get(gate_node_id!);

    expect(timePoints).toBeDefined();
    expect(v_gate).toBeDefined();
    expect(timePoints.length).toBeGreaterThan(10);

    // 在 t=1.003μs 時，gate 電壓應該是 15mV
    const idx_1003 = timePoints.findIndex(t => Math.abs(t - 1.003e-6) < 1e-10);
    if (idx_1003 >= 0 && v_gate) {
      const v_at_1003 = v_gate[idx_1003];
      console.log(`  📍 t=1.003μs: V_gate = ${v_at_1003.toExponential(3)}V (expected 0.015V)`);
      expect(v_at_1003).toBeCloseTo(0.015, 3);
    }

    // 在 t=2μs 時，應該達到 5V
    const idx_2 = timePoints.findIndex(t => Math.abs(t - 2.0e-6) < 1e-10);
    if (idx_2 >= 0 && v_gate) {
      const v_at_2 = v_gate[idx_2];
      console.log(`  📍 t=2.0μs: V_gate = ${v_at_2.toExponential(3)}V (expected 5.0V)`);
      expect(v_at_2).toBeCloseTo(5.0, 1);
    }
  });
});
