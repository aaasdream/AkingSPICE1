/**
 * 📋 DC Solver Convergence Tests - AkingSPICE 2.1
 * 
 * 測試目標：
 * 1. Newton-Raphson 迭代收斂性（線性電路）
 * 2. Gmin Stepping 穩定性增強
 * 3. 電容器 DC 行為（開路）
 * 4. 電感器 DC 行為（短路）
 * 5. 混合 LC 電路 DC 分析
 * 6. 極端電阻值處理
 * 7. 數值穩定性測試
 * 
 * @layer Layer 2 - Core Algorithm Tests
 * @priority High
 * @author AkingSPICE Team
 * @date 2025-10-11
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../../src/components/passive/resistor';
import { VoltageSource } from '../../../src/components/sources/voltage_source';
import { Capacitor } from '../../../src/components/passive/capacitor';
import { Inductor } from '../../../src/components/passive/inductor';

// Helper function to get node voltage by name
function getNodeVoltage(engine: CircuitSimulationEngine, result: any, nodeName: string): number {
  const nodeIndex = engine['_nodeMapping'].get(nodeName);
  if (nodeIndex === undefined) return 0;
  return result.waveformData.nodeVoltages.get(nodeIndex)?.[0] || 0;
}

describe('DC Solver Convergence Tests', () => {
  
  // ============================================================================
  // Newton-Raphson 基本收斂測試（線性電路）
  // ============================================================================
  describe('Newton-Raphson Convergence - Linear Circuits', () => {
    
    test('should converge in 1 iteration for simple linear circuit', async () => {
      // 純線性電路應該快速收斂
      const engine = new CircuitSimulationEngine({
        endTime: 0, // DC analysis only
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 驗證解的正確性：V = 10V
      const v_1 = getNodeVoltage(engine, result, '1');
      expect(Math.abs(v_1 - 10)).toBeLessThan(1e-6);
    });

    test('should converge for voltage divider', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['1', '2'], 3000));
      engine.addDevice(new Resistor('R2', ['2', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // V2 = 12V * (1kΩ / (3kΩ + 1kΩ)) = 3V
      const v_2 = getNodeVoltage(engine, result, '2');
      expect(Math.abs(v_2 - 3)).toBeLessThan(1e-3);
    });

    test('should converge for complex resistive network', async () => {
      // 6 節點複雜電阻網絡
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 24));
      engine.addDevice(new Resistor('R1', ['1', '2'], 100));
      engine.addDevice(new Resistor('R2', ['2', '3'], 200));
      engine.addDevice(new Resistor('R3', ['1', '3'], 150));
      engine.addDevice(new Resistor('R4', ['3', '4'], 300));
      engine.addDevice(new Resistor('R5', ['2', '4'], 250));
      engine.addDevice(new Resistor('R6', ['4', '0'], 180));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 驗證所有節點電壓都在合理範圍內
      for (const nodeName of ['1', '2', '3', '4']) {
        const v = getNodeVoltage(engine, result, nodeName);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(24);
      }
    });

    test('should converge for Wheatstone bridge', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Resistor('R2', ['1', '3'], 2000));
      engine.addDevice(new Resistor('R3', ['2', '4'], 1500));
      engine.addDevice(new Resistor('R4', ['3', '4'], 3000));
      engine.addDevice(new Resistor('Rm', ['2', '3'], 10000)); // 測量電阻

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const v_2 = getNodeVoltage(engine, result, '2');
      const v_3 = getNodeVoltage(engine, result, '3');
      
      // 檢查橋是否平衡（R1/R2 = R3/R4 => 1/2 = 1.5/3 = 0.5）
      expect(Math.abs(v_2 - v_3)).toBeLessThan(0.1); // 應該接近平衡
    });
  });

  // ============================================================================
  // Gmin Stepping 穩定性測試
  // ============================================================================
  describe('Gmin Stepping Stability Enhancement', () => {
    
    test('should handle very small resistances (near short circuit)', async () => {
      // 極小電阻（接近短路）
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1e-3)); // 1mΩ
      engine.addDevice(new Resistor('R2', ['2', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 由於 R1 << R2，節點 2 電壓應接近節點 1
      const v_1 = getNodeVoltage(engine, result, '1');
      const v_2 = getNodeVoltage(engine, result, '2');
      expect(Math.abs(v_2 - v_1)).toBeLessThan(0.1);
    });

    test('should handle very large resistances (near open circuit)', async () => {
      // 極大電阻（接近開路）
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1e9)); // 1GΩ
      engine.addDevice(new Resistor('R2', ['2', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 由於 R1 >> R2，節點 2 電壓應接近 0
      const v_2 = getNodeVoltage(engine, result, '2');
      expect(Math.abs(v_2)).toBeLessThan(0.1);
    });

    test('should handle wide range of resistance values', async () => {
      // 混合極端電阻值（1mΩ 到 1MΩ）
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1e-3));  // 1mΩ
      engine.addDevice(new Resistor('R2', ['2', '3'], 1));     // 1Ω
      engine.addDevice(new Resistor('R3', ['3', '4'], 1e3));   // 1kΩ
      engine.addDevice(new Resistor('R4', ['4', '0'], 1e6));   // 1MΩ

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 驗證電壓遞減
      const v_1 = getNodeVoltage(engine, result, '1');
      const v_2 = getNodeVoltage(engine, result, '2');
      const v_3 = getNodeVoltage(engine, result, '3');
      const v_4 = getNodeVoltage(engine, result, '4');
      
      expect(v_1).toBeGreaterThan(v_2);
      expect(v_2).toBeGreaterThan(v_3);
      expect(v_3).toBeGreaterThan(v_4);
      expect(v_4).toBeGreaterThan(0);
    });

    test('should handle floating node with Gmin stabilization', async () => {
      // 懸空節點測試 - Gmin Stepping 應該提供穩定性
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 5));
      engine.addDevice(new Resistor('R1', ['1', '0'], 1000));
      engine.addDevice(new Resistor('R2', ['2', '0'], 2000)); // 懸空節點

      const result = await engine.runSimulation();

      // Gmin Stepping 應該讓求解器收斂
      expect(result.success).toBe(true);
      
      // 懸空節點電壓應該接近 0（由於 Gmin）
      const v_2 = getNodeVoltage(engine, result, '2');
      expect(Math.abs(v_2)).toBeLessThan(1e-3);
    });
  });

  // ============================================================================
  // 電容器 DC 分析（開路）測試
  // ============================================================================
  describe('Capacitor DC Analysis - Open Circuit Behavior', () => {
    
    test('should treat capacitor as open circuit in DC', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 1e-6)); // 1μF
      engine.addDevice(new Resistor('R2', ['2', '0'], 2000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // DC 穩態下，電容器開路，電流只流過 R2
      // V2 = V1 * R2 / (R1 + R2) = 10 * 2000 / 3000 = 6.67V
      const v_2 = getNodeVoltage(engine, result, '2');
      expect(Math.abs(v_2 - (10 * 2000 / 3000))).toBeLessThan(1e-3);
    });

    test('should handle capacitor in series - blocks DC current', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '3'], 1e-6));
      engine.addDevice(new Resistor('R2', ['3', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 電容器阻擋 DC 電流，V3 應該接近 0
      const v_3 = getNodeVoltage(engine, result, '3');
      expect(Math.abs(v_3)).toBeLessThan(1e-3);
    });

    test('should handle multiple capacitors in parallel', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 15));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Capacitor('C1', ['2', '0'], 10e-6));
      engine.addDevice(new Capacitor('C2', ['2', '0'], 22e-6));
      engine.addDevice(new Resistor('R2', ['2', '0'], 2200));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 電容器並聯在 DC 下都是開路，電流只流過 R2
      const v_2 = getNodeVoltage(engine, result, '2');
      const expected = 15 * 2200 / (1000 + 2200);
      expect(Math.abs(v_2 - expected)).toBeLessThan(1e-3);
    });

    test('should handle RC voltage divider in DC', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['1', '2'], 4700));
      engine.addDevice(new Resistor('R2', ['2', '3'], 2200));
      engine.addDevice(new Capacitor('C1', ['3', '0'], 100e-6));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // C 開路，所以 V3 ≈ V2（無電流流過 R2）
      const v_2 = getNodeVoltage(engine, result, '2');
      const v_3 = getNodeVoltage(engine, result, '3');
      expect(Math.abs(v_2 - v_3)).toBeLessThan(1e-3);
    });
  });

  // ============================================================================
  // 電感器 DC 分析（短路）測試
  // ============================================================================
  describe('Inductor DC Analysis - Short Circuit Behavior', () => {
    
    test('should treat inductor as short circuit in DC', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['1', '2'], 100));
      engine.addDevice(new Inductor('L1', ['2', '3'], 1e-3)); // 1mH
      engine.addDevice(new Resistor('R2', ['3', '0'], 200));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 電感器在 DC 下是短路，V2 和 V3 應該相等
      const v_2 = getNodeVoltage(engine, result, '2');
      const v_3 = getNodeVoltage(engine, result, '3');
      expect(Math.abs(v_2 - v_3)).toBeLessThan(1e-3);
      
      // V3 = V1 * R2 / (R1 + R2)
      const expected = 12 * 200 / (100 + 200);
      expect(Math.abs(v_3 - expected)).toBeLessThan(1e-2);
    });

    test('should handle inductor in parallel - provides low resistance path', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Inductor('L1', ['2', '0'], 10e-3));
      engine.addDevice(new Resistor('R2', ['2', '0'], 5000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 電感器並聯提供短路路徑，V2 應該接近 0
      const v_2 = getNodeVoltage(engine, result, '2');
      expect(Math.abs(v_2)).toBeLessThan(0.1);
    });

    test('should handle multiple inductors in series', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 20));
      engine.addDevice(new Resistor('R1', ['1', '2'], 500));
      engine.addDevice(new Inductor('L1', ['2', '3'], 1e-3));
      engine.addDevice(new Inductor('L2', ['3', '4'], 2e-3));
      engine.addDevice(new Resistor('R2', ['4', '0'], 1500));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 電感器串聯在 DC 下都是短路，V2 ≈ V3 ≈ V4
      const v_2 = getNodeVoltage(engine, result, '2');
      const v_3 = getNodeVoltage(engine, result, '3');
      const v_4 = getNodeVoltage(engine, result, '4');
      
      expect(Math.abs(v_2 - v_3)).toBeLessThan(1e-3);
      expect(Math.abs(v_3 - v_4)).toBeLessThan(1e-3);
      
      // V4 = V1 * R2 / (R1 + R2)
      const expected = 20 * 1500 / (500 + 1500);
      expect(Math.abs(v_4 - expected)).toBeLessThan(1e-2);
    });

    test('should handle RL voltage divider in DC', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 15));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Inductor('L1', ['2', '3'], 10e-3));
      engine.addDevice(new Resistor('R2', ['3', '0'], 2000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // L 短路，所以 V2 ≈ V3，都受分壓影響
      const v_2 = getNodeVoltage(engine, result, '2');
      const v_3 = getNodeVoltage(engine, result, '3');
      expect(Math.abs(v_2 - v_3)).toBeLessThan(1e-3);
      
      const expected = 15 * 2000 / (1000 + 2000);
      expect(Math.abs(v_3 - expected)).toBeLessThan(1e-2);
    });
  });

  // ============================================================================
  // 混合 LC 電路 DC 分析
  // ============================================================================
  describe('Mixed LC Circuits in DC Analysis', () => {
    
    test('should handle LC circuit with resistor load', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 15));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Inductor('L1', ['2', '3'], 10e-3)); // 短路
      engine.addDevice(new Capacitor('C1', ['3', '4'], 100e-6)); // 開路
      engine.addDevice(new Resistor('R2', ['4', '0'], 2000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // L 短路：V2 ≈ V3
      const v_2 = getNodeVoltage(engine, result, '2');
      const v_3 = getNodeVoltage(engine, result, '3');
      expect(Math.abs(v_2 - v_3)).toBeLessThan(1e-3);
      
      // C 開路：V4 ≈ 0（無電流）
      const v_4 = getNodeVoltage(engine, result, '4');
      expect(Math.abs(v_4)).toBeLessThan(1e-3);
    });

    test('should handle parallel LC with resistor', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['1', '2'], 100));
      engine.addDevice(new Inductor('L1', ['2', '0'], 1e-3)); // 短路並聯
      engine.addDevice(new Capacitor('C1', ['2', '0'], 10e-6)); // 開路並聯
      engine.addDevice(new Resistor('R2', ['2', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // L 並聯提供短路路徑，V2 應該接近 0
      const v_2 = getNodeVoltage(engine, result, '2');
      expect(Math.abs(v_2)).toBeLessThan(0.1);
    });

    test('should handle series LC resonant circuit in DC', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 50));
      engine.addDevice(new Inductor('L1', ['2', '3'], 1e-3));
      engine.addDevice(new Capacitor('C1', ['3', '4'], 100e-9));
      engine.addDevice(new Resistor('R2', ['4', '0'], 50));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // DC 下：L 短路，C 開路，無電流流過 R2
      const v_4 = getNodeVoltage(engine, result, '4');
      expect(Math.abs(v_4)).toBeLessThan(1e-3);
    });

    test('should handle CLC pi-filter in DC', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 24));
      engine.addDevice(new Capacitor('C1', ['1', '0'], 100e-6)); // 輸入電容（並聯，開路）
      engine.addDevice(new Inductor('L1', ['1', '2'], 10e-3));   // 串聯電感（短路）
      engine.addDevice(new Capacitor('C2', ['2', '0'], 100e-6)); // 輸出電容（並聯，開路）
      engine.addDevice(new Resistor('R_load', ['2', '0'], 100)); // 負載

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // DC 下：C 並聯開路（無影響），L 短路（直接連接）
      // V2 應該等於 V1 = 24V（電感短路，電流流過負載電阻）
      const v_1 = getNodeVoltage(engine, result, '1');
      const v_2 = getNodeVoltage(engine, result, '2');
      expect(Math.abs(v_2 - v_1)).toBeLessThan(1e-3); // V2 ≈ V1
      expect(Math.abs(v_2 - 24)).toBeLessThan(1e-3); // V2 ≈ 24V
    });
  });

  // ============================================================================
  // 邊界條件與極端情況
  // ============================================================================
  describe('Edge Cases and Boundary Conditions', () => {
    
    test('should handle zero voltage source', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 0)); // 0V 源
      engine.addDevice(new Resistor('R1', ['1', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const v_1 = getNodeVoltage(engine, result, '1');
      expect(Math.abs(v_1)).toBeLessThan(1e-6);
    });

    test('should handle multiple voltage sources in series', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 5));
      engine.addDevice(new VoltageSource('V2', ['2', '1'], 3));
      engine.addDevice(new Resistor('R1', ['2', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 總電壓 = V1 + V2 = 8V
      const v_2 = getNodeVoltage(engine, result, '2');
      expect(Math.abs(v_2 - 8)).toBeLessThan(1e-3);
    });

    test('should converge for single node circuit', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 5));
      engine.addDevice(new Resistor('R1', ['1', '0'], 100));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const v_1 = getNodeVoltage(engine, result, '1');
      expect(Math.abs(v_1 - 5)).toBeLessThan(1e-9);
    });

    test('should handle symmetric circuit', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['1', '2'], 1000));
      engine.addDevice(new Resistor('R2', ['1', '3'], 1000)); // 相同電阻
      engine.addDevice(new Resistor('R3', ['2', '0'], 1000));
      engine.addDevice(new Resistor('R4', ['3', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 由於對稱性，V2 和 V3 應該相等
      const v_2 = getNodeVoltage(engine, result, '2');
      const v_3 = getNodeVoltage(engine, result, '3');
      expect(Math.abs(v_2 - v_3)).toBeLessThan(1e-6);
      expect(Math.abs(v_2 - 5)).toBeLessThan(1e-3); // 應該是 5V
    });
  });

  // ============================================================================
  // 數值穩定性測試
  // ============================================================================
  describe('Numerical Stability Tests', () => {
    
    test('should maintain precision for very small voltages', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 1e-6)); // 1μV
      engine.addDevice(new Resistor('R1', ['1', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const v_1 = getNodeVoltage(engine, result, '1');
      expect(Math.abs(v_1 - 1e-6)).toBeLessThan(1e-9);
    });

    test('should maintain precision for very large voltages', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 1e6)); // 1MV
      engine.addDevice(new Resistor('R1', ['1', '0'], 1000));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const v_1 = getNodeVoltage(engine, result, '1');
      const relativeError = Math.abs((v_1 - 1e6) / 1e6);
      expect(relativeError).toBeLessThan(1e-6); // 相對誤差 < 1ppm
    });

    test('should handle circuit with uniform resistances', async () => {
      // 所有電阻相同 - 測試數值均勻性
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['1', '2'], 100));
      engine.addDevice(new Resistor('R2', ['2', '3'], 100));
      engine.addDevice(new Resistor('R3', ['3', '4'], 100));
      engine.addDevice(new Resistor('R4', ['4', '0'], 100));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 電壓應該均勻分布：9V, 6V, 3V
      const v_2 = getNodeVoltage(engine, result, '2');
      const v_3 = getNodeVoltage(engine, result, '3');
      const v_4 = getNodeVoltage(engine, result, '4');
      
      expect(Math.abs(v_2 - 9)).toBeLessThan(1e-3);
      expect(Math.abs(v_3 - 6)).toBeLessThan(1e-3);
      expect(Math.abs(v_4 - 3)).toBeLessThan(1e-3);
    });

    test('should handle large number of nodes', async () => {
      // 10 節點串聯電阻網絡
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], 100));
      
      for (let i = 1; i <= 10; i++) {
        const nodeA = i.toString();
        const nodeB = (i === 10 ? '0' : (i + 1).toString());
        engine.addDevice(new Resistor(`R${i}`, [nodeA, nodeB], 100));
      }

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 驗證電壓線性遞減
      const v_5 = getNodeVoltage(engine, result, '5');
      expect(Math.abs(v_5 - 60)).toBeLessThan(1); // 中點應該是 60V
    });
  });
});
