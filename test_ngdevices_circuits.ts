/**
 * Comprehensive NGDevices Circuit Tests
 * Tests diode and MOSFET circuits with actual simulation
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine.js';
import { ResistorFactory } from './src/components/passive/resistor.js';
import { VoltageSourceFactory } from './src/components/sources/voltage_source.js';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory.js';
import { ComponentInterface } from './src/core/interfaces/component.js';

/**
 * Test 1: Simple Diode Forward Bias Circuit
 * V1 (5V) --- D1 --- R1 (1k) --- GND
 */
async function testDiodeForwardBias(): Promise<void> {
  console.log('\n=== Test 1: Diode Forward Bias Circuit ===');
  console.log('Circuit: V1(5V) --- D1 --- R1(1kΩ) --- GND');
  
  const components: ComponentInterface[] = [];
  
  // Create voltage source: 5V DC
  const v1 = VoltageSourceFactory.createDC('V1', ['vin', '0'], 5.0);
  components.push(v1);
  
  // Create diode with typical parameters
  const d1 = NgDeviceFactory.createDiode('D1', 'vin', 'vout', {
    IS: 1e-14,
    N: 1.0
  });
  components.push(d1);
  
  // Create load resistor: 1kΩ
  const r1 = ResistorFactory.create('R1', ['vout', '0'], 1000);
  components.push(r1);
  
  // Create simulation engine
  const engine = new CircuitSimulationEngine({
    endTime: 1e-6,           // 1us (just DC)
    initialTimeStep: 1e-7,
    minTimeStep: 1e-10,
    maxTimeStep: 1e-6
  });
  
  // Add components
  engine.addDevices(components);
  
  // Run simulation
  try {
    console.log('Running DC analysis...');
    const result = await engine.runSimulation();
    
    if (result.success) {
      console.log('✓ Simulation converged successfully!');
      
      // Extract final values
      const finalTime = result.waveformData.time[result.waveformData.time.length - 1];
      const finalVout = result.waveformData.voltages['vout']?.[result.waveformData.voltages['vout'].length - 1] ?? 0;
      
      console.log(`Final time: ${finalTime.toExponential(3)} s`);
      console.log(`Output voltage (Vout): ${finalVout.toFixed(4)} V`);
      
      // Expected: Vout ≈ 5V - 0.7V = 4.3V (diode forward voltage drop)
      const expectedVout = 5.0 - 0.7;
      const tolerance = 0.5;
      
      if (Math.abs(finalVout - expectedVout) < tolerance) {
        console.log(`✓ Output voltage is within expected range (${expectedVout} ± ${tolerance} V)`);
      } else {
        console.log(`⚠ Output voltage outside expected range. Expected: ~${expectedVout} V, Got: ${finalVout.toFixed(4)} V`);
      }
      
      // Calculate current
      const current = (5.0 - finalVout) / 1000;  // I = (Vin - Vout) / R
      console.log(`Diode current: ${(current * 1000).toFixed(4)} mA`);
      
    } else {
      console.error('✗ Simulation failed:', result.errorMessage);
      if (result.debugInfo) {
        console.log('Debug info:', result.debugInfo);
      }
    }
  } catch (error) {
    console.error('✗ Exception during simulation:', error);
  }
}

/**
 * Test 2: MOSFET as a Switch (DC Analysis)
 */
async function testMosfetSwitch(gateVoltage: number, testName: string): Promise<void> {
  console.log(`\n=== ${testName} ===`);
  console.log(`Circuit: VDD(12V) --- M1 --- R1(10Ω) --- GND, Vgate=${gateVoltage}V`);
  
  const components: ComponentInterface[] = [];
  
  // VDD: 12V supply
  const vdd = VoltageSourceFactory.createDC('VDD', ['vdd', '0'], 12.0);
  components.push(vdd);
  
  // Gate voltage
  const vgate = VoltageSourceFactory.createDC('VGATE', ['vgate', '0'], gateVoltage);
  components.push(vgate);
  
  // NMOS transistor (Drain, Gate, Source, Bulk)
  const m1 = NgDeviceFactory.createNMOS('M1', 'vdd', 'vgate', 'vout', '0', {
    VTO: 1.0,      // Threshold voltage: 1V
    KP: 100e-3,    // Transconductance: 100 mA/V²
    W: 100e-6,     // Width: 100um
    L: 10e-6,      // Length: 10um
    LAMBDA: 0.01   // Channel-length modulation
  });
  components.push(m1);
  
  // Load resistor: 10Ω
  const r1 = ResistorFactory.create('R1', ['vout', '0'], 10);
  components.push(r1);
  
  // Create simulation engine
  const engine = new CircuitSimulationEngine({
    endTime: 1e-6,
    initialTimeStep: 1e-7,
    minTimeStep: 1e-10,
    maxTimeStep: 1e-6
  });
  
  engine.addDevices(components);
  
  try {
    console.log('Running DC analysis...');
    const result = await engine.runSimulation();
    
    if (result.success) {
      console.log('✓ Simulation converged successfully!');
      
      const finalVout = result.waveformData.voltages['vout']?.[result.waveformData.voltages['vout'].length - 1] ?? 0;
      const vds = 12.0 - finalVout;
      const current = finalVout / 10;  // I = Vout / R
      
      console.log(`Output voltage (Vout): ${finalVout.toFixed(4)} V`);
      console.log(`VDS: ${vds.toFixed(4)} V`);
      console.log(`Drain current: ${(current * 1000).toFixed(4)} mA`);
      
      if (gateVoltage > 1.5) {
        // MOSFET should be ON
        console.log('Expected: MOSFET ON, significant current flow');
        if (current > 0.1) {
          console.log('✓ MOSFET is conducting');
        } else {
          console.log('⚠ Current lower than expected');
        }
      } else {
        // MOSFET should be OFF
        console.log('Expected: MOSFET OFF, minimal current');
        if (current < 0.01) {
          console.log('✓ MOSFET is correctly in cutoff');
        } else {
          console.log('⚠ Current higher than expected');
        }
      }
    } else {
      console.error('✗ Simulation failed:', result.errorMessage);
      if (result.debugInfo) {
        console.log('Debug info:', result.debugInfo);
      }
    }
  } catch (error) {
    console.error('✗ Exception during simulation:', error);
  }
}

/**
 * Test 3: MOSFET PWM Circuit with Transient Analysis
 */
async function testMosfetPWM(): Promise<void> {
  console.log('\n=== Test 3: MOSFET PWM Circuit (Transient) ===');
  console.log('Circuit: VDD(12V) --- M1 --- R1(10Ω) --- GND');
  console.log('Gate: PWM signal (0-5V, 10kHz, 50% duty)');
  
  const components: ComponentInterface[] = [];
  
  // VDD: 12V supply
  const vdd = VoltageSourceFactory.createDC('VDD', ['vdd', '0'], 12.0);
  components.push(vdd);
  
  // Gate PWM signal: 5V amplitude, 10kHz (period = 100us), 50% duty cycle
  const vgate = VoltageSourceFactory.createPulse('VGATE', ['vgate', '0'], {
    v1: 0,
    v2: 5,
    td: 0,           // delay
    tr: 1e-9,        // rise time: 1ns
    tf: 1e-9,        // fall time: 1ns
    pw: 50e-6,       // pulse width: 50us (50% of 100us)
    per: 100e-6      // period: 100us (10kHz)
  });
  components.push(vgate);
  
  // NMOS transistor
  const m1 = NgDeviceFactory.createNMOS('M1', 'vdd', 'vgate', 'vout', '0', {
    VTO: 1.0,
    KP: 100e-3,
    W: 100e-6,
    L: 10e-6,
    LAMBDA: 0.01
  });
  components.push(m1);
  
  // Load resistor: 10Ω
  const r1 = ResistorFactory.create('R1', ['vout', '0'], 10);
  components.push(r1);
  
  // Create simulation engine for transient analysis
  const engine = new CircuitSimulationEngine({
    endTime: 200e-6,        // Simulate 2 PWM cycles
    initialTimeStep: 1e-7,
    minTimeStep: 1e-10,
    maxTimeStep: 5e-6
  });
  
  engine.addDevices(components);
  
  try {
    console.log('Running transient analysis (200us, 2 cycles)...');
    const result = await engine.runSimulation();
    
    if (result.success) {
      console.log('✓ Simulation converged successfully!');
      console.log(`Total time points: ${result.waveformData.time.length}`);
      
      // Analyze waveform
      const voutData = result.waveformData.voltages['vout'] ?? [];
      const vgateData = result.waveformData.voltages['vgate'] ?? [];
      
      if (voutData.length > 0) {
        const maxVout = Math.max(...voutData);
        const minVout = Math.min(...voutData);
        const avgVout = voutData.reduce((a, b) => a + b, 0) / voutData.length;
        
        console.log(`\nOutput voltage statistics:`);
        console.log(`  Max: ${maxVout.toFixed(4)} V`);
        console.log(`  Min: ${minVout.toFixed(4)} V`);
        console.log(`  Average: ${avgVout.toFixed(4)} V`);
        
        if (maxVout > 1.0 && minVout < 1.0) {
          console.log('✓ PWM switching behavior observed');
        } else {
          console.log('⚠ Unexpected PWM behavior');
        }
      }
      
      if (vgateData.length > 0) {
        console.log(`\nGate voltage range: ${Math.min(...vgateData).toFixed(2)}V to ${Math.max(...vgateData).toFixed(2)}V`);
      }
      
    } else {
      console.error('✗ Simulation failed:', result.errorMessage);
      if (result.debugInfo) {
        console.log('Debug info:', result.debugInfo);
      }
    }
  } catch (error) {
    console.error('✗ Exception during simulation:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }
}

/**
 * Run all tests
 */
async function runAllTests(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  NGDevices Circuit Test Suite                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Test diode circuit
    await testDiodeForwardBias();
    
    // Test MOSFET as switch
    await testMosfetSwitch(0, 'Test 2a: MOSFET Switch (Gate=0V, OFF)');
    await testMosfetSwitch(5, 'Test 2b: MOSFET Switch (Gate=5V, ON)');
    
    // Test MOSFET PWM
    await testMosfetPWM();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  All tests completed                                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('\n✗ Fatal error in test suite:', error);
    process.exit(1);
  }
}

// Run the tests
runAllTests().catch(console.error);
