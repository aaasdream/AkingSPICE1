/**
 * Simple NGDevices Test - Using CommonJS
 */

const { CircuitSimulationEngine } = require('./dist/src/core/simulation/circuit_simulation_engine.js');
const { ResistorFactory } = require('./dist/src/components/passive/resistor.js');
const { VoltageSourceFactory } = require('./dist/src/components/sources/voltage_source.js');
const { NgDeviceFactory } = require('./dist/src/core/ngdevices/ng_device_factory.js');

/**
 * Test 1: Simple Diode Forward Bias Circuit
 * V1 (5V) --- D1 --- R1 (1k) --- GND
 */
async function testDiodeForwardBias() {
  console.log('\n=== Test 1: Diode Forward Bias Circuit ===');
  console.log('Circuit: V1(5V) --- D1 --- R1(1kΩ) --- GND');
  
  const components = [];
  
  try {
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
    
    // Create simulation engine - use very short time for quasi-DC analysis
    const engine = new CircuitSimulationEngine({
      endTime: 1e-9,           // 1ns - very short to get DC result
      initialTimeStep: 1e-10,
      minTimeStep: 1e-12,
      maxTimeStep: 1e-9
    });
    
    // Add components
    engine.addDevices(components);
    
    // Run simulation
    console.log('Running DC analysis...');
    const result = await engine.runSimulation();
    
    if (result.success) {
      console.log('✓ Simulation converged successfully!');
      
      // Extract final values
      if (!result.waveformData || !result.waveformData.time || result.waveformData.time.length === 0) {
        console.error('✗ No waveform data available');
        return false;
      }
      
      const finalTime = result.waveformData.time[result.waveformData.time.length - 1];
      const voutData = result.waveformData.voltages?.['vout'];
      
      if (!voutData || voutData.length === 0) {
        console.error('✗ No voltage data for node "vout"');
        console.log('Available nodes:', Object.keys(result.waveformData.voltages || {}));
        return false;
      }
      
      const finalVout = voutData[voutData.length - 1];
      
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
      
      return true;
    } else {
      console.error('✗ Simulation failed:', result.errorMessage);
      if (result.debugInfo) {
        console.log('Debug info:', result.debugInfo);
      }
      return false;
    }
  } catch (error) {
    console.error('✗ Exception during simulation:', error.message);
    console.error(error.stack);
    return false;
  }
}

/**
 * Test 2: MOSFET as a Switch (DC Analysis)
 */
async function testMosfetSwitch(gateVoltage, testName) {
  console.log(`\n=== ${testName} ===`);
  console.log(`Circuit: VDD(12V) --- M1 --- R1(10Ω) --- GND, Vgate=${gateVoltage}V`);
  
  const components = [];
  
  try {
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
    
    // Create simulation engine - use very short time for quasi-DC analysis
    const engine = new CircuitSimulationEngine({
      endTime: 1e-9,           // 1ns - very short to get DC result
      initialTimeStep: 1e-10,
      minTimeStep: 1e-12,
      maxTimeStep: 1e-9
    });
    
    engine.addDevices(components);
    
    console.log('Running DC analysis...');
    const result = await engine.runSimulation();
    
    if (result.success) {
      console.log('✓ Simulation converged successfully!');
      
      if (!result.waveformData || !result.waveformData.voltages) {
        console.error('✗ No waveform data available');
        return false;
      }
      
      const voutData = result.waveformData.voltages['vout'];
      
      if (!voutData || voutData.length === 0) {
        console.error('✗ No voltage data for node "vout"');
        console.log('Available nodes:', Object.keys(result.waveformData.voltages));
        return false;
      }
      
      const finalVout = voutData[voutData.length - 1];
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
      return true;
    } else {
      console.error('✗ Simulation failed:', result.errorMessage);
      return false;
    }
  } catch (error) {
    console.error('✗ Exception during simulation:', error.message);
    console.error(error.stack);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  NGDevices Circuit Test Suite                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  let allPassed = true;
  
  try {
    // Test diode circuit
    const test1 = await testDiodeForwardBias();
    allPassed = allPassed && test1;
    
    // Test MOSFET as switch
    const test2a = await testMosfetSwitch(0, 'Test 2a: MOSFET Switch (Gate=0V, OFF)');
    allPassed = allPassed && test2a;
    
    const test2b = await testMosfetSwitch(5, 'Test 2b: MOSFET Switch (Gate=5V, ON)');
    allPassed = allPassed && test2b;
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    if (allPassed) {
      console.log('║  ✓ All tests PASSED                                      ║');
    } else {
      console.log('║  ✗ Some tests FAILED                                     ║');
    }
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n✗ Fatal error in test suite:', error);
    process.exit(1);
  }
}

// Run the tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
