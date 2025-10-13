/**
 * Verbose test for homotopy solver with proper UTF-8 output
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine.js';
import { VoltageSource } from './src/components/sources/voltage_source.js';
import { Resistor } from './src/components/passive/resistor.js';
import { Capacitor } from './src/components/passive/capacitor.js';
import { IntelligentDiode } from './src/core/devices/intelligent_diode.js';
import { IntelligentMOSFET } from './src/core/devices/intelligent_mosfet.js';

async function testHomotopySolver() {
  console.log('='.repeat(80));
  console.log('HOMOTOPY SOLVER TEST - Diode+MOSFET Circuit');
  console.log('='.repeat(80));

  const diodeParams = {
    Is: 1e-14,
    n: 1.0,
    Rs: 0.1,
    Cj0: 10e-12,
    Vj: 0.7,
    m: 0.5,
    tt: 0
  };

  const mosfetParams = {
    Vth: 2.0,
    Kp: 0.02,
    lambda: 0.01,
    Cgs: 100e-12,
    Cgd: 50e-12,
    Ron: 0.1,
    Roff: 1e12,
    Vmax: 50,
    Imax: 10
  };

  const engine = new CircuitSimulationEngine({
    endTime: 0,  // DC analysis only
    initialTimeStep: 0.5e-6,
    maxTimeStep: 2e-6,
    minTimeStep: 1e-7
  });

  engine.addDevice(new VoltageSource('Vdd', ['n_vdd', '0'], 15));
  engine.addDevice(new VoltageSource('Vgate', ['n_gate', '0'], 0));  // MOSFET off
  
  engine.addDevice(new IntelligentMOSFET('M1', ['n_vdd', 'n_gate', 'n_sw'], mosfetParams));
  engine.addDevice(new IntelligentDiode('D1', ['n_sw', '0'], diodeParams));
  engine.addDevice(new Resistor('R_load', ['n_sw', '0'], 100));
  engine.addDevice(new Capacitor('C_load', ['n_sw', '0'], 1e-6));

  console.log('\nStarting simulation...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  if (result.success) {
    console.log('SUCCESS! DC analysis converged');
    console.log(`Final time: ${result.finalTime}`);
    console.log(`Total steps: ${result.totalSteps}`);
    
    console.log('\nNode Voltages:');
    for (const [nodeId, voltages] of result.waveformData.nodeVoltages) {
      if (voltages.length > 0) {
        console.log(`  Node ${nodeId}: ${voltages[0].toFixed(6)} V`);
      }
    }
  } else {
    console.log('FAILED!');
    console.log(`Error: ${result.errorMessage}`);
  }
  console.log('='.repeat(80));
}

testHomotopySolver().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
