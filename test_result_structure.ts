/**
 * 測試結果結構檢查
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';

async function checkResultStructure() {
  const vdd = new VoltageSource('VDD', ['vdd', '0'], 12);
  const vgate = new VoltageSource('VGATE', ['gate', '0'], 5);
  const rload = new Resistor('R_LOAD', ['vdd', 'drain'], 1e3);
  const m1 = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', {
    KP: 100e-6,
    VTO: 2.0,
    LAMBDA: 0.01,
    W: 100e-6,
    L: 10e-6
  });
  
  const engine = new CircuitSimulationEngine({ endTime: 0, verboseLogging: false });
  engine.addDevice(vdd);
  engine.addDevice(vgate);
  engine.addDevice(rload);
  engine.addDevice(m1);
  
  const result = await engine.runSimulation();
  
  console.log('\n=== 結果結構檢查 ===\n');
  console.log('result.success:', result.success);
  console.log('\nresult 的屬性:');
  console.log(Object.keys(result));
  
  if (result.waveformData) {
    console.log('\nwaveformData 存在');
    console.log('waveformData 屬性:', Object.keys(result.waveformData));
    console.log('timePoints 數量:', result.waveformData.timePoints?.length);
    
    if (result.waveformData.nodeVoltages) {
      console.log('\nnodeVoltages 存在');
      console.log('nodeVoltages 類型:', result.waveformData.nodeVoltages.constructor.name);
      console.log('nodeVoltages 大小:', result.waveformData.nodeVoltages.size);
      console.log('\n所有節點電壓:');
      result.waveformData.nodeVoltages.forEach((voltages: any, nodeName: string) => {
        console.log(`  節點 "${nodeName}":`, voltages);
      });
    }
  }
}

checkResultStructure().catch(err => {
  console.error('錯誤:', err.message);
  process.exit(1);
});
