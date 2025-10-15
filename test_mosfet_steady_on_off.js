/**
 * MOSFET RL 穩態測試 - 先測試 ON/OFF 穩態
 * 避開 PWM 複雜性,分別測試:
 * 1. MOSFET OFF (Vgs=0V) - 電流應為 0
 * 2. MOSFET ON (Vgs=5V) - 電流穩態
 */

const path = require('path');
const modulePath = path.join(__dirname, 'dist', 'src');
const { CircuitSimulationEngine } = require(path.join(modulePath, 'core/simulation/circuit_simulation_engine'));
const { NgDeviceFactory } = require(path.join(modulePath, 'core/ngdevices/ng_device_factory'));
const { ResistorFactory } = require(path.join(modulePath, 'components/passive/resistor'));
const { InductorFactory } = require(path.join(modulePath, 'components/passive/inductor'));
const { VoltageSourceFactory } = require(path.join(modulePath, 'components/sources/voltage_source'));

console.log('============================================================');
console.log('⚡ MOSFET RL 穩態測試 (ON/OFF)');
console.log('============================================================\n');

const VDD = 12;
const R_LOAD = 10;
const L_LOAD = 100e-6;

async function testMosfetState(testName, Vgs, expectedCurrentRange) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 測試: ${testName} (Vgs=${Vgs}V)`);
  console.log('='.repeat(60));
  
  const engine = new CircuitSimulationEngine({
    endTime: 10e-6,  // 10µs
    voltageToleranceAbs: 1e-3,
    currentToleranceAbs: 1e-4,
    maxNewtonIterations: 50,
    minTimeStep: 1e-11,
    maxTimeStep: 1e-6,
    verboseLogging: false,
    enableLogging: true
  });

  const gnd = '0';
  const vdd = '1';
  const gate = '2';
  const drain = '3';
  const source = '4';
  const inductor_node = '5';

  console.log('🔧 電路: VDD → RD → MOSFET(D-S) → L → RS → GND');
  console.log(`   VDD=${VDD}V, Vgs=${Vgs}V, R=${R_LOAD}Ω, L=${L_LOAD*1e6}µH\n`);

  // 1. VDD 電源
  const v_supply = VoltageSourceFactory.createDC('VDD', [gnd, vdd], VDD);

  // 2. 固定閘極電壓 (ON or OFF)
  const v_gate = VoltageSourceFactory.createDC('VGATE', [gnd, gate], Vgs);

  // 3. MOSFET
  const mosfet = NgDeviceFactory.createNMOS('M1', drain, gate, source, gnd, {
    VTO: 1.0,
    KP: 10e-3,
    LAMBDA: 0.01,
    W: 10e-6,
    L: 10e-6,
    PHI: 0.6,
    GAMMA: 0.3
  });

  // 4. 負載電路
  const r_drain = ResistorFactory.create('RD', [vdd, drain], R_LOAD / 2);
  const inductor = InductorFactory.create('L1', [source, inductor_node], L_LOAD);
  const r_source = ResistorFactory.create('RS', [inductor_node, gnd], R_LOAD / 2);

  engine.addDevices([v_supply, v_gate, mosfet, r_drain, inductor, r_source]);

  const startTime = Date.now();

  // 超時保護
  const timeout = setTimeout(() => {
    console.error(`\n❌ 超時！已執行 ${(Date.now() - startTime) / 1000}s`);
    process.exit(1);
  }, 30000);  // 30秒超時

  try {
    const result = await engine.runSimulation();
    clearTimeout(timeout);
    
    const elapsed = Date.now() - startTime;
    
    console.log(`\n✅ 模擬完成！耗時 ${elapsed}ms`);
    console.log(`\n🔍 Result 結構:`, result ? Object.keys(result) : 'null');
    if (result) {
      console.log(`   - success: ${result.success}`);
      console.log(`   - waveformData 存在: ${!!result.waveformData}`);
      console.log(`   - results 存在: ${!!result.results}`);
      if (result.waveformData) {
        console.log(`   - waveformData keys:`, Object.keys(result.waveformData).slice(0, 10));
      }
      if (result.results) {
        console.log(`   - results keys:`, Object.keys(result.results).slice(0, 10));
      }
    }
    
    // 分析結果
    if (result && result.waveformData) {
      const time = result.waveformData.timePoints || result.waveformData.time || [];
      const n = time.length;
      
      if (n === 0) {
        console.log('⚠️  無時間數據');
        return false;
      }
      
      console.log(`\n📊 時間點數: ${n}`);
      console.log(`   時間範圍: [${time[0].toExponential(3)}, ${time[n-1].toExponential(3)}]`);
      
      // deviceCurrents 是 Map, 不是普通物件!
      const deviceCurrents = result.waveformData.deviceCurrents;
      if (!deviceCurrents || !(deviceCurrents instanceof Map)) {
        console.log('⚠️  deviceCurrents 不是 Map');
        return false;
      }
      
      console.log(`\n🔍 可用電流數據:`, Array.from(deviceCurrents.keys()));
      
      // 電感是 L1
      if (!deviceCurrents.has('L1')) {
        console.log('⚠️  找不到 L1 電感電流數據');
        return false;
      }
      
      const iL = deviceCurrents.get('L1') || [];
      console.log(`   使用電流: L1`);
      
      if (iL.length === 0) {
        console.log('⚠️  電感電流數據為空');
        return false;
      }
      
      // 最終穩態電流
      const iFinal = iL[n - 1];
      const iMid = iL[Math.floor(n / 2)];
      const iStart = iL[0];
      
      console.log(`\n🔌 電感電流:`);
      console.log(`   起始: ${iStart.toExponential(3)} A`);
      console.log(`   中點: ${iMid.toExponential(3)} A`);
      console.log(`   終點: ${iFinal.toExponential(3)} A`);
      
      // 計算電流變化率
      const diStart = Math.abs(iL[Math.min(10, n-1)] - iStart);
      const diFinal = Math.abs(iFinal - iL[Math.max(0, n-10)]);
      
      console.log(`\n📈 電流變化:`);
      console.log(`   起始變化: ${diStart.toExponential(3)} A`);
      console.log(`   終點變化: ${diFinal.toExponential(3)} A`);
      
      // 檢查穩態
      const isStable = diFinal < 1e-6;
      console.log(`   穩態判定: ${isStable ? '✅ 已穩定' : '⚠️ 仍在變化'}`);
      
      // 驗證期望範圍
      if (expectedCurrentRange) {
        const [imin, imax] = expectedCurrentRange;
        const inRange = iFinal >= imin && iFinal <= imax;
        console.log(`\n🎯 期望電流: [${imin.toExponential(2)}, ${imax.toExponential(2)}] A`);
        console.log(`   實際電流: ${iFinal.toExponential(3)} A`);
        console.log(`   驗證: ${inRange ? '✅ 通過' : '❌ 失敗'}`);
        return inRange && isStable;
      }
      
      return isStable;
      
    } else {
      console.log('❌ 無波形數據');
      return false;
    }
    
  } catch (error) {
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;
    console.log(`\n❌ 模擬失敗 (${elapsed}ms)`);
    console.log(`失敗原因: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🎯 測試計劃:');
  console.log('   1. MOSFET OFF (Vgs=0V) - 預期電流 ≈ 0');
  console.log('   2. MOSFET ON (Vgs=5V) - 預期電流 > 0\n');
  
  // 測試 1: MOSFET OFF
  const test1Pass = await testMosfetState(
    'MOSFET OFF',
    0,          // Vgs = 0V (低於 VTO=1V)
    [0, 1e-6]   // 期望電流接近 0
  );
  
  // 測試 2: MOSFET ON  
  const test2Pass = await testMosfetState(
    'MOSFET ON',
    5,          // Vgs = 5V (遠高於 VTO=1V)
    [0.05, 0.15]  // 期望電流 50~150mA (Level 1: Id=KP/2*(W/L)*(Vgs-VTO)^2 ≈ 80mA)
  );
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試總結');
  console.log('='.repeat(60));
  console.log(`   MOSFET OFF: ${test1Pass ? '✅ 通過' : '❌ 失敗'}`);
  console.log(`   MOSFET ON:  ${test2Pass ? '✅ 通過' : '❌ 失敗'}`);
  console.log(`\n   總體結果: ${test1Pass && test2Pass ? '✅ 全部通過' : '❌ 有測試失敗'}`);
  console.log('='.repeat(60));
}

main();
