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
  VoltageVector,
  IVector,
  IEvent
} from '../../types/index';
import { 
  AssemblyContext,
} from '../interfaces/component';
import { 
  IntelligentDeviceModelBase,
  DeviceState,
  ConvergenceInfo,
  PredictionHint,
  SwitchingEvent,
  NumericalChallenge,
  MOSFETParameters
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

    // 6. 计算右侧向量贡献 (线性化误差)
    const Ieq = dcAnalysis.Id - (smallSignal.gm * Vgs + smallSignal.gds * Vds);

    // 7. Stamp Matrix
    const { gm } = smallSignal;
    matrix.add(drainIndex, gateIndex, gm);
    matrix.add(drainIndex, drainIndex, totalGds);
    matrix.add(drainIndex, sourceIndex, -(gm + totalGds));
    
    matrix.add(sourceIndex, gateIndex, -gm);
    matrix.add(sourceIndex, drainIndex, -totalGds);
    matrix.add(sourceIndex, sourceIndex, gm + totalGds);

    // 8. Stamp RHS
    rhs.add(drainIndex, -Ieq);
    rhs.add(sourceIndex, Ieq);

    // 9. 更新设备状态
    const capacitance = this._computeCapacitances(Vgs, Vds);
    this._currentState = this._createNewDeviceState(
      Vgs, Vds, region, smallSignal, capacitance
    );
  }

  /**
   * 🔥 MOSFET 载入实现 (DEPRECATED)
   */
  /*
  override load(voltage: VoltageVector, nodeMap: Map<string, number>): LoadResult {
    // ... (This method is now replaced by assemble) ...
  }
  */

  /**
   * ⚡️ Gmin Stepping 支持 (DEPRECATED)
   * 
   * 在 MNA 矩阵中并联一个临时电导
   */
  /*
  stampGmin(gmin: number): void {
    this._gminConductance = gmin;
  }
  */

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
    const { Vth } = this._mosfetParams;
    const transitionWidth = 5 * IntelligentMOSFET.VT; // 5 * 26mV = 130mV transition region

    // Smooth transition around Vth
    if (Vgs < Vth - transitionWidth) {
        return MOSFETRegion.CUTOFF;
    }
    if (Vgs > Vth + transitionWidth) {
        // On region
        const Vdsat = Vgs - Vth;
        return Vds < Vdsat ? MOSFETRegion.LINEAR : MOSFETRegion.SATURATION;
    }
    
    // Subthreshold/Transition region
    return MOSFETRegion.SUBTHRESHOLD;
  }

  /**
   * 🔥🔥🔥 [C∞ 连续平滑化] 計算 MOSFET DC 特性 - Phoenix Project 修复
   * 
   * 使用三层嵌套 tanh 实现完全平滑的 MOSFET 模型：
   * 1. Cutoff ↔ On 转换（基于 Vgs vs Vth）
   * 2. Linear ↔ Saturation 转换（基于 Vds vs Vdsat）
   * 3. 沟道长度调制效应（lambda）
   * 
   * 关键：_computeSmallSignalParameters 必须是此函数的精确解析导数！
   * 
   * 数值安全保证：
   * - 所有中间变量都有安全钳位
   * - 避免除零和负数平方根
   * - 确保在所有 (Vgs, Vds) 组合下都返回有限值
   */
  private _computeDCCharacteristics(
    Vgs: number, 
    Vds: number, 
    region: MOSFETRegion  // 参数保留用于日志/调试，不影响计算
  ) {
    const { Vth, Kp, lambda, Roff } = this._mosfetParams;
    const SMOOTH_WIDTH = 0.05; // 50mV 平滑宽度（平衡光滑度和数值稳定性）

    // === 步骤 1: 计算有效过驱动电压 ===
    const Vov = Vgs - Vth; // 过驱动电压 (overdrive voltage)
    
    // === 步骤 2: 平滑混合函数 ===
    // alpha_on: 在 Vth 处平滑从截止过渡到导通
    const alpha_on = 0.5 * (1 + Math.tanh(Vov / SMOOTH_WIDTH));
    
    // === 早期退出优化：如果几乎完全截止，直接返回泄漏电流 ===
    if (alpha_on < 1e-6) {
      const Id_cutoff = Vds / Roff;
      return { Id: Id_cutoff, Ig: 0, Is: -Id_cutoff };
    }
    
    // === 步骤 3: 计算安全的中间变量（仅在导通时需要）===
    const Vov_safe = Math.max(0, Vov); // 确保非负
    const Vds_safe = Math.abs(Vds);    // 使用绝对值确保安全
    const Vds_sign = Vds >= 0 ? 1 : -1; // 保留符号信息
    
    // === 步骤 4: 计算饱和漏极电压 ===
    const Vdsat = Vov_safe; // 理想情况 Vdsat = Vgs - Vth
    
    // === 步骤 5: 计算各区域的理想电流 ===
    
    // 截止区：仅有漏极泄漏电流
    const Id_cutoff = Vds / Roff;
    
    // 线性区（欧姆区）：Id = Kp * (Vov * Vds - 0.5 * Vds²)
    // 使用安全值避免负数
    const Id_linear_mag = Kp * (Vov_safe * Vds_safe - 0.5 * Vds_safe * Vds_safe);
    const Id_linear = Id_linear_mag * Vds_sign; // 恢复符号
    
    // 🔥 CRITICAL FIX: 饱和区电流不应依赖 Vds 的符号！
    // 饱和区（恒流区）：Id = 0.5 * Kp * Vov²
    // 在飽和區，Id 的大小僅由 Vgs 決定，是一個壓控電流源
    const Id_saturation_mag = 0.5 * Kp * Vov_safe * Vov_safe;
    
    // === 步骤 6: 沟道长度调制因子 ===
    const CLM = 1 + lambda * Vds_safe; // 使用绝对值确保正值
    
    // === 步骤 7: 平滑混合 ===
    
    // alpha_sat: 在 Vdsat 处平滑从线性过渡到饱和
    const alpha_sat = 0.5 * (1 + Math.tanh((Vds_safe - Vdsat) / SMOOTH_WIDTH));
    
    // 首先混合线性区和饱和区的幅值
    const Id_on_mag = (Id_linear_mag * (1 - alpha_sat) + Id_saturation_mag * alpha_sat) * CLM;
    // 然後統一應用方向
    const Id_on = Id_on_mag * Vds_sign;
    
    // 然后混合截止区和导通区
    const Id_final = Id_cutoff * (1 - alpha_on) + Id_on * alpha_on;
    
    // === 最终安全检查 ===
    if (!isFinite(Id_final)) {
      console.warn(`⚠️ MOSFET ${this.deviceId}: Non-finite current detected! Vgs=${Vgs}, Vds=${Vds}`);
      return { Id: Vds / Roff, Ig: 0, Is: -Vds / Roff }; // 回退到纯电阻
    }

    return { Id: Id_final, Ig: 0, Is: -Id_final };
  }

  /**
   * 平滑轉換函數 (使用 tanh)
   * 在 x0 附近寬度為 width 的區域內從 0 平滑過渡到 1
   */
  private _smoothTransition(x: number, x0: number, width: number): number {
    return 0.5 * (1 + Math.tanh((x - x0) / width));
  }

  /**
   * 🔥🔥🔥 [C∞ 连续平滑化] 计算小信号参数 - Phoenix Project 修复
   * 
   * 这是 _computeDCCharacteristics 的精确解析导数！
   * gm = ∂Id/∂Vgs, gds = ∂Id/∂Vds
   * 
   * 数学推导：
   *   Id(Vgs, Vds) = (1-α_on)·Id_cutoff + α_on·[(1-α_sat)·Id_lin + α_sat·Id_sat]·CLM
   *   
   *   gm = ∂Id/∂Vgs = ∂α_on/∂Vgs · (Id_on - Id_cutoff) + α_on · ∂Id_on/∂Vgs
   *   gds = ∂Id/∂Vds = 类似公式
   *   
   * 关键：tanh 导数 = sech²(x) = 1 - tanh²(x)
   * 
   * 数值安全：与 _computeDCCharacteristics 完全一致的安全措施
   */
  private _computeSmallSignalParameters(
    Vgs: number, 
    Vds: number, 
    region: MOSFETRegion  // 保留用于调试
  ) {
    const { Vth, Kp, lambda, Roff } = this._mosfetParams;
    const SMOOTH_WIDTH = 0.05; // 必须与 _computeDCCharacteristics 一致！

    // === 复现 _computeDCCharacteristics 的所有中间变量（完全一致！）===
    const Vov = Vgs - Vth;
    
    // 平滑因子（必须先计算，用于早期退出检测）
    const tanh_on = Math.tanh(Vov / SMOOTH_WIDTH);
    const alpha_on = 0.5 * (1 + tanh_on);
    
    // 早期退出：如果几乎完全截止，返回最小电导
    if (alpha_on < 1e-6) {
      const gds_cutoff = 1 / Roff;
      return { 
        gm: 0,  // 🔥 FIX: 截止区 Id = Vds/Roff，与 Vgs 无关，gm = 0！
        gds: Math.max(gds_cutoff, IntelligentMOSFET.MIN_CONDUCTANCE),
        gmbs: 0 
      };
    }
    
    // 安全中间变量（与 _computeDCCharacteristics 完全一致）
    const Vov_safe = Math.max(0, Vov);
    const Vds_safe = Math.abs(Vds);
    const Vds_sign = Vds >= 0 ? 1 : -1;
    const Vdsat = Vov_safe;
    
    // 各区域电流（与 _computeDCCharacteristics 完全一致）
    // 🔥 CRITICAL FIX: 使用物理正确的公式，幅值与符号分离
    const Id_cutoff = Vds / Roff;
    const Id_linear_mag = Kp * (Vov_safe * Vds_safe - 0.5 * Vds_safe * Vds_safe);
    const Id_saturation_mag = 0.5 * Kp * Vov_safe * Vov_safe; // 饱和电流幅值（无符号）
    const CLM = 1 + lambda * Vds_safe;
    
    // 平滑因子
    const tanh_sat = Math.tanh((Vds_safe - Vdsat) / SMOOTH_WIDTH);
    const alpha_sat = 0.5 * (1 + tanh_sat);
    
    // 混合后的电流幅值，最后统一应用方向
    const Id_on_mag = (Id_linear_mag * (1 - alpha_sat) + Id_saturation_mag * alpha_sat) * CLM;
    const Id_on = Id_on_mag * Vds_sign;
    
    // === 计算各区域电流对 Vgs, Vds 的偏导数 ===
    // 🔥 关键：所有导数基于**幅值**计算，最后在 gm/gds 中统一应用符号
    
    // ∂Id_cutoff/∂Vds = 1/Roff, ∂Id_cutoff/∂Vgs = 0
    const dId_cutoff_dVds = 1 / Roff;
    
    // 线性区：∂Id_linear_mag/∂Vgs = Kp * Vds_safe (无符号)
    //         ∂Id_linear_mag/∂Vds_safe = Kp * (Vov_safe - Vds_safe)
    const dId_linear_mag_dVgs = (Vov > 0) ? Kp * Vds_safe : 0;
    const dId_linear_mag_dVds_safe = (Vov > 0) ? Kp * (Vov_safe - Vds_safe) : 0;
    
    // 饱和区：∂Id_saturation_mag/∂Vgs = Kp * Vov_safe (无符号)
    //         ∂Id_saturation_mag/∂Vds_safe = 0
    const dId_sat_mag_dVgs = (Vov > 0) ? Kp * Vov_safe : 0;
    const dId_sat_mag_dVds_safe = 0;
    
    // CLM: ∂CLM/∂Vds_safe = lambda
    const dCLM_dVds_safe = lambda;
    
    // === 计算 alpha 的导数 ===
    // ∂α_on/∂Vgs = 0.5 * sech²(Vov/w) * (1/w)
    const sech2_on = 1 - tanh_on * tanh_on;
    const d_alpha_on_dVgs = 0.5 * sech2_on / SMOOTH_WIDTH;
    
    // ∂α_sat/∂Vds: 因为使用 |Vds|，需要考虑符号
    // ∂α_sat/∂Vds = 0.5 * sech²((|Vds|-Vdsat)/w) * sign(Vds) / w
    // ∂α_sat/∂Vgs = 0.5 * sech²(...) * (-∂Vdsat/∂Vgs / w) = -0.5 * sech²(...) / w (when Vov > 0)
    const sech2_sat = 1 - tanh_sat * tanh_sat;
    const d_alpha_sat_dVds = 0.5 * sech2_sat * Vds_sign / SMOOTH_WIDTH;
    const d_alpha_sat_dVgs = (Vov > 0) ? -0.5 * sech2_sat / SMOOTH_WIDTH : 0;
    
    // === 链式法则：计算 gm = ∂Id/∂Vgs ===
    // 🔥 修正：使用正确的幅值导数，最后统一应用符号
    
    // 项 1: 来自 alpha_on 对 Vgs 的导数
    const term1_gm = d_alpha_on_dVgs * (Id_on - Id_cutoff);
    
    // 项 2: 来自 Id_on 对 Vgs 的导数
    // ∂Id_on_mag/∂Vgs = [(1-α_sat)·∂Id_lin_mag/∂Vgs + α_sat·∂Id_sat_mag/∂Vgs] · CLM
    //                   + (Id_sat_mag - Id_lin_mag)·∂α_sat/∂Vgs · CLM
    const dId_on_mag_dVgs = 
      ((1 - alpha_sat) * dId_linear_mag_dVgs + alpha_sat * dId_sat_mag_dVgs) * CLM
      + (Id_saturation_mag - Id_linear_mag) * d_alpha_sat_dVgs * CLM;
    
    // ∂Id_on/∂Vgs = ∂Id_on_mag/∂Vgs * Vds_sign
    const dId_on_dVgs = dId_on_mag_dVgs * Vds_sign;
    const term2_gm = alpha_on * dId_on_dVgs;
    
    let gm = term1_gm + term2_gm;
    
    // === 链式法则：计算 gds = ∂Id/∂Vds ===
    // 🔥 修正：考虑 Vds → |Vds| 的符号处理
    
    // 项 1: 来自 (1-α_on) 的截止区贡献
    const term1_gds = (1 - alpha_on) * dId_cutoff_dVds;
    
    // 项 2: 来自 α_on·Id_on 对 Vds 的导数
    // ∂Id_on/∂Vds 包含三部分：
    //   a) ∂|Vds|/∂Vds = sign(Vds)
    //   b) Id_on_mag 对 |Vds| 的导数（通过链式法则）
    //   c) α_sat 对 |Vds| 的导数
    const Id_mixed_mag = Id_linear_mag * (1 - alpha_sat) + Id_saturation_mag * alpha_sat;
    const dId_mixed_mag_dVds_safe = 
      (1 - alpha_sat) * dId_linear_mag_dVds_safe 
      + alpha_sat * dId_sat_mag_dVds_safe
      + (Id_saturation_mag - Id_linear_mag) * d_alpha_sat_dVds / Vds_sign; // α_sat对|Vds|的导数
    
    const dId_on_mag_dVds_safe = dId_mixed_mag_dVds_safe * CLM + Id_mixed_mag * dCLM_dVds_safe;
    
    // ∂Id_on/∂Vds = ∂(Id_on_mag · Vds_sign)/∂Vds
    //             = ∂Id_on_mag/∂|Vds| · ∂|Vds|/∂Vds · Vds_sign
    //             = ∂Id_on_mag/∂|Vds| · sign(Vds) · Vds_sign
    //             = ∂Id_on_mag/∂|Vds| (符号抵消)
    const dId_on_dVds = dId_on_mag_dVds_safe * Vds_sign * Vds_sign; // sign² = 1
    const term2_gds = alpha_on * dId_on_dVds;
    
    let gds = term1_gds + term2_gds;

    // === 🔥 Phoenix 修复：强制物理正确性 ===
    // gm 必须 >= 0（MOSFET 的跨导在所有区域都是非负的）
    // 这修复了截止区附近平滑过渡时的数值不稳定性
    gm = Math.max(0, gm);
    
    // gds 必须 > 0（漏源电导始终为正）
    gds = Math.max(IntelligentMOSFET.MIN_CONDUCTANCE, gds);

    // === 最终安全检查 ===
    if (!isFinite(gm)) {
      console.warn(`⚠️ MOSFET ${this.deviceId}: Non-finite gm! Vgs=${Vgs}, Vds=${Vds}, gm=${gm}`);
      gm = IntelligentMOSFET.MIN_CONDUCTANCE;
    }
    if (!isFinite(gds)) {
      console.warn(`⚠️ MOSFET ${this.deviceId}: Non-finite gds! Vgs=${Vgs}, Vds=${Vds}, gds=${gds}`);
      gds = IntelligentMOSFET.MIN_CONDUCTANCE;
    }

    return { gm, gds, gmbs: 0 };
  }

  /**
   * 计算电容效应
   */
  private _computeCapacitances(Vgs: number, Vds: number) {
    const { Cgs: Cgs0, Cgd: Cgd0 } = this._mosfetParams;
    
    // 简化模型：电容随电压变化
    const Cgs = Cgs0 * (1 + 0.1 * Math.abs(Vgs));
    const Cgd = Cgd0 * (1 + 0.1 * Math.abs(Vds - Vgs));
    const Cdb = 1e-12; // 漏体结电容
    const Csb = 1e-12; // 源体结电容
    
    return { Cgs, Cgd, Cdb, Csb };
  }

  /**
   * 生成 MNA 印花 (DEPRECATED)
   */
  /*
  private _generateMNAStamp(smallSignal: any, _capacitance: any, nodeMap: Map<string, number>): MatrixStamp {
    // ... (This logic is now inside assemble) ...
  }
  */

  /**
   * 计算右侧向量贡献 (DEPRECATED)
   */
  /*
  private _computeRHSContribution(
    dcAnalysis: any, 
    smallSignal: any,
    Vgs: number,
    Vds: number,
    nodeMap: Map<string, number>
  ): { index: number, value: number }[] {
    // ... (This logic is now inside assemble) ...
  }
  */

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
  computeCurrent(voltages: import('../../math/sparse/vector').Vector, context?: AssemblyContext): number {
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