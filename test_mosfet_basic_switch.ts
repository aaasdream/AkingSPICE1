/**
 * MOSFET 基礎開關測試
 * 測試 NMOS 在固定 VGS 下的開關特性（不使用 PWM）
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';

// 輔助函數：從結果中提取節點電壓
function getNodeVoltage(engine: CircuitSimulationEngine, result: any, nodeName: string): number {
  if (!result.success || !result.waveformData) {
    return 0;
  }
  // 獲取節點ID
  const nodeId = engine.getNodeIdByName(nodeName);
  if (nodeId === undefined) {
    return 0;
  }
  // DC 分析：waveformData.nodeVoltages 是 Map<number, number[]>
  // 取最後一個時間點的電壓
  const voltages = result.waveformData.nodeVoltages?.get(nodeId);
  if (voltages && voltages.length > 0) {
    return voltages[voltages.length - 1];
  }
  return 0;
}

async function testMosfetBasicSwitch() {
  console.log('\n=== MOSFET 基礎開關測試 ===\n');
  let passed = 0;
  let failed = 0;

  // 測試 1: MOSFET 截止 (VGS = 0V)
  console.log('測試 1: MOSFET 截止 (VGS = 0V)');
  console.log('='.repeat(60));
  
  try {
    const vdd_off = new VoltageSource('VDD', ['vdd', '0'], 12);
    const vgate_off = new VoltageSource('VGATE', ['gate', '0'], 0);
    const rload_off = new Resistor('R_LOAD', ['vdd', 'drain'], 1e3); // 1kΩ
    const m1_off = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', {
      KP: 100e-6,  // 100µA/V²
      VTO: 2.0,
      LAMBDA: 0.01,
      W: 100e-6,
      L: 10e-6
    });
    
    const engine = new CircuitSimulationEngine({ endTime: 0, verboseLogging: false });
    engine.addDevice(vdd_off);
    engine.addDevice(vgate_off);
    engine.addDevice(rload_off);
    engine.addDevice(m1_off);
    
    const result = await engine.runSimulation();
    
    if (result.success) {
      const vd = getNodeVoltage(engine, result, 'drain');
      const vg = getNodeVoltage(engine, result, 'gate');
      const vdd_val = getNodeVoltage(engine, result, 'vdd');
      const id = (vdd_val - vd) / 1e3 * 1e6; // µA
      
      console.log('工作點:');
      console.log(`  V(drain) = ${vd.toFixed(3)}V`);
      console.log(`  V(gate) = ${vg.toFixed(3)}V`);
      console.log(`  V(vdd) = ${vdd_val.toFixed(3)}V`);
      console.log(`  I(drain) = ${id.toFixed(6)}µA`);
      
      if (Math.abs(id) < 1e-3) {
        console.log('✅ 測試 1 通過: MOSFET 截止\n');
        passed++;
      } else {
        console.log(`⚠️  測試 1 失敗: 截止電流 ${id.toFixed(6)}µA > 1nA\n`);
        failed++;
      }
    } else {
      console.log('❌ 測試 1 失敗: 模擬未收斂\n');
      failed++;
    }
  } catch (e: any) {
    console.log(`❌ 測試 1 異常: ${e.message}\n`);
    failed++;
  }

  // 測試 2: MOSFET 飽和區 (VGS = 5V)
  console.log('測試 2: MOSFET 飽和區 (VGS = 5V)');
  console.log('='.repeat(60));
  
  try {
    const vdd_sat = new VoltageSource('VDD', ['vdd', '0'], 12);
    const vgate_sat = new VoltageSource('VGATE', ['gate', '0'], 5);
    const rload_sat = new Resistor('R_LOAD', ['vdd', 'drain'], 1e3);
    const m1_sat = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', {
      KP: 100e-6,
      VTO: 2.0,
      LAMBDA: 0.01,
      W: 100e-6,
      L: 10e-6
    });
    
    const engine = new CircuitSimulationEngine({ endTime: 0, verboseLogging: false });
    engine.addDevice(vdd_sat);
    engine.addDevice(vgate_sat);
    engine.addDevice(rload_sat);
    engine.addDevice(m1_sat);
    
    const result = await engine.runSimulation();
    
    if (result.success) {
      const vd = getNodeVoltage(engine, result, 'drain');
      const vg = getNodeVoltage(engine, result, 'gate');
      const vdd_val = getNodeVoltage(engine, result, 'vdd');
      const id = (vdd_val - vd) / 1e3 * 1e3; // mA
      const vgs = vg;
      const vds = vd;
      
      console.log('工作點:');
      console.log(`  V(drain) = ${vd.toFixed(3)}V`);
      console.log(`  V(gate) = ${vg.toFixed(3)}V`);
      console.log(`  VGS = ${vgs.toFixed(3)}V, VDS = ${vds.toFixed(3)}V`);
      console.log(`  I(drain) = ${id.toFixed(6)}mA`);
      
      const vgs_eff = vgs - 2.0;
      const vds_dsat = vgs_eff;
      
      console.log(`\n分析:`);
      console.log(`  VGS - Vto = ${vgs_eff.toFixed(3)}V`);
      console.log(`  VDS,sat = ${vds_dsat.toFixed(3)}V`);
      
      if (vds > vds_dsat) {
        const kp = 100e-6;
        const w_over_l = 10; // (100µm) / (10µm)
        const id_theory = 0.5 * kp * w_over_l * Math.pow(vgs_eff, 2) * 1e3; // mA
        
        console.log(`  工作區: 飽和區 (VDS > VDS,sat)`);
        console.log(`  理論電流: ${id_theory.toFixed(6)}mA`);
        console.log(`  實際電流: ${id.toFixed(6)}mA`);
        
        const error = Math.abs((id - id_theory) / id_theory);
        console.log(`  誤差: ${(error * 100).toFixed(2)}%`);
        
        if (error < 0.15) {
          console.log('✅ 測試 2 通過: 飽和區電流符合理論\n');
          passed++;
        } else {
          console.log('⚠️  測試 2 失敗: 電流偏差過大\n');
          failed++;
        }
      } else {
        console.log(`⚠️  測試 2 未達飽和區 (VDS < VDS,sat)\n`);
        failed++;
      }
    } else {
      console.log('❌ 測試 2 失敗: 模擬未收斂\n');
      failed++;
    }
  } catch (e: any) {
    console.log(`❌ 測試 2 異常: ${e.message}\n`);
    failed++;
  }

  // 測試 3: MOSFET 線性區
  console.log('測試 3: MOSFET 線性區 (VGS = 5V, 低 VDS)');
  console.log('='.repeat(60));
  
  try {
    const vdd_lin = new VoltageSource('VDD', ['vdd', '0'], 2); // 低 VDD
    const vgate_lin = new VoltageSource('VGATE', ['gate', '0'], 5);
    const rload_lin = new Resistor('R_LOAD', ['vdd', 'drain'], 100);
    const m1_lin = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', '0', '0', {
      KP: 100e-6,
      VTO: 2.0,
      LAMBDA: 0.01,
      W: 100e-6,
      L: 10e-6
    });
    
    const engine = new CircuitSimulationEngine({ endTime: 0, verboseLogging: false });
    engine.addDevice(vdd_lin);
    engine.addDevice(vgate_lin);
    engine.addDevice(rload_lin);
    engine.addDevice(m1_lin);
    
    const result = await engine.runSimulation();
    
    if (result.success) {
      const vd = getNodeVoltage(engine, result, 'drain');
      const vg = getNodeVoltage(engine, result, 'gate');
      const vgs = vg;
      const vds = vd;
      
      console.log('工作點:');
      console.log(`  V(drain) = ${vd.toFixed(3)}V`);
      console.log(`  V(gate) = ${vg.toFixed(3)}V`);
      console.log(`  VGS = ${vgs.toFixed(3)}V, VDS = ${vds.toFixed(3)}V`);
      
      const vgs_eff = vgs - 2.0;
      const vds_dsat = vgs_eff;
      
      console.log(`\n分析:`);
      console.log(`  VGS - Vto = ${vgs_eff.toFixed(3)}V`);
      console.log(`  VDS,sat = ${vds_dsat.toFixed(3)}V`);
      
      if (vds < vds_dsat) {
        console.log(`  工作區: 線性區 (VDS = ${vds.toFixed(3)}V < VDS,sat = ${vds_dsat.toFixed(3)}V)`);
        console.log('✅ 測試 3 通過: MOSFET 工作在線性區\n');
        passed++;
      } else {
        console.log(`  工作區: 飽和區 (VDS = ${vds.toFixed(3)}V >= VDS,sat)`);
        console.log('⚠️  測試 3 未達線性區\n');
        failed++;
      }
    } else {
      console.log('❌ 測試 3 失敗: 模擬未收斂\n');
      failed++;
    }
  } catch (e: any) {
    console.log(`❌ 測試 3 異常: ${e.message}\n`);
    failed++;
  }

  // 總結
  console.log('\n' + '='.repeat(60));
  console.log('測試總結:');
  console.log(`  通過: ${passed}/3`);
  console.log(`  失敗: ${failed}/3`);
  console.log('='.repeat(60));
}

testMosfetBasicSwitch().catch(err => {
  console.error('\n模擬失敗:', err.message);
  process.exit(1);
});
