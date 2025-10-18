/**
 * 最簡單的二極體整流測試 - 無濾波電容
 * Circuit: AC Source -> D -> R -> GND (no capacitor)
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgDiode } from './src/core/ngdevices/ng_diode';
import * as fs from 'fs';

async function testDiodeSimpleRectifier() {
  console.log('='.repeat(80));
  console.log('Test: Simple Diode Rectifier (NO filter capacitor)');
  console.log('='.repeat(80));

  const V_peak = 5;     // 5V peak
  const freq = 1000;    // 1kHz (higher frequency for faster test)
  const R_load = 1000;  // 1kΩ

  console.log(`\nCircuit: AC(${V_peak}V, ${freq}Hz) -> D -> R(${R_load}Ω) -> GND`);

  // Create components
  const vac = VoltageSourceFactory.createSine(
    'Vac',
    ['n_ac', '0'],
    0,       // DC offset
    V_peak,  // amplitude
    freq     // frequency
  );

  const diode = new NgDiode('D1', 'n_ac', 'n_out', {
    IS: 1e-14,
    N: 1.0,
    CJO: 10e-12,  // 10pF 
    VJ: 0.7,
    M: 0.5
  });

  const rload = ResistorFactory.create('R_load', ['n_out', '0'], R_load);

  // Simulation: 2 periods
  const period = 1 / freq;
  const endTime = 2 * period;
  const timeStep = period / 50;  // 50 points per period

  console.log(`Period: ${(period * 1000).toFixed(3)} ms`);
  console.log(`Simulation time: ${(endTime * 1000).toFixed(3)} ms`);
  console.log(`Time step: ${(timeStep * 1e6).toFixed(3)} μs`);

  const engine = new CircuitSimulationEngine({
    endTime: endTime,
    initialTimeStep: timeStep,
    maxTimeStep: timeStep,
    minTimeStep: timeStep / 10
  });

  engine.addDevices([vac, diode, rload]);

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

      const acIdx = nodeMap.get('n_ac');
      const outIdx = nodeMap.get('n_out');

      if (acIdx !== undefined && outIdx !== undefined) {
        const V_ac = nodeVoltages.get(acIdx) || [];
        const V_out = nodeVoltages.get(outIdx) || [];

        // Statistics
        let maxVout = -Infinity;
        let minVout = Infinity;
        let avgVout = 0;
        let positiveCount = 0;

        for (let i = 0; i < V_out.length; i++) {
          const v = V_out[i];
          if (!isNaN(v) && isFinite(v)) {
            maxVout = Math.max(maxVout, v);
            minVout = Math.min(minVout, v);
            avgVout += v;
            if (v > 0.1) positiveCount++;
          }
        }
        avgVout /= V_out.length;

        console.log('\nOutput Voltage:');
        console.log(`  Max: ${maxVout.toFixed(3)}V`);
        console.log(`  Min: ${minVout.toFixed(3)}V`);
        console.log(`  Avg: ${avgVout.toFixed(3)}V`);
        console.log(`  Positive points: ${positiveCount}/${V_out.length} (${(positiveCount/V_out.length*100).toFixed(1)}%)`);

        // Check rectification
        if (maxVout > 3.0 && minVout < 0.1) {
          console.log('  ✅ Rectification working!');
        } else {
          console.log('  ❌ Rectification NOT working!');
          console.log(`     Expected: Max > 3V, Min ≈ 0V`);
          console.log(`     Got: Max = ${maxVout.toFixed(3)}V, Min = ${minVout.toFixed(3)}V`);
        }

        // Save CSV
        const csvLines = ['time(ms),V_ac(V),V_out(V)'];
        for (let i = 0; i < timePoints.length; i++) {
          const t = timePoints[i] * 1000;  // convert to ms
          const vAc = V_ac[i] || 0;
          const vOut = V_out[i] || 0;
          csvLines.push(`${t.toFixed(6)},${vAc.toFixed(6)},${vOut.toFixed(6)}`);
        }
        fs.writeFileSync('test_diode_no_cap.csv', csvLines.join('\n'));
        console.log('\n📁 CSV saved: test_diode_no_cap.csv');

        // Show sample points
        console.log('\nSample points (every 10th):');
        console.log('  time(ms)   V_ac(V)   V_out(V)');
        console.log('  ' + '-'.repeat(35));
        for (let i = 0; i < timePoints.length; i += 10) {
          const t = timePoints[i] * 1000;
          const vAc = V_ac[i] || 0;
          const vOut = V_out[i] || 0;
          console.log(`  ${t.toFixed(3).padStart(8)}   ${vAc.toFixed(3).padStart(7)}   ${vOut.toFixed(3).padStart(8)}`);
        }
      }

      console.log('\n' + '='.repeat(80));
      console.log('Test Result: ✅ Completed');
      console.log('='.repeat(80));

    } else {
      console.error('\nError:', result.errorMessage);
      console.log('\n' + '='.repeat(80));
      console.log('Test Result: ❌ Failed');
      console.log('='.repeat(80));
    }

  } catch (error) {
    console.error('\nException:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    console.log('\n' + '='.repeat(80));
    console.log('Test Result: ❌ Failed');
    console.log('='.repeat(80));
  }
}

testDiodeSimpleRectifier().catch(console.error);
