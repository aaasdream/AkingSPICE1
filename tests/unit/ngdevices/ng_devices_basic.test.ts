/**
 * NGDevices Simple Test
 * 
 * Basic test to verify NGSpice-based devices can simulate and converge
 */

import { NgDeviceFactory, NgDeviceType } from '../../../src/core/ngdevices';
import { VoltageSource } from '../../../src/components/sources/voltage_source';
import { Resistor } from '../../../src/components/passive/resistor';
import { SparseMatrix } from '../../../src/math/sparse/matrix';
import { Vector } from '../../../src/math/sparse/vector';
import { GaussElimination } from '../../../src/math/sparse/gauss_elimination';
import { AssemblyContext } from '../../../src/core/interfaces/component';

describe('NGDevices Basic Tests', () => {
  
  describe('Diode Forward Bias Test', () => {
    it('should converge for simple diode circuit with DC source', () => {
      // Simple circuit: V1 (5V) - R1 (1kΩ) - D1 - GND
      const components = [
        new VoltageSource('V1', '1', '0', 5.0),
        new Resistor('R1', '1', '2', 1000),
        NgDeviceFactory.createDiode('D1', '2', '0', { IS: 1e-14, N: 1.0 })
      ];
      
      // Node mapping
      const nodeMap = new Map<string, number>([
        ['0', 0],  // Ground
        ['1', 1],  // Voltage source positive
        ['2', 2],  // Between resistor and diode
      ]);
      
      const numNodes = 3;
      const numExtraVars = 1;  // For voltage source current
      const totalSize = numNodes + numExtraVars;
      
      // Newton-Raphson iteration
      const maxIterations = 50;
      const tolerance = 1e-6;
      const gmin = 1e-12;
      
      let solution = new Vector(totalSize);
      solution.set(1, 5.0);  // Initial guess
      solution.set(2, 0.7);  // Initial diode voltage guess
      
      let converged = false;
      let iteration = 0;
      
      for (iteration = 0; iteration < maxIterations; iteration++) {
        const matrix = new SparseMatrix(totalSize);
        const rhs = new Vector(totalSize);
        
        const context: AssemblyContext = {
          matrix,
          rhs,
          nodeMap,
          currentTime: 0,
          dt: 0,
          solutionVector: solution,
          gmin
        };
        
        // Assemble all components
        for (const component of components) {
          component.assemble(context);
        }
        
        // Solve system
        const solver = new GaussElimination();
        const delta = solver.solve(matrix, rhs);
        
        // Update solution
        for (let i = 0; i < totalSize; i++) {
          solution.set(i, solution.get(i) + delta.get(i));
        }
        
        // Check convergence
        const maxDelta = Math.max(...Array.from({ length: totalSize }, (_, i) => Math.abs(delta.get(i))));
        
        if (maxDelta < tolerance) {
          converged = true;
          break;
        }
      }
      
      console.log(`\n=== Diode Circuit Test Results ===`);
      console.log(`Converged: ${converged} after ${iteration + 1} iterations`);
      console.log(`Node 1 (source): ${solution.get(1).toFixed(6)} V`);
      console.log(`Node 2 (diode anode): ${solution.get(2).toFixed(6)} V`);
      console.log(`Diode voltage: ${solution.get(2).toFixed(6)} V`);
      console.log(`Expected: ~0.6-0.7 V (forward bias)`);
      
      expect(converged).toBe(true);
      expect(solution.get(2)).toBeGreaterThan(0.5);
      expect(solution.get(2)).toBeLessThan(1.0);
    });
  });
  
  describe('NMOS Saturation Test', () => {
    it('should converge for simple NMOS circuit', () => {
      // Simple circuit: VDD (5V) - RD (1kΩ) - NMOS(drain) - GND
      //                 VGS (3V) - NMOS(gate)
      const components = [
        new VoltageSource('VDD', '1', '0', 5.0),
        new VoltageSource('VGS', '2', '0', 3.0),
        new Resistor('RD', '1', '3', 1000),
        NgDeviceFactory.createNMOS('M1', '3', '2', '0', '0', {
          VTO: 1.0,
          KP: 100e-6,  // 100 µA/V²
          W: 10e-6,
          L: 1e-6,
          LAMBDA: 0.01
        })
      ];
      
      // Node mapping
      const nodeMap = new Map<string, number>([
        ['0', 0],  // Ground
        ['1', 1],  // VDD
        ['2', 2],  // Gate
        ['3', 3],  // Drain
      ]);
      
      const numNodes = 4;
      const numExtraVars = 2;  // For two voltage sources
      const totalSize = numNodes + numExtraVars;
      
      // Newton-Raphson iteration
      const maxIterations = 50;
      const tolerance = 1e-6;
      const gmin = 1e-12;
      
      let solution = new Vector(totalSize);
      solution.set(1, 5.0);  // VDD
      solution.set(2, 3.0);  // VGS
      solution.set(3, 2.5);  // Initial drain voltage guess
      
      let converged = false;
      let iteration = 0;
      
      for (iteration = 0; iteration < maxIterations; iteration++) {
        const matrix = new SparseMatrix(totalSize);
        const rhs = new Vector(totalSize);
        
        const context: AssemblyContext = {
          matrix,
          rhs,
          nodeMap,
          currentTime: 0,
          dt: 0,
          solutionVector: solution,
          gmin
        };
        
        // Assemble all components
        for (const component of components) {
          component.assemble(context);
        }
        
        // Solve system
        const solver = new GaussElimination();
        const delta = solver.solve(matrix, rhs);
        
        // Update solution
        for (let i = 0; i < totalSize; i++) {
          solution.set(i, solution.get(i) + delta.get(i));
        }
        
        // Check convergence
        const maxDelta = Math.max(...Array.from({ length: totalSize }, (_, i) => Math.abs(delta.get(i))));
        
        if (maxDelta < tolerance) {
          converged = true;
          break;
        }
      }
      
      console.log(`\n=== NMOS Circuit Test Results ===`);
      console.log(`Converged: ${converged} after ${iteration + 1} iterations`);
      console.log(`VDD (Node 1): ${solution.get(1).toFixed(6)} V`);
      console.log(`VGS (Node 2): ${solution.get(2).toFixed(6)} V`);
      console.log(`VDS (Node 3): ${solution.get(3).toFixed(6)} V`);
      console.log(`Expected VDS: < 5V (MOSFET conducting)`);
      
      expect(converged).toBe(true);
      expect(solution.get(3)).toBeGreaterThan(0);
      expect(solution.get(3)).toBeLessThan(5.0);
    });
  });
  
  describe('Diode Rectifier Test', () => {
    it('should show correct polarity for reverse biased diode', () => {
      // Reverse biased: -5V source through resistor to diode
      const components = [
        new VoltageSource('V1', '0', '1', 5.0),  // Negative 5V
        new Resistor('R1', '1', '2', 1000),
        NgDeviceFactory.createDiode('D1', '2', '0', { IS: 1e-14, N: 1.0 })
      ];
      
      const nodeMap = new Map<string, number>([
        ['0', 0],
        ['1', 1],
        ['2', 2],
      ]);
      
      const numNodes = 3;
      const numExtraVars = 1;
      const totalSize = numNodes + numExtraVars;
      
      const maxIterations = 50;
      const tolerance = 1e-6;
      const gmin = 1e-12;
      
      let solution = new Vector(totalSize);
      solution.set(1, -5.0);
      solution.set(2, -4.9);
      
      let converged = false;
      let iteration = 0;
      
      for (iteration = 0; iteration < maxIterations; iteration++) {
        const matrix = new SparseMatrix(totalSize);
        const rhs = new Vector(totalSize);
        
        const context: AssemblyContext = {
          matrix,
          rhs,
          nodeMap,
          currentTime: 0,
          dt: 0,
          solutionVector: solution,
          gmin
        };
        
        for (const component of components) {
          component.assemble(context);
        }
        
        const solver = new GaussElimination();
        const delta = solver.solve(matrix, rhs);
        
        for (let i = 0; i < totalSize; i++) {
          solution.set(i, solution.get(i) + delta.get(i));
        }
        
        const maxDelta = Math.max(...Array.from({ length: totalSize }, (_, i) => Math.abs(delta.get(i))));
        
        if (maxDelta < tolerance) {
          converged = true;
          break;
        }
      }
      
      console.log(`\n=== Reverse Biased Diode Test ===`);
      console.log(`Converged: ${converged} after ${iteration + 1} iterations`);
      console.log(`Node 1: ${solution.get(1).toFixed(6)} V`);
      console.log(`Node 2 (diode anode): ${solution.get(2).toFixed(6)} V`);
      console.log(`Diode voltage: ${solution.get(2).toFixed(6)} V (should be negative)`);
      
      expect(converged).toBe(true);
      // In reverse bias, current is very small, so node 2 should be close to node 1
      expect(solution.get(2)).toBeLessThan(0);
    });
  });
});
