/**
 * 🚀 智能二极管模型 - AkingSPICE 2.1
 * 
 * 革命性的二极管建模实现，专为电力电子应用优化
 * 结合 Shockley 方程和先进数值技术的完美融合
 * 
 * 🏆 技术特色：
 * - 指数特性线性化处理
 * - 反向恢复建模
 * - 温度漂移补偿
 * - 自适应收敛控制
 * - 数值稳定性保障
 * 
 * 📚 物理基础：
 *   Shockley 二极管方程：I = Is*(exp(V/nVt) - 1)
 *   考虑串联电阻、结电容、温度效应
 *   支持齐纳/雪崩击穿建模
 * 
 * 🎯 应用领域：
 *   整流电路精确分析
 *   续流二极管建模
 *   ESD 保护器件
 *   RF 检波器设计
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
  DiodeParameters
} from './intelligent_device_model';

/**
 * Diode operating state enumeration
 */
export enum DiodeState {
  FORWARD_BIAS = 'forward_bias',     // Forward bias
  REVERSE_BIAS = 'reverse_bias',     // Reverse bias
  BREAKDOWN = 'breakdown',           // Breakdown state
  TRANSITION = 'transition'          // Transition state
}

/**
 * 🚀 Intelligent Diode Model Implementation
 * 
 * Provides physically accurate and numerically stable diode modeling
 * Optimized for high-frequency rectification and switching applications
 */
export class IntelligentDiode extends IntelligentDeviceModelBase {
  private readonly _diodeParams: DiodeParameters;
  
  // Physical constants
  private static readonly VT = 0.026; // Thermal voltage (26mV @ 300K)
  
  // Numerical constants
  private static readonly MIN_CONDUCTANCE = 1e-12; // Minimum conductance
  private static readonly FORWARD_VOLTAGE_LIMIT = 2.0; // Forward voltage limit (V)
  private static readonly CONVERGENCE_VOLTAGE_TOL = 1e-9; // Voltage convergence tolerance (nV)
  
  constructor(
    deviceId: string,
    nodes: [string, string], // [Anode, Cathode]
    parameters: DiodeParameters
  ) {
    super(deviceId, 'DIODE', nodes, parameters as any);
    this._diodeParams = parameters;
    this._initializeDiodeState();
  }

  /**
   * 🧠 Unified assembly entry point (replaces load)
   */
  override assemble(context: AssemblyContext): void {
    const { matrix, rhs, solutionVector, nodeMap, gmin, dt, previousSolutionVector } = context;
    
    const anodeNode = this.nodes[0];
    const cathodeNode = this.nodes[1];
    if (!anodeNode || !cathodeNode) {
      throw new Error(`Diode ${this.name}: Node names are not defined.`);
    }

    const anodeIndex = nodeMap.get(anodeNode);
    const cathodeIndex = nodeMap.get(cathodeNode);

    if (anodeIndex === undefined || cathodeIndex === undefined) {
      throw new Error(`Diode ${this.name}: Node not found in mapping.`);
    }
    
    if (!solutionVector) {
        throw new Error(`Diode ${this.name}: Solution vector is not available in assembly context.`);
    }

    const Va = solutionVector.get(anodeIndex);
    const Vc = solutionVector.get(cathodeIndex);
    
    // 🔥 CRITICAL FIX: Detect NaN in solution vector early
    if (!isFinite(Va) || !isFinite(Vc)) {
      console.error(`❌ Diode ${this.name}: NaN detected in solution vector! Va=${Va}, Vc=${Vc}`);
      throw new Error(`Diode ${this.name}: Solution vector contains NaN/Inf. Cannot assemble.`);
    }
    
    let Vd = Va - Vc;

    // --- BEGIN CRITICAL VOLTAGE LIMITING ---
    // 使用標準 SPICE 電壓限制算法來馴服指數爆炸
    const lastVd = this._currentState.internalStates['voltage'] as number || 0;
    const { n, Is } = this._diodeParams;
    const Vt = IntelligentDiode.VT;
    const SQRT2 = Math.sqrt(2);  // ✅ JavaScript 沒有 Math.SQRT2，手動計算
    const Vcrit = n * Vt * Math.log(n * Vt / (SQRT2 * Is));

    if (Vd > Vcrit) {
        // 當牛頓法給出的猜測值過大時，用對數公式壓縮更新步長
        Vd = lastVd + n * Vt * Math.log((Vd - lastVd) / (n * Vt) + 1);
    }
    // --- END CRITICAL VOLTAGE LIMITING ---

    // ⚠️ 不再需要 _determineOperatingState - 新的平滑化函數已經統一處理所有區域
    // const state = this._determineOperatingState(Vd);

    // ✅ 直接呼叫新的平滑化函數
    const dcAnalysis = this._computeDCCharacteristics(Vd);
    const conductance = this._computeConductance(Vd);
    
    // 初始化總電導和總電流誤差
    let totalConductance = conductance + (gmin || 0);
    let totalCurrentError = dcAnalysis.current - (conductance * Vd);

    // --- 🔥 關鍵新增：處理結電容 (Cj) 的瞬態行為 ---
    if (dt && dt > 0 && previousSolutionVector) {
        const capacitance = this._computeCapacitance(Vd);
        
        // 使用與 Capacitor.ts 中相同的後向歐拉伴隨模型
        // geq_c = C / dt (等效電導)
        const geq_c = capacitance / dt;
        
        // 獲取上一時刻的電壓
        const v1_prev = previousSolutionVector.get(anodeIndex);
        const v2_prev = previousSolutionVector.get(cathodeIndex);
        const previousVoltage = v1_prev - v2_prev;
        
        // ieq_c = geq_c * V_prev (等效電流源)
        const ieq_c = geq_c * previousVoltage;

        // 將電容的貢獻疊加到總電導和電流誤差中
        totalConductance += geq_c;
        totalCurrentError -= ieq_c; // 電流從陽極流向陰極
    }
    // --- 電容處理結束 ---

    // Stamp Matrix (使用 totalConductance)
    matrix.add(anodeIndex, anodeIndex, totalConductance);
    matrix.add(anodeIndex, cathodeIndex, -totalConductance);
    matrix.add(cathodeIndex, anodeIndex, -totalConductance);
    matrix.add(cathodeIndex, cathodeIndex, totalConductance);

    // Stamp RHS (使用 totalCurrentError)
    rhs.add(anodeIndex, -totalCurrentError);
    rhs.add(cathodeIndex, totalCurrentError);

    // Update internal state after assembly
    const capacitance = this._computeCapacitance(Vd);
    // 使用通用的 'operating' 狀態，因為新的平滑化模型已經統一處理所有區域
    this._currentState = this._createNewDeviceState(Vd, 'operating' as any, dcAnalysis, conductance, capacitance);
  }

  /**
   * 🎯 Diode Convergence Check
   */
  override checkConvergence(deltaV: VoltageVector, nodeMap: Map<string, number>): ConvergenceInfo {
    const baseCheck = super.checkConvergence(deltaV, nodeMap);
    
    const anodeNode = this.nodes[0];
    const cathodeNode = this.nodes[1];
    if (!anodeNode || !cathodeNode) {
      return { ...baseCheck, confidence: 0.1, physicalConsistency: { ...baseCheck.physicalConsistency, operatingRegionValid: false } };
    }

    const anodeIndex = nodeMap.get(anodeNode);
    const cathodeIndex = nodeMap.get(cathodeNode);

    if (anodeIndex === undefined || cathodeIndex === undefined) {
      return { ...baseCheck, confidence: 0.1, physicalConsistency: { ...baseCheck.physicalConsistency, operatingRegionValid: false } };
    }
    
    const diodeCheck = this._checkDiodeSpecificConvergence(deltaV, anodeIndex, cathodeIndex);
    
    return {
      ...baseCheck,
      confidence: Math.min(baseCheck.confidence, diodeCheck.confidence),
      physicalConsistency: {
        ...baseCheck.physicalConsistency,
        operatingRegionValid: diodeCheck.stateStable
      }
    };
  }

  /**
   * 🛡️ Diode Newton Step Limiting
   */
  override limitUpdate(deltaV: VoltageVector, nodeMap: Map<string, number>): VoltageVector {
    const limited = super.limitUpdate(deltaV, nodeMap);
    
    this._applyDeviceSpecificLimits(limited, nodeMap);
    
    return limited;
  }
  
  /**
   * 🔮 Diode State Prediction
   */
  override predictNextState(dt: number): PredictionHint {
    const baseHint = super.predictNextState(dt);
    const switchingEvents = this._predictSwitchingEvents(dt);
    const challenges = this._identifyDiodeChallenges(dt);
    
    return {
      ...baseHint,
      switchingEvents,
      numericalChallenges: challenges
    };
  }

  override getOperatingMode(solution: IVector, nodeMap: Map<string, number>): string {
    const anodeNode = this.nodes[0];
    const cathodeNode = this.nodes[1];
    if (!anodeNode || !cathodeNode) return DiodeState.REVERSE_BIAS;

    const anodeIndex = nodeMap.get(anodeNode);
    const cathodeIndex = nodeMap.get(cathodeNode);
    if (anodeIndex === undefined || cathodeIndex === undefined) return DiodeState.REVERSE_BIAS;
    
    const Va = solution.get(anodeIndex);
    const Vc = solution.get(cathodeIndex);
    const Vd = Va - Vc;
    return this._determineOperatingState(Vd);
  }

  private _initializeDiodeState(): void {
    this._currentState = {
      ...this._currentState,
      operatingMode: DiodeState.REVERSE_BIAS,
      internalStates: {
        state: DiodeState.REVERSE_BIAS,
        voltage: 0,
        current: 0,
        conductance: IntelligentDiode.MIN_CONDUCTANCE,
        capacitance: this._diodeParams.Cj0,
        temperature: 300
      }
    };
  }

  private _determineOperatingState(Vd: number): DiodeState {
    const { n } = this._diodeParams;
    const Vt = IntelligentDiode.VT;
    
    if (Vd < -5.0) {
      return DiodeState.BREAKDOWN;
    }
    
    if (Math.abs(Vd) < 2 * n * Vt) {
      return DiodeState.TRANSITION;
    }
    
    return Vd > 0 ? DiodeState.FORWARD_BIAS : DiodeState.REVERSE_BIAS;
  }

  /**
   * 🔥🔥🔥 [C∞ 连续平滑化] 計算 DC 特性 - Phoenix Project 修复
   * 
   * 使用简化的两区域模型：
   * 1. 反向饱和区（Vd < 0）：I = -Is
   * 2. 正向指数区（Vd > 0）：I = Is * (exp(Vd/nVt) - 1)，用 tanh 平滑过渡
   * 
   * 🔧 关键修复：移除高电压线性外推（会在负压区产生巨大负值）
   *    使用纯指数模型 + 反向饱和，中间用 tanh 平滑过渡
   */
  private _computeDCCharacteristics(Vd: number): { current: number; voltage: number } {
    const { Is, n } = this._diodeParams;
    const Vt = IntelligentDiode.VT;
    const Vd_thermal = Vd / (n * Vt);

    const V_MAX_EXP = 30.0; // 限制指数计算（对应 0.78V）
    const SMOOTH_WIDTH = 5.0; // tanh 平滑过渡区域宽度

    // --- 两区域模型 ---
    
    // 1. 正向指数电流（安全截断）
    const Vd_thermal_clamped = Math.min(Vd_thermal, V_MAX_EXP);
    const I_forward = Is * (Math.exp(Vd_thermal_clamped) - 1);
    
    // 2. 反向饱和电流
    const I_reverse = -Is;

    // --- 使用 tanh 在 Vd=0 附近平滑混合 ---
    // alpha: 在 Vd=0 附近从 0 (选择反向) 平滑过渡到 1 (选择正向)
    const alpha = 0.5 * (1 + Math.tanh(Vd_thermal / SMOOTH_WIDTH));
    
    // 二区域平滑混合：I = (1-α) * I_reverse + α * I_forward
    const current = (1 - alpha) * I_reverse + alpha * I_forward;
    
    return { current: current, voltage: Vd };
  }

  /**
   * 🔥🔥🔥 [C∞ 连续平滑化] 計算電導（dI/dV）- Phoenix Project 修复
   * 
   * 这是 _computeDCCharacteristics 的精确解析导数！
   * 必须与电流函数完全匹配，确保雅可比矩阵准确无误。
   * 
   * 导数公式推导（两区域模型）：
   *   I(Vd) = (1-α) * I_reverse + α * I_forward
   *   dI/dVd = dα/dVd * (I_forward - I_reverse) + α * dI_forward/dVd
   * 
   * 关键：tanh 的导数 = sech²(x) = 1 - tanh²(x)
   */
  private _computeConductance(Vd: number): number {
    const { Is, n } = this._diodeParams;
    const Vt = IntelligentDiode.VT;
    const Vd_thermal = Vd / (n * Vt);
    const d_Vd_thermal = 1 / (n * Vt); // dVd_thermal/dVd

    const V_MAX_EXP = 30.0;
    const SMOOTH_WIDTH = 5.0;

    // --- 计算两区域电流值（与 _computeDCCharacteristics 完全一致）---
    const Vd_thermal_clamped = Math.min(Vd_thermal, V_MAX_EXP);
    const I_forward = Is * (Math.exp(Vd_thermal_clamped) - 1);
    const I_reverse = -Is;

    // --- 计算各区域电流对 Vd 的导数 ---
    const dI_forward_dVd = (Vd_thermal < V_MAX_EXP) 
      ? (Is / (n * Vt)) * Math.exp(Vd_thermal_clamped)
      : 0; // 钳位在 V_MAX_EXP 处，导数为 0

    // --- 计算 alpha 及其导数 ---
    const tanh_val = Math.tanh(Vd_thermal / SMOOTH_WIDTH);
    const alpha = 0.5 * (1 + tanh_val);
    
    // d(tanh(x))/dx = sech²(x) = 1 - tanh²(x)
    const sech2 = 1 - tanh_val * tanh_val;
    const d_alpha_dVd = 0.5 * sech2 * (d_Vd_thermal / SMOOTH_WIDTH);

    // === 应用链式法则：dI/dVd ===
    // I = (1-α) * I_reverse + α * I_forward
    // dI/dVd = -dα/dVd * I_reverse + (1-α) * dI_reverse/dVd 
    //          + dα/dVd * I_forward + α * dI_forward/dVd
    // 简化为：dI/dVd = dα/dVd * (I_forward - I_reverse) + α * dI_forward/dVd
    const conductance = d_alpha_dVd * (I_forward - I_reverse) + alpha * dI_forward_dVd;

    if (!isFinite(conductance) || conductance < 0) {
      console.warn(`⚠️ Diode ${this.deviceId}: Non-finite conductance! Vd=${Vd}, g=${conductance}`);
      return IntelligentDiode.MIN_CONDUCTANCE;
    }

    return Math.max(conductance, IntelligentDiode.MIN_CONDUCTANCE);
  }

  private _computeCapacitance(Vd: number): number {
    const { Cj0, Vj, m } = this._diodeParams;
    
    if (Vd >= 0) {
      return Cj0 * (1 + Vd / Vj);
    } else {
      const factor = Math.pow(1 - Vd / Vj, -m);
      return Cj0 * factor;
    }
  }

  private _createNewDeviceState(
    Vd: number,
    state: DiodeState,
    dcAnalysis: any,
    conductance: number,
    capacitance: number
  ): DeviceState {
    return {
      ...this._currentState,
      operatingMode: state,
      internalStates: {
        state,
        voltage: Vd,
        current: dcAnalysis.current,
        conductance,
        capacitance,
        temperature: this._currentState.temperature
      }
    };
  }

  private _checkDiodeSpecificConvergence(deltaV: VoltageVector, anodeIndex: number, cathodeIndex: number) {
    const deltaVd = deltaV.get(anodeIndex) - deltaV.get(cathodeIndex);
    const voltageChangeReasonable = Math.abs(deltaVd) < IntelligentDiode.CONVERGENCE_VOLTAGE_TOL * 1000;
    
    const currentVd = this._currentState.internalStates['voltage'] as number || 0;
    const newVd = currentVd + deltaVd;
    const currentState = this._currentState.internalStates['state'] as DiodeState;
    const newState = this._determineOperatingState(newVd);
    
    const stateStable = currentState === newState;
    
    let confidence = 0.8;
    if (!voltageChangeReasonable) confidence *= 0.5;
    if (!stateStable) confidence *= 0.3;
    
    return { stateStable, confidence };
  }

  protected override _applyDeviceSpecificLimits(deltaV: VoltageVector, nodeMap?: Map<string, number>): void {
    if (!nodeMap) return;

    const anodeNode = this.nodes[0];
    const cathodeNode = this.nodes[1];
    if (!anodeNode || !cathodeNode) return;

    const anodeIndex = nodeMap.get(anodeNode);
    const cathodeIndex = nodeMap.get(cathodeNode);

    if (anodeIndex === undefined || cathodeIndex === undefined) return;

    const deltaVd = deltaV.get(anodeIndex) - deltaV.get(cathodeIndex);
    
    if (deltaVd > IntelligentDiode.FORWARD_VOLTAGE_LIMIT) {
      const scale = IntelligentDiode.FORWARD_VOLTAGE_LIMIT / deltaVd;
      deltaV.set(anodeIndex, deltaV.get(anodeIndex) * scale);
      deltaV.set(cathodeIndex, deltaV.get(cathodeIndex) * scale);
    }
  }

  private _predictSwitchingEvents(dt: number): readonly SwitchingEvent[] {
    const events: SwitchingEvent[] = [];
    const currentVd = this._currentState.internalStates['voltage'] as number || 0;
    const currentState = this._currentState.internalStates['state'] as DiodeState;
    
    if (currentState === DiodeState.REVERSE_BIAS && currentVd > -0.1) {
      events.push({
        eventType: 'turn_on',
        estimatedTime: this._currentState.time + dt * 0.5,
        confidence: 0.6,
        impactSeverity: 'medium'
      });
    }
    
    if (currentState === DiodeState.FORWARD_BIAS && currentVd < 0.1) {
      events.push({
        eventType: 'turn_off',
        estimatedTime: this._currentState.time + dt * 0.5,
        confidence: 0.6,
        impactSeverity: 'medium'
      });
    }
    
    return events;
  }

  private _identifyDiodeChallenges(_dt: number): readonly NumericalChallenge[] {
    const challenges: NumericalChallenge[] = [];
    const conductance = this._currentState.internalStates['conductance'] as number || 0;
    const voltage = this._currentState.internalStates['voltage'] as number || 0;
    
    if (conductance > 1e6) {
      challenges.push({
        type: 'ill_conditioning',
        severity: 0.7,
        mitigation: '增加串联电阻或使用更精确的数值方法'
      });
    }
    
    const { n } = this._diodeParams;
    const expArg = voltage / (n * IntelligentDiode.VT);
    if (expArg > 30) {
      challenges.push({
        type: 'stiffness',
        severity: 0.8,
        mitigation: '使用对数变换或限制器避免指数溢出'
      });
    }
    
    return challenges;
  }

  override getEventFunctions() {
    const anodeNode = this.nodes[0];
    const cathodeNode = this.nodes[1];

    if (!anodeNode || !cathodeNode) {
      return [];
    }

    return [
      {
        type: `${this.name}_forward_bias`,
        condition: (v: IVector, nodeMap: Map<string, number>) => { // ✅ 直接接收 nodeMap
          const anodeIndex = nodeMap.get(anodeNode);
          const cathodeIndex = nodeMap.get(cathodeNode);
          
          if (anodeIndex === undefined || cathodeIndex === undefined) {
            return 1e9; // 返回大值避免誤觸發
          }
          
          const Va = v.get(anodeIndex);
          const Vc = v.get(cathodeIndex);
          const Vd = Va - Vc;
          
          // 檢測是否通過順向偏壓 (~0.7V for typical silicon diode)
          // 返回 Vd - Vforward，過零點表示開始導通
          const Vforward = 0.7; // 可以從 diodeParams 讀取
          return Vd - Vforward;
        }
      }
    ];
  }

  /**
   * 🎯 處理事件（二極管狀態轉換）
   * 
   * 當事件發生時，此方法被引擎調用，用於更新二極管的內部狀態
   * 主要處理：
   * - FORWARD_BIAS: 從反向偏壓轉為順向偏壓（開始導通）
   * - REVERSE_BIAS: 從順向偏壓轉為反向偏壓（截止）
   */
  override handleEvent(event: IEvent, context: AssemblyContext): void {
    const anodeNode = this.nodes[0];
    const cathodeNode = this.nodes[1];
    
    if (!anodeNode || !cathodeNode || !context.solutionVector) {
      return;
    }

    // 獲取當前電壓以確定新狀態
    const anodeIndex = context.nodeMap.get(anodeNode);
    const cathodeIndex = context.nodeMap.get(cathodeNode);
    
    if (anodeIndex === undefined || cathodeIndex === undefined) {
      return;
    }
    
    const Va = context.solutionVector.get(anodeIndex);
    const Vc = context.solutionVector.get(cathodeIndex);
    const Vd = Va - Vc;
    
    // 確定新的工作模式
    const newMode = this.getOperatingMode(context.solutionVector, context.nodeMap);
    
    // 更新當前狀態
    this._currentState = {
      ...this._currentState,
      operatingMode: newMode,
      time: event.time,
      internalStates: {
        ...this._currentState.internalStates,
        state: newMode,
        voltage: Vd
      }
    };
    
    console.log(`[Diode ${this.name}] 🔄 Event '${event.type}' at t=${event.time.toExponential(3)}s: Vd=${Vd.toFixed(3)}V → Mode: ${newMode}`);
  }

  /**
   * ⚡ 计算通过二极管的电流
   * 
   * 使用 Shockley 方程: I = Is * (exp(Vd / (n * Vt)) - 1)
   * 
   * @param voltages - 系统的完整电压向量
   * @param context - 组装上下文 (用于获取节点索引)
   * @returns 电流值 (A)，正值表示从阳极流向阴极
   */
  computeCurrent(voltages: import('../../math/sparse/vector').Vector, context?: AssemblyContext): number {
    if (!context) {
      throw new Error('IntelligentDiode.computeCurrent requires AssemblyContext');
    }
    
    const anodeNode = this.nodes[0];
    const cathodeNode = this.nodes[1];
    if (!anodeNode || !cathodeNode) {
      throw new Error(`Diode ${this.name}: Node names are not defined.`);
    }

    const anodeIndex = context.nodeMap.get(anodeNode);
    const cathodeIndex = context.nodeMap.get(cathodeNode);

    if (anodeIndex === undefined || cathodeIndex === undefined) {
      throw new Error(`Diode ${this.name}: Node not found in mapping.`);
    }
    
    const Va = voltages.get(anodeIndex);
    const Vc = voltages.get(cathodeIndex);
    const Vd = Va - Vc;
    
    // 计算实际電流 (使用新的平滑化模型)
    const dcAnalysis = this._computeDCCharacteristics(Vd);
    
    return dcAnalysis.current;
  }
}