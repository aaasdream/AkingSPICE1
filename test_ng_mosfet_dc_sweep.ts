/**
 * DC Sweep 測試：驗證 NgMosfet IV 特性
 * 
 * 電路：Vdd(12V) -> R(10Ω) -> MOSFET -> GND
 * 
 * 掃描 Vgs: 0V → 10V，每次 DC 分析記錄 V_drain 和 I_drain
 * 驗證飽和區電流公式：I_D = 0.5 * KP * W/L * (Vgs - Vth)²
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { ResistorFactory } from './src/components/passive/resistor';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { NgMosfet } from './src/core/ngdevices/ng_mosfet';

async function testDCSweep() {
  console.log('='.repeat(80));
  console.log('測試：NgMosfet DC Sweep (Vgs: 0V → 10V)');
  console.log('='.repeat(80));

  const VDD = 12;
  const R = 10;
  const mosfetParams = {
    TYPE: 'NMOS' as const,
    VTO: 2.0,
    KP: 50e-6,
    W: 100e-6,
    L: 10e-6,
    LAMBDA: 0.01,
    PHI: 0.6,
    GAMMA: 0.5
  };

  console.log('\n電路參數:');
  console.log(`  Vdd: ${VDD}V`);
  console.log(`  R_load: ${R}Ω`);
  console.log(`\nMOSFET 參數:`);
  console.log(`  VTO: ${mosfetParams.VTO}V`);
  console.log(`  KP: ${mosfetParams.KP * 1e6}μA/V²`);
  console.log(`  W/L: ${mosfetParams.W / mosfetParams.L}`);

  console.log('\n開始 DC Sweep:');
  console.log('Vgs(V)\tVds(V)\tId(mA)\tExpected_Id(mA)\tRegion');
  console.log('-'.repeat(70));

  const vgsPoints = [];
  for (let vgs = 0; vgs <= 10; vgs += 1) {
    vgsPoints.push(vgs);
  }

  for (const vgs of vgsPoints) {
    // 創建電路
    const vdd = VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], VDD);
    const vgate = VoltageSourceFactory.createDC('Vgate', ['gate', '0'], vgs);
    const resistor = ResistorFactory.create('R1', ['vdd', 'n_drain'], R);
    const mosfet = new NgMosfet('M1', 'n_drain', 'gate', '0', '0', mosfetParams);

    // 配置 DC 分析
    const engine = new CircuitSimulationEngine({
      endTime: 0,  // DC only
      initialTimeStep: 0,
      maxTimeStep: 0,
      minTimeStep: 0
    });

    engine.addDevices([vdd, vgate, resistor, mosfet]);

    try {
      const result = await engine.runSimulation();

      if (result.success && result.waveformData) {
        const nodeMap = engine['_nodeMapping'] as Map<string, number>;
        const v_drain_idx = nodeMap.get('n_drain');
        // DC 分析時，waveformData 有一個時間點 (t=0)
        const v_drain = v_drain_idx !== undefined ? (result.waveformData.nodeVoltages.get(v_drain_idx)?.[0] ?? 0) : 0;
        const i_drain = (VDD - v_drain) / R;

        // 計算預期電流
        const vth = mosfetParams.VTO;
        let expected_id = 0;
        let region = 'Cutoff';

        if (vgs > vth) {
          const vov = vgs - vth;
          const beta = mosfetParams.KP * (mosfetParams.W / mosfetParams.L);
          const id_sat = 0.5 * beta * vov * vov;
          const vds_sat = vov;

          expected_id = id_sat;

          if (v_drain < vds_sat) {
            region = 'Linear';
          } else {
            region = 'Saturation';
          }
        }

        console.log(
          `${vgs.toFixed(1)}\t${v_drain.toFixed(3)}\t${(i_drain * 1e3).toFixed(3)}\t${(expected_id * 1e3).toFixed(3)}\t${region}`
        );
      } else {
        console.log(`${vgs.toFixed(1)}\t✗ FAILED`);
      }
    } catch (error) {
      console.log(`${vgs.toFixed(1)}\t✗ ERROR: ${error}`);
    }
  }

  console.log('-'.repeat(70));
  console.log('\n✅ DC Sweep 完成');
  console.log('='.repeat(80));
}

testDCSweep().catch(console.error);
