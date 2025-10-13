/**
 * 最简单的二极管测试
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { IntelligentDiode, type DiodeParameters } from './src/core/devices/intelligent_diode';

async function testSimpleDiode() {
  console.log('='.repeat(80));
  console.log('🧪 最簡單的二極管測試 - 正向偏壓');
  console.log('='.repeat(80));

  const diodeParams: DiodeParameters = {
    Is: 1e-14,
    n: 1.0,
    Rs: 0.1,
    Cj0: 10e-12,
    Vj: 0.7,
    m: 0.5,
    tt: 0
  };

  // 最簡單電路：Vin (5V) -- D1 -- R (1kΩ) -- GND
  const engine = new CircuitSimulationEngine({
    endTime: 0,  // 只做 DC 分析
    initialTimeStep: 0.5e-6,
    maxTimeStep: 2e-6,
    minTimeStep: 1e-7
  });

  engine.addDevice(new VoltageSource('Vin', ['vin', '0'], 5));
  engine.addDevice(new Resistor('R1', ['vout', '0'], 1000));
  
  // 添加二極管：anode=vin, cathode=vout
  const diode = new IntelligentDiode('D1', ['vin', 'vout'], diodeParams);
  engine.addDevice(diode as any);  // 类型转换避免接口问题

  console.log('\n開始 DC 分析...\n');
  const result = await engine.runSimulation();

  console.log('\n' + '='.repeat(80));
  if (result.success) {
    console.log('✅ 測試成功！DC 分析收斂');
    
    // 打印節點電壓
    console.log('\n節點電壓:');
    for (const [nodeId, voltages] of result.waveformData.nodeVoltages) {
      if (voltages.length > 0) {
        console.log(`  Node ${nodeId}: ${voltages[0].toFixed(6)} V`);
      }
    }
    
    // 理論驗證：正向偏壓二極管，Vout 應該約為 Vin - 0.7V
    // 找到 vout 节点（通常是 nodeId=2）
    let vout: number | undefined;
    for (const [nodeId, voltages] of result.waveformData.nodeVoltages) {
      if (nodeId !== 0 && nodeId !== 1 && voltages.length > 0) {
        // 假设 nodeId=2 is vout (5V source is nodeId=1)
        vout = voltages[0];
        break;
      }
    }
    
    if (vout !== undefined) {
      const expectedVout = 5 - 0.7;  // Vin - Vd
      const error = Math.abs(vout - expectedVout);
      console.log(`\n物理驗證:`);
      console.log(`  期望 Vout ≈ ${expectedVout.toFixed(3)} V`);
      console.log(`  實際 Vout = ${vout.toFixed(6)} V`);
      console.log(`  誤差 = ${error.toFixed(6)} V (${(error/expectedVout*100).toFixed(2)}%)`);
      
      if (error < 0.1) {
        console.log(`  ✅ 物理結果正確！`);
      } else {
        console.log(`  ⚠️  誤差較大，可能需要調整模型`);
      }
    }
  } else {
    console.log('❌ 測試失敗！');
    console.log(`錯誤信息: ${result.errorMessage}`);
  }
  console.log('='.repeat(80));
}

testSimpleDiode().catch(error => {
  console.error('測試過程中發生錯誤:', error);
  process.exit(1);
});
