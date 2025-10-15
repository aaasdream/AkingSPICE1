/**
 * Debug test for transient analysis issue
 * Minimal circuit to investigate why timestep falls below minimum
 */

const { CircuitSimulationEngine } = require('./dist/src/core/simulation/circuit_simulation_engine.js');
const { ResistorFactory } = require('./dist/src/components/passive/resistor.js');
const { VoltageSourceFactory } = require('./dist/src/components/sources/voltage_source.js');
const { NgDeviceFactory } = require('./dist/src/core/ngdevices/ng_device_factory.js');

/**
 * Test: Simplest possible diode circuit for transient
 */
async function testDiodeTransient() {
  console.log('\n=== Debug: Diode Transient Analysis ===');
  console.log('Circuit: V1(5V DC) --- D1 --- R1(1kΩ) --- GND');
  console.log('Goal: Check why timestep falls below minimum\n');
  
  const components = [];
  
  try {
    // Create voltage source: 5V DC (no transient behavior)
    const v1 = VoltageSourceFactory.createDC('V1', ['vin', '0'], 5.0);
    components.push(v1);
    
    // Create diode
    const d1 = NgDeviceFactory.createDiode('D1', 'vin', 'vout', {
      IS: 1e-14,
      N: 1.0
    });
    components.push(d1);
    
    // Create load resistor: 1kΩ
    const r1 = ResistorFactory.create('R1', ['vout', '0'], 1000);
    components.push(r1);
    
    // Create simulation engine with LARGER time steps
    const engine = new CircuitSimulationEngine({
      endTime: 100e-9,         // 100ns total simulation
      initialTimeStep: 10e-9,  // Start with 10ns
      minTimeStep: 1e-9,       // Minimum 1ns (much larger!)
      maxTimeStep: 20e-9       // Maximum 20ns
    });
    
    engine.addDevices(components);
    
    console.log('Configuration:');
    console.log(`  End time: 100ns`);
    console.log(`  Initial dt: 10ns`);
    console.log(`  Min dt: 1ns`);
    console.log(`  Max dt: 20ns\n`);
    
    console.log('Running transient analysis...\n');
    const result = await engine.runSimulation();
    
    if (result.success) {
      console.log('✓ Simulation SUCCESS!\n');
      
      if (result.waveformData && result.waveformData.time) {
        const timePoints = result.waveformData.time.length;
        const finalTime = result.waveformData.time[timePoints - 1];
        const voutData = result.waveformData.voltages?.['vout'];
        
        console.log(`Total time points: ${timePoints}`);
        console.log(`Final time: ${(finalTime * 1e9).toFixed(3)} ns`);
        
        if (voutData && voutData.length > 0) {
          const finalVout = voutData[voutData.length - 1];
          console.log(`Final Vout: ${finalVout.toFixed(4)} V`);
          console.log(`Expected: ~4.3V (5V - 0.7V diode drop)`);
          
          // Check if reasonable
          if (Math.abs(finalVout - 4.3) < 1.0) {
            console.log('✓ Result looks reasonable!\n');
            return true;
          } else {
            console.log('⚠ Result outside expected range\n');
            return false;
          }
        }
      }
    } else {
      console.error('✗ Simulation FAILED\n');
      console.error('Error:', result.errorMessage);
      
      // Analyze the failure
      if (result.errorMessage && result.errorMessage.includes('minimum')) {
        console.log('\n📊 Analysis: Timestep fell below minimum');
        console.log('Possible causes:');
        console.log('1. Numerical stiffness in diode model');
        console.log('2. Initial transient too sharp');
        console.log('3. Integrator tolerance too tight');
        console.log('4. Capacitance effects (if any)');
      }
      
      return false;
    }
  } catch (error) {
    console.error('✗ Exception:', error.message);
    return false;
  }
}

/**
 * Test: MOSFET transient (even simpler - just DC)
 */
async function testMosfetTransient() {
  console.log('\n=== Debug: MOSFET Transient Analysis ===');
  console.log('Circuit: VDD(12V) --- M1 --- R1(10Ω) --- GND, Vgate=5V');
  console.log('Goal: Check MOSFET in transient mode\n');
  
  const components = [];
  
  try {
    // VDD: 12V supply
    const vdd = VoltageSourceFactory.createDC('VDD', ['vdd', '0'], 12.0);
    components.push(vdd);
    
    // Gate voltage: 5V (ON)
    const vgate = VoltageSourceFactory.createDC('VGATE', ['vgate', '0'], 5.0);
    components.push(vgate);
    
    // NMOS
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
    
    // Create simulation engine with LARGER time steps
    const engine = new CircuitSimulationEngine({
      endTime: 100e-9,
      initialTimeStep: 10e-9,
      minTimeStep: 1e-9,
      maxTimeStep: 20e-9
    });
    
    engine.addDevices(components);
    
    console.log('Configuration:');
    console.log(`  End time: 100ns`);
    console.log(`  Initial dt: 10ns`);
    console.log(`  Min dt: 1ns`);
    console.log(`  Max dt: 20ns\n`);
    
    console.log('Running transient analysis...\n');
    const result = await engine.runSimulation();
    
    if (result.success) {
      console.log('✓ Simulation SUCCESS!\n');
      
      if (result.waveformData && result.waveformData.voltages) {
        const voutData = result.waveformData.voltages['vout'];
        if (voutData && voutData.length > 0) {
          const finalVout = voutData[voutData.length - 1];
          const current = finalVout / 10;
          
          console.log(`Final Vout: ${finalVout.toFixed(4)} V`);
          console.log(`Drain current: ${(current * 1000).toFixed(2)} mA`);
          console.log('✓ MOSFET transient works!\n');
          return true;
        }
      }
    } else {
      console.error('✗ Simulation FAILED\n');
      console.error('Error:', result.errorMessage);
      return false;
    }
  } catch (error) {
    console.error('✗ Exception:', error.message);
    return false;
  }
}

/**
 * Run debug tests
 */
async function runDebugTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  NGDevices Transient Debug Suite                         ║');
  console.log('║  Investigating timestep minimum issue                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  let allPassed = true;
  
  try {
    const test1 = await testDiodeTransient();
    allPassed = allPassed && test1;
    
    const test2 = await testMosfetTransient();
    allPassed = allPassed && test2;
    
    console.log('╔════════════════════════════════════════════════════════════╗');
    if (allPassed) {
      console.log('║  ✓ All debug tests PASSED                                ║');
      console.log('║  Transient analysis works with larger timesteps!         ║');
    } else {
      console.log('║  ✗ Some debug tests FAILED                               ║');
      console.log('║  Issue: Timestep constraints too tight for ngdevices     ║');
    }
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  }
}

// Run the debug tests
runDebugTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
