/**
 * 🧮 Generalized-α Integrator Tests - AkingSPICE 2.1
 * 
 * 測試目標：
 * 1. 一階系統穩定性驗證 (RC, RL)
 * 2. 時間步長穩定性測試
 * 3. 數值阻尼效果驗證
 * 4. 長時間積分穩定性
 * 5. 精度與收斂性分析
 * 
 * Generalized-α 方法特性：
 * - 無條件穩定 (Unconditionally Stable)
 * - L-穩定 (高頻數值阻尼)
 * - 二階精度 (對線性問題)
 * 
 * @layer Layer 2 - Core Algorithm Tests
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

describe('Generalized-α Integrator Tests', () => {
  
  // ============================================================================
  // 一階系統穩定性測試 - RC 電路
  // ============================================================================
  describe('First-Order System Stability - RC Circuits', () => {
    
    test('should maintain stability for RC charging with standard time step', async () => {
      // RC 充電：V_C(t) = V_0 * (1 - e^(-t/τ))
      // τ = R*C = 1000 * 1e-6 = 1ms
      const tau = 1e-3;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 10,
        maxTimeStep: tau / 5,
        minTimeStep: tau / 100,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      expect(result.waveformData.timePoints.length).toBeGreaterThan(0);
      
      // 檢查最終時間
      const finalTime = result.waveformData.timePoints[result.waveformData.timePoints.length - 1];
      expect(finalTime).toBeGreaterThanOrEqual(4.5 * tau);
      
      // 檢查最終電壓應該接近 10V (99.3%)
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          expect(finalVoltage).toBeGreaterThan(9.5);
          expect(finalVoltage).toBeLessThan(10.1);
        }
      }
    });

    test('should maintain stability for RC charging with small time step', async () => {
      // 測試小時間步長的穩定性 (τ/100)
      const tau = 1e-3;
      
      const engine = new CircuitSimulationEngine({
        endTime: 3 * tau,
        initialTimeStep: tau / 100,
        maxTimeStep: tau / 50,
        minTimeStep: tau / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 5));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 最終電壓應該接近 5V (95%)
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          expect(finalVoltage).toBeGreaterThan(4.7);
          expect(finalVoltage).toBeLessThan(5.1);
        }
      }
    });

    test('should maintain stability for RC charging with large time step', async () => {
      // 測試大時間步長的穩定性 (τ/2) - 挑戰無條件穩定性
      const tau = 1e-3;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 2,
        maxTimeStep: tau,
        minTimeStep: tau / 10,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 即使步長大，仍應穩定收斂（允許較大誤差）
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          expect(finalVoltage).toBeGreaterThan(9.0);
          expect(finalVoltage).toBeLessThan(10.5);
        }
      }
    });

    test('should maintain monotonic behavior during RC charging', async () => {
      // 檢查單調性 - 電壓應該持續上升
      const tau = 1e-3;
      
      const engine = new CircuitSimulationEngine({
        endTime: 3 * tau,
        initialTimeStep: tau / 50,
        maxTimeStep: tau / 25,
        minTimeStep: tau / 100,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 1) {
          // 檢查單調性
          for (let i = 1; i < voltages.length; i++) {
            expect(voltages[i]).toBeGreaterThanOrEqual(voltages[i-1] - 1e-6);
          }
        }
      }
    });
  });

  // ============================================================================
  // 一階系統穩定性測試 - RL 電路
  // ============================================================================
  describe('First-Order System Stability - RL Circuits', () => {
    
    test('should maintain stability for RL current rise', async () => {
      // RL 電流上升：τ = L/R
      const L = 10e-3;  // 10mH
      const R = 100;     // 100Ω
      const tau = L / R; // 100μs
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 10,
        maxTimeStep: tau / 5,
        minTimeStep: tau / 50,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '0'], L));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 檢查電壓趨勢（應該從高到低）
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 1) {
          const firstVoltage = voltages[0];
          const lastVoltage = voltages[voltages.length - 1];
          // 最終電壓應該接近 0（穩態時電感短路）
          expect(lastVoltage).toBeLessThan(firstVoltage);
          expect(Math.abs(lastVoltage)).toBeLessThan(1.0);
        }
      }
    });

    test('should handle RL circuit with different time constants', async () => {
      // 測試不同時間常數的 RL 電路
      const L = 100e-3; // 100mH
      const R = 1000;    // 1kΩ
      const tau = L / R; // 100μs
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 10,
        maxTimeStep: tau / 5,
        minTimeStep: tau / 50,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '0'], L));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 檢查穩定性
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          expect(Math.abs(finalVoltage)).toBeLessThan(1.0);
        }
      }
    });
  });

  // ============================================================================
  // 多時間尺度系統測試
  // ============================================================================
  describe('Multi-Timescale System Handling', () => {
    
    test('should handle circuit with fast and slow components', async () => {
      // 多時間尺度：快速和慢速組件混合
      const tau_fast = 10e-6;  // 10μs
      const tau_slow = 10e-3;  // 10ms
      
      const engine = new CircuitSimulationEngine({
        endTime: 15e-3, // 1.5 * tau_slow
        initialTimeStep: tau_fast / 5,
        maxTimeStep: tau_slow / 10,
        minTimeStep: tau_fast / 20,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      
      // 快速子電路：τ_fast = 10μs
      engine.addDevice(new Resistor('R1', ['1', '2'], 100));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 100e-9));
      
      // 慢速子電路：τ_slow = 10ms
      engine.addDevice(new Resistor('R2', ['1', '3'], 10000));
      engine.addDevice(new Capacitor('C2', ['3', '0'], 1e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 快速電路應該已經穩定
      const fastNodeId = engine.getNodeIdByName('2');
      if (fastNodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(fastNodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          expect(finalVoltage).toBeGreaterThan(9.5); // 應該接近 10V
        }
      }
      
      // 慢速電路還在充電
      const slowNodeId = engine.getNodeIdByName('3');
      if (slowNodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(slowNodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          expect(finalVoltage).toBeGreaterThan(5);  // 已經充到一半以上
          expect(finalVoltage).toBeLessThan(10);    // 但還未完全充滿
        }
      }
    });
  });

  // ============================================================================
  // 長時間積分穩定性測試
  // ============================================================================
  describe('Long-Term Integration Stability', () => {
    
    test('should maintain stability over extended simulation time', async () => {
      // 長時間模擬：100個時間常數
      const tau = 1e-3;
      
      const engine = new CircuitSimulationEngine({
        endTime: 100 * tau,
        initialTimeStep: tau / 10,
        maxTimeStep: tau / 5,
        minTimeStep: tau / 50,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 最終應該完全充電到 10V (誤差 < 0.1%)
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          expect(Math.abs(finalVoltage - 10) / 10).toBeLessThan(0.001);
        }
      }
    });

    test('should not accumulate significant error over time', async () => {
      // 誤差累積測試
      const tau = 1e-3;
      
      const engine = new CircuitSimulationEngine({
        endTime: 50 * tau,
        initialTimeStep: tau / 20,
        maxTimeStep: tau / 10,
        minTimeStep: tau / 50,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 5));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 檢查最終精度
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          // 50τ 後應該完全充滿
          expect(Math.abs(finalVoltage - 5) / 5).toBeLessThan(0.005); // 0.5% 誤差
        }
      }
    });
  });

  // ============================================================================
  // 數值阻尼測試
  // ============================================================================
  describe('Numerical Damping Behavior', () => {
    
    test('should provide appropriate damping for oscillatory systems', async () => {
      // 測試輕度阻尼的 RLC 電路
      const engine = new CircuitSimulationEngine({
        endTime: 100e-6,
        initialTimeStep: 1e-6,
        maxTimeStep: 2e-6,
        minTimeStep: 0.5e-6,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 10));
      engine.addDevice(new Inductor('L1', ['2', '3'], 1e-3));
      engine.addDevice(new Capacitor('C1', ['3', '0'], 1e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 檢查系統穩定（沒有發散）
      const nodeId = engine.getNodeIdByName('3');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages && voltages.length > 0) {
          // 所有電壓都應該在合理範圍內（允許輕度過衝）
          for (const v of voltages) {
            expect(v).toBeGreaterThan(-5);
            expect(v).toBeLessThan(20); // 允許欠阻尼系統的過衝
          }
        }
      }
    });
  });

  // ============================================================================
  // 精度驗證測試
  // ============================================================================
  describe('Accuracy Verification', () => {
    
    test('should provide accurate results for RC charging', async () => {
      // 使用較小步長確保高精度
      const tau = 1e-3;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 50,
        maxTimeStep: tau / 25,
        minTimeStep: tau / 100,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        const timePoints = result.waveformData.timePoints;
        
        if (voltages && timePoints) {
          // 檢查 t = τ 時的電壓 (應該是 63.2%)
          let closestIdx = 0;
          let minDiff = Math.abs(timePoints[0] - tau);
          for (let i = 1; i < timePoints.length; i++) {
            const diff = Math.abs(timePoints[i] - tau);
            if (diff < minDiff) {
              minDiff = diff;
              closestIdx = i;
            }
          }
          
          const v_at_tau = voltages[closestIdx];
          const expected = 10 * (1 - Math.exp(-1)); // 6.321 V
          const relError = Math.abs(v_at_tau - expected) / expected;
          expect(relError).toBeLessThan(0.03); // 3% 相對誤差
        }
      }
    });

    test('should converge to correct steady state', async () => {
      // 驗證穩態收斂
      const tau = 1e-3;
      
      const engine = new CircuitSimulationEngine({
        endTime: 10 * tau,
        initialTimeStep: tau / 20,
        maxTimeStep: tau / 10,
        minTimeStep: tau / 50,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 7.5));
      engine.addDevice(new Resistor('R1', ['1', '2'], 2000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 0.5e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          // 穩態應該等於電壓源電壓
          expect(Math.abs(finalVoltage - 7.5) / 7.5).toBeLessThan(0.002);
        }
      }
    });
  });

  // ============================================================================
  // 邊界條件測試
  // ============================================================================
  describe('Edge Cases and Boundary Conditions', () => {
    
    test('should handle very small capacitor', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 10e-9,
        initialTimeStep: 1e-9,
        maxTimeStep: 2e-9,
        minTimeStep: 0.5e-9,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1e-15)); // 1fF

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
    });

    test('should handle very large capacitor', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 20e-3,
        initialTimeStep: 1e-3,
        maxTimeStep: 2e-3,
        minTimeStep: 0.5e-3,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 100));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1)); // 1F

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 大電容充電慢，電壓應該還很低
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          expect(finalVoltage).toBeLessThan(2); // 應該還在充電初期
        }
      }
    });

    test('should handle very small inductor', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 10e-9,
        initialTimeStep: 1e-9,
        maxTimeStep: 2e-9,
        minTimeStep: 0.5e-9,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 5));
      engine.addDevice(new Resistor('R1', ['1', '2'], 100));
      engine.addDevice(new Inductor('L1', ['2', '0'], 1e-15)); // 1fH

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
    });

    test('should handle very large inductor', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 20e-3,
        initialTimeStep: 1e-3,
        maxTimeStep: 2e-3,
        minTimeStep: 0.5e-3,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Inductor('L1', ['2', '0'], 1)); // 1H

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 大電感電流變化極慢，20ms 內電壓變化很小
      const nodeId = engine.getNodeIdByName('2');
      if (nodeId !== undefined) {
        const voltages = result.waveformData.nodeVoltages.get(nodeId);
        if (voltages) {
          const finalVoltage = voltages[voltages.length - 1];
          // τ = L/R = 1H / 1000Ω = 1ms，但電感會阻止電流變化
          // 20ms 後電感兩端電壓應該很小（接近短路）
          expect(Math.abs(finalVoltage)).toBeLessThan(1); // 應該接近 0
        }
      }
    });
  });
});
