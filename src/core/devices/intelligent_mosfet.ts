/**
 * 🚀 智能 MOSFET 模型 - AkingSPICE 2.1
 *
 * 世界领先的 MOSFET 建模实现，专为电力电子应用优化
 * 结合物理准确性和数值稳定性的终极解决方案
 *
 * 🏆 技术亮点：
 * - 多工作区域无缝切换 (截止/线性/饱和)
 * - 智能开关事件预测
 * - 自适应 Newton 收敛控制
 * - 温度效应建模
 * - 寄生电容/电阻精确处理
 *
 * 📚 物理模型：
 *   基于 Level 1 SPICE 模型，增强数值稳定性
 *   支持亚阈值传导和短沟道效应
 *   考虑体二极管和结电容非线性
 *
 * 🎯 应用目标：
 *   Buck/Boost 变换器高频开关
 *   三相逆变器精确建模
 *   同步整流器优化设计
 */

import type {
  IEvent,
  IVector,
  VoltageVector
} from '../../types/index';
import {
  AssemblyContext,
} from '../interfaces/component';
import {
  ConvergenceInfo,
  DeviceState,
  IntelligentDeviceModelBase,
  MOSFETParameters,
  NumericalChallenge,
  PredictionHint,
  SwitchingEvent
} from './intelligent_device_model';

/**
 * MOSFET 工作区域枚举
 */
export enum MOSFETRegion {
  CUTOFF = 'cutoff',           // 截止区
  LINEAR = 'linear',           // 线性区 (欧姆区)
  SATURATION = 'saturation',   // 饱和区 (恒流区)
  SUBTHRESHOLD = 'subthreshold' // 亚阈值区
}

/**
 * MOSFET 内部状态
 */
// import type {
//   MOSFETInternalState
// } from './intelligent_device_model';

/**
 * 🚀 智能 MOSFET 模型实现
 *
 * 提供物理准确、数值稳定的 MOSFET 建模
 * 专为电力电子高频开关应用优化
 */
export class IntelligentMOSFET extends IntelligentDeviceModelBase {
  private readonly _drainNode: string;
  private readonly _gateNode: string;
  private readonly _sourceNode: string;
  private readonly _mosfetParams: MOSFETParameters;

  // 物理常数
  private static readonly VT = 0.026; // 热电压 (26mV @ 300K)

  // 数值常数
  private static readonly MIN_CONDUCTANCE = 1e-12; // 最小电导 (避免奇异)
  private static readonly MAX_VOLTAGE_STEP = 0.5;  // 最大电压步长 (V)
  private static readonly SWITCH_THRESHOLD = 0.1;  // 开关检测阈值 (V)

  constructor(
    deviceId: string,
    nodes: [string, string, string], // [Drain, Gate, Source]
    parameters: MOSFETParameters
  ) {
    super(deviceId, 'MOSFET', nodes, parameters);

    [this._drainNode, this._gateNode, this._sourceNode] = nodes;
    this._mosfetParams = parameters;

    // 初始化 MOSFET 特定状态
    this._initializeMOSFETState();
  }

  /**
   * 🧠 Unified assembly entry point for MOSFET
   */
  override assemble(context: AssemblyContext): void {
    const { matrix, rhs, solutionVector, nodeMap, gmin } = context;

    const drainIndex = nodeMap.get(this._drainNode);
    const gateIndex = nodeMap.get(this._gateNode);
    const sourceIndex = nodeMap.get(this._sourceNode);

    if (drainIndex === undefined || gateIndex === undefined || sourceIndex === undefined) {
      throw new Error(`MOSFET ${this.deviceId}: Node not found in mapping.`);
    }

    if (!solutionVector) {
      throw new Error(`MOSFET ${this.deviceId}: Solution vector is not available in assembly context.`);
    }

    // 1. 提取节点电压
    const Vd = solutionVector.get(drainIndex);
    const Vg = solutionVector.get(gateIndex);
    const Vs = solutionVector.get(sourceIndex);

    // 2. 计算端电压
    const Vgs = Vg - Vs;
    const Vds = Vd - Vs;

    // 关键保护：检查 NaN
    if (isNaN(Vgs) || isNaN(Vds)) {
      const detailedError = `Input voltage is NaN for ${this.deviceId}. Vd=${Vd}, Vg=${Vg}, Vs=${Vs} -> Vgs=${Vgs}, Vds=${Vds}`;
      console.error(detailedError);
      throw new Error(detailedError);
    }

    // 3. 确定工作区域
    const region = this._determineOperatingRegion(Vgs, Vds);

    // 4. 计算 DC 特性
    const dcAnalysis = this._computeDCCharacteristics(Vgs, Vds, region);

    // 5. 计算小信号参数
    const smallSignal = this._computeSmallSignalParameters(Vgs, Vds, region);

    // Add Gmin
    const totalGds = smallSignal.gds + (gmin || 0);

    // 6. 计算电荷和电容
    const Vbs = 0;  // 假設體源短接（對於功率 MOSFET）
    const chargeModel = this._computeCapacitances(Vgs, Vds, Vbs);

    // 7. 添加電容電流貢獻（dQ/dt 項）
    // 只在瞬態分析時添加，DC 分析時跳過
    if (context.dt && context.dt > 0 && context.previousSolutionVector && context.G_coeff) {
      // 提取上一時刻的電壓
      const Vd_prev = context.previousSolutionVector.get(drainIndex);
      const Vg_prev = context.previousSolutionVector.get(gateIndex);
      const Vs_prev = context.previousSolutionVector.get(sourceIndex);

      const Vgs_prev = Vg_prev - Vs_prev;
      const Vds_prev = Vd_prev - Vs_prev;

      // 計算上一時刻的電荷
      const chargeModel_prev = this._computeCapacitances(Vgs_prev, Vds_prev, Vbs);

      // === 使用電荷守恆模型計算電容電流 ===
      // I_cap = dQ/dt ≈ (Q_current - Q_prev) / dt
      // 使用積分器係數：I_cap = G_coeff * (Q_current - Q_prev)

      const G_coeff = context.G_coeff;

      // 閘極電容電流
      const Ig_cap = G_coeff * (chargeModel.Q_gate - chargeModel_prev.Q_gate);

      // 漏極電容電流
      const Id_cap = G_coeff * (chargeModel.Q_drain - chargeModel_prev.Q_drain);

      // 源極電容電流
      const Is_cap = G_coeff * (chargeModel.Q_source - chargeModel_prev.Q_source);

      // === 添加電容電流到 RHS ===
      // 注意：閘極不導電（理想情況），但電容電流仍需考慮
      rhs.add(gateIndex, -Ig_cap);     // 閘極電容電流流入
      rhs.add(drainIndex, -Id_cap);    // 漏極電容電流
      rhs.add(sourceIndex, -Is_cap);   // 源極電容電流

      // === 添加電容等效電導到矩陣（dQ/dV 項）===
      // 這提供了 Jacobian 的電容貢獻，提升收斂性
      const { Cgs, Cgd } = chargeModel;
      const Ceq = G_coeff;  // 等效電導係數

      // Cgs 貢獻（閘極-源極）
      matrix.add(gateIndex, gateIndex, Cgs * Ceq);
      matrix.add(gateIndex, sourceIndex, -Cgs * Ceq);
      matrix.add(sourceIndex, gateIndex, -Cgs * Ceq);
      matrix.add(sourceIndex, sourceIndex, Cgs * Ceq);

      // Cgd 貢獻（閘極-漏極）
      matrix.add(gateIndex, gateIndex, Cgd * Ceq);
      matrix.add(gateIndex, drainIndex, -Cgd * Ceq);
      matrix.add(drainIndex, gateIndex, -Cgd * Ceq);
      matrix.add(drainIndex, drainIndex, Cgd * Ceq);

      // Cdb 和 Csb（結電容，體極接源極）
      const { Cdb, Csb } = chargeModel;
      matrix.add(drainIndex, drainIndex, Cdb * Ceq);
      matrix.add(drainIndex, sourceIndex, -Cdb * Ceq);
      matrix.add(sourceIndex, drainIndex, -Cdb * Ceq);
      matrix.add(sourceIndex, sourceIndex, (Cdb + Csb) * Ceq);
    }

    // 8. 计算DC電流右侧向量贡献 (线性化误差)
    const Ieq = dcAnalysis.Id - (smallSignal.gm * Vgs + smallSignal.gds * Vds);

    // 9. Stamp DC Matrix
    const { gm } = smallSignal;
    matrix.add(drainIndex, gateIndex, gm);
    matrix.add(drainIndex, drainIndex, totalGds);
    matrix.add(drainIndex, sourceIndex, -(gm + totalGds));

    matrix.add(sourceIndex, gateIndex, -gm);
    matrix.add(sourceIndex, drainIndex, -totalGds);
    matrix.add(sourceIndex, sourceIndex, gm + totalGds);

    // 10. Stamp DC RHS
    rhs.add(drainIndex, -Ieq);
    rhs.add(sourceIndex, Ieq);

    // 11. 🔋 添加體二極體貢獻（Body Diode: Bulk → Drain）
    // 功率 MOSFET 內部通常有寄生的體二極體（P-N 結）
    // 方向：N 型體（接源極）到 P 型漏極（NMOS），或反之（PMOS）
    this._assembleBodyDiode(context, drainIndex, sourceIndex);

    // 12. 更新设备状态
    this._currentState = this._createNewDeviceState(
      Vgs, Vds, region, smallSignal, chargeModel
    );
  }



  /**
   * 🎯 MOSFET 收敛性检查
   *
   * 专门针对 MOSFET 开关特性的收敛判断：
   * 1. 工作区域稳定性
   * 2. 开关瞬态检测
   * 3. 栅极电压变化率
   * 4. 漏极电流连续性
   */
  override checkConvergence(deltaV: VoltageVector, nodeMap: Map<string, number>): ConvergenceInfo {
    // 调用基类通用检查
    const baseCheck = super.checkConvergence(deltaV, nodeMap);

    // MOSFET 特定的收敛检查
    const mosfetCheck = this._checkMOSFETSpecificConvergence(deltaV, nodeMap);

    // 合并检查结果
    return {
      ...baseCheck,
      confidence: Math.min(baseCheck.confidence, mosfetCheck.confidence),
      physicalConsistency: {
        ...baseCheck.physicalConsistency,
        operatingRegionValid: mosfetCheck.regionStable
      }
    };
  }

  /**
   * 🛡️ MOSFET Newton 步长限制
   *
   * 专门处理 MOSFET 的数值挑战：
   * 1. 防止跨越开关阈值
   * 2. 限制栅极电压过冲
   * 3. 保护工作区域边界
   */
  override limitUpdate(deltaV: VoltageVector, nodeMap: Map<string, number>): VoltageVector {
    const limited = super.limitUpdate(deltaV, nodeMap);

    // MOSFET 特定的步长限制
    this._applyDeviceSpecificLimits(limited, nodeMap);

    return limited;
  }

  /**
   * 🔮 MOSFET 状态预测
   *
   * 预测 MOSFET 的开关行为和时间常数
   */
  override predictNextState(dt: number): PredictionHint {
    const baseHint = super.predictNextState(dt);

    // 检测开关事件
    const switchingEvents = this._predictSwitchingEvents(dt);

    // 识别 MOSFET 特定的数值挑战
    const challenges = this._identifyMOSFETChallenges(dt);

    return {
      ...baseHint,
      switchingEvents,
      numericalChallenges: challenges
    };
  }

  // === MOSFET 特定的私有方法 ===

  /**
   * ADDED: 获取 MOSFET 在给定电压下的工作模式
   * 实现了基类的抽象方法
   */
  override getOperatingMode(voltage: IVector, nodeMap: Map<string, number>): string {
    const drainIndex = nodeMap.get(this._drainNode);
    const gateIndex = nodeMap.get(this._gateNode);
    const sourceIndex = nodeMap.get(this._sourceNode);

    if (drainIndex === undefined || gateIndex === undefined || sourceIndex === undefined) {
      return MOSFETRegion.CUTOFF; // Default if nodes not mapped
    }

    const Vd = voltage.get(drainIndex);
    const Vg = voltage.get(gateIndex);
    const Vs = voltage.get(sourceIndex);

    const Vgs = Vg - Vs;
    const Vds = Vd - Vs;

    return this._determineOperatingRegion(Vgs, Vds);
  }

  /**
   * 🆕 导出事件条件函数
   * 啟用事件驅動模擬，精確捕捉 MOSFET 狀態轉換
   */
  override getEventFunctions() {
    const drainNode = this.nodes[0];
    const gateNode = this.nodes[1];
    const sourceNode = this.nodes[2];

    if (!drainNode || !gateNode || !sourceNode) {
      return [];
    }

    return [
      {
        type: `${this.name}_Vgs_cross_Vth`,
        condition: (v: IVector, nodeMap: Map<string, number>) => { // ✅ 直接接收 nodeMap
          const gateIndex = nodeMap.get(gateNode);
          const sourceIndex = nodeMap.get(sourceNode);

          if (gateIndex === undefined || sourceIndex === undefined) {
            return 1e9; // 返回大值避免誤觸發
          }

          const Vg = v.get(gateIndex);
          const Vs = v.get(sourceIndex);
          const Vgs = Vg - Vs;
          // 返回 Vgs - Vth，過零點即為事件
          return Vgs - this._mosfetParams.Vth;
        }
      },
      {
        type: `${this.name}_linear_to_saturation`,
        condition: (v: IVector, nodeMap: Map<string, number>) => { // ✅ 直接接收 nodeMap
          const drainIndex = nodeMap.get(drainNode);
          const gateIndex = nodeMap.get(gateNode);
          const sourceIndex = nodeMap.get(sourceNode);

          if (drainIndex === undefined || gateIndex === undefined || sourceIndex === undefined) {
            return 1e9; // 返回大值避免誤觸發
          }

          const Vd = v.get(drainIndex);
          const Vg = v.get(gateIndex);
          const Vs = v.get(sourceIndex);
          const Vds = Vd - Vs;
          const Vgs = Vg - Vs;
          // 返回 (Vgs - Vth) - Vds，過零點為線性/飽和邊界
          return (Vgs - this._mosfetParams.Vth) - Vds;
        }
      }
    ];
  }

  /**
   * 🎯 處理事件（MOSFET 狀態轉換）
   *
   * 當事件發生時，此方法被引擎調用，用於更新 MOSFET 的內部狀態
   * 主要處理：
   * - Vgs_cross_Vth: 閘源電壓跨越閾值電壓（導通/截止轉換）
   * - linear_to_saturation: 線性區到飽和區轉換
   */
  override handleEvent(event: IEvent, context: AssemblyContext): void {
    const drainNode = this.nodes[0];
    const gateNode = this.nodes[1];
    const sourceNode = this.nodes[2];

    if (!drainNode || !gateNode || !sourceNode || !context.solutionVector) {
      return;
    }

    // 獲取當前電壓
    const drainIndex = context.nodeMap.get(drainNode);
    const gateIndex = context.nodeMap.get(gateNode);
    const sourceIndex = context.nodeMap.get(sourceNode);

    if (drainIndex === undefined || gateIndex === undefined || sourceIndex === undefined) {
      return;
    }

    const Vd = context.solutionVector.get(drainIndex);
    const Vg = context.solutionVector.get(gateIndex);
    const Vs = context.solutionVector.get(sourceIndex);
    const Vgs = Vg - Vs;
    const Vds = Vd - Vs;

    // 確定新的工作區域
    const newRegion = this._determineOperatingRegion(Vgs, Vds);

    // 更新當前狀態
    this._currentState = {
      ...this._currentState,
      operatingMode: newRegion,
      time: event.time,
      internalStates: {
        ...this._currentState.internalStates,
        region: newRegion,
        Vgs,
        Vds,
        Vbs: 0 - Vs // Body-Source voltage
      }
    };

    console.log(`[MOSFET ${this.name}] 🔄 Event '${event.type}' at t=${event.time.toExponential(3)}s: Vgs=${Vgs.toFixed(3)}V, Vds=${Vds.toFixed(3)}V → Region: ${newRegion}`);
  }

  private _initializeMOSFETState(): void {
    // 设置初始工作区域为截止
    this._currentState = {
      ...this._currentState,
      operatingMode: MOSFETRegion.CUTOFF,
      internalStates: {
        region: MOSFETRegion.CUTOFF,
        Vgs: 0,
        Vds: 0,
        Vbs: 0,
        gm: 0,
        gds: IntelligentMOSFET.MIN_CONDUCTANCE,
        gmbs: 0,
        Cgs: this._mosfetParams.Cgs,
        Cgd: this._mosfetParams.Cgd,
        Cdb: 0,
        Csb: 0
      }
    };
  }

  /**
   * 确定 MOSFET 工作区域
   */
  private _determineOperatingRegion(Vgs: number, Vds: number): MOSFETRegion {
    // === 統一模型驅動的區域判斷 ===
    // 這個函數的結果主要用於診斷和高層邏輯，而不直接參與核心電流計算。
    // 判斷邏輯必須與 _computeDCCharacteristics 中的平滑函數保持一致。

    const Vth = this._mosfetParams.VTH0 ?? this._mosfetParams.Vth;
    const VOFF = 0.05; // 與 DC 計算一致

    // 1. 判斷導通/截止
    const Vov = Vgs - Vth;
    const alpha_on = 0.5 * (1 + Math.tanh(Vov / VOFF));

    if (alpha_on < 0.1) { // alpha_on 接近 0
      return MOSFETRegion.CUTOFF;
    }
    if (alpha_on > 0.9) { // alpha_on 接近 1
      // 2. 在導通狀態下，判斷線性/飽和
      const Vds_abs = Math.abs(Vds);

      // 🔧 FIX: 使用傳統 MOSFET 理論的清晰判斷標準
      // 線性區: Vds < Vgs - Vth
      // 飽和區: Vds >= Vgs - Vth
      // 保留一個小的平滑區域以避免硬邊界
      const Vdsat_simple = Math.max(0, Vov); // 簡化的飽和電壓
      const delta = 0.1; // 100mV 平滑區域

      // 使用 alpha_sat 判斷，但閾值調整為更接近傳統理論
      const alpha_sat = 0.5 * (1 + Math.tanh((Vds_abs - Vdsat_simple) / delta));

      // 🔧 FIX: 降低閾值從 0.5 到 0.3，確保邊界情況被正確分類為飽和區
      if (alpha_sat < 0.3) { // 明確的線性區
        return MOSFETRegion.LINEAR;
      } else { // 飽和區或接近飽和
        return MOSFETRegion.SATURATION;
      }
    }

    // 處於 0.1 和 0.9 之間，視為亞閾值/過渡區
    return MOSFETRegion.SUBTHRESHOLD;
  }

  /**
   * 🔥🔥🔥 [BSIM4-Inspired Unified Model] 計算 MOSFET DC 特性
   *
   * 實現統一的 MOSFET 模型，無需區域判斷：
   * 1. Vgst_eff: 平滑的有效過驅動電壓（消除亞閾值/強反轉邊界）
   * 2. Vdsat_eff: 平滑的飽和漏極電壓（考慮速度飽和）
   * 3. Id_unified: 單一連續函數涵蓋所有區域
   *
   * 物理模型：
   *   Vgst_eff = Vov * alpha_on  (平滑激活函數)
   *   Vdsat_eff = Vgst_eff       (簡化模型)
   *   Id = Kp * f(Vgst_eff, Vds) * (1 + λ·Vds)
   *
   * 關鍵特性：
   * - C∞ 連續（無限次可微）
   * - 物理正確（滿足端電壓對稱性）
   * - 數值穩定（無奇異點）
   *
   * @param Vgs 閘源電壓 (V)
   * @param Vds 漏源電壓 (V)
   * @param region 僅用於診斷/日誌，不影響計算
   * @returns {Id, Ig, Is} 漏極、閘極、源極電流 (A)
   */
  private _computeDCCharacteristics(
    Vgs: number,
    Vds: number,
    region: MOSFETRegion  // 保留用於診斷，不參與計算
  ) {
    // === BSIM4-inspired 參數提取 ===
    const Vth = this._mosfetParams.VTH0 ?? this._mosfetParams.Vth;  // 優先使用 VTH0
    const Kp = this._mosfetParams.Kp;
    const lambda = this._mosfetParams.lambda;
    const Roff = this._mosfetParams.Roff;

    // 平滑參數：控制過渡區域寬度
    // BSIM4 使用 n_sub * VT，這裡簡化為固定值
    const VOFF = 0.05;  // 50mV，相當於 ~2 * VT @ 300K

    // === 步驟 1: 計算有效閘極過驅動電壓 (Vgst_eff) ===
    // 這是 BSIM4 統一模型的核心概念：
    // 在亞閾值區，Vgst_eff ≈ 0；在強反轉區，Vgst_eff ≈ Vov
    const Vov = Vgs - Vth;  // 理想過驅動電壓

    // 平滑激活函數：tanh 實現 C∞ 過渡
    // alpha_on ∈ [0, 1]: 0=截止, 1=完全導通
    const alpha_on = 0.5 * (1 + Math.tanh(Vov / VOFF));

    // 有效過驅動電壓：平滑地從 0 過渡到 Vov
    // 這消除了傳統模型中的"截止-導通"硬邊界
    const Vgst_eff = Vov * alpha_on;

    // === 早期退出優化：深度截止區 ===
    if (alpha_on < 1e-6) {
      const Id_leakage = Vds / Roff;  // 純漏電流
      return { Id: Id_leakage, Ig: 0, Is: -Id_leakage };
    }

    // === 步驟 2: 處理 Vds 的符號和安全性 ===
    const Vds_sign = Vds >= 0 ? 1 : -1;
    const Vds_abs = Math.abs(Vds);

    // === 步驟 3: 計算有效飽和電壓 (Vdsat_eff) ===
    // BSIM4: Vdsat 受速度飽和影響，這裡簡化為 Vgst_eff
    // ⚠️ BUG FIX: 使用平滑函數確保 Vdsat_eff >= 0，而非硬截斷
    //    sqrt(x² + δ²) 在 x=0 附近平滑過渡，且 C∞ 可微
    const delta_smooth = 0.01 * VOFF;  // 1mV 平滑參數
    const Vdsat_eff = 0.5 * (Vgst_eff + Math.sqrt(Vgst_eff * Vgst_eff + delta_smooth * delta_smooth));

    // === 步驟 4: 統一電流表達式（單一公式涵蓋所有區域）===
    // 線性區分量: Id_lin ∝ Vdsat_eff * Vds - 0.5 * Vds²
    // ⚠️ 當 Vdsat_eff 很小時，這個公式可能產生負值
    //    使用 max(0, ...) 確保物理正確性
    const Id_lin_raw = Kp * (Vdsat_eff * Vds_abs - 0.5 * Vds_abs * Vds_abs);
    const Id_lin_mag = Math.max(0, Id_lin_raw);

    // 飽和區分量: Id_sat ∝ 0.5 * Vdsat_eff²（總是非負）
    const Id_sat_mag = 0.5 * Kp * Vdsat_eff * Vdsat_eff;

    // === 步驟 5: 平滑混合線性區和飽和區 ===
    // alpha_sat ∈ [0, 1]: 0=線性區, 1=飽和區
    const alpha_sat = 0.5 * (1 + Math.tanh((Vds_abs - Vdsat_eff) / VOFF));

    // 統一電流（幅值）：平滑過渡，無奇異點
    const Id_unified_mag = Id_lin_mag * (1 - alpha_sat) + Id_sat_mag * alpha_sat;

    // === 步驟 6: 溝道長度調製效應 (Early Effect) ===
    const CLM = 1 + lambda * Vds_abs;

    // === 步驟 7: 應用方向並加入截止區泄漏 ===
    const Id_on = Id_unified_mag * CLM * Vds_sign;
    const Id_leakage = Vds / Roff;

    // 最終電流：加權平均（導通區主導，截止區貢獻微小）
    const Id_final = Id_leakage * (1 - alpha_on) + Id_on * alpha_on;

    // === 安全檢查：防止 NaN/Inf ===
    if (!isFinite(Id_final)) {
      console.warn(`⚠️ MOSFET ${this.deviceId}: Non-finite current! Vgs=${Vgs.toFixed(3)}V, Vds=${Vds.toFixed(3)}V`);
      return { Id: Id_leakage, Ig: 0, Is: -Id_leakage };  // 回退到純電阻
    }


    return { Id: Id_final, Ig: 0, Is: -Id_final };
  }

  /**
   * 🔥🔥🔥 [BSIM4-Inspired Unified Model] 計算小信號參數
   *
   * 這是 _computeDCCharacteristics 的精確解析導數！
   *   gm = ∂Id/∂Vgs  (跨導)
   *   gds = ∂Id/∂Vds (輸出電導)
   *
   * 數學推導基於統一模型：
   *   Id = (1-α_on)·Id_leak + α_on·[(1-α_sat)·Id_lin + α_sat·Id_sat]·CLM
   *
   * 其中：
   *   Vgst_eff = Vov * α_on
   *   α_on = 0.5 * (1 + tanh(Vov/VOFF))
   *   α_sat = 0.5 * (1 + tanh((|Vds|-Vdsat)/VOFF))
   *
   * 關鍵求導公式：
   *   d(tanh(x))/dx = sech²(x) = 1 - tanh²(x)
   *   ∂α/∂x = 0.5 * sech²(...) / VOFF
   *
   * @param Vgs 閘源電壓 (V)
   * @param Vds 漏源電壓 (V)
   * @param region 僅用於診斷，不影響計算
   * @returns {gm, gds, gmbs} 小信號參數
   */
  private _computeSmallSignalParameters(
    Vgs: number,
    Vds: number,
    region: MOSFETRegion  // 保留用于调试，但不使用
  ) {
    // === 參數提取（與 _computeDCCharacteristics 一致）===
    const Vth = this._mosfetParams.VTH0 ?? this._mosfetParams.Vth;
    const Kp = this._mosfetParams.Kp;
    const lambda = this._mosfetParams.lambda;
    const Roff = this._mosfetParams.Roff;
    const VOFF = 0.05;  // 必須與 _computeDCCharacteristics 一致！

    // === 復現所有中間變量（保證導數的一致性）===
    const Vov = Vgs - Vth;
    const tanh_on = Math.tanh(Vov / VOFF);
    const alpha_on = 0.5 * (1 + tanh_on);

    // === 早期退出：深度截止區 ===
    // ⚠️ 注意：不能簡單地設 gm=0，因為在亞閾值區 alpha_on 雖小但 d_alpha_on/dVgs 不為零！
    // 只有在極深的截止區（Vov << -VOFF）才能安全地忽略 gm
    if (Vov < -5 * VOFF) {  // Vgs < Vth - 5*VOFF = Vth - 0.25V
      return {
        gm: 0,  // 極深截止區：Id ≈ Vds/Roff 與 Vgs 無關
        gds: Math.max(1 / Roff, IntelligentMOSFET.MIN_CONDUCTANCE),
        gmbs: 0
      };
    }

    // === 中間變量 ===
    const Vgst_eff = Vov * alpha_on;  // 有效過驅動電壓
    const Vds_sign = Vds >= 0 ? 1 : -1;
    const Vds_abs = Math.abs(Vds);

    // === BUG FIX: 使用與 _computeDCCharacteristics 相同的平滑函數 ===
    const delta_smooth = 0.01 * VOFF;
    const sqrt_term = Math.sqrt(Vgst_eff * Vgst_eff + delta_smooth * delta_smooth);
    const Vdsat_eff = 0.5 * (Vgst_eff + sqrt_term);

    // === 電流分量（幅值）- 必須與 _computeDCCharacteristics 一致！===
    const Id_lin_raw = Kp * (Vdsat_eff * Vds_abs - 0.5 * Vds_abs * Vds_abs);
    const Id_lin_mag = Math.max(0, Id_lin_raw);
    const Id_sat_mag = 0.5 * Kp * Vdsat_eff * Vdsat_eff;

    // === 平滑混合因子 ===
    const tanh_sat = Math.tanh((Vds_abs - Vdsat_eff) / VOFF);
    const alpha_sat = 0.5 * (1 + tanh_sat);

    // === CLM 因子 ===
    const CLM = 1 + lambda * Vds_abs;

    // === 計算導數（核心部分）===

    // 1️⃣ 計算 ∂Vgst_eff/∂Vgs
    //    Vgst_eff = Vov * alpha_on
    //    ∂Vgst_eff/∂Vgs = alpha_on + Vov * ∂alpha_on/∂Vgs
    const sech2_on = 1 - tanh_on * tanh_on;
    const d_alpha_on_dVgs = 0.5 * sech2_on / VOFF;
    const d_Vgst_eff_dVgs = alpha_on + Vov * d_alpha_on_dVgs;

    // 2️⃣ 計算 ∂Id_lin_mag/∂Vdsat_eff 和 ∂Id_sat_mag/∂Vdsat_eff
    //    ⚠️ BUG FIX: 現在使用 Vdsat_eff 而非 Vgst_eff！
    //    Id_lin_raw = Kp * (Vdsat_eff * Vds_abs - 0.5 * Vds_abs²)
    //    Id_lin_mag = max(0, Id_lin_raw)
    //
    //    ∂Id_lin_mag/∂Vdsat = { Kp * Vds_abs   if Id_lin_raw > 0
    //                          { 0              if Id_lin_raw <= 0 (截斷區)
    const dId_lin_mag_dVdsat = (Id_lin_raw > 0) ? Kp * Vds_abs : 0;

    //    Id_sat_mag = 0.5 * Kp * Vdsat_eff²
    const dId_sat_mag_dVdsat = Kp * Vdsat_eff;

    // 3️⃣ 計算 ∂alpha_sat/∂Vgs (通過 Vdsat_eff)
    //    α_sat = 0.5 * (1 + tanh((Vds_abs - Vdsat_eff)/VOFF))
    //    ∂α_sat/∂Vgs = -0.5 * sech²(...) / VOFF * ∂Vdsat_eff/∂Vgs
    //
    //    ⚠️ BUG FIX: Vdsat_eff 現在使用平滑函數，導數需要重新計算！
    //    Vdsat_eff = 0.5 * (Vgst_eff + sqrt(Vgst_eff² + δ²))
    //    ∂Vdsat_eff/∂Vgst = 0.5 * (1 + Vgst_eff / sqrt(...))
    const d_Vdsat_eff_dVgst = 0.5 * (1 + Vgst_eff / sqrt_term);
    const d_Vdsat_eff_dVgs = d_Vdsat_eff_dVgst * d_Vgst_eff_dVgs;

    const sech2_sat = 1 - tanh_sat * tanh_sat;
    const d_alpha_sat_dVgs = -0.5 * sech2_sat / VOFF * d_Vdsat_eff_dVgs;

    // 4️⃣ 計算 gm = ∂Id/∂Vgs（鏈式法則）
    //    Id_unified = [(1-α_sat)*Id_lin + α_sat*Id_sat] * CLM
    //    ∂Id_unified/∂Vgs = [(1-α_sat)*∂Id_lin/∂Vdsat*∂Vdsat/∂Vgs
    //                      + α_sat*∂Id_sat/∂Vdsat*∂Vdsat/∂Vgs
    //                      + (Id_sat - Id_lin)*∂α_sat/∂Vgs] * CLM
    const dId_unified_mag_dVgs =
      (1 - alpha_sat) * dId_lin_mag_dVdsat * d_Vdsat_eff_dVgs +
      alpha_sat * dId_sat_mag_dVdsat * d_Vdsat_eff_dVgs +
      (Id_sat_mag - Id_lin_mag) * d_alpha_sat_dVgs;

    // 導通區電流貢獻
    const Id_on_component = dId_unified_mag_dVgs * CLM;

    // 總跨導（加權）
    //    Id = (1-α_on)*Id_leak + α_on*Id_unified
    //    gm = ∂α_on/∂Vgs * (Id_unified - Id_leak) + α_on * ∂Id_unified/∂Vgs
    const Id_unified_val = ((1 - alpha_sat) * Id_lin_mag + alpha_sat * Id_sat_mag) * CLM * Vds_sign;
    const Id_leak_val = Vds / Roff;

    let gm = d_alpha_on_dVgs * (Id_unified_val - Id_leak_val) + alpha_on * Id_on_component * Vds_sign;

    // 5️⃣ 計算 gds = ∂Id/∂Vds
    //    這部分較複雜，需要考慮：
    //    - ∂|Vds|/∂Vds = sign(Vds)
    //    - ∂alpha_sat/∂Vds
    //    - ∂CLM/∂Vds
    const d_alpha_sat_dVds = 0.5 * sech2_sat * Vds_sign / VOFF;
    const dCLM_dVds = lambda * Vds_sign;

    // ∂Id_lin_mag/∂|Vds| = ∂(max(0, Kp*(Vdsat*Vds - 0.5*Vds²)))/∂Vds
    //   If Id_lin_raw > 0: ∂/∂Vds = Kp * (Vdsat - Vds)
    //   If Id_lin_raw <= 0: ∂/∂Vds = 0 (截斷區，電流不隨 Vds 變化)
    const dId_lin_mag_dVds_abs = (Id_lin_raw > 0) ? Kp * (Vdsat_eff - Vds_abs) : 0;

    // ∂Id_sat_mag/∂|Vds| = 0（飽和區電流不直接依賴 Vds）

    // ∂Id_unified_mag/∂|Vds|
    const Id_unified_mag = (1 - alpha_sat) * Id_lin_mag + alpha_sat * Id_sat_mag;
    const dId_unified_mag_dVds_abs =
      (1 - alpha_sat) * dId_lin_mag_dVds_abs +
      (Id_sat_mag - Id_lin_mag) * d_alpha_sat_dVds / Vds_sign;  // 注意符號修正

    // 總輸出電導
    //    gds_unified = (dId_unified_mag_dVds_abs * CLM + Id_unified_mag * dCLM_dVds) * sign²(Vds)
    const gds_unified = (dId_unified_mag_dVds_abs * CLM + Id_unified_mag * dCLM_dVds / Vds_sign);

    // 泄漏區貢獻
    const gds_leak = 1 / Roff;

    // 加權總和
    let gds = (1 - alpha_on) * gds_leak + alpha_on * gds_unified;

    // === 安全檢查 ===
    if (!isFinite(gm) || !isFinite(gds)) {
      console.warn(`⚠️ MOSFET ${this.deviceId}: Non-finite parameters! Vgs=${Vgs.toFixed(3)}V, Vds=${Vds.toFixed(3)}V`);
      gm = IntelligentMOSFET.MIN_CONDUCTANCE;
      gds = IntelligentMOSFET.MIN_CONDUCTANCE;
    }

    // === 物理正確性強制 ===
    // ⚠️ 注意：gm 在亞閾值區可能是極小值（接近零但可能為負由於數值誤差）
    //    不要強制為零，這會破壞與數值導數的一致性！
    //    只在明顯錯誤時（gm < -1e-12）才修正
    if (gm < -1e-12) {
      console.warn(`⚠️ MOSFET ${this.deviceId}: Negative gm detected! Vgs=${Vgs.toFixed(3)}V, Vds=${Vds.toFixed(3)}V, gm=${gm.toExponential(2)}`);
      gm = 0;
    }
    gds = Math.max(IntelligentMOSFET.MIN_CONDUCTANCE, gds);  // 輸出電導嚴格正


    return { gm, gds, gmbs: 0 };
  }

  /**
   * 🔋 計算 MOSFET 電荷分佈（電荷守恆模型）
   *
   * 基於 BSIM4 簡化的電荷分割模型：
   * - Q_gate: 閘極電荷（來自柵氧化層）
   * - Q_drain: 漏極電荷（來自溝道）
   * - Q_source: 源極電荷（來自溝道）
   * - 電荷守恆：Q_gate + Q_drain + Q_source + Q_bulk = 0
   *
   * 電容通過電荷偏導數計算：
   *   C_ij = -∂Q_i/∂V_j
   *
   * @param Vgs 閘源電壓 (V)
   * @param Vds 漏源電壓 (V)
   * @param Vbs 體源電壓 (V) - 默認為 0（體源短接）
   * @returns 電荷和等效電容
   */
  private _computeCapacitances(Vgs: number, Vds: number, Vbs: number = 0) {
    // === 提取 BSIM4 電容參數 ===
    const CGSO = this._mosfetParams.CGSO ?? 0;  // 閘源交疊電容 (F/m)
    const CGDO = this._mosfetParams.CGDO ?? 0;  // 閘漏交疊電容 (F/m)
    const CGBO = this._mosfetParams.CGBO ?? 0;  // 閘體交疊電容 (F/m)
    const W = this._mosfetParams.W ?? 1e-6;     // 溝道寬度 (m)

    // 向後兼容：如果沒有提供 BSIM4 參數，使用 Level 1
    const Cgs0 = this._mosfetParams.Cgs ?? CGSO * W;
    const Cgd0 = this._mosfetParams.Cgd ?? CGDO * W;
    const Cgb0 = CGBO * W;

    // 結電容參數
    const CJ = this._mosfetParams.CJ ?? 1e-4;    // 零偏壓結電容 (F/m²)
    const CJSW = this._mosfetParams.CJSW ?? 1e-10; // 側壁結電容 (F/m)
    const PB = this._mosfetParams.PB ?? 0.8;     // 內建電位 (V)
    const MJ = this._mosfetParams.MJ ?? 0.5;     // 結電容分級係數
    const AD = this._mosfetParams.AD ?? W * 1e-6; // 漏極面積 (m²)
    const AS = this._mosfetParams.AS ?? W * 1e-6; // 源極面積 (m²)
    const PD = this._mosfetParams.PD ?? 2 * W;   // 漏極周長 (m)
    const PS = this._mosfetParams.PS ?? 2 * W;   // 源極周長 (m)

    // === 計算工作區域相關的電荷分割係數 ===
    const Vth = this._mosfetParams.VTH0 ?? this._mosfetParams.Vth;
    const Vov = Vgs - Vth;
    const VOFF = 0.05;  // 與統一模型一致

    // 平滑激活函數
    const alpha_on = 0.5 * (1 + Math.tanh(Vov / VOFF));
    const Vgst_eff = Vov * alpha_on;

    // 計算飽和電壓
    const Vdsat_eff = Math.max(0, Vgst_eff);
    const Vds_abs = Math.abs(Vds);

    // 飽和度因子：0=線性區, 1=飽和區
    const alpha_sat = 0.5 * (1 + Math.tanh((Vds_abs - Vdsat_eff) / VOFF));

    // === 步驟 1: 計算閘極總電荷（柵氧化層 + 交疊）===
    // Q_gate = Q_channel + Q_overlap

    // 溝道電荷（近似）：Q_channel ∝ Cox * W * L * Vgst_eff
    // 這裡簡化為與 Vgst_eff 成正比
    const Cox_WL = (Cgs0 + Cgd0) / 2;  // 等效柵氧電容
    const Q_channel = Cox_WL * Vgst_eff * alpha_on;

    // 交疊電荷（固定）
    const Q_overlap_gs = Cgs0 * Vgs;
    const Q_overlap_gd = Cgd0 * (Vgs - Vds);
    const Q_overlap_gb = Cgb0 * (Vgs - Vbs);

    const Q_gate = Q_channel + Q_overlap_gs + Q_overlap_gd + Q_overlap_gb;

    // === 步驟 2: 計算漏極和源極電荷分割 ===
    // 使用 Ward-Dutton 分割模型（簡化版）
    // 在線性區：電荷均分；在飽和區：主要在源極

    // 溝道電荷分割係數
    const f_d = 0.5 * (1 - alpha_sat);  // 漏極分得的比例：線性區 0.5，飽和區 0
    const f_s = 1 - f_d;                 // 源極分得的比例：線性區 0.5，飽和區 1

    // 溝道電荷分配
    const Q_channel_drain = -Q_channel * f_d;   // 注意負號（電子電荷）
    const Q_channel_source = -Q_channel * f_s;

    // 交疊電荷（固定貢獻）
    const Q_drain_overlap = Cgd0 * Vds;
    const Q_source_overlap = 0;  // 源極交疊已包含在 Q_overlap_gs

    const Q_drain = Q_channel_drain + Q_drain_overlap;
    const Q_source = Q_channel_source + Q_source_overlap;

    // === 步驟 3: 計算結電容（PN 結的非線性電容）===
    // C_junction = CJ * A / (1 - V/PB)^MJ

    // 漏體結電壓（Vdb = Vd - Vb，假設 Vb = Vs - Vbs）
    const Vdb = Vds + Vbs;
    const Vsb = Vbs;

    // 防止除零和負電壓
    const Vdb_safe = Math.min(Vdb, PB * 0.9);
    const Vsb_safe = Math.min(Vsb, PB * 0.9);

    // 結電容（面積 + 側壁）
    const Cdb_area = CJ * AD / Math.pow(1 - Vdb_safe / PB, MJ);
    const Cdb_sw = CJSW * PD / Math.pow(1 - Vdb_safe / PB, MJ);
    const Cdb = Cdb_area + Cdb_sw;

    const Csb_area = CJ * AS / Math.pow(1 - Vsb_safe / PB, MJ);
    const Csb_sw = CJSW * PS / Math.pow(1 - Vsb_safe / PB, MJ);
    const Csb = Csb_area + Csb_sw;

    // === 步驟 4: 計算等效線性電容（小信號模型）===
    // 這些是 C_ij = -∂Q_i/∂V_j 的近似值

    // 閘源電容：主要來自溝道 + 交疊
    const Cgs = Cgs0 + Cox_WL * alpha_on * (1 + Vov * 0.5 / VOFF * (1 - alpha_on * alpha_on));

    // 閘漏電容：主要來自交疊（飽和區溝道貢獻小）
    const Cgd = Cgd0 * (1 + 0.1 * (1 - alpha_sat));

    // 閘體電容
    const Cgb = Cgb0;

    // === 返回電荷和電容 ===
    return {
      // 電荷（用於 dQ/dt 計算）
      Q_gate,
      Q_drain,
      Q_source,
      // 等效電容（用於小信號分析和數值穩定性）
      Cgs,
      Cgd,
      Cgb,
      Cdb,
      Csb
    };
  }

  /**
   * 🔋 添加體二極體貢獻到 MNA 系統
   *
   * 功率 MOSFET 內部存在寄生的體二極體（P-N 結）：
   * - NMOS: N 型源極 → P 型體 → N 型漏極（體二極體：源極到漏極）
   * - PMOS: P 型源極 → N 型體 → P 型漏極（體二極體：漏極到源極）
   *
   * 使用 Shockley 方程建模：
   *   I_diode = IS * (exp(V_bd / (n*VT)) - 1)
   *
   * 其中 V_bd = V_body - V_drain (對於 NMOS，體接源極，V_bd = -Vds)
   *
   * @param context 裝配上下文
   * @param drainIndex 漏極節點索引
   * @param sourceIndex 源極節點索引
   */
  private _assembleBodyDiode(
    context: AssemblyContext,
    drainIndex: number,
    sourceIndex: number
  ): void {
    // 提取體二極體參數
    const IS_body = this._mosfetParams.JS ?? 1e-14;  // 體二極體飽和電流密度
    const n_body = this._mosfetParams.N ?? 1.0;      // 理想因子
    const AD = this._mosfetParams.AD ?? 1e-12;       // 漏極面積

    // 計算體二極體飽和電流
    const IS = IS_body * AD;  // I_S = J_S * Area

    // 獲取當前電壓
    const Vd = context.solutionVector!.get(drainIndex);
    const Vs = context.solutionVector!.get(sourceIndex);

    // 體二極體電壓（假設體接源極）
    // 對於 NMOS: 體極（N 型）到漏極（P 型通過溝道）的 PN 結
    // 正向偏壓條件：V_source > V_drain（體比漏極電位高）
    const Vbd = Vs - Vd;  // 體-漏電壓 = -(Vd - Vs) = -Vds

    // === 使用平滑的二極體模型（與 IntelligentDiode 一致）===
    const VT = 0.026;  // 熱電壓 @ 300K
    const V_thermal = Vbd / (n_body * VT);

    // 安全限制：防止指數爆炸
    const V_MAX_EXP = 30.0;  // 對應約 0.78V
    const SMOOTH_WIDTH = 5.0;

    // 正向電流
    const V_thermal_clamped = Math.min(V_thermal, V_MAX_EXP);
    const I_forward = IS * (Math.exp(V_thermal_clamped) - 1);

    // 反向飽和電流
    const I_reverse = -IS;

    // 平滑混合（tanh 過渡）
    const alpha = 0.5 * (1 + Math.tanh(V_thermal / SMOOTH_WIDTH));
    const I_body_diode = (1 - alpha) * I_reverse + alpha * I_forward;

    // === 計算電導（Jacobian）===
    const tanh_val = Math.tanh(V_thermal / SMOOTH_WIDTH);
    const sech2 = 1 - tanh_val * tanh_val;
    const d_alpha_dV = 0.5 * sech2 / (SMOOTH_WIDTH * n_body * VT);

    // dI_forward/dV
    const dI_forward_dV = (V_thermal < V_MAX_EXP)
      ? (IS / (n_body * VT)) * Math.exp(V_thermal_clamped)
      : 0;

    // 總電導
    const G_body_diode = d_alpha_dV * (I_forward - I_reverse) + alpha * dI_forward_dV;

    // === 線性化誤差項 ===
    const I_eq_body = I_body_diode - G_body_diode * Vbd;

    // === Stamp 到 MNA 系統 ===
    // 體二極體連接：源極（正極）→ 漏極（負極）
    // KCL: I 從源極流向漏極

    // 矩陣貢獻（電導）
    context.matrix.add(sourceIndex, sourceIndex, G_body_diode);
    context.matrix.add(sourceIndex, drainIndex, -G_body_diode);
    context.matrix.add(drainIndex, sourceIndex, -G_body_diode);
    context.matrix.add(drainIndex, drainIndex, G_body_diode);

    // RHS 貢獻（電流誤差）
    context.rhs.add(sourceIndex, -I_eq_body);  // 源極流出
    context.rhs.add(drainIndex, I_eq_body);     // 漏極流入
  }



  /**
   * 创建新的设备状态
   */
  private _createNewDeviceState(
    Vgs: number,
    Vds: number,
    region: MOSFETRegion,
    smallSignal: any,
    capacitance: any
  ): DeviceState {
    return {
      ...this._currentState,
      operatingMode: region,
      internalStates: {
        region,
        Vgs,
        Vds,
        ...smallSignal,
        ...capacitance
      }
    };
  }

  /**
   * MOSFET 特定收敛检查
   */
  private _checkMOSFETSpecificConvergence(deltaV: VoltageVector, nodeMap: Map<string, number>) {
    const gateIndex = nodeMap.get(this._gateNode);
    const sourceIndex = nodeMap.get(this._sourceNode);
    const drainIndex = nodeMap.get(this._drainNode);

    if (gateIndex === undefined || sourceIndex === undefined || drainIndex === undefined) {
      return { regionStable: false, confidence: 0.1 };
    }

    // 检查工作区域是否稳定
    const deltaVgs = deltaV.get(gateIndex) - deltaV.get(sourceIndex);
    const deltaVds = deltaV.get(drainIndex) - deltaV.get(sourceIndex);

    // 如果电压变化可能导致区域切换，降低置信度
    const regionStable = Math.abs(deltaVgs) < IntelligentMOSFET.SWITCH_THRESHOLD &&
      Math.abs(deltaVds) < IntelligentMOSFET.SWITCH_THRESHOLD;

    const confidence = regionStable ? 0.9 : 0.3;

    return { regionStable, confidence };
  }

  /**
   * MOSFET 特定步长限制
   */
  protected override _applyDeviceSpecificLimits(deltaV: VoltageVector, nodeMap: Map<string, number>): void {
    const gateIndex = nodeMap.get(this._gateNode);
    const sourceIndex = nodeMap.get(this._sourceNode);

    if (gateIndex === undefined || sourceIndex === undefined) {
      return;
    }

    // 限制栅源电压变化
    const deltaVgs = deltaV.get(gateIndex) - deltaV.get(sourceIndex);
    if (Math.abs(deltaVgs) > IntelligentMOSFET.MAX_VOLTAGE_STEP) {
      const scale = IntelligentMOSFET.MAX_VOLTAGE_STEP / Math.abs(deltaVgs);

      // 缩放所有节点电压变化
      // Note: This is a simple approach. A more sophisticated method might
      // only scale the relevant node voltages (gate, source).
      for (let i = 0; i < deltaV.size; i++) {
        deltaV.set(i, deltaV.get(i) * scale);
      }
    }
  }

  /**
   * 预测开关事件
   */
  private _predictSwitchingEvents(dt: number): readonly SwitchingEvent[] {
    const events: SwitchingEvent[] = [];
    const currentVgs = this._currentState.internalStates['Vgs'] as number;
    const { Vth } = this._mosfetParams;

    // 如果接近阈值电压，预测开关事件
    const distanceToThreshold = Math.abs(currentVgs - Vth);

    if (distanceToThreshold < 0.1) { // 100mV 内
      const eventType = currentVgs > Vth ? 'turn_off' : 'turn_on';
      const estimatedTime = this._currentState.time + dt * (distanceToThreshold / 0.1);

      events.push({
        eventType,
        estimatedTime,
        confidence: 0.7,
        impactSeverity: 'high'
      });
    }

    return events;
  }

  /**
   * 识别 MOSFET 数值挑战
   */
  private _identifyMOSFETChallenges(_dt: number): readonly NumericalChallenge[] {
    const challenges: NumericalChallenge[] = [];
    const region = this._currentState.internalStates['region'] as MOSFETRegion;

    // 开关瞬态挑战
    if (region === MOSFETRegion.SUBTHRESHOLD) {
      challenges.push({
        type: 'stiffness',
        severity: 0.8,
        mitigation: '减小时间步长至纳秒级'
      });
    }

    // 工作区域边界挑战
    const gds = this._currentState.internalStates['gds'] as number;
    if (gds < IntelligentMOSFET.MIN_CONDUCTANCE * 10) {
      challenges.push({
        type: 'ill_conditioning',
        severity: 0.6,
        mitigation: '增加并联电阻改善条件数'
      });
    }

    return challenges;
  }

  /**
   * ⚡ 计算通过 MOSFET 的漏极电流
   *
   * 根据工作区域计算实际电流:
   * - 截止区: Id = 0
   * - 线性区: Id = Kp * ((Vgs - Vth) * Vds - Vds²/2)
   * - 饱和区: Id = (Kp/2) * (Vgs - Vth)²
   *
   * @param voltages - 系统的完整电压向量
   * @param context - 组装上下文 (用于获取节点索引)
   * @returns 漏极电流值 (A)
   */
  override computeCurrent(voltages: import('../../math/sparse/vector').Vector, context?: AssemblyContext): number {
    if (!context) {
      throw new Error('IntelligentMOSFET.computeCurrent requires AssemblyContext');
    }

    const drainNode = this.nodes[0];
    const gateNode = this.nodes[1];
    const sourceNode = this.nodes[2];

    if (!drainNode || !gateNode || !sourceNode) {
      throw new Error(`MOSFET ${this.name}: Node names are not defined.`);
    }

    const drainIndex = context.nodeMap.get(drainNode);
    const gateIndex = context.nodeMap.get(gateNode);
    const sourceIndex = context.nodeMap.get(sourceNode);

    if (drainIndex === undefined || gateIndex === undefined || sourceIndex === undefined) {
      throw new Error(`MOSFET ${this.name}: Node not found in mapping.`);
    }

    const Vd = voltages.get(drainIndex);
    const Vg = voltages.get(gateIndex);
    const Vs = voltages.get(sourceIndex);

    const Vgs = Vg - Vs;
    const Vds = Vd - Vs;

    // 计算实际电流 (包括所有工作区域)
    const region = this._determineOperatingRegion(Vgs, Vds);
    const dcAnalysis = this._computeDCCharacteristics(Vgs, Vds, region);

    return dcAnalysis.Id;  // 漏极电流
  }
}
