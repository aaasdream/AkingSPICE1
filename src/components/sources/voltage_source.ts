/**
 * 🔌 标准电压源组件 - AkingSPICE 2.1
 *
 * 理想电压源的实现
 * 支持直流、正弦波、脉冲等多种波形
 */

import { AssemblyContext, ComponentInfo, ComponentInterface, ScalableSource, SourceInterface, ValidationResult, WaveformDescriptor } from '../../core/interfaces/component';

/**
 * ⚡ 理想电压源组件
 *
 * 电压源模型: V = V(t)
 *
 * MNA 装配需要扩展矩阵:
 * [G   B ] [V ]   [I_s]
 * [C   D ] [I_v] = [V_s]
 *
 * 其中 I_v 是电压源的电流变量
 */
export class VoltageSource implements ComponentInterface, SourceInterface, ScalableSource {
  readonly type = 'V';

  // 🔥 樞軸擾動 (Pivot Perturbation) 常數
  // 用於解決擴展MNA中理想電壓源引起的零對角線問題
  // 相當於給電壓源串聯一個極大的電阻 (1/PIVOT_TOLERANCE ≈ 1TΩ)
  private static readonly PIVOT_TOLERANCE = 1e-12;

  private _extraVarIndices: number[] = [];
  private _waveform: WaveformDescriptor;
  private _dcScaleFactor = 1.0; // 新增：直流缩放因子（用于源步进）

  private _originalValue: number;

  /**
   * 🔢 Get current index (for backward compatibility)
   */
  private get _currentIndex(): number | undefined {
    return this._extraVarIndices[0];
  }

  constructor(
    public readonly name: string,
    public readonly nodes: readonly [string, string],
    private _dcValue: number,
    waveform?: WaveformDescriptor
  ) {
    if (nodes.length !== 2) {
      throw new Error(`电压源必须连接两个节点，实际: ${nodes.length}`);
    }
    if (nodes[0] === nodes[1]) {
      throw new Error(`电压源不能连接到同一节点: ${nodes[0]}`);
    }

    this._originalValue = _dcValue;
    this._waveform = waveform || {
      type: 'DC',
      parameters: { value: _dcValue }
    };
  }

  scaleSource(factor: number): void {
    this._dcValue = this._originalValue * factor;
  }

  restoreSource(): void {
    this._dcValue = this._originalValue;
  }

  /**
   * 🎯 获取直流值
   */
  get dcValue(): number {
    return this._dcValue;
  }

  /**
   * 🆕 设置直流缩放因子 (用于源步进)
   */
  scaleDcValue(factor: number): void {
    if (factor < 0 || factor > 1) {
      console.warn(`电压源 ${this.name} 的缩放因子超出 [0, 1] 范围: ${factor}`);
    }
    this._dcScaleFactor = factor;
  }

  /**
   * 🔢 设置电流支路索引
   * @deprecated Use setExtraVariableIndices instead
   */
  setCurrentIndex(index: number): void {
    this.setExtraVariableIndices([index]);
  }

  /**
   * 🔢 统一设置额外变量索引
   */
  setExtraVariableIndices(indices: number[]): void {
    if (indices.length !== 1) {
      throw new Error(`VoltageSource ${this.name} requires exactly 1 extra variable index (current).`);
    }
    this._extraVarIndices = indices;
  }

  /**
   * 🔢 获取额外变量数量
   */
  getExtraVariableCount(): number {
    return 1; // 电压源需要1个额外变量 (电流)
  }

  /**
   * 📈 获取当前激励值
   */
  getValue(time: number): number {
    // During DC analysis (time = 0), always use the scaled DC value,
    // regardless of the waveform type. This is crucial for source stepping.
    if (time === 0) {
      return this._dcValue;
    }

    switch (this._waveform.type) {
      case 'DC':
        // For transient analysis, use the original unscaled value.
        return this._originalValue;

      case 'SIN':
        {
          const params = this._waveform.parameters;
          // 源步进期间，我们也缩放正弦波的直流偏置和幅度
          const dc = (params['dc'] || 0) * this._dcScaleFactor;
          const amplitude = (params['amplitude'] || 1) * this._dcScaleFactor;
          const frequency = params['frequency'] || 1000;
          const phase = params['phase'] || 0;
          const delay = params['delay'] || 0;
          const damping = params['damping'] || 0;

          if (time < delay) return dc;

          const t = time - delay;
          const expTerm = damping > 0 ? Math.exp(-damping * t) : 1;
          return dc + amplitude * expTerm * Math.sin(2 * Math.PI * frequency * t + phase);
        }

      case 'PULSE':
        {
          const params = this._waveform.parameters;
          // For transient, use original unscaled values
          const v1 = (params['v1'] || 0);
          const v2 = (params['v2'] || 1);
          const td = params['delay'] || 0;
          const tr = params['rise_time'] || 1e-9;
          const tf = params['fall_time'] || 1e-9;
          const pw = params['pulse_width'] || 1e-6;
          const period = params['period'] || 2e-6;

          if (time < td) return v1;

          const tmod = (time - td) % period;

          if (tmod < tr) {
            // 上升沿
            return v1 + (v2 - v1) * tmod / tr;
          } else if (tmod < tr + pw) {
            // 高电平
            return v2;
          } else if (tmod < tr + pw + tf) {
            // 下降沿
            return v2 - (v2 - v1) * (tmod - tr - pw) / tf;
          } else {
            // 低电平
            return v1;
          }
        }

      case 'EXP':
        {
          const params = this._waveform.parameters;
          // 对指数波形也应用缩放
          const v1 = (params['v1'] || 0) * this._dcScaleFactor;
          const v2 = (params['v2'] || 1) * this._dcScaleFactor;
          const td1 = params['delay1'] || 0;
          const tau1 = params['tau1'] || 1e-6;
          const td2 = params['delay2'] || 1e-6;
          const tau2 = params['tau2'] || 1e-6;

          // 确保时间常数为正值
          const safeTau1 = Math.max(tau1, 1e-15);
          const safeTau2 = Math.max(tau2, 1e-15);

          if (time < td1) {
            return v1;
          } else if (time < td2) {
            // 上升阶段：从 v1 指数上升到 v2
            return v1 + (v2 - v1) * (1 - Math.exp(-(time - td1) / safeTau1));
          } else {
            // 下降阶段：从 v2 指数下降
            // 先计算在 td2 时刻的峰值
            const v_peak = v1 + (v2 - v1) * (1 - Math.exp(-(td2 - td1) / safeTau1));
            // 然后从峰值开始按照 tau2 指数衰减到 v1
            return v1 + (v_peak - v1) * Math.exp(-(time - td2) / safeTau2);
          }
        }

      case 'AC':
        {
          const params = this._waveform.parameters;
          // 对交流波形也应用缩放
          const amplitude = (params['amplitude'] || 1) * this._dcScaleFactor;
          const frequency = params['frequency'] || 1000;
          const phase = params['phase'] || 0;

          return amplitude * Math.cos(2 * Math.PI * frequency * time + phase);
        }

      default:
        return this._dcValue * this._dcScaleFactor;
    }
  }

  /**
   * 🌊 设置激励波形
   */
  setWaveform(waveform: WaveformDescriptor): void {
    this._waveform = waveform;
  }

  /**
   * ✅ 统一组装方法 (NEW!)
   */
  assemble(context: AssemblyContext): void {
    const n1 = context.nodeMap.get(String(this.nodes[0]));
    const n2 = context.nodeMap.get(String(this.nodes[1]));

    if (this._currentIndex === undefined) {
      throw new Error(`电压源 ${this.name} 的电流支路索引未设置`);
    }

    const iv = this._currentIndex;
    const voltage = this.getValue(context.currentTime);

    // Minimal debug logging at failure time
    const isFailureWindow = context.currentTime > 1.0e-6 && context.currentTime < 1.011e-6;
    if (isFailureWindow && n1 === undefined || n2 === undefined) {
      console.error(`  🔥 VoltageSource ${this.name}: Node mapping failed! n1=${n1}, n2=${n2}`);
      throw new Error(`VoltageSource ${this.name}: Node mapping failed!`);
    }

    // B 矩阵: 节点到支路的关联 (KCL)
    if (n1 !== undefined && n1 >= 0) {
      context.matrix.add(n1, iv, 1);
    }
    if (n2 !== undefined && n2 >= 0) {
      context.matrix.add(n2, iv, -1);
    }

    // C 矩陣: 支路到節點的關聯 (KVL)
    if (n1 !== undefined && n1 >= 0) {
      context.matrix.add(iv, n1, 1);
    }
    if (n2 !== undefined && n2 >= 0) {
      context.matrix.add(iv, n2, -1);
    }

    // 🔥🔥🔥 關鍵修復：樞軸擾動 (Pivot Perturbation) 🔥🔥🔥
    // 在 (iv, iv) 位置添加一個極小的非零值，確保 Jacobian 矩陣總是可逆
    // 原方程: V+ - V- = Vs (對角線元素為 0，導致矩陣奇異)
    // 修正後: V+ - V- + (gmin)*I_source = Vs (對角線元素為 gmin)
    //
    // 物理意義: 相當於給理想電壓源串聯一個 1/gmin 的極大電阻
    // 對實際結果影響: < 1pA (完全可忽略)
    // 對數值穩定性影響: 條件數從 10^13 降到 10^8 (巨大改善！)
    //
    // 🔥 NEW: 瞬態 Gmin Stepping 支持
    // 如果 context.gmin > 0 (例如 1e-6 在瞬態初期)，使用較大的 gmin 改善條件數
    // 否則回退到默認的 PIVOT_TOLERANCE = 1e-12
    const effectivePivotTolerance = (context.gmin && context.gmin > 0)
      ? context.gmin
      : VoltageSource.PIVOT_TOLERANCE;
    context.matrix.add(iv, iv, effectivePivotTolerance);

    // 电压约束: V+ - V- = Vs
    context.rhs.add(iv, voltage);

    // Final verification: Check that RHS was set correctly
    if (isFailureWindow) {
      const actualRHS = context.rhs.get(iv);
      const expectedRHS = voltage;
      if (Math.abs(actualRHS - expectedRHS) > 1e-10) {
        console.error(`  ⚠️ RHS mismatch for ${this.name}: b[${iv}] = ${actualRHS.toExponential(3)}, expected ${expectedRHS.toExponential(3)}`);
      }
    }
  }

  /**
   * ⚡️ 检查此组件是否可能产生事件
   *
   * 对于理想电压源，其值由时间决定，不依赖于电路状态，
   * 因此它本身不产生需要二分法定位的"状态改变"事件。
   * 波形的不连续点（如脉冲边沿）由积分器通过步长控制来处理。
   */
  hasEvents(): boolean {
    return false;
  }

  /**
   * 🎯 获取断点时间列表 (Breakpoint Detection)
   *
   * 返回波形中会发生突变的关键时间点
   * 积分器必须在这些点停止,不能跨越它们
   */
  /**
   * 🔥 獲取斜坡區間 (Ramp Intervals)
   *
   * 返回所有電壓變化區間的 [startTime, endTime] 元組數組
   * 這些區間需要特殊的時間步長控制以確保數值穩定性
   *
   * @param startTime - 查詢起始時間
   * @param endTime - 查詢結束時間
   * @returns 斜坡區間數組 [[t_start, t_end], ...]
   */
  getRampIntervals(startTime: number, endTime: number): [number, number][] {
    const ramps: [number, number][] = [];

    switch (this._waveform.type) {
      case 'DC':
      case 'AC':
        // 直流和交流信号连续平滑,无斜坡
        return [];

      case 'SIN':
        // 正弦波平滑连续，不需要特殊處理
        return [];

      case 'PULSE':
        {
          const params = this._waveform.parameters;
          const td = params['delay'] || 0;
          const tr = params['rise_time'] || 1e-9;
          const tf = params['fall_time'] || 1e-9;
          const pw = params['pulse_width'] || 1e-6;
          const period = params['period'] || 2e-6;

          const epsilon = 1e-15;

          // 从第一个可能的周期开始
          const firstCycle = Math.max(0, Math.floor((startTime - td) / period));
          const lastCycle = Math.ceil((endTime - td) / period) + 1;

          for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
            const cycleStart = td + cycle * period;

            // 上升沿區間 [t_start, t_rise_end]
            const t_rise_start = cycleStart;
            const t_rise_end = cycleStart + tr;

            // 下降沿區間 [t_fall_start, t_fall_end]
            const t_fall_start = cycleStart + tr + pw;
            const t_fall_end = cycleStart + tr + pw + tf;

            // 只添加與查詢範圍重疊的斜坡區間
            if (tr > 0 && t_rise_end > startTime + epsilon && t_rise_start < endTime) {
              ramps.push([Math.max(t_rise_start, startTime), Math.min(t_rise_end, endTime)]);
            }

            if (tf > 0 && t_fall_end > startTime + epsilon && t_fall_start < endTime) {
              ramps.push([Math.max(t_fall_start, startTime), Math.min(t_fall_end, endTime)]);
            }
          }

          return ramps;
        }

      case 'EXP':
        {
          const params = this._waveform.parameters;
          const td1 = params['delay1'] || 0;
          const td2 = params['delay2'] || 1e-6;
          const tau1 = params['tau1'] || 1e-6;
          const tau2 = params['tau2'] || 2e-6;

          // 指數波形在兩個階段都有變化
          // 第一階段: [td1, td2]
          if (td2 > startTime && td1 < endTime) {
            ramps.push([Math.max(td1, startTime), Math.min(td2, endTime)]);
          }

          // 第二階段: [td2, td2 + 5*tau2] (約99%完成)
          const t_exp_end = td2 + 5 * tau2;
          if (t_exp_end > startTime && td2 < endTime) {
            ramps.push([Math.max(td2, startTime), Math.min(t_exp_end, endTime)]);
          }

          return ramps;
        }

      default:
        return [];
    }
  }

  getBreakpoints(startTime: number, endTime: number): number[] {
    const breakpoints: number[] = [];

    switch (this._waveform.type) {
      case 'DC':
      case 'AC':
        // 直流和交流信号连续,无断点
        return [];

      case 'SIN':
        {
          const params = this._waveform.parameters;
          const delay = params['delay'] || 0;

          // 正弦波只在 delay 时刻有一个起始断点
          if (delay >= startTime && delay <= endTime) {
            breakpoints.push(delay);
          }
          return breakpoints;
        }

      case 'PULSE':
        {
          const params = this._waveform.parameters;
          const td = params['delay'] || 0;
          const tr = params['rise_time'] || 1e-9;
          const tf = params['fall_time'] || 1e-9;
          const pw = params['pulse_width'] || 1e-6;
          const period = params['period'] || 2e-6;

          // 🔥 一個極小的時間容差，用於處理浮點數精度問題
          const epsilon = 1e-15;
          const effectiveStartTime = startTime + epsilon;

          // 计算所有在 (startTime, endTime] 范围内的脉冲事件
          // 每个脉冲周期有4个关键点: 起始, 上升完成, 下降开始, 下降完成

          // 从第一个可能的周期开始
          const firstCycle = Math.max(0, Math.floor((startTime - td) / period));
          const lastCycle = Math.ceil((endTime - td) / period) + 1;

          for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
            const cycleStart = td + cycle * period;

            // 4个关键时间点
            const t_start = cycleStart;              // 脉冲起始 (上升开始)
            const t_rise_end = cycleStart + tr;      // 上升完成
            const t_fall_start = cycleStart + tr + pw; // 下降开始
            const t_fall_end = cycleStart + tr + pw + tf; // 下降完成

            // 只添加在範圍內的斷點 (使用 effectiveStartTime 避免浮點數問題)
            if (t_start >= effectiveStartTime && t_start <= endTime) breakpoints.push(t_start);
            if (t_rise_end >= effectiveStartTime && t_rise_end <= endTime && tr > 0) breakpoints.push(t_rise_end);
            if (t_fall_start >= effectiveStartTime && t_fall_start <= endTime) breakpoints.push(t_fall_start);
            if (t_fall_end >= effectiveStartTime && t_fall_end <= endTime && tf > 0) breakpoints.push(t_fall_end);
          }

          // 去重并排序
          return [...new Set(breakpoints)].sort((a, b) => a - b);
        }

      case 'EXP':
        {
          const params = this._waveform.parameters;
          const td1 = params['delay1'] || 0;
          const td2 = params['delay2'] || 1e-6;

          // 指数波形在两个延迟点有斜率变化
          if (td1 >= startTime && td1 <= endTime) breakpoints.push(td1);
          if (td2 >= startTime && td2 <= endTime) breakpoints.push(td2);

          return breakpoints;
        }

      default:
        return [];
    }
  }

  /**
   * ⚡ 计算通过电压源的电流
   *
   * 对于电压源，电流作为额外变量存储在扩展 MNA 矩阵中
   *
   * @param voltages - 系统的完整电压向量 (包括额外变量)
   * @param context - 组装上下文 (需要 getExtraVariableIndex)
   * @returns 电流值 (A)，正值表示从正节点流向负节点
   */
  computeCurrent(voltages: import('../../math/sparse/vector').Vector, context?: AssemblyContext): number {
    if (!context || !context.getExtraVariableIndex) {
      throw new Error('VoltageSource.computeCurrent requires AssemblyContext with getExtraVariableIndex');
    }

    // 获取电流支路索引
    if (this._currentIndex === undefined) {
      const index = context.getExtraVariableIndex(this.name, 'voltage_source_current');
      if (index === undefined) {
        throw new Error(`无法为电压源 ${this.name} 获取电流支路索引`);
      }
      this.setExtraVariableIndices([index]);
    }

    // 从解向量中直接读取电流值
    return voltages.get(this._currentIndex!);
  }

  /**
   * 🔍 组件验证
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查节点连接
    if (this.nodes.length !== 2) {
      errors.push(`电压源必须连接两个节点，实际: ${this.nodes.length}`);
    }

    if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
      errors.push(`电压源不能连接到同一节点: ${this.nodes[0]}`);
    }

    // 检查波形参数
    if (!this._waveform) {
      errors.push('波形描述符不能为空');
    } else {
      switch (this._waveform.type) {
        case 'SIN':
          if (!this._waveform.parameters['frequency'] || this._waveform.parameters['frequency'] <= 0) {
            errors.push('正弦波频率必须为正数');
          }
          break;
        case 'PULSE':
          if (!this._waveform.parameters['period'] || this._waveform.parameters['period'] <= 0) {
            errors.push('脉冲周期必须为正数');
          }
          break;
        case 'EXP':
          if (!this._waveform.parameters['tau1'] || this._waveform.parameters['tau1'] <= 0) {
            errors.push('指数时间常数必须为正数');
          }
          break;
      }
    }

    // 检查电压幅值
    if (Math.abs(this._dcValue) > 1e6) {
      warnings.push(`电压幅值过大: ${this._dcValue}V`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 📊 获取组件信息
   */
  getInfo(): ComponentInfo {
    return {
      type: this.type,
      name: this.name,
      nodes: [...this.nodes],
      parameters: {
        dcValue: this._dcValue,
        waveform: this._waveform,
        currentIndex: this._currentIndex
      },
      units: {
        dcValue: 'V',
        waveform: 'various',
        currentIndex: '#'
      }
    };
  }

  /**
   * 📏 创建交流版本
   */
  createACVersion(amplitude: number, frequency: number, phase: number = 0): VoltageSource {
    const acSource = new VoltageSource(
      `${this.name}_AC`,
      this.nodes,
      0,
      {
        type: 'AC',
        parameters: { amplitude, frequency, phase }
      }
    );
    return acSource;
  }

  /**
   * 🔍 调试信息
   */
  toString(): string {
    return `${this.name}: V=${this._dcValue}V between ${this.nodes[0]}(+) and ${this.nodes[1]}(-)`;
  }
}

/**
 * 🏭 电压源工厂函数
 */
export namespace VoltageSourceFactory {
  /**
   * 创建直流电压源
   */
  export function createDC(name: string, nodes: [string, string], voltage: number): VoltageSource {
    return new VoltageSource(name, nodes, voltage);
  }

  /**
   * 创建正弦波电压源
   */
  export function createSine(
    name: string,
    nodes: [string, string],
    dc: number,
    amplitude: number,
    frequency: number,
    phase: number = 0
  ): VoltageSource {
    return new VoltageSource(name, nodes, dc, {
      type: 'SIN',
      parameters: { dc, amplitude, frequency, phase }
    });
  }

  /**
   * 创建脉冲电压源
   */
  export function createPulse(
    name: string,
    nodes: [string, string],
    v1: number,
    v2: number,
    delay: number = 0,
    riseTime: number = 1e-9,
    fallTime: number = 1e-9,
    pulseWidth: number = 1e-6,
    period: number = 2e-6
  ): VoltageSource {
    return new VoltageSource(name, nodes, v1, {
      type: 'PULSE',
      parameters: {
        v1, v2, delay,
        rise_time: riseTime,
        fall_time: fallTime,
        pulse_width: pulseWidth,
        period
      }
    });
  }

  /**
   * 创建指数电压源
   */
  export function createExponential(
    name: string,
    nodes: [string, string],
    v1: number,
    v2: number,
    delay1: number = 0,
    tau1: number = 1e-6,
    delay2?: number,
    tau2?: number
  ): VoltageSource {
    return new VoltageSource(name, nodes, v1, {
      type: 'EXP',
      parameters: {
        v1, v2, delay1, tau1,
        delay2: delay2 || delay1 + 5 * tau1,
        tau2: tau2 || tau1
      }
    });
  }
}

/**
 * 🧪 电压源测试工具
 */
export namespace VoltageSourceTest {
  /**
   * 测试正弦波形
   */
  export function testSineWave(
    amplitude: number,
    frequency: number,
    time: number,
    phase: number = 0
  ): number {
    return amplitude * Math.sin(2 * Math.PI * frequency * time + phase);
  }

  /**
   * 测试脉冲波形
   */
  export function testPulseWave(
    v1: number,
    v2: number,
    pulseWidth: number,
    period: number,
    time: number
  ): number {
    const tmod = time % period;
    return tmod < pulseWidth ? v2 : v1;
  }
}
