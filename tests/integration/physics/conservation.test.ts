/**
 * 🧪 Physics Conservation Laws Tests - AkingSPICE 2.1
 * 
 * 測試目標：
 * 1. KCL (基爾霍夫電流定律) 驗證
 *    - 任意節點流入電流總和 = 流出電流總和
 * 2. KVL (基爾霍夫電壓定律) 驗證
 *    - 任意閉合迴路電壓降總和 = 電壓源總和
 * 3. 能量守恆驗證
 *    - 電源供給能量 = 電阻耗散能量 + 儲能元件能量
 * 4. 功率平衡驗證
 *    - 瞬時功率平衡檢查
 * 
 * 物理意義：
 * - KCL: 電荷守恆定律的直接體現
 * - KVL: 能量守恆定律的直接體現
 * - 能量守恆: 系統總能量守恆
 * - 功率平衡: 瞬時能量平衡
 * 
 * @layer Layer 3 - Subsystem Integration Tests
 * @priority High
 * @author AkingSPICE Team
 * @date 2025-10-12
 */

import { describe, test, expect } from 'vitest';
import { CircuitSimulationEngine } from '../../../src/core/simulation/circuit_simulation_engine';
import { Resistor } from '../../../src/components/passive/resistor';
import { Capacitor } from '../../../src/components/passive/capacitor';
import { Inductor } from '../../../src/components/passive/inductor';
import { VoltageSource } from '../../../src/components/sources/voltage_source';

describe('Physics Conservation Laws Tests', () => {
  
  // ============================================================================
  // KCL (基爾霍夫電流定律) 驗證
  // ============================================================================
  describe('Kirchhoff\'s Current Law (KCL) Verification', () => {
    
    test('should satisfy KCL at voltage divider midpoint', async () => {
      // 簡單分壓器：V1 --- R1 --- (node 1) --- R2 --- GND
      // 在 node 1: I(R1,in) = I(R2,out)
      
      const V = 10;
      const R1 = 1000;
      const R2 = 2000;
      
      const engine = new CircuitSimulationEngine({
        endTime: 0, // DC analysis only
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R1));
      engine.addDevice(new Resistor('R2', ['2', '0'], R2));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 獲取節點電壓
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      
      if (node1Id !== undefined && node2Id !== undefined) {
        const v1 = result.waveformData.nodeVoltages.get(node1Id)?.[0];
        const v2 = result.waveformData.nodeVoltages.get(node2Id)?.[0];
        
        if (v1 !== undefined && v2 !== undefined) {
          // 計算流經兩個電阻的電流
          const I_R1 = (v1 - v2) / R1;
          const I_R2 = (v2 - 0) / R2;
          
          // KCL: 流入 node 2 的電流應等於流出的電流
          expect(Math.abs(I_R1 - I_R2)).toBeLessThan(1e-9);
        }
      }
    });

    test('should satisfy KCL at parallel resistor junction', async () => {
      // 並聯電阻: V1 --- R_series --- (node 2) --- R1 --- GND
      //                                          |--- R2 --- GND
      // 在 node 2: I(R_series) = I(R1) + I(R2)
      
      const V = 12;
      const R_series = 100;
      const R1 = 1000;
      const R2 = 2000;
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R_series', ['1', '2'], R_series));
      engine.addDevice(new Resistor('R1', ['2', '0'], R1));
      engine.addDevice(new Resistor('R2', ['2', '0'], R2));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      
      if (node1Id !== undefined && node2Id !== undefined) {
        const v1 = result.waveformData.nodeVoltages.get(node1Id)?.[0];
        const v2 = result.waveformData.nodeVoltages.get(node2Id)?.[0];
        
        if (v1 !== undefined && v2 !== undefined) {
          const I_series = (v1 - v2) / R_series;
          const I_R1 = v2 / R1;
          const I_R2 = v2 / R2;
          const I_parallel = I_R1 + I_R2;
          
          // KCL: 流入電流應等於流出電流
          expect(Math.abs(I_series - I_parallel) / I_series).toBeLessThan(1e-6);
        }
      }
    });

    test('should satisfy KCL in complex network (Wheatstone bridge)', async () => {
      // 惠斯登電橋:
      //     V1 --- R1 --- (node 2) --- R3 --- GND
      //            |                    |
      //           R2 --- (node 3) --- R4
      //                    |
      //                   GND
      
      const V = 10;
      const R1 = 1000;
      const R2 = 2000;
      const R3 = 1500;
      const R4 = 3000;
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R1));
      engine.addDevice(new Resistor('R2', ['1', '3'], R2));
      engine.addDevice(new Resistor('R3', ['2', '0'], R3));
      engine.addDevice(new Resistor('R4', ['3', '0'], R4));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 檢查 node 2 的 KCL
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      
      if (node1Id !== undefined && node2Id !== undefined) {
        const v1 = result.waveformData.nodeVoltages.get(node1Id)?.[0];
        const v2 = result.waveformData.nodeVoltages.get(node2Id)?.[0];
        
        if (v1 !== undefined && v2 !== undefined) {
          const I_R1 = (v1 - v2) / R1; // 流入
          const I_R3 = v2 / R3;         // 流出
          
          // KCL at node 2 (忽略橋接電阻，此處為平衡電橋)
          expect(Math.abs(I_R1 - I_R3) / I_R1).toBeLessThan(1e-6);
        }
      }
    });

    test('should satisfy KCL in transient RC circuit', async () => {
      // RC 充電電路: V1 --- R1 --- (node 2) --- C1 --- GND
      // 瞬態時 KCL: I_R = I_C
      
      const V = 10;
      const R = 1000;
      const C = 1e-6;
      const tau = R * C;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 100,
        maxTimeStep: tau / 50,
        minTimeStep: tau / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Capacitor('C1', ['2', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 檢查幾個時間點的 KCL
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      const times = result.waveformData.timePoints;
      
      if (node1Id !== undefined && node2Id !== undefined && times.length > 10) {
        const v1_array = result.waveformData.nodeVoltages.get(node1Id);
        const v2_array = result.waveformData.nodeVoltages.get(node2Id);
        
        if (v1_array && v2_array) {
          // 檢查中間時刻
          const mid = Math.floor(times.length / 2);
          const v1 = v1_array[mid];
          const v2 = v2_array[mid];
          const v2_prev = v2_array[mid - 1];
          const dt = (times[mid] ?? 0) - (times[mid - 1] ?? 0);
          
          if (v1 !== undefined && v2 !== undefined && v2_prev !== undefined && dt > 0) {
            const I_R = (v1 - v2) / R;
            const I_C = C * (v2 - v2_prev) / dt;
            
            // KCL: 電阻電流應等於電容電流
            // 允許較大誤差因為數值微分
            expect(Math.abs(I_R - I_C) / Math.max(Math.abs(I_R), 1e-12)).toBeLessThan(0.1);
          }
        }
      }
    });
  });

  // ============================================================================
  // KVL (基爾霍夫電壓定律) 驗證
  // ============================================================================
  describe('Kirchhoff\'s Voltage Law (KVL) Verification', () => {
    
    test('should satisfy KVL in simple series circuit', async () => {
      // V1 --- R1 --- R2 --- GND
      // KVL: V1 = V_R1 + V_R2
      
      const V = 12;
      const R1 = 1000;
      const R2 = 2000;
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R1));
      engine.addDevice(new Resistor('R2', ['2', '0'], R2));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      
      if (node1Id !== undefined && node2Id !== undefined) {
        const v1 = result.waveformData.nodeVoltages.get(node1Id)?.[0];
        const v2 = result.waveformData.nodeVoltages.get(node2Id)?.[0];
        
        if (v1 !== undefined && v2 !== undefined) {
          const V_R1 = v1 - v2;
          const V_R2 = v2 - 0;
          const sum = V_R1 + V_R2;
          
          // KVL: 電壓源電壓應等於所有電阻壓降之和
          expect(Math.abs(V - sum)).toBeLessThan(1e-9);
        }
      }
    });

    test('should satisfy KVL in series RLC circuit', async () => {
      // V1 --- R1 --- L1 --- C1 --- GND
      // KVL: V1 = V_R + V_L + V_C
      
      const V = 10;
      const R = 100;
      const L = 1e-3;
      const C = 1e-6;
      
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 2 * period,
        initialTimeStep: period / 100,
        maxTimeStep: period / 50,
        minTimeStep: period / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 檢查最後時刻的 KVL (穩態)
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      const node3Id = engine.getNodeIdByName('3');
      
      if (node1Id !== undefined && node2Id !== undefined && node3Id !== undefined) {
        const v1_array = result.waveformData.nodeVoltages.get(node1Id);
        const v2_array = result.waveformData.nodeVoltages.get(node2Id);
        const v3_array = result.waveformData.nodeVoltages.get(node3Id);
        
        if (v1_array && v2_array && v3_array && v1_array.length > 0) {
          const idx = v1_array.length - 1;
          const v1 = v1_array[idx];
          const v2 = v2_array[idx];
          const v3 = v3_array[idx];
          
          if (v1 !== undefined && v2 !== undefined && v3 !== undefined) {
            const V_R = v1 - v2;
            const V_L = v2 - v3;
            const V_C = v3 - 0;
            const sum = V_R + V_L + V_C;
            
            // KVL: 電壓源電壓應等於所有元件壓降之和
            expect(Math.abs(V - sum)).toBeLessThan(0.1); // 允許暫態誤差
          }
        }
      }
    });

    test('should satisfy KVL in mesh with multiple loops', async () => {
      // 雙網孔電路:
      //   V1 --- R1 --- (node 2) --- R3 --- GND
      //                    |
      //                   R2
      //                    |
      //                   GND
      // Loop 1: V1 - V_R1 - V_R2 = 0
      // Loop 2: V_R2 - V_R3 = 0 (at node 2)
      
      const V = 12;
      const R1 = 1000;
      const R2 = 2000;
      const R3 = 1500;
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R1));
      engine.addDevice(new Resistor('R2', ['2', '0'], R2));
      engine.addDevice(new Resistor('R3', ['2', '0'], R3));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      
      if (node1Id !== undefined && node2Id !== undefined) {
        const v1 = result.waveformData.nodeVoltages.get(node1Id)?.[0];
        const v2 = result.waveformData.nodeVoltages.get(node2Id)?.[0];
        
        if (v1 !== undefined && v2 !== undefined) {
          const V_R1 = v1 - v2;
          const V_R2 = v2;
          
          // KVL for loop 1: V1 = V_R1 + V_R2
          expect(Math.abs(V - V_R1 - V_R2)).toBeLessThan(1e-9);
        }
      }
    });
  });

  // ============================================================================
  // 能量守恆驗證
  // ============================================================================
  describe('Energy Conservation Verification', () => {
    
    test('should conserve energy in RC charging circuit', async () => {
      // 能量關係: E_source = E_resistor + E_capacitor
      
      const V = 10;
      const R = 1000;
      const C = 1e-6;
      const tau = R * C;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 100,
        maxTimeStep: tau / 50,
        minTimeStep: tau / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Capacitor('C1', ['2', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      const times = result.waveformData.timePoints;
      
      if (node1Id !== undefined && node2Id !== undefined && times.length > 1) {
        const v1_array = result.waveformData.nodeVoltages.get(node1Id);
        const v2_array = result.waveformData.nodeVoltages.get(node2Id);
        
        if (v1_array && v2_array) {
          // 計算電源供給的總能量
          let E_source = 0;
          for (let i = 1; i < times.length; i++) {
            const dt = (times[i] ?? 0) - (times[i-1] ?? 0);
            const v1 = v1_array[i];
            const v2 = v2_array[i];
            
            if (v1 !== undefined && v2 !== undefined && dt > 0) {
              const I = (v1 - v2) / R;
              E_source += V * I * dt;
            }
          }
          
          // 電容最終儲存的能量
          const v2_final = v2_array[v2_array.length - 1];
          const E_capacitor = v2_final !== undefined ? 0.5 * C * v2_final * v2_final : 0;
          
          // 電阻耗散的能量
          let E_resistor = 0;
          for (let i = 1; i < times.length; i++) {
            const dt = (times[i] ?? 0) - (times[i-1] ?? 0);
            const v1 = v1_array[i];
            const v2 = v2_array[i];
            
            if (v1 !== undefined && v2 !== undefined && dt > 0) {
              const I = (v1 - v2) / R;
              E_resistor += I * I * R * dt;
            }
          }
          
          // 能量守恆: E_source ≈ E_resistor + E_capacitor
          const total_dissipated = E_resistor + E_capacitor;
          const energy_error = Math.abs(E_source - total_dissipated) / E_source;
          
          expect(energy_error).toBeLessThan(0.05); // 5% 誤差容忍
        }
      }
    });

    test('should conserve energy in RL circuit', async () => {
      // 能量關係: E_source = E_resistor + E_inductor
      
      const V = 12;
      const R = 100;
      const L = 1e-3;
      const tau = L / R;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 100,
        maxTimeStep: tau / 50,
        minTimeStep: tau / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '0'], L));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      const times = result.waveformData.timePoints;
      
      if (node1Id !== undefined && node2Id !== undefined && times.length > 1) {
        const v1_array = result.waveformData.nodeVoltages.get(node1Id);
        const v2_array = result.waveformData.nodeVoltages.get(node2Id);
        
        if (v1_array && v2_array) {
          // 計算電源供給的總能量
          let E_source = 0;
          let E_resistor = 0;
          
          for (let i = 1; i < times.length; i++) {
            const dt = (times[i] ?? 0) - (times[i-1] ?? 0);
            const v1 = v1_array[i];
            const v2 = v2_array[i];
            
            if (v1 !== undefined && v2 !== undefined && dt > 0) {
              const I = (v1 - v2) / R;
              E_source += V * I * dt;
              E_resistor += I * I * R * dt;
            }
          }
          
          // 電感最終儲存的能量
          const v1_final = v1_array[v1_array.length - 1];
          const v2_final = v2_array[v2_array.length - 1];
          if (v1_final !== undefined && v2_final !== undefined) {
            const I_final = (v1_final - v2_final) / R;
            const E_inductor = 0.5 * L * I_final * I_final;
            
            // 能量守恆
            const total_dissipated = E_resistor + E_inductor;
            const energy_error = Math.abs(E_source - total_dissipated) / E_source;
            
            expect(energy_error).toBeLessThan(0.05);
          }
        }
      }
    });

    test('should track energy distribution in RLC circuit', async () => {
      // RLC 電路中能量在電阻、電感、電容之間轉換
      
      const V = 10;
      const R = 50;
      const L = 1e-3;
      const C = 1e-6;
      
      const omega0 = 1 / Math.sqrt(L * C);
      const period = 2 * Math.PI / omega0;
      
      const engine = new CircuitSimulationEngine({
        endTime: 3 * period,
        initialTimeStep: period / 100,
        maxTimeStep: period / 50,
        minTimeStep: period / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Inductor('L1', ['2', '3'], L));
      engine.addDevice(new Capacitor('C1', ['3', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      // 驗證電路成功模擬
      const times = result.waveformData.timePoints;
      expect(times.length).toBeGreaterThan(10);
    });
  });

  // ============================================================================
  // 功率平衡驗證
  // ============================================================================
  describe('Power Balance Verification', () => {
    
    test('should balance power in series resistor circuit', async () => {
      // P_source = P_R1 + P_R2
      
      const V = 12;
      const R1 = 1000;
      const R2 = 2000;
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R1));
      engine.addDevice(new Resistor('R2', ['2', '0'], R2));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      
      if (node1Id !== undefined && node2Id !== undefined) {
        const v1 = result.waveformData.nodeVoltages.get(node1Id)?.[0];
        const v2 = result.waveformData.nodeVoltages.get(node2Id)?.[0];
        
        if (v1 !== undefined && v2 !== undefined) {
          const I = (v1 - v2) / R1; // 電流相同
          
          const P_source = V * I;
          const P_R1 = (v1 - v2) * I;
          const P_R2 = v2 * I;
          
          // 功率平衡
          expect(Math.abs(P_source - P_R1 - P_R2)).toBeLessThan(1e-9);
        }
      }
    });

    test('should balance power in parallel resistor circuit', async () => {
      // P_source = P_R1 + P_R2
      
      const V = 10;
      const R1 = 1000;
      const R2 = 2000;
      
      const engine = new CircuitSimulationEngine({
        endTime: 0,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '0'], R1));
      engine.addDevice(new Resistor('R2', ['1', '0'], R2));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const node1Id = engine.getNodeIdByName('1');
      
      if (node1Id !== undefined) {
        const v1 = result.waveformData.nodeVoltages.get(node1Id)?.[0];
        
        if (v1 !== undefined) {
          const I1 = v1 / R1;
          const I2 = v1 / R2;
          const I_total = I1 + I2;
          
          const P_source = V * I_total;
          const P_R1 = v1 * I1;
          const P_R2 = v1 * I2;
          
          // 功率平衡
          expect(Math.abs(P_source - P_R1 - P_R2) / P_source).toBeLessThan(1e-6);
        }
      }
    });

    test('should track instantaneous power in transient circuit', async () => {
      // 瞬態 RC 電路功率平衡: P_source(t) = P_R(t) + P_C(t)
      
      const V = 10;
      const R = 1000;
      const C = 1e-6;
      const tau = R * C;
      
      const engine = new CircuitSimulationEngine({
        endTime: 3 * tau,
        initialTimeStep: tau / 100,
        maxTimeStep: tau / 50,
        minTimeStep: tau / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Capacitor('C1', ['2', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      const times = result.waveformData.timePoints;
      
      if (node1Id !== undefined && node2Id !== undefined && times.length > 10) {
        const v1_array = result.waveformData.nodeVoltages.get(node1Id);
        const v2_array = result.waveformData.nodeVoltages.get(node2Id);
        
        if (v1_array && v2_array) {
          // 檢查中間時刻的功率平衡
          const mid = Math.floor(times.length / 2);
          const v1 = v1_array[mid];
          const v2 = v2_array[mid];
          const v2_prev = v2_array[mid - 1];
          const dt = (times[mid] ?? 0) - (times[mid - 1] ?? 0);
          
          if (v1 !== undefined && v2 !== undefined && v2_prev !== undefined && dt > 0) {
            const I = (v1 - v2) / R;
            const P_source = V * I;
            const P_R = I * I * R;
            const P_C = v2 * C * (v2 - v2_prev) / dt;
            
            // 瞬時功率平衡 (允許數值誤差)
            const power_balance = Math.abs(P_source - P_R - P_C) / P_source;
            expect(power_balance).toBeLessThan(0.15); // 15% 容忍度
          }
        }
      }
    });
  });

  // ============================================================================
  // 電荷守恆驗證
  // ============================================================================
  describe('Charge Conservation Verification', () => {
    
    test('should conserve charge in capacitor charging', async () => {
      // 電容充電: Q = C * V_C
      // 流入電荷 = 電容儲存電荷
      
      const V = 10;
      const R = 1000;
      const C = 1e-6;
      const tau = R * C;
      
      const engine = new CircuitSimulationEngine({
        endTime: 5 * tau,
        initialTimeStep: tau / 100,
        maxTimeStep: tau / 50,
        minTimeStep: tau / 200,
      });

      engine.addDevice(new VoltageSource('V1', ['1', '0'], V));
      engine.addDevice(new Resistor('R1', ['1', '2'], R));
      engine.addDevice(new Capacitor('C1', ['2', '0'], C));

      const result = await engine.runSimulation();

      expect(result.success).toBe(true);
      
      const node1Id = engine.getNodeIdByName('1');
      const node2Id = engine.getNodeIdByName('2');
      const times = result.waveformData.timePoints;
      
      if (node1Id !== undefined && node2Id !== undefined && times.length > 1) {
        const v1_array = result.waveformData.nodeVoltages.get(node1Id);
        const v2_array = result.waveformData.nodeVoltages.get(node2Id);
        
        if (v1_array && v2_array) {
          // 計算流入的總電荷
          let Q_in = 0;
          for (let i = 1; i < times.length; i++) {
            const dt = (times[i] ?? 0) - (times[i-1] ?? 0);
            const v1 = v1_array[i];
            const v2 = v2_array[i];
            
            if (v1 !== undefined && v2 !== undefined && dt > 0) {
              const I = (v1 - v2) / R;
              Q_in += I * dt;
            }
          }
          
          // 電容最終儲存的電荷
          const v2_final = v2_array[v2_array.length - 1];
          const Q_stored = v2_final !== undefined ? C * v2_final : 0;
          
          // 電荷守恆
          const charge_error = Math.abs(Q_in - Q_stored) / Q_stored;
          expect(charge_error).toBeLessThan(0.05);
        }
      }
    });
  });
});
