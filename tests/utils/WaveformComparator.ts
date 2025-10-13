/**
 * 📊 WaveformComparator - 波形數據對比工具
 * 
 * 用於比較仿真結果與解析解或其他仿真器結果
 */

export interface WaveformPoint {
  time: number;
  value: number;
}

export interface ComparisonResult {
  maxAbsError: number;          // 最大絕對誤差
  maxRelError: number;          // 最大相對誤差
  rmsError: number;             // 均方根誤差
  meanAbsError: number;         // 平均絕對誤差
  passed: boolean;              // 是否通過測試
  details: {
    worstPoint: { time: number; simulated: number; expected: number; error: number };
    totalPoints: number;
  };
}

export interface ComparisonThreshold {
  maxAbsError?: number;
  maxRelError?: number;
  rmsError?: number;
}

export class WaveformComparator {
  /**
   * 比較兩個波形
   * 
   * @param simulated - 仿真結果波形
   * @param expected - 期望結果波形（解析解或基準）
   * @param threshold - 通過標準閾值
   */
  static compare(
    simulated: WaveformPoint[],
    expected: WaveformPoint[],
    threshold: ComparisonThreshold = {}
  ): ComparisonResult {
    if (simulated.length === 0 || expected.length === 0) {
      throw new Error('波形數據不能為空');
    }
    
    // 設置默認閾值
    const {
      maxAbsError = 0.05,      // 默認 50mV
      maxRelError = 0.02,      // 默認 2%
      rmsError = 0.01          // 默認 1%
    } = threshold;
    
    // 內插對齊時間點
    const alignedData = this.alignTimePoints(simulated, expected);
    
    // 計算誤差指標
    let sumSquaredError = 0;
    let sumAbsError = 0;
    let maxAbs = 0;
    let maxRel = 0;
    let worstPoint = { time: 0, simulated: 0, expected: 0, error: 0 };
    
    for (const point of alignedData) {
      const absError = Math.abs(point.simValue - point.expValue);
      const relError = Math.abs(point.expValue) > 1e-12 
        ? absError / Math.abs(point.expValue)
        : 0;
      
      sumSquaredError += absError * absError;
      sumAbsError += absError;
      
      if (absError > maxAbs) {
        maxAbs = absError;
        worstPoint = {
          time: point.time,
          simulated: point.simValue,
          expected: point.expValue,
          error: absError
        };
      }
      
      if (relError > maxRel) {
        maxRel = relError;
      }
    }
    
    const n = alignedData.length;
    const rms = Math.sqrt(sumSquaredError / n);
    const meanAbs = sumAbsError / n;
    
    // 判斷是否通過
    const passed = maxAbs <= maxAbsError && 
                   maxRel <= maxRelError && 
                   rms <= rmsError;
    
    return {
      maxAbsError: maxAbs,
      maxRelError: maxRel,
      rmsError: rms,
      meanAbsError: meanAbs,
      passed,
      details: {
        worstPoint,
        totalPoints: n
      }
    };
  }
  
  /**
   * 對齊兩個波形的時間點（線性內插）
   */
  private static alignTimePoints(
    simulated: WaveformPoint[],
    expected: WaveformPoint[]
  ): Array<{ time: number; simValue: number; expValue: number }> {
    const result: Array<{ time: number; simValue: number; expValue: number }> = [];
    
    // 使用仿真結果的時間點為基準
    for (const simPoint of simulated) {
      const t = simPoint.time;
      const simValue = simPoint.value;
      const expValue = this.interpolate(expected, t);
      
      result.push({ time: t, simValue, expValue });
    }
    
    return result;
  }
  
  /**
   * 線性內插
   */
  private static interpolate(data: WaveformPoint[], t: number): number {
    // 找到 t 兩側的點
    if (t <= data[0]!.time) return data[0]!.value;
    if (t >= data[data.length - 1]!.time) return data[data.length - 1]!.value;
    
    for (let i = 0; i < data.length - 1; i++) {
      const p1 = data[i]!;
      const p2 = data[i + 1]!;
      
      if (t >= p1.time && t <= p2.time) {
        const alpha = (t - p1.time) / (p2.time - p1.time);
        return p1.value + alpha * (p2.value - p1.value);
      }
    }
    
    return data[data.length - 1]!.value;
  }
  
  /**
   * 生成詳細對比報告
   */
  static generateReport(result: ComparisonResult, circuitName: string): string {
    const passSymbol = result.passed ? '✅' : '❌';
    
    return `
${passSymbol} ${circuitName} 波形對比報告
${'='.repeat(50)}
最大絕對誤差: ${result.maxAbsError.toExponential(3)}
最大相對誤差: ${(result.maxRelError * 100).toFixed(2)}%
RMS 誤差:     ${result.rmsError.toExponential(3)}
平均絕對誤差: ${result.meanAbsError.toExponential(3)}

最差點詳情:
  時間: ${result.details.worstPoint.time.toExponential(3)} s
  仿真值: ${result.details.worstPoint.simulated.toFixed(6)}
  期望值: ${result.details.worstPoint.expected.toFixed(6)}
  誤差: ${result.details.worstPoint.error.toExponential(3)}

總對比點數: ${result.details.totalPoints}
測試結果: ${result.passed ? '通過 ✅' : '失敗 ❌'}
${'='.repeat(50)}
    `.trim();
  }
  
  /**
   * 計算兩個波形的皮爾遜相關係數
   */
  static correlation(waveform1: WaveformPoint[], waveform2: WaveformPoint[]): number {
    const aligned = this.alignTimePoints(waveform1, waveform2);
    const n = aligned.length;
    
    // 計算均值
    const mean1 = aligned.reduce((sum, p) => sum + p.simValue, 0) / n;
    const mean2 = aligned.reduce((sum, p) => sum + p.expValue, 0) / n;
    
    // 計算協方差和標準差
    let cov = 0;
    let var1 = 0;
    let var2 = 0;
    
    for (const p of aligned) {
      const d1 = p.simValue - mean1;
      const d2 = p.expValue - mean2;
      cov += d1 * d2;
      var1 += d1 * d1;
      var2 += d2 * d2;
    }
    
    return cov / Math.sqrt(var1 * var2);
  }
  
  /**
   * 檢查波形單調性
   */
  static isMonotonic(waveform: WaveformPoint[]): { increasing: boolean; decreasing: boolean } {
    let increasing = true;
    let decreasing = true;
    
    for (let i = 1; i < waveform.length; i++) {
      const curr = waveform[i]!.value;
      const prev = waveform[i - 1]!.value;
      
      if (curr < prev) increasing = false;
      if (curr > prev) decreasing = false;
    }
    
    return { increasing, decreasing };
  }
  
  /**
   * 檢測波形中的過衝
   */
  static detectOvershoot(waveform: WaveformPoint[], steadyStateValue: number): {
    hasOvershoot: boolean;
    peakValue: number;
    overshootPercent: number;
  } {
    const peakValue = Math.max(...waveform.map(p => p.value));
    const overshootPercent = ((peakValue - steadyStateValue) / steadyStateValue) * 100;
    
    return {
      hasOvershoot: peakValue > steadyStateValue,
      peakValue,
      overshootPercent
    };
  }
  
  /**
   * 計算上升時間（10% 到 90%）
   */
  static riseTime(waveform: WaveformPoint[], finalValue: number): number {
    const v10 = 0.1 * finalValue;
    const v90 = 0.9 * finalValue;
    
    let t10 = -1;
    let t90 = -1;
    
    for (let i = 1; i < waveform.length; i++) {
      const v = waveform[i]!.value;
      const vPrev = waveform[i - 1]!.value;
      
      if (t10 < 0 && vPrev < v10 && v >= v10) {
        t10 = waveform[i]!.time;
      }
      
      if (t90 < 0 && vPrev < v90 && v >= v90) {
        t90 = waveform[i]!.time;
        break;
      }
    }
    
    return t90 - t10;
  }
}
