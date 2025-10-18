/**
 * 超簡單的二極體瞬態測試
 * 電路：DC 電壓源 -> R -> D -> GND
 * 測試二極體在固定正向電壓下的行為
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgDiode } from './src/core/ngdevices/ng_diode';
import * as fs from 'fs';

async function testDiodeSimpleTransient() {
  console.log('='.repeat(80));
  console.log('Test: Simple Diode Transient - Forward Bias');
  console.log('='.repeat(80));

  console.log('\nCircuit: Vdd(5V) -> R(1kΩ) -> D -> GND');
  console.log('Expected: V_diode ≈ 0.7V (forward voltage drop)');

  // Create components
  const vdd = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], 5.0);
  const r = ResistorFactory.create('R1', ['vdd', 'n1'], 1000);  // 1kΩ
  const diode = new NgDiode('D1', 'n1', '0', {
    IS: 1e-14,
    N: 1.0,
    CJO: 10e-12,  // 10pF junction capacitance
    VJ: 0.7,      // Junction potential
    M: 0.5        // Grading coefficient
  });

  // Simulation time: 100 μs
  const endTime = 100e-6;
  const timeStep = 1e-6;

  console.log(`\nSimulation time: ${endTime * 1e6} μs`);
  console.log(`Time step: ${timeStep * 1e6} μs`);

  const engine = new CircuitSimulationEngine({
    endTime: endTime,
    initialTimeStep: timeStep,
    maxTimeStep: timeStep,
    minTimeStep: timeStep / 10
  });

  engine.addDevices([vdd, r, diode]);

  console.log('\nStarting transient analysis...');
  const startTime = Date.now();

  try {
    const result = await engine.runSimulation();
    const simTime = Date.now() - startTime;

    console.log('\nSimulation Result:');
    console.log(`  Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`  Time: ${(simTime / 1000).toFixed(2)} s`);

    if (result.success && result.waveformData) {
      const { timePoints, nodeVoltages } = result.waveformData;
      const nodeMap = engine['_nodeMapping'] as Map<string, number>;

      console.log(`  Data points: ${timePoints.length}`);

      const vddIdx = nodeMap.get('vdd');
      const n1Idx = nodeMap.get('n1');

      if (vddIdx !== undefined && n1Idx !== undefined) {
        const V_vdd = nodeVoltages.get(vddIdx) || [];
        const V_n1 = nodeVoltages.get(n1Idx) || [];

        // Statistics
        let maxV = -Infinity;
        let minV = Infinity;
        let avgV = 0;
        let finalV = 0;

        for (let i = 0; i < V_n1.length; i++) {
          const v = V_n1[i];
          if (!isNaN(v) && isFinite(v)) {
            maxV = Math.max(maxV, v);
            minV = Math.min(minV, v);
            avgV += v;
            if (i === V_n1.length - 1) finalV = v;
          }
        }
        avgV /= V_n1.length;

        console.log('\nVoltage Analysis:');
        console.log(`  V_vdd: ${V_vdd[V_vdd.length - 1].toFixed(3)}V`);
        console.log(`  V_diode (final): ${finalV.toFixed(3)}V`);
        console.log(`  V_diode (avg): ${avgV.toFixed(3)}V`);
        console.log(`  V_diode (max): ${maxV.toFixed(3)}V`);
        console.log(`  V_diode (min): ${minV.toFixed(3)}V`);

        // Calculate current
        const I_final = (V_vdd[V_vdd.length - 1] - finalV) / 1000;
        console.log(`  I_diode (final): ${(I_final * 1000).toFixed(3)}mA`);

        // Expected check
        if (finalV > 0.5 && finalV < 0.8) {
          console.log('  ✅ Diode voltage in expected range (0.5-0.8V)');
        } else if (Math.abs(finalV) < 0.01) {
          console.log('  ❌ ERROR: Diode voltage is near zero! Diode not conducting!');
        } else {
          console.log(`  ⚠️  WARNING: Diode voltage outside expected range: ${finalV.toFixed(3)}V`);
        }

        // Save CSV
        const csvLines = ['time(s),V_vdd(V),V_diode(V),I_diode(mA)'];
        for (let i = 0; i < timePoints.length; i++) {
          const t = timePoints[i];
          const vVdd = V_vdd[i] || 0;
          const vDiode = V_n1[i] || 0;
          const iDiode = (vVdd - vDiode) / 1.0;  // mA
          csvLines.push(`${t.toExponential(6)},${vVdd.toFixed(6)},${vDiode.toFixed(6)},${iDiode.toFixed(6)}`);
        }
        fs.writeFileSync('test_diode_simple_transient.csv', csvLines.join('\n'));
        console.log('\n📁 CSV saved: test_diode_simple_transient.csv');

        // Show first and last few points
        console.log('\nFirst 5 time points:');
        console.log('  time(μs)   V_vdd(V)   V_diode(V)  I_diode(mA)');
        console.log('  ' + '-'.repeat(50));
        for (let i = 0; i < Math.min(5, timePoints.length); i++) {
          const t = timePoints[i] * 1e6;
          const vVdd = V_vdd[i] || 0;
          const vDiode = V_n1[i] || 0;
          const iDiode = (vVdd - vDiode) / 1.0;
          console.log(`  ${t.toFixed(2).padStart(8)}   ${vVdd.toFixed(3).padStart(8)}   ${vDiode.toFixed(3).padStart(10)}  ${iDiode.toFixed(3).padStart(10)}`);
        }

        console.log('\nLast 5 time points:');
        console.log('  time(μs)   V_vdd(V)   V_diode(V)  I_diode(mA)');
        console.log('  ' + '-'.repeat(50));
        for (let i = Math.max(0, timePoints.length - 5); i < timePoints.length; i++) {
          const t = timePoints[i] * 1e6;
          const vVdd = V_vdd[i] || 0;
          const vDiode = V_n1[i] || 0;
          const iDiode = (vVdd - vDiode) / 1.0;
          console.log(`  ${t.toFixed(2).padStart(8)}   ${vVdd.toFixed(3).padStart(8)}   ${vDiode.toFixed(3).padStart(10)}  ${iDiode.toFixed(3).padStart(10)}`);
        }

      }

      console.log('\n' + '='.repeat(80));
      console.log('Test Result: ✅ Transient analysis completed');
      console.log('='.repeat(80));

    } else {
      console.error('\nError:', result.errorMessage);
      console.log('\n' + '='.repeat(80));
      console.log('Test Result: ❌ Failed');
      console.log('='.repeat(80));
    }

  } catch (error) {
    console.error('\nException during simulation:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    console.log('\n' + '='.repeat(80));
    console.log('Test Result: ❌ Failed');
    console.log('='.repeat(80));
  }
}

testDiodeSimpleTransient().catch(console.error);
