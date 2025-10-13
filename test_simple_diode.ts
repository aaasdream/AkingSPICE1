/**
 * Simplified test to trace DC analysis flow
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine.js';

async function main() {
  console.log('=== STARTING SIMPLE DIODE TEST ===\n');
  
  const engine = new CircuitSimulationEngine();
  
  // Simple diode forward bias circuit: V1 --[ D1 ]-- R1 -- GND
  const netlist = `
Simple Diode Forward Bias
V1 n1 0 DC 5
D1 n1 n2 DMOD
R1 n2 0 1k
.model DMOD D(Is=1e-14 N=1.0)
.dc
.end
  `.trim();
  
  try {
    console.log('Parsing netlist...');
    engine.parseNetlist(netlist);
    
    console.log('\nStarting simulation...');
    const result = await engine.simulate();
    
    console.log('\n=== SIMULATION COMPLETE ===');
    console.log('Success:', result.success);
    console.log('Solution vector:', result.solution);
    
    if (result.dc) {
      console.log('\nDC Analysis Results:');
      console.log('Node voltages:', result.dc.nodeVoltages);
    }
  } catch (error) {
    console.error('\n=== SIMULATION FAILED ===');
    console.error('Error:', error);
    console.error('Stack:', (error as Error).stack);
  }
}

main();
