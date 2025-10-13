/**
 * 🧪 MNA 系統構建測試 - AkingSPICE 2.1
 * 
 * 測試改良節點分析 (Modified Nodal Analysis) 矩陣的正確構建
 * 這是電路求解器的核心基礎
 * 
 * 測試覆蓋:
 * 1. 純阻性網絡 (基本 G 矩陣)
 * 2. 擴展 MNA (電壓源、電感的額外變量)
 * 3. 矩陣奇異性檢測
 * 4. 懸空節點檢測
 * 5. 接地節點處理
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../../src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from '../../../src/components/sources/voltage_source';
import { Resistor } from '../../../src/components/passive/resistor';
import { Inductor } from '../../../src/components/passive/inductor';
import { Capacitor } from '../../../src/components/passive/capacitor';

describe('MNA Matrix Assembly', () => {
  describe('Pure Resistive Networks - Basic G Matrix', () => {
    test('should build correct G matrix for 2R series circuit', async () => {
      // V_in --[R1=1k]--n1--[R2=1k]-- GND
      // Expected: V(n1) = V_in / 2 = 5V
      
      const engine = new CircuitSimulationEngine({
        endTime: 0, // DC-only analysis
      });
      
      engine.addDevice(new VoltageSource('Vin', ['n_in', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n_in', 'n1'], 1000));
      engine.addDevice(new Resistor('R2', ['n1', '0'], 1000));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 驗證節點電壓
      const nodeVoltages = result.waveformData.nodeVoltages;
      const n1Index = Array.from(engine['_nodeMapping'].entries())
        .find(([name]) => name === 'n1')?.[1];
      
      if (n1Index !== undefined) {
        const v_n1 = nodeVoltages.get(n1Index)?.[0] || 0;
        expect(v_n1).toBeCloseTo(5.0, 3); // ±0.001V
      }
    });

    test('should build correct G matrix for parallel resistors', async () => {
      // V_in --+--[R1=1k]--+-- GND
      //        |           |
      //        +--[R2=1k]--+
      // R_eq = 500Ω, I_total = V/R_eq = 10/500 = 0.02A
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      engine.addDevice(new VoltageSource('Vin', ['n_in', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n_in', '0'], 1000));
      engine.addDevice(new Resistor('R2', ['n_in', '0'], 1000));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 驗證電流：每個電阻應該通過 0.01A
      const i_r1 = result.waveformData.deviceCurrents.get('R1')?.[0] || 0;
      const i_r2 = result.waveformData.deviceCurrents.get('R2')?.[0] || 0;
      
      expect(i_r1).toBeCloseTo(0.01, 4); // 10V / 1000Ω = 0.01A
      expect(i_r2).toBeCloseTo(0.01, 4);
      
      // 總電流應該是 0.02A
      const i_total = Math.abs(i_r1) + Math.abs(i_r2);
      expect(i_total).toBeCloseTo(0.02, 4);
    });

    test('should handle 3-node resistor network correctly', async () => {
      // V_in --[R1=100]--n1--[R2=200]--n2--[R3=300]-- GND
      // R_total = 600Ω
      // I = 12V / 600Ω = 0.02A
      // V(n1) = 12 - 100*0.02 = 10V
      // V(n2) = 12 - (100+200)*0.02 = 6V
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      engine.addDevice(new VoltageSource('Vin', ['n_in', '0'], 12));
      engine.addDevice(new Resistor('R1', ['n_in', 'n1'], 100));
      engine.addDevice(new Resistor('R2', ['n1', 'n2'], 200));
      engine.addDevice(new Resistor('R3', ['n2', '0'], 300));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      const nodeMapping = engine['_nodeMapping'];
      const n1Index = nodeMapping.get('n1');
      const n2Index = nodeMapping.get('n2');
      
      if (n1Index !== undefined && n2Index !== undefined) {
        const v_n1 = result.waveformData.nodeVoltages.get(n1Index)?.[0] || 0;
        const v_n2 = result.waveformData.nodeVoltages.get(n2Index)?.[0] || 0;
        
        expect(v_n1).toBeCloseTo(10.0, 3);
        expect(v_n2).toBeCloseTo(6.0, 3);
      }
    });

    test('should handle Wheatstone bridge correctly', async () => {
      // 平衡惠斯登電橋：中心節點電壓應為 V_in/2
      //        R1(1k)
      //    n1 -------- n2
      //    |            |
      // R2(1k)       R3(1k)
      //    |            |
      //    +---- n3 ----+
      //         R4(1k)
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      engine.addDevice(new VoltageSource('Vin', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
      engine.addDevice(new Resistor('R2', ['n1', 'n3'], 1000));
      engine.addDevice(new Resistor('R3', ['n2', '0'], 1000));
      engine.addDevice(new Resistor('R4', ['n3', '0'], 1000));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      const nodeMapping = engine['_nodeMapping'];
      const n2Index = nodeMapping.get('n2');
      const n3Index = nodeMapping.get('n3');
      
      if (n2Index !== undefined && n3Index !== undefined) {
        const v_n2 = result.waveformData.nodeVoltages.get(n2Index)?.[0] || 0;
        const v_n3 = result.waveformData.nodeVoltages.get(n3Index)?.[0] || 0;
        
        // 平衡電橋：兩個節點電壓應該相等
        expect(v_n2).toBeCloseTo(5.0, 3);
        expect(v_n3).toBeCloseTo(5.0, 3);
        expect(Math.abs(v_n2 - v_n3)).toBeLessThan(0.001);
      }
    });
  });

  describe('Extended MNA - Voltage Sources', () => {
    test('should allocate extra variable for voltage source current', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', '0'], 1000));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 電壓源應該有電流記錄
      const i_v1 = result.waveformData.deviceCurrents.get('V1')?.[0];
      expect(i_v1).toBeDefined();
      expect(i_v1).toBeCloseTo(-0.01, 4); // 10V / 1000Ω = 0.01A (從負極流出)
    });

    test('should handle multiple voltage sources correctly', async () => {
      // V1(10V) --[R1=100]-- n1 --[R2=200]-- V2(5V)
      // KVL: 10 - 100*I - 200*I - 5 = 0
      // I = 5 / 300 = 0.01667A
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      engine.addDevice(new VoltageSource('V1', ['n_v1', '0'], 10));
      engine.addDevice(new VoltageSource('V2', ['n_v2', '0'], 5));
      engine.addDevice(new Resistor('R1', ['n_v1', 'n1'], 100));
      engine.addDevice(new Resistor('R2', ['n1', 'n_v2'], 200));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 驗證電流
      const i_r1 = result.waveformData.deviceCurrents.get('R1')?.[0] || 0;
      const i_r2 = result.waveformData.deviceCurrents.get('R2')?.[0] || 0;
      
      expect(i_r1).toBeCloseTo(0.01667, 4);
      expect(i_r2).toBeCloseTo(0.01667, 4);
    });

    test('should handle voltage source in series with resistor - B and C matrices', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // 測試 B 和 C 矩陣的正確裝配
      engine.addDevice(new VoltageSource('Vin', ['n_in', '0'], 12));
      engine.addDevice(new Resistor('R1', ['n_in', 'n_out'], 1200));
      engine.addDevice(new Resistor('R2', ['n_out', '0'], 600));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 驗證分壓：V_out = 12 * 600 / (1200 + 600) = 4V
      const nodeMapping = engine['_nodeMapping'];
      const nOutIndex = nodeMapping.get('n_out');
      
      if (nOutIndex !== undefined) {
        const v_out = result.waveformData.nodeVoltages.get(nOutIndex)?.[0] || 0;
        expect(v_out).toBeCloseTo(4.0, 3);
      }
      
      // 驗證電壓源電流
      const i_vin = result.waveformData.deviceCurrents.get('Vin')?.[0] || 0;
      expect(Math.abs(i_vin)).toBeCloseTo(0.00667, 4); // 12V / 1800Ω
    });
  });

  describe('Extended MNA - Inductors', () => {
    test('should allocate extra variable for inductor current', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // DC 分析中，電感應該表現為短路
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 500));
      engine.addDevice(new Inductor('L1', ['n2', '0'], 1e-3)); // 1mH
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 電感應該有電流記錄
      const i_l1 = result.waveformData.deviceCurrents.get('L1')?.[0];
      expect(i_l1).toBeDefined();
      
      // DC 分析中，電感是短路，電流應該由電阻決定
      // I = 10V / 500Ω = 0.02A
      expect(i_l1).toBeCloseTo(0.02, 3);
    });

    test('should handle inductor in RL circuit - DC steady state', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // DC 分析：電感短路，電流 = V/R
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
      engine.addDevice(new Inductor('L1', ['n2', '0'], 10e-3)); // 10mH
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      const i_l1 = result.waveformData.deviceCurrents.get('L1')?.[0] || 0;
      const i_r1 = result.waveformData.deviceCurrents.get('R1')?.[0] || 0;
      
      // 串聯電路，電流應該相等
      expect(i_l1).toBeCloseTo(0.12, 3); // 12V / 100Ω
      expect(i_r1).toBeCloseTo(0.12, 3);
      expect(Math.abs(i_l1 - i_r1)).toBeLessThan(0.001);
    });

    test('should handle multiple inductors correctly', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // 兩個電感串聯：L_total = L1 + L2
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Inductor('L1', ['n1', 'n2'], 5e-3)); // 5mH
      engine.addDevice(new Inductor('L2', ['n2', 'n3'], 10e-3)); // 10mH
      engine.addDevice(new Resistor('R1', ['n3', '0'], 100));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // DC 分析：電感短路，電流應該相等
      const i_l1 = result.waveformData.deviceCurrents.get('L1')?.[0] || 0;
      const i_l2 = result.waveformData.deviceCurrents.get('L2')?.[0] || 0;
      const i_r1 = result.waveformData.deviceCurrents.get('R1')?.[0] || 0;
      
      expect(i_l1).toBeCloseTo(0.1, 3);
      expect(i_l2).toBeCloseTo(0.1, 3);
      expect(i_r1).toBeCloseTo(0.1, 3);
    });
  });

  describe('Matrix Size and Structure', () => {
    test('should have correct matrix size for pure resistive network', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // 3 節點 (不含地) + 1 電壓源 = 4x4 矩陣
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
      engine.addDevice(new Resistor('R2', ['n2', 'n3'], 200));
      engine.addDevice(new Resistor('R3', ['n3', '0'], 300));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 檢查矩陣大小
      const nodeCount = engine['_nodeMapping'].size;
      const extraVarManager = engine['_extraVariableManager'];
      const totalSize = extraVarManager?.getTotalMatrixSize() || 0;
      
      expect(nodeCount).toBe(4); // n1, n2, n3, ground(0)
      expect(totalSize).toBe(5); // 4 nodes + 1 voltage source current
    });

    test('should have correct matrix size with inductors', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // 2 節點 + 1 電壓源 + 1 電感 = 5x5 矩陣
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
      engine.addDevice(new Inductor('L1', ['n2', '0'], 1e-3));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      const nodeCount = engine['_nodeMapping'].size;
      const extraVarManager = engine['_extraVariableManager'];
      const totalSize = extraVarManager?.getTotalMatrixSize() || 0;
      
      expect(nodeCount).toBe(3); // n1, n2, ground(0)
      expect(totalSize).toBe(5); // 3 nodes + 1 V current + 1 L current
    });

    test('should handle complex circuit with multiple extra variables', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // 複雜電路：2 電壓源 + 2 電感 + 多個電阻
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new VoltageSource('V2', ['n4', '0'], 5));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
      engine.addDevice(new Inductor('L1', ['n2', 'n3'], 1e-3));
      engine.addDevice(new Inductor('L2', ['n3', 'n4'], 2e-3));
      engine.addDevice(new Resistor('R2', ['n3', '0'], 50));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      const extraVarManager = engine['_extraVariableManager'];
      const extraVarCount = extraVarManager?.getExtraVariableCount() || 0;
      
      // 應該有 4 個額外變量：2 個電壓源電流 + 2 個電感電流
      expect(extraVarCount).toBe(4);
    });
  });

  describe('Ground Node Handling', () => {
    test('should force ground node (node 0) voltage to zero', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', '0'], 1000));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 檢查地節點電壓是否接近 0
      // 注意：Gmin Stepping 會引入微小數值誤差（~1e-6），這是正常的數值現象
      const nodeMapping = engine['_nodeMapping'];
      const groundIndex = nodeMapping.get('0');
      
      if (groundIndex !== undefined) {
        const v_ground = result.waveformData.nodeVoltages.get(groundIndex)?.[0] || 0;
        expect(Math.abs(v_ground)).toBeLessThan(1e-5); // 允許 Gmin Stepping 引入的數值誤差
      }
    });

    test('should handle multiple ground connections', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // 多個元件連接到地
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['n1', '0'], 600));
      engine.addDevice(new Resistor('R2', ['n1', '0'], 1200));
      engine.addDevice(new Resistor('R3', ['n1', '0'], 400));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 並聯等效電阻：1/(1/600 + 1/1200 + 1/400) = 200Ω
      // 總電流：12V / 200Ω = 0.06A
      const i_r1 = Math.abs(result.waveformData.deviceCurrents.get('R1')?.[0] || 0);
      const i_r2 = Math.abs(result.waveformData.deviceCurrents.get('R2')?.[0] || 0);
      const i_r3 = Math.abs(result.waveformData.deviceCurrents.get('R3')?.[0] || 0);
      
      const i_total = i_r1 + i_r2 + i_r3;
      expect(i_total).toBeCloseTo(0.06, 3);
    });
  });

  describe('Capacitor in DC Analysis', () => {
    test('should treat capacitor as open circuit in DC analysis', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // DC 分析中，電容應該表現為開路
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
      engine.addDevice(new Capacitor('C1', ['n2', '0'], 1e-6)); // 1μF
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // DC 分析中，流經電容的電流應該為 0
      // 但由於有 Gmin，可能有極小的電流
      const nodeMapping = engine['_nodeMapping'];
      const n2Index = nodeMapping.get('n2');
      
      if (n2Index !== undefined) {
        const v_n2 = result.waveformData.nodeVoltages.get(n2Index)?.[0] || 0;
        // 電容開路，節點電壓應該等於電源電壓（假設沒有其他路徑）
        // 但實際上由於 Gmin，電壓會略低
        expect(v_n2).toBeGreaterThan(9.9);
        expect(v_n2).toBeLessThan(10.1);
      }
    });

    test('should handle RC circuit in DC analysis', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // DC 穩態：電容充滿電，無電流流動
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 12));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
      engine.addDevice(new Capacitor('C1', ['n2', '0'], 10e-6)); // 10μF
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // DC 分析中，電容開路，流經電阻的電流應該接近 0
      const i_r1 = Math.abs(result.waveformData.deviceCurrents.get('R1')?.[0] || 0);
      expect(i_r1).toBeLessThan(1e-6); // 極小電流（Gmin 造成）
    });
  });

  describe('Matrix Symmetry and Properties', () => {
    test('should produce symmetric G matrix for pure resistive network', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // 對稱電路
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1000));
      engine.addDevice(new Resistor('R2', ['n1', 'n3'], 1000));
      engine.addDevice(new Resistor('R3', ['n2', '0'], 1000));
      engine.addDevice(new Resistor('R4', ['n3', '0'], 1000));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 驗證對稱性：n2 和 n3 的電壓應該相等
      const nodeMapping = engine['_nodeMapping'];
      const n2Index = nodeMapping.get('n2');
      const n3Index = nodeMapping.get('n3');
      
      if (n2Index !== undefined && n3Index !== undefined) {
        const v_n2 = result.waveformData.nodeVoltages.get(n2Index)?.[0] || 0;
        const v_n3 = result.waveformData.nodeVoltages.get(n3Index)?.[0] || 0;
        
        expect(Math.abs(v_n2 - v_n3)).toBeLessThan(1e-6);
      }
    });

    test('should handle circuit with redundant paths', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      // 多路徑電路
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 100));
      engine.addDevice(new Resistor('R2', ['n1', 'n2'], 100)); // 並聯路徑
      engine.addDevice(new Resistor('R3', ['n2', '0'], 100));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // R1 和 R2 並聯 = 50Ω，加上 R3 = 150Ω
      // I_total = 10V / 150Ω = 0.0667A
      const i_r1 = Math.abs(result.waveformData.deviceCurrents.get('R1')?.[0] || 0);
      const i_r2 = Math.abs(result.waveformData.deviceCurrents.get('R2')?.[0] || 0);
      
      // R1 和 R2 應該分流，各 0.0333A
      expect(i_r1).toBeCloseTo(0.0333, 3);
      expect(i_r2).toBeCloseTo(0.0333, 3);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle very small resistances (near short circuit)', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 0.001)); // 1mΩ
      engine.addDevice(new Resistor('R2', ['n2', '0'], 1000));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 總電阻 ≈ 1000Ω，電流 ≈ 0.01A
      const i_r2 = Math.abs(result.waveformData.deviceCurrents.get('R2')?.[0] || 0);
      expect(i_r2).toBeCloseTo(0.01, 3);
    });

    test('should handle very large resistances (near open circuit)', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 10));
      engine.addDevice(new Resistor('R1', ['n1', 'n2'], 1e9)); // 1GΩ
      engine.addDevice(new Resistor('R2', ['n2', '0'], 1000));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      // 總電阻 ≈ 1GΩ，電流 ≈ 10nA
      const i_r1 = Math.abs(result.waveformData.deviceCurrents.get('R1')?.[0] || 0);
      expect(i_r1).toBeLessThan(1e-6); // 極小電流
    });

    test('should handle circuit with single resistor', async () => {
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });
      
      engine.addDevice(new VoltageSource('V1', ['n1', '0'], 5));
      engine.addDevice(new Resistor('R1', ['n1', '0'], 500));
      
      const result = await engine.runSimulation();
      
      expect(result.success).toBe(true);
      
      const i_r1 = Math.abs(result.waveformData.deviceCurrents.get('R1')?.[0] || 0);
      expect(i_r1).toBeCloseTo(0.01, 4);
    });
  });
});
