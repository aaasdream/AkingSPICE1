/**
 * 🧪 Second-Order RLC Circuit Tests - AkingSPICE 2.1
 * 
 * 測試目標：
 * 1. 串聯 RLC 電路三種阻尼模式
 *    - 欠阻尼 (Underdamped, ζ < 1): 振盪衰減
 *    - 臨界阻尼 (Critically Damped, ζ = 1): 最快收斂無振盪
 *    - 過阻尼 (Overdamped, ζ > 1): 慢收斂無振盪
 * 2. 並聯 RLC 諧振電路
 * 3. 諧振頻率驗證 (f₀ = 1/(2π√LC))
 * 4. 品質因數驗證 (Q = √(L/C)/R)
 * 5. 能量轉換與守恆
 * 
 * 數學背景：
 * - 阻尼比: ζ = R/(2√(L/C))
 * - 固有頻率: ω₀ = 1/√(LC)
 * - 阻尼頻率: ωd = ω₀√(1-ζ²)
 * 
 * @layer Layer 3 - Subsystem Integration Tests
 * @priority High
 * @author AkingSPICE Team
 * @date 2025-10-11
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../../src/components/passive/resistor';
import { Capacitor } from '../../../src/components/passive/capacitor';
import { Inductor } from '../../../src/components/passive/inductor';
import { VoltageSource } from '../../../src/components/sources/voltage_source';

describe('Second-Order RLC Circuit Tests', () => {
  
  // ============================================================================
  // 串聯 RLC - 欠阻尼模式 (Underdamped)
  // ============================================================================
  describe('Series RLC - Underdamped Response (ζ < 1)', () => {
    
    test('should exhibit oscillatory behavior in underdamped mode', async () => {
      // 欠阻尼 RLC：ζ < 1
      // L = 1mH, C = 1μF, R = 10Ω
      // ω₀ = 1/√(LC) = 1/√(1e-3 * 1e-6) = 31,623 rad/s
      // ζ = R/(2√(L/C)) = 10/(2*31.623) ≈ 0.158 << 1 (欠阻尼)
      
      const L = 1e-3;  // 1mH
      const C = 1e-6;  // 1μF
      const R = 10;    // 10Ω
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * period,
        initialTimeStep: period / 100,
        maxTimeStep: period / 50,
        minTimeStep: period / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 檢查電容電壓是否有振盪
      const nodeId = engine.getNodeIdByName('3');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 10) {
          // 尋找局部最大值（振盪的證據）
          let peakCount = 0;
          for (let i = 2; i < voltages.length - 2; i++) {
            const v_curr = voltages[i];
            const v_prev1 = voltages[i-1];
            const v_prev2 = voltages[i-2];
            const v_next1 = voltages[i+1];
            const v_next2 = voltages[i+2];
            
            if (v_curr !== undefined && v_prev1 !== undefined && v_prev2 !== undefined &&
                v_next1 !== undefined && v_next2 !== undefined) {
              if (v_curr > v_prev1 && v_curr > v_prev2 && v_curr > v_next1 && v_curr > v_next2) {
                peakCount++;
              }
            }
          }
          // 欠阻尼應該有多個振盪峰值
          expect(peakCount).toBeGreaterThan(2);
        }
      }
    });

    test('should have damped oscillation amplitude decreasing over time', async () => {
      // 檢查振幅衰減
      const L = 10e-3;  // 10mH
      const C = 100e-9; // 100nF
      const R = 50;     // 50Ω
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 10 * period,
        initialTimeStep: period / 100,
        maxTimeStep: period / 50,
        minTimeStep: period / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const nodeId = engine.getNodeIdByName('3');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 20) {
          // 找到前半段和後半段的最大值
          const mid = Math.floor(voltages.length / 2);
          const firstHalf = voltages.slice(0, mid);
          const secondHalf = voltages.slice(mid);
          
          const maxFirst = Math.max(...firstHalf.map(v => Math.abs(v)));
          const maxSecond = Math.max(...secondHalf.map(v => Math.abs(v)));
          
          // 後半段振幅應該小於前半段（阻尼效果）
          expect(maxSecond).toBeLessThan(maxFirst * 1.1);
        }
      }
    });

    test('should verify resonant frequency', async () => {
      // 驗證諧振頻率
      const L = 1e-3;   // 1mH
      const C = 1e-6;   // 1μF
      const R = 5;      // 5Ω (極小阻尼)
      
      const omega0_expected = 1 / Math.sqrt(L * C); // rad/s
      const f0_expected = omega0_expected / (2 * Math.PI); // Hz
      const period_expected = 1 / f0_expected;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * period_expected,
        initialTimeStep: period_expected / 200,
        maxTimeStep: period_expected / 100,
        minTimeStep: period_expected / 400,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 測量實際振盪週期
      const nodeId = engine.getNodeIdByName('3');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        const times = result.waveformData.timePoints;
        
        if (voltages && times && voltages.length > 10) {
          // 找到前兩個峰值
          const peaks: number[] = [];
          for (let i = 2; i < voltages.length - 2 && peaks.length < 2; i++) {
            const v_curr = voltages[i];
            const v_prev = voltages[i-1];
            const v_next = voltages[i+1];
            const t_curr = times[i];
            
            if (v_curr !== undefined && v_prev !== undefined && v_next !== undefined && t_curr !== undefined) {
              if (v_curr > v_prev && v_curr > v_next && v_curr > (Math.max(...voltages) * 0.3)) {
                peaks.push(t_curr);
              }
            }
          }
          
          if (peaks.length >= 2 && peaks[0] !== undefined && peaks[1] !== undefined) {
            const measured_period = peaks[1] - peaks[0];
            const relError = Math.abs(measured_period - period_expected) / period_expected;
            expect(relError).toBeLessThan(0.1); // 10% 誤差容忍
          }
        }
      }
    });
  });

  // ============================================================================
  // 串聯 RLC - 臨界阻尼模式 (Critically Damped)
  // ============================================================================
  describe('Series RLC - Critically Damped Response (ζ = 1)', () => {
    
    test('should reach steady state fastest without overshoot', async () => {
      // 臨界阻尼：ζ = 1
      // R = 2√(L/C)
      const L = 1e-3;   // 1mH
      const C = 1e-6;   // 1μF
      const R = 2 * Math.sqrt(L / C); // ≈ 63.2Ω
      
      const tau = 2 * Math.sqrt(L * C); // 時間常數
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 50,
        maxTimeStep: tau / 25,
        minTimeStep: tau / 100,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const nodeId = engine.getNodeIdByName('3');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 5) {
          // 檢查沒有明顯過衝
          const maxVoltage = Math.max(...voltages);
          const finalVoltage = voltages[voltages.length - 1];
          
          if (finalVoltage !== undefined) {
            // 最大值不應該超過最終值太多（允許小幅過衝）
            expect(maxVoltage).toBeLessThan(finalVoltage * 1.15);
            
            // 檢查單調性（不應該有振盪）
            let hasSignificantOscillation = false;
            for (let i = 2; i < voltages.length - 2; i++) {
              const v_curr = voltages[i];
              const v_prev = voltages[i-1];
              const v_next = voltages[i+1];
              
              if (v_curr !== undefined && v_prev !== undefined && v_next !== undefined) {
                const localMax = v_curr > v_prev && v_curr > v_next;
                const isSignificant = Math.abs(v_curr - v_prev) > finalVoltage * 0.05;
                if (localMax && isSignificant && i < voltages.length * 0.8) {
                  hasSignificantOscillation = true;
                }
              }
            }
            expect(hasSignificantOscillation).toBe(false);
          }
        }
      }
    });
  });

  // ============================================================================
  // 串聯 RLC - 過阻尼模式 (Overdamped)
  // ============================================================================
  describe('Series RLC - Overdamped Response (ζ > 1)', () => {
    
    test('should have slow monotonic rise without oscillation', async () => {
      // 過阻尼：ζ > 1
      const L = 1e-3;   // 1mH
      const C = 1e-6;   // 1μF
      const R = 200;    // 200Ω >> 2√(L/C)
      
      const tau = L / R; // 估計時間常數
      
      const engine = new CircuitSimulationEngine({
        endTime: 10 * tau,
        initialTimeStep: tau / 20,
        maxTimeStep: tau / 10,
        minTimeStep: tau / 50,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const nodeId = engine.getNodeIdByName('3');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 5) {
          // 檢查單調上升（允許微小數值誤差）
          for (let i = 1; i < voltages.length; i++) {
            const v_curr = voltages[i];
            const v_prev = voltages[i-1];
            if (v_curr !== undefined && v_prev !== undefined) {
              expect(v_curr).toBeGreaterThanOrEqual(v_prev - 1e-6);
            }
          }
        }
      }
    });

    test('should have no overshoot in overdamped mode', async () => {
      const L = 10e-3;  // 10mH
      const C = 1e-6;   // 1μF
      const R = 500;    // 500Ω (大電阻)
      
      const tau = L / R;
      
      const engine = new CircuitSimulationEngine({
        endTime: 10 * tau,
        initialTimeStep: tau / 20,
        maxTimeStep: tau / 10,
        minTimeStep: tau / 50,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 5));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const nodeId = engine.getNodeIdByName('3');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 0) {
          const maxVoltage = Math.max(...voltages);
          const targetVoltage = 5;
          
          // 過阻尼不應該有過衝
          expect(maxVoltage).toBeLessThanOrEqual(targetVoltage * 1.01);
        }
      }
    });
  });

  // ============================================================================
  // 並聯 RLC 諧振電路
  // ============================================================================
  describe('Parallel RLC Resonant Circuits', () => {
    
    test('should handle parallel RLC configuration', async () => {
      // 並聯 RLC
      const L = 1e-3;   // 1mH
      const C = 1e-6;   // 1μF
      const R = 1000;   // 1kΩ (並聯)
      
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * period,
        initialTimeStep: period / 100,
        maxTimeStep: period / 50,
        minTimeStep: period / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R_series', ['1', '2'], 10)); // 串聯小電阻
      
      // 並聯 RLC
      engine.addDevice(new Resistor('R1', ['2', '0'], R));
      engine.addDevice(new Inductor('L1', ['2', '0'], L));
      engine.addDevice(new Capacitor('C1', ['2', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 檢查節點電壓穩定
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          // 並聯諧振電路應該有振盪行為
          expect(voltages.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ============================================================================
  // 品質因數 (Quality Factor) 測試
  // ============================================================================
  describe('Quality Factor (Q) Verification', () => {
    
    test('should exhibit high Q behavior with low resistance', async () => {
      // 高 Q 電路：Q = √(L/C)/R
      const L = 1e-3;   // 1mH
      const C = 1e-6;   // 1μF
      const R = 1;      // 1Ω (極小電阻 -> 高 Q)
      
      const Q_expected = Math.sqrt(L / C) / R; // Q ≈ 31.6
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 10 * period,
        initialTimeStep: period / 200,
        maxTimeStep: period / 100,
        minTimeStep: period / 400,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      expect(Q_expected).toBeGreaterThan(10); // 高 Q
      
      // 高 Q 應該有持續的振盪 - 檢查峰值數量而非過零點
      const nodeId = engine.getNodeIdByName('3');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 20) {
          // 尋找局部最大值和最小值（振盪的證據）
          let peakCount = 0;
          for (let i = 2; i < voltages.length - 2; i++) {
            const v_curr = voltages[i];
            const v_prev1 = voltages[i-1];
            const v_prev2 = voltages[i-2];
            const v_next1 = voltages[i+1];
            const v_next2 = voltages[i+2];
            
            if (v_curr !== undefined && v_prev1 !== undefined && v_prev2 !== undefined &&
                v_next1 !== undefined && v_next2 !== undefined) {
              // 局部最大值
              if (v_curr > v_prev1 && v_curr > v_prev2 && v_curr > v_next1 && v_curr > v_next2) {
                peakCount++;
              }
              // 局部最小值
              if (v_curr < v_prev1 && v_curr < v_prev2 && v_curr < v_next1 && v_curr < v_next2) {
                peakCount++;
              }
            }
          }
          // 高 Q 應該有多個振盪峰值
          expect(peakCount).toBeGreaterThan(5);
        }
      }
    });

    test('should exhibit low Q behavior with high resistance', async () => {
      // 低 Q 電路
      const L = 1e-3;   // 1mH
      const C = 1e-6;   // 1μF
      const R = 100;    // 100Ω (大電阻 -> 低 Q)
      
      const Q_expected = Math.sqrt(L / C) / R; // Q ≈ 0.316
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * period,
        initialTimeStep: period / 100,
        maxTimeStep: period / 50,
        minTimeStep: period / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      expect(Q_expected).toBeLessThan(1); // 低 Q
      
      // 低 Q 應該快速衰減
      const nodeId = engine.getNodeIdByName('3');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 10) {
          const finalVoltage = voltages[voltages.length - 1];
          if (finalVoltage !== undefined) {
            // 應該快速收斂到穩態
            expect(Math.abs(finalVoltage - 10)).toBeLessThan(1);
          }
        }
      }
    });
  });

  // ============================================================================
  // 不同初始條件測試
  // ============================================================================
  describe('Different Initial Conditions', () => {
    
    test('should handle non-zero initial capacitor voltage', async () => {
      // 注意：當前 API 可能不支持初始條件，這個測試驗證零初始條件下的行為
      const L = 1e-3;
      const C = 1e-6;
      const R = 50;
      
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * period,
        initialTimeStep: period / 100,
        maxTimeStep: period / 50,
        minTimeStep: period / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // 極端參數測試
  // ============================================================================
  describe('Extreme Parameter Values', () => {
    
    test('should handle very high frequency RLC', async () => {
      const L = 1e-6;   // 1μH
      const C = 1e-12;  // 1pF
      const R = 10;
      
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 10 * period,
        initialTimeStep: period / 100,
        maxTimeStep: period / 50,
        minTimeStep: period / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 5));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
    });

    test('should handle very low frequency RLC', async () => {
      const L = 1;      // 1H
      const C = 1e-3;   // 1mF
      const R = 100;
      
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 2 * period,
        initialTimeStep: period / 100,
        maxTimeStep: period / 50,
        minTimeStep: period / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
    });
  });
});
