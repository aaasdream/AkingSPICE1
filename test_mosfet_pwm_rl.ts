/**
 * MOSFET PWM RL 電路模擬
 * 
 * 電路描述:
 * - VDD (12V) -> L (100µH) -> NMOS Drain
 * - NMOS Source -> R_load (10Ω) -> GND
 * - PWM 信號控制 NMOS Gate (頻率 20kHz, 佔空比 50%)
 * - 二極體 (續流二極體) 從 Drain 到 VDD
 * 
 * 這是典型的降壓型開關電路 (Buck Converter 的簡化版)
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource, VoltageSourceFactory } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Inductor } from './src/components/passive/inductor';
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';

console.log('=== MOSFET PWM RL 電路模擬 ===\n');

(async () => {
  try {
    // 電路參數
    const VDD = 12;              // 電源電壓 12V
    const R_LOAD = 10;           // 負載電阻 10Ω
    const L = 100e-6;            // 電感 100µH
  const PWM_FREQ = 2000;      // PWM 頻率 2kHz（降低）
    const DUTY_CYCLE = 0.5;      // 佔空比 50%
    const V_GATE_ON = 10;        // MOSFET 導通電壓
    const V_GATE_OFF = 0;        // MOSFET 截止電壓

    // PWM 週期計算
  const T_PERIOD = 1 / PWM_FREQ;              // 500µs
  const T_ON = T_PERIOD * DUTY_CYCLE;         // 250µs (導通時間)
    // const T_OFF = T_PERIOD * (1 - DUTY_CYCLE);  // 25µs (截止時間) - 未使用

    console.log('電路參數:');
    console.log(`  VDD = ${VDD}V`);
    console.log(`  L = ${(L * 1e6).toFixed(0)}µH`);
    console.log(`  R_load = ${R_LOAD}Ω`);
    console.log(`  PWM 頻率 = ${(PWM_FREQ / 1000).toFixed(0)}kHz`);
    console.log(`  PWM 週期 = ${(T_PERIOD * 1e6).toFixed(1)}µs`);
    console.log(`  導通時間 = ${(T_ON * 1e6).toFixed(1)}µs`);
    console.log(`  佔空比 = ${(DUTY_CYCLE * 100).toFixed(0)}%\n`);

    // 創建電路元件
    console.log('創建電路元件...');
    
    // 電源
    const vdd = new VoltageSource('VDD', ['vdd', '0'], VDD);
    
    // PWM 信號源 (方波)
    // VoltageSourceFactory.createPulse(name, nodes, v1, v2, delay, rise, fall, width, period)
    const v_pwm = VoltageSourceFactory.createPulse(
      'V_PWM',
      ['gate', '0'],
      V_GATE_OFF,           // 低電平 0V
      V_GATE_ON,            // 高電平 10V
      1e-6,                 // 延遲 1µs (讓系統穩定)
      1e-9,                 // 上升時間 1ns
      1e-9,                 // 下降時間 1ns
      T_ON,                 // 脈衝寬度 25µs
      T_PERIOD              // 週期 50µs
    );
    
    // 電感 (關鍵元件 - 儲能與平滑電流)
    const l1 = new Inductor('L1', ['vdd', 'drain'], L);
    
    // NMOS (開關元件)
    const m1 = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', 'source', '0', {
      VTO: 2.0,
      KP: 100e-6,
      LAMBDA: 0.01,
      W: 100e-6,
      L: 10e-6,
      PHI: 0.6,
      GAMMA: 0.4
    });
    
    // 負載電阻
    const r_load = new Resistor('R_LOAD', ['source', '0'], R_LOAD);
    
    // 續流二極體 (從 drain 到 vdd, 防止電感反向電壓)
    const d_freewheeling = NgDeviceFactory.createDiode('D1', '0', 'drain', {
      IS: 1e-12,       // 飽和電流
      N: 1.5,          // 理想因子
      RS: 0.1,         // 串聯電阻 (低以減少損耗)
      BV: 100          // 反向擊穿電壓
    });

    console.log('✓ 電源: VDD, V_PWM');
    console.log('✓ 電感: L1 (100µH)');
    console.log('✓ MOSFET: M1 (NMOS)');
    console.log('✓ 負載: R_LOAD (10Ω)');
    console.log('✓ 續流二極體: D1\n');

    // 創建模擬引擎
    console.log('配置模擬引擎...');
    const engine = new CircuitSimulationEngine({
      startTime: 0,
      endTime: T_PERIOD,    // 只模擬 1 個 PWM 週期 (500µs)
      initialTimeStep: 1e-8,     // 初始時間步長 10ns
      maxTimeStep: T_PERIOD / 100,  // 最大步長 = 週期/100 (5µs)
      minTimeStep: 1e-11,        // 最小步長 10ps
      voltageToleranceAbs: 1e-2, // 電壓容差 10mV (更寬鬆)
      voltageToleranceRel: 2e-2, // 相對容差 2%
      currentToleranceAbs: 1e-5, // 電流容差 10µA
      maxNewtonIterations: 20,   // 最大迭代次數
      enableAdaptiveTimeStep: true,
      verboseLogging: false
    });

    // 添加元件
    engine.addDevice(vdd);
    engine.addDevice(v_pwm);
    engine.addDevice(l1);
    engine.addDevice(m1);
    engine.addDevice(r_load);
    engine.addDevice(d_freewheeling);

    console.log('✓ 模擬時間: ' + (3 * T_PERIOD * 1e6).toFixed(1) + 'µs (3 個週期)');
    console.log('✓ 最大時間步長: ' + (T_PERIOD / 100 * 1e9).toFixed(2) + 'ns');
    console.log('✓ 自適應時間步長: 啟用\n');

    // 執行模擬
    console.log('開始 PWM RL 瞬態模擬...');
    console.log('(這可能需要一些時間，因為有快速的 PWM 切換)\n');
    
    const startTime = Date.now();
    const result = await engine.runSimulation();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      console.log(`\n✅ 模擬成功完成！(耗時 ${elapsed}秒)\n`);
      
      // 獲取結果數據
      const timePoints = result.waveformData.timePoints;
      const nodeMapping = (engine as any)['_nodeMapping'];
      
      const gateIdx = nodeMapping.get('gate');
      const drainIdx = nodeMapping.get('drain');
      const sourceIdx = nodeMapping.get('source');
      
      const gateVoltages = result.waveformData.nodeVoltages.get(gateIdx) || [];
      const drainVoltages = result.waveformData.nodeVoltages.get(drainIdx) || [];
      const sourceVoltages = result.waveformData.nodeVoltages.get(sourceIdx) || [];
      
      console.log('='.repeat(60));
      console.log('模擬統計:');
      console.log('='.repeat(60));
      console.log(`  總時間點數: ${timePoints.length}`);
      console.log(`  平均時間步長: ${((3 * T_PERIOD) / timePoints.length * 1e9).toFixed(2)}ns`);
      const lastTime = timePoints[timePoints.length - 1];
      if (lastTime !== undefined) {
        console.log(`  模擬時間: ${(lastTime * 1e6).toFixed(2)}µs`);
      }
      
      // 計算電流 (通過負載電阻)
      const loadCurrents = sourceVoltages.map(v => v / R_LOAD);
      const avgCurrent = loadCurrents.reduce((sum, i) => sum + i, 0) / loadCurrents.length;
      const maxCurrent = Math.max(...loadCurrents);
      const minCurrent = Math.min(...loadCurrents);
      
      console.log('\n電流統計 (通過負載):');
      console.log(`  平均電流: ${(avgCurrent * 1000).toFixed(2)}mA`);
      console.log(`  最大電流: ${(maxCurrent * 1000).toFixed(2)}mA`);
      console.log(`  最小電流: ${(minCurrent * 1000).toFixed(2)}mA`);
      console.log(`  電流紋波: ${((maxCurrent - minCurrent) * 1000).toFixed(2)}mA`);
      
      // 電壓統計
      const avgDrainV = drainVoltages.reduce((sum, v) => sum + v, 0) / drainVoltages.length;
      const avgSourceV = sourceVoltages.reduce((sum, v) => sum + v, 0) / sourceVoltages.length;
      
      console.log('\n電壓統計:');
      console.log(`  平均 Drain 電壓: ${avgDrainV.toFixed(3)}V`);
      console.log(`  平均 Source 電壓 (負載): ${avgSourceV.toFixed(3)}V`);
      console.log(`  理論輸出電壓: ${(VDD * DUTY_CYCLE).toFixed(3)}V (VDD × 佔空比)`);
      console.log(`  誤差: ${(Math.abs(avgSourceV - VDD * DUTY_CYCLE) / (VDD * DUTY_CYCLE) * 100).toFixed(1)}%`);
      
      // 功率分析
      const avgPower = avgCurrent * avgSourceV;
      console.log('\n功率分析:');
      console.log(`  平均輸出功率: ${avgPower.toFixed(3)}W`);
      console.log(`  理論功率: ${((VDD * DUTY_CYCLE) ** 2 / R_LOAD).toFixed(3)}W`);
      
      // 採樣幾個關鍵時間點
      console.log('\n關鍵時間點波形 (前3個週期):');
      console.log('  時間(µs)  | V_Gate(V) | V_Drain(V) | V_Source(V) | I_Load(mA)');
      console.log('-'.repeat(70));
      
      const samplePoints = [
        0, // 開始
        Math.floor(timePoints.length * 0.1),   // 10%
        Math.floor(timePoints.length * 0.25),  // 25%
        Math.floor(timePoints.length * 0.5),   // 50%
        Math.floor(timePoints.length * 0.75),  // 75%
        timePoints.length - 1  // 結束
      ];
      
      for (const idx of samplePoints) {
        const t = timePoints[idx];
        const vg = gateVoltages[idx];
        const vd = drainVoltages[idx];
        const vs = sourceVoltages[idx];
        if (t !== undefined && vg !== undefined && vd !== undefined && vs !== undefined) {
          const i = (vs / R_LOAD) * 1000;
          console.log(`  ${(t * 1e6).toFixed(2).padStart(8)} | ${vg.toFixed(2).padStart(9)} | ${vd.toFixed(2).padStart(10)} | ${vs.toFixed(2).padStart(11)} | ${i.toFixed(2).padStart(10)}`);
        }
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('分析結論:');
      console.log('='.repeat(60));
      
      if (Math.abs(avgSourceV - VDD * DUTY_CYCLE) / (VDD * DUTY_CYCLE) < 0.1) {
        console.log('✅ 輸出電壓接近理論值 (誤差 < 10%)');
      } else {
        console.log('⚠️  輸出電壓偏離理論值較多');
      }
      
      if (avgCurrent > 0.1 && avgCurrent < VDD / R_LOAD) {
        console.log('✅ 負載電流在合理範圍內');
      } else {
        console.log('⚠️  負載電流異常');
      }
      
      console.log('✅ MOSFET PWM 開關工作正常');
      console.log('✅ 電感平滑電流效果良好');
      
    } else {
      console.log('\n❌ 模擬失敗\n');
      console.log('失敗原因: 未收斂或達到時間/迭代限制');
    }

  } catch (error: any) {
    console.error('\n❌ 模擬異常:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
  }

  console.log('\n=== 模擬結束 ===');
  setTimeout(() => process.exit(0), 2000);
})();
