/**
 * NGDevices 增強測試
 * 測試改進後的二極體和 MOSFET 在不同工作區域的行為
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';
import { Resistor } from './src/components/passive/resistor';
import { VoltageSource } from './src/components/sources/voltage_source';

console.log('=== NGDevices 增強測試 ===\n');

// Helper function
function getNodeVoltage(engine: CircuitSimulationEngine, result: any, nodeName: string): number {
  const nodeIndex = (engine as any)['_nodeMapping'].get(nodeName);
  if (nodeIndex === undefined) return 0;
  return result.waveformData.nodeVoltages.get(nodeIndex)?.[0] || 0;
}

// 測試 1: 二極體正向偏壓 (不同電壓)
console.log('測試 1: 二極體正向偏壓測試');
console.log('==========================================\n');

const testVoltages = [0.1, 0.3, 0.5, 0.7, 0.9, 1.0];

(async () => {
  for (const testV of testVoltages) {
    try {
      const v1 = new VoltageSource('V1', ['n1', '0'], testV);
      const d1 = NgDeviceFactory.createDiode('D1', 'n1', 'n2', {
        IS: 1e-14,
        N: 1.0,
        RS: 0.1
      });
      const r1 = new Resistor('R1', ['n2', '0'], 1000);

      const engine = new CircuitSimulationEngine({
        endTime: 0,
        maxNewtonIterations: 100,
        voltageToleranceAbs: 1e-6,
        verboseLogging: false
      });
      
      engine.addDevice(v1);
      engine.addDevice(d1);
      engine.addDevice(r1);

      const result = await engine.runSimulation();

      if (result.success) {
        const v_n1 = getNodeVoltage(engine, result, 'n1');
        const v_n2 = getNodeVoltage(engine, result, 'n2');
        const vd = v_n1 - v_n2;
        const i_diode = v_n2 / 1000;
        console.log(`  Vsource=${testV.toFixed(2)}V: Vdiode=${vd.toFixed(4)}V, I=${(i_diode*1000).toFixed(4)}mA`);
      } else {
        console.log(`  Vsource=${testV.toFixed(2)}V: 未收斂`);
      }
    } catch (error) {
      console.log(`  Vsource=${testV.toFixed(2)}V: 錯誤 - ${error}`);
    }
  }

  // 測試 2: MOSFET 不同工作區域
  console.log('\n測試 2: NMOS 不同工作區域測試');
  console.log('==========================================\n');

  const vgsTests = [
    { vgs: 0.5, vdd: 5.0, desc: 'VGS < VTH (截止)' },
    { vgs: 1.0, vdd: 5.0, desc: 'VGS = VTH + 0.3V (飽和)' },
    { vgs: 2.0, vdd: 5.0, desc: 'VGS = 2V (飽和)' },
    { vgs: 5.0, vdd: 5.0, desc: 'VGS = VDD (線性)' }
  ];

  for (const test of vgsTests) {
    try {
      const vdd = new VoltageSource('VDD', ['vdd', '0'], test.vdd);
      const vgs = new VoltageSource('VGS', ['gate', '0'], test.vgs);
      const rd = new Resistor('RD', ['vdd', 'drain'], 1000);
      const m1 = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', {
        VTO: 0.7,
        KP: 2e-4,  // 更大的 KP 以便觀察效果
        LAMBDA: 0.02
      });

      const engine = new CircuitSimulationEngine({
        endTime: 0,
        maxNewtonIterations: 100,
        voltageToleranceAbs: 1e-6,
        verboseLogging: false
      });
      
      engine.addDevice(vdd);
      engine.addDevice(vgs);
      engine.addDevice(rd);
      engine.addDevice(m1);

      const result = await engine.runSimulation();

      if (result.success) {
        const v_drain = getNodeVoltage(engine, result, 'drain');
        const v_gate = getNodeVoltage(engine, result, 'gate');
        const i_drain = (test.vdd - v_drain) / 1000;
        console.log(`  ${test.desc}:`);
        console.log(`    VGS=${v_gate.toFixed(3)}V, VDS=${v_drain.toFixed(3)}V, ID=${(i_drain*1000).toFixed(4)}mA\n`);
      } else {
        console.log(`  ${test.desc}: 未收斂\n`);
      }
    } catch (error) {
      console.log(`  ${test.desc}: 錯誤 - ${error}\n`);
    }
  }

  // 測試 3: 二極體反向偏壓
  console.log('\n測試 3: 二極體反向偏壓測試');
  console.log('==========================================\n');

  try {
    const v1 = new VoltageSource('V1', ['n1', '0'], -5.0);
    const d1 = NgDeviceFactory.createDiode('D1', 'n2', 'n1', {  // 注意反接
      IS: 1e-14,
      N: 1.0
    });
    const r1 = new Resistor('R1', ['n2', '0'], 10000);

    const engine = new CircuitSimulationEngine({
      endTime: 0,
      maxNewtonIterations: 100,
      voltageToleranceAbs: 1e-6,
      verboseLogging: false
    });
    
    engine.addDevice(v1);
    engine.addDevice(d1);
    engine.addDevice(r1);

    const result = await engine.runSimulation();

    if (result.success) {
      const v_n1 = getNodeVoltage(engine, result, 'n1');
      const v_n2 = getNodeVoltage(engine, result, 'n2');
      const vd = v_n2 - v_n1;
      const i_diode = v_n2 / 10000;
      console.log(`  ✓ 反向偏壓: Vdiode=${vd.toFixed(4)}V, I=${(i_diode*1e6).toFixed(4)}µA`);
    } else {
      console.log(`  ✗ 反向偏壓: 未收斂`);
    }
  } catch (error) {
    console.log(`  ✗ 反向偏壓: 錯誤 - ${error}`);
  }

  // 測試 4: PMOS 測試
  console.log('\n測試 4: PMOS 電路測試');
  console.log('==========================================\n');

  try {
    const vdd = new VoltageSource('VDD', ['vdd', '0'], 5.0);
    const vgs = new VoltageSource('VGS', ['gate', '0'], 2.0);  // VGS = 2V, VSG = 3V > |VTP|
    const rd = new Resistor('RD', ['drain', '0'], 1000);
    const m1 = NgDeviceFactory.createPMOS('M1', 'drain', 'gate', 'vdd', 'vdd', {
      VTO: -0.7,
      KP: 2e-4,
      LAMBDA: 0.02
    });

    const engine = new CircuitSimulationEngine({
      endTime: 0,
      maxNewtonIterations: 100,
      voltageToleranceAbs: 1e-6,
      verboseLogging: false
    });
    
    engine.addDevice(vdd);
    engine.addDevice(vgs);
    engine.addDevice(rd);
    engine.addDevice(m1);

    const result = await engine.runSimulation();

    if (result.success) {
      const v_vdd = getNodeVoltage(engine, result, 'vdd');
      const v_drain = getNodeVoltage(engine, result, 'drain');
      const v_gate = getNodeVoltage(engine, result, 'gate');
      const vsg = v_vdd - v_gate;
      const i_drain = v_drain / 1000;
      console.log(`  ✓ PMOS: VSG=${vsg.toFixed(3)}V, VDS=${(v_drain-v_vdd).toFixed(3)}V, ID=${(i_drain*1000).toFixed(4)}mA`);
    } else {
      console.log(`  ✗ PMOS: 未收斂`);
    }
  } catch (error) {
    console.log(`  ✗ PMOS: 錯誤 - ${error}`);
  }

  console.log('\n=== ✓ 所有增強測試完成 ===');
  process.exit(0);
})();
