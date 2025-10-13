/**
 * 🔬 法醫級收斂失敗診斷工具
 * 
 * 目的：精確判斷收斂失敗是由於：
 * 1. 程式 BUG (兇殺案) - 錯誤的 MNA 貢獻、模型導數錯誤、索引錯誤
 * 2. 真實的數值剛性 (心臟病) - 極端剛性、模型不連續
 * 
 * @date 2025-10-13
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Inductor } from './src/components/passive/inductor';
import { Capacitor } from './src/components/passive/capacitor';
import { IntelligentMOSFET } from './src/core/devices/intelligent_mosfet';
import { IntelligentDiode } from './src/core/devices/intelligent_diode';
import type { MOSFETParameters, DiodeParameters } from './src/core/devices/intelligent_device_model';
import { Vector } from './src/math/sparse/vector';
import { SparseMatrix } from './src/math/sparse/matrix';
import * as fs from 'fs';

// ============================================================
// 工具函數：有限差分法驗證模型導數
// ============================================================

/**
 * 驗證 MOSFET 模型的解析導數是否與數值導數匹配
 */
function verifyMOSFETDerivatives(
  mosfet: IntelligentMOSFET,
  Vgs: number,
  Vds: number,
  Vbs: number = 0
): { passed: boolean; errors: any } {
  const epsilon = 1e-7; // 擾動量

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔬 驗證 MOSFET '${mosfet.name}' 導數`);
  console.log(`   工作點: Vgs=${Vgs.toFixed(4)}V, Vds=${Vds.toFixed(4)}V, Vbs=${Vbs.toFixed(4)}V`);
  console.log('='.repeat(70));

  try {
    // 獲取內部方法（需要繞過 TypeScript 的私有限制）
    const mosfetAny = mosfet as any;

    // 確定工作區域
    const region = mosfetAny._determineOperatingRegion(Vgs, Vds);
    console.log(`   工作區域: ${region}`);

    // 1. 獲取解析導數
    const analytical = mosfetAny._computeSmallSignalParameters(Vgs, Vds, Vbs, region);
    const analytical_gm = analytical.gm;
    const analytical_gds = analytical.gds;
    const analytical_gmbs = analytical.gmbs;

    // 2. 計算數值導數（中心差分法）
    
    // gm = ∂Id/∂Vgs
    const Id_center = mosfetAny._computeDCCharacteristics(Vgs, Vds, Vbs, region).Id;
    const Id_plus_Vgs = mosfetAny._computeDCCharacteristics(Vgs + epsilon, Vds, Vbs, region).Id;
    const Id_minus_Vgs = mosfetAny._computeDCCharacteristics(Vgs - epsilon, Vds, Vbs, region).Id;
    const numerical_gm = (Id_plus_Vgs - Id_minus_Vgs) / (2 * epsilon);

    // gds = ∂Id/∂Vds
    const Id_plus_Vds = mosfetAny._computeDCCharacteristics(Vgs, Vds + epsilon, Vbs, region).Id;
    const Id_minus_Vds = mosfetAny._computeDCCharacteristics(Vgs, Vds - epsilon, Vbs, region).Id;
    const numerical_gds = (Id_plus_Vds - Id_minus_Vds) / (2 * epsilon);

    // gmbs = ∂Id/∂Vbs
    const Id_plus_Vbs = mosfetAny._computeDCCharacteristics(Vgs, Vds, Vbs + epsilon, region).Id;
    const Id_minus_Vbs = mosfetAny._computeDCCharacteristics(Vgs, Vds, Vbs - epsilon, region).Id;
    const numerical_gmbs = (Id_plus_Vbs - Id_minus_Vbs) / (2 * epsilon);

    // 3. 計算相對誤差
    const gm_error = Math.abs(analytical_gm - numerical_gm) / (Math.abs(numerical_gm) + 1e-12);
    const gds_error = Math.abs(analytical_gds - numerical_gds) / (Math.abs(numerical_gds) + 1e-12);
    const gmbs_error = Math.abs(analytical_gmbs - numerical_gmbs) / (Math.abs(numerical_gmbs) + 1e-12);

    // 4. 輸出結果
    console.log('\n📊 導數對比:');
    console.log(`   Id (中心點) = ${Id_center.toExponential(4)} A`);
    console.log('\n   gm (∂Id/∂Vgs):');
    console.log(`     解析值: ${analytical_gm.toExponential(6)} S`);
    console.log(`     數值值: ${numerical_gm.toExponential(6)} S`);
    console.log(`     相對誤差: ${(gm_error * 100).toFixed(4)}%`);
    
    console.log('\n   gds (∂Id/∂Vds):');
    console.log(`     解析值: ${analytical_gds.toExponential(6)} S`);
    console.log(`     數值值: ${numerical_gds.toExponential(6)} S`);
    console.log(`     相對誤差: ${(gds_error * 100).toFixed(4)}%`);
    
    console.log('\n   gmbs (∂Id/∂Vbs):');
    console.log(`     解析值: ${analytical_gmbs.toExponential(6)} S`);
    console.log(`     數值值: ${numerical_gmbs.toExponential(6)} S`);
    console.log(`     相對誤差: ${(gmbs_error * 100).toFixed(4)}%`);

    // 5. 判斷
    const threshold = 1e-3; // 0.1% 誤差閾值
    const passed = gm_error < threshold && gds_error < threshold && gmbs_error < threshold;

    if (!passed) {
      console.log('\n🔥🔥🔥 導數不匹配！這很可能是 BUG 的根源！🔥🔥🔥');
    } else {
      console.log('\n✅ 導數驗證通過');
    }

    return {
      passed,
      errors: {
        gm: gm_error,
        gds: gds_error,
        gmbs: gmbs_error,
        threshold
      }
    };

  } catch (error) {
    console.error('❌ 驗證過程出錯:', error);
    return { passed: false, errors: { exception: error } };
  }
}

/**
 * 驗證 Diode 模型的解析導數
 */
function verifyDiodeDerivatives(
  diode: IntelligentDiode,
  Vd: number
): { passed: boolean; errors: any } {
  const epsilon = 1e-7;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔬 驗證 Diode '${diode.name}' 導數`);
  console.log(`   工作點: Vd=${Vd.toFixed(4)}V`);
  console.log('='.repeat(70));

  try {
    const diodeAny = diode as any;

    // 1. 獲取解析導數
    const analytical_gd = diodeAny._computeConductance(Vd);
    const I_center = diodeAny._computeDCCharacteristics(Vd).current;

    // 2. 計算數值導數
    const I_plus = diodeAny._computeDCCharacteristics(Vd + epsilon).current;
    const I_minus = diodeAny._computeDCCharacteristics(Vd - epsilon).current;
    const numerical_gd = (I_plus - I_minus) / (2 * epsilon);

    // 3. 計算相對誤差
    const gd_error = Math.abs(analytical_gd - numerical_gd) / (Math.abs(numerical_gd) + 1e-12);

    // 4. 輸出結果
    console.log('\n📊 導數對比:');
    console.log(`   Id (中心點) = ${I_center.toExponential(4)} A`);
    console.log('\n   gd (∂Id/∂Vd):');
    console.log(`     解析值: ${analytical_gd.toExponential(6)} S`);
    console.log(`     數值值: ${numerical_gd.toExponential(6)} S`);
    console.log(`     相對誤差: ${(gd_error * 100).toFixed(4)}%`);

    // 5. 判斷
    const threshold = 1e-3;
    const passed = gd_error < threshold;

    if (!passed) {
      console.log('\n🔥🔥🔥 導數不匹配！這很可能是 BUG 的根源！🔥🔥🔥');
    } else {
      console.log('\n✅ 導數驗證通過');
    }

    return {
      passed,
      errors: {
        gd: gd_error,
        threshold
      }
    };

  } catch (error) {
    console.error('❌ 驗證過程出錯:', error);
    return { passed: false, errors: { exception: error } };
  }
}

// ============================================================
// 工具函數：矩陣診斷
// ============================================================

/**
 * 診斷 MNA 矩陣的健康狀況
 */
function diagnoseMatrix(matrix: SparseMatrix, rhs: Vector): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log('🔬 MNA 矩陣診斷');
  console.log('='.repeat(70));

  const size = matrix.rows;
  console.log(`   矩陣大小: ${size}×${size}`);

  // 1. 檢查 NaN 和 Infinity
  let hasNaN = false;
  let hasInfinity = false;
  let minValue = Infinity;
  let maxValue = -Infinity;

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const val = matrix.get(i, j);
      if (isNaN(val)) {
        hasNaN = true;
        console.log(`   🔥 發現 NaN at (${i}, ${j})`);
      }
      if (!isFinite(val)) {
        hasInfinity = true;
        console.log(`   🔥 發現 Infinity at (${i}, ${j})`);
      }
      if (val !== 0) {
        minValue = Math.min(minValue, Math.abs(val));
        maxValue = Math.max(maxValue, Math.abs(val));
      }
    }
  }

  if (hasNaN || hasInfinity) {
    console.log('\n🔥🔥🔥 矩陣包含 NaN 或 Infinity！這是程式 BUG！🔥🔥🔥');
    return;
  }

  console.log(`\n   數值範圍:`);
  console.log(`     最小值 (非零): ${minValue.toExponential(2)}`);
  console.log(`     最大值: ${maxValue.toExponential(2)}`);
  console.log(`     動態範圍: ${(maxValue / minValue).toExponential(2)}`);

  // 2. 檢查對角線
  console.log('\n   對角線元素檢查:');
  let zeroOrNearZeroDiag = 0;
  for (let i = 0; i < size; i++) {
    const diag = matrix.get(i, i);
    if (Math.abs(diag) < 1e-15) {
      console.log(`     ⚠️ 對角線 [${i}] ≈ 0 (${diag.toExponential(2)})`);
      zeroOrNearZeroDiag++;
    }
  }
  if (zeroOrNearZeroDiag > 0) {
    console.log(`   🔥 有 ${zeroOrNearZeroDiag} 個對角線元素接近零！可能導致奇異矩陣`);
  } else {
    console.log(`     ✅ 所有對角線元素都非零`);
  }

  // 3. 檢查零行/零列
  console.log('\n   零行/零列檢查:');
  let zeroRows = 0;
  let zeroCols = 0;

  for (let i = 0; i < size; i++) {
    let rowSum = 0;
    for (let j = 0; j < size; j++) {
      rowSum += Math.abs(matrix.get(i, j));
    }
    if (rowSum < 1e-15) {
      console.log(`     ⚠️ 行 ${i} 幾乎全為零`);
      zeroRows++;
    }
  }

  for (let j = 0; j < size; j++) {
    let colSum = 0;
    for (let i = 0; i < size; i++) {
      colSum += Math.abs(matrix.get(i, j));
    }
    if (colSum < 1e-15) {
      console.log(`     ⚠️ 列 ${j} 幾乎全為零`);
      zeroCols++;
    }
  }

  if (zeroRows > 0 || zeroCols > 0) {
    console.log(`   🔥 有 ${zeroRows} 個零行和 ${zeroCols} 個零列！`);
  } else {
    console.log(`     ✅ 無零行/零列`);
  }

  // 4. 檢查 RHS
  console.log('\n   RHS 向量檢查:');
  let rhsHasNaN = false;
  let rhsHasInf = false;
  for (let i = 0; i < rhs.size; i++) {
    const val = rhs.get(i);
    if (isNaN(val)) rhsHasNaN = true;
    if (!isFinite(val)) rhsHasInf = true;
  }
  if (rhsHasNaN || rhsHasInf) {
    console.log(`     🔥 RHS 包含 NaN 或 Infinity！`);
  } else {
    console.log(`     ✅ RHS 正常`);
  }

  // 5. 估算條件數（簡化版：Frobenius 範數的比值）
  let frobNorm = 0;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const val = matrix.get(i, j);
      frobNorm += val * val;
    }
  }
  frobNorm = Math.sqrt(frobNorm);
  console.log(`\n   Frobenius 範數: ${frobNorm.toExponential(2)}`);
  
  if (maxValue / minValue > 1e12) {
    console.log(`   ⚠️ 極端的動態範圍 (> 10^12) 表明矩陣病態`);
  }
}

/**
 * 將矩陣和向量導出為 Python NumPy 格式，供外部驗證
 */
function exportForPythonVerification(
  matrix: SparseMatrix,
  rhs: Vector,
  filename: string = 'matrix_export.py'
): void {
  const size = matrix.rows;
  
  let pythonCode = `import numpy as np\nimport scipy.linalg\n\n`;
  pythonCode += `# 導出時間: ${new Date().toISOString()}\n\n`;
  
  // 導出矩陣
  pythonCode += `MNA_MATRIX = np.array([\n`;
  for (let i = 0; i < size; i++) {
    pythonCode += `    [`;
    for (let j = 0; j < size; j++) {
      pythonCode += matrix.get(i, j).toExponential(16);
      if (j < size - 1) pythonCode += ', ';
    }
    pythonCode += `]`;
    if (i < size - 1) pythonCode += ',';
    pythonCode += '\n';
  }
  pythonCode += `])\n\n`;
  
  // 導出 RHS
  pythonCode += `RHS_VECTOR = np.array([\n`;
  for (let i = 0; i < rhs.size; i++) {
    pythonCode += `    ${rhs.get(i).toExponential(16)}`;
    if (i < rhs.size - 1) pythonCode += ',';
    pythonCode += '\n';
  }
  pythonCode += `])\n\n`;
  
  // 添加驗證代碼
  pythonCode += `# 驗證代碼\n`;
  pythonCode += `print("Matrix shape:", MNA_MATRIX.shape)\n`;
  pythonCode += `print("RHS shape:", RHS_VECTOR.shape)\n\n`;
  
  pythonCode += `# 計算條件數\n`;
  pythonCode += `try:\n`;
  pythonCode += `    cond_num = np.linalg.cond(MNA_MATRIX)\n`;
  pythonCode += `    print(f"Condition Number: {cond_num:e}")\n`;
  pythonCode += `except:\n`;
  pythonCode += `    print("無法計算條件數")\n\n`;
  
  pythonCode += `# 嘗試求解\n`;
  pythonCode += `try:\n`;
  pythonCode += `    solution = np.linalg.solve(MNA_MATRIX, RHS_VECTOR)\n`;
  pythonCode += `    print("\\nNumPy 求解成功！")\n`;
  pythonCode += `    print("Solution:")\n`;
  pythonCode += `    print(solution)\n`;
  pythonCode += `    \n`;
  pythonCode += `    # 驗證\n`;
  pythonCode += `    residual = np.linalg.norm(MNA_MATRIX @ solution - RHS_VECTOR)\n`;
  pythonCode += `    print(f"\\nResidual: {residual:e}")\n`;
  pythonCode += `except np.linalg.LinAlgError as e:\n`;
  pythonCode += `    print(f"\\nNumPy 求解失敗: {e}")\n`;
  pythonCode += `    print("矩陣奇異，問題在於矩陣組裝，而非求解器")\n`;
  
  fs.writeFileSync(filename, pythonCode);
  console.log(`\n✅ 矩陣已導出至: ${filename}`);
  console.log(`   請在 Python 環境中執行此文件以進行外部驗證`);
}

// ============================================================
// 主診斷流程
// ============================================================

async function runDiagnosis() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   🔬 Buck 轉換器收斂失敗診斷 (Forensic Analysis)        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // 電路配置（與 test_buck_event_driven.ts 相同）
  const Vin = 12;
  const Vout_target = 5;
  const f_sw = 100e3;
  const L = 100e-6;
  const C = 100e-6;
  const R_load = 5;
  const duty_cycle = Vout_target / Vin;

  console.log('📐 電路配置:');
  console.log(`  Vin = ${Vin}V, Vout (目標) = ${Vout_target}V`);
  console.log(`  開關頻率 = ${f_sw/1000}kHz, 占空比 = ${(duty_cycle*100).toFixed(1)}%`);
  console.log(`  L = ${L*1e6}μH, C = ${C*1e6}μF, R_load = ${R_load}Ω\n`);

  // 創建引擎（使用更詳細的日誌）
  const engine = new CircuitSimulationEngine({
    endTime: 100e-6,
    initialTimeStep: 10e-9,
    minTimeStep: 1e-12,
    maxTimeStep: 1e-6,
    verboseLogging: true,  // 開啟詳細日誌
  });

  // 添加電路元件
  engine.addDevice(new VoltageSource('Vin', ['in', '0'], Vin));

  const period = 1 / f_sw;
  const pulse_width = duty_cycle * period;
  
  engine.addDevice(new VoltageSource('Vpwm', ['gate', '0'], 0, {
    type: 'PULSE',
    parameters: {
      v1: 0,
      v2: 10,
      delay: 1e-6,
      rise_time: 50e-9,
      fall_time: 50e-9,
      pulse_width: pulse_width,
      period: period
    }
  }));

  const mosfetParams: MOSFETParameters = {
    Vth: 2.0,
    Kp: 0.1,
    lambda: 0.01,
    Cgs: 100e-12,
    Cgd: 50e-12,
    Ron: 0.01,
    Roff: 1e12,
    Vmax: 50,
    Imax: 20
  };
  const M1 = new IntelligentMOSFET('M1', ['in', 'gate', 'sw'], mosfetParams);
  engine.addDevice(M1);

  const diodeParams: DiodeParameters = {
    Is: 1e-12,
    n: 1.0,
    Rs: 0.01,
    Cj0: 10e-12,
    Vj: 0.7,
    m: 0.5,
    tt: 0
  };
  const D1 = new IntelligentDiode('D1', ['0', 'sw'], diodeParams);
  engine.addDevice(D1);

  engine.addDevice(new Inductor('L1', ['sw', 'out'], L));
  engine.addDevice(new Capacitor('C1', ['out', '0'], C));
  engine.addDevice(new Resistor('R_load', ['out', '0'], R_load));

  console.log('⚙️  開始診斷性模擬...\n');
  
  // TODO: 需要修改 CircuitSimulationEngine 以暴露內部狀態
  // 這裡我們先展示診斷工具的使用方法

  // 步驟 1: 驗證模型導數（在不同工作點）
  console.log('\n' + '═'.repeat(70));
  console.log('步驟 1: 驗證設備模型導數');
  console.log('═'.repeat(70));

  // 測試幾個關鍵工作點
  const testPoints = [
    { Vgs: 0.5, Vds: 12, name: '截止區' },
    { Vgs: 2.5, Vds: 12, name: '飽和區' },
    { Vgs: 5.0, Vds: 0.5, name: '線性區' },
    { Vgs: 2.1, Vds: 10, name: '閾值附近' },
  ];

  let allPassed = true;
  for (const point of testPoints) {
    console.log(`\n--- 測試點: ${point.name} ---`);
    const result = verifyMOSFETDerivatives(M1, point.Vgs, point.Vds);
    if (!result.passed) {
      allPassed = false;
    }
  }

  // 測試二極體
  const diodeTestPoints = [
    { Vd: -1.0, name: '反向偏壓' },
    { Vd: 0.0, name: '零偏' },
    { Vd: 0.7, name: '順向導通' },
    { Vd: 0.5, name: '亞閾值' },
  ];

  for (const point of diodeTestPoints) {
    console.log(`\n--- 測試點: ${point.name} ---`);
    const result = verifyDiodeDerivatives(D1, point.Vd);
    if (!result.passed) {
      allPassed = false;
    }
  }

  console.log('\n' + '═'.repeat(70));
  if (allPassed) {
    console.log('✅ 所有模型導數驗證通過！');
    console.log('   結論: 模型導數正確，問題不在這裡');
  } else {
    console.log('🔥🔥🔥 發現模型導數錯誤！');
    console.log('   結論: 這很可能是收斂失敗的根本原因');
    console.log('   建議: 修正模型的 _computeSmallSignalParameters() 方法');
  }
  console.log('═'.repeat(70));

  console.log('\n\n提示：要完成完整的診斷，需要在 CircuitSimulationEngine 中添加診斷鉤子');
  console.log('參考上面的註釋修改 runSimulation() 方法');
}

// 執行診斷
runDiagnosis().catch(error => {
  console.error('💥 診斷過程中發生錯誤:', error);
  process.exit(1);
});
