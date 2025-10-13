/**
 * 📐 AnalyticalSolutions - 經典電路解析解庫
 * 
 * 提供常見電路的理論解析解，用於驗證仿真精度
 */

export interface RCParams {
  R: number;      // 電阻 (Ω)
  C: number;      // 電容 (F)
  V0: number;     // 初始/最終電壓 (V)
}

export interface RLParams {
  R: number;      // 電阻 (Ω)
  L: number;      // 電感 (H)
  V0: number;     // 電壓源 (V)
}

export interface RLCParams {
  R: number;      // 電阻 (Ω)
  L: number;      // 電感 (H)
  C: number;      // 電容 (F)
  V0: number;     // 初始電壓 (V)
}

export class AnalyticalSolutions {
  /**
   * RC 電路階躍響應
   * 
   * V(t) = V0 * (1 - exp(-t / τ))
   * 其中 τ = RC
   * 
   * @param t - 時間 (s)
   * @param params - RC 參數
   * @returns 電壓 (V)
   */
  static rcStepResponse(t: number, params: RCParams): number {
    const { R, C, V0 } = params;
    const tau = R * C;
    
    if (t < 0) return 0;
    return V0 * (1 - Math.exp(-t / tau));
  }
  
  /**
   * RC 電路放電響應
   * 
   * V(t) = V0 * exp(-t / τ)
   * 
   * @param t - 時間 (s)
   * @param params - RC 參數
   * @returns 電壓 (V)
   */
  static rcDischargeResponse(t: number, params: RCParams): number {
    const { R, C, V0 } = params;
    const tau = R * C;
    
    if (t < 0) return V0;
    return V0 * Math.exp(-t / tau);
  }
  
  /**
   * RL 電路階躍響應
   * 
   * I(t) = (V0/R) * (1 - exp(-R*t/L))
   * 
   * @param t - 時間 (s)
   * @param params - RL 參數
   * @returns 電流 (A)
   */
  static rlStepResponse(t: number, params: RLParams): number {
    const { R, L, V0 } = params;
    const tau = L / R;
    const I_final = V0 / R;
    
    if (t < 0) return 0;
    return I_final * (1 - Math.exp(-t / tau));
  }
  
  /**
   * RLC 串聯電路階躍響應（欠阻尼）
   * 
   * ζ < 1: 振盪衰減
   * ζ = 1: 臨界阻尼
   * ζ > 1: 過阻尼
   * 
   * @param t - 時間 (s)
   * @param params - RLC 參數
   * @returns 電壓 (V)
   */
  static rlcStepResponse(t: number, params: RLCParams): number {
    const { R, L, C, V0 } = params;
    
    if (t < 0) return 0;
    
    // 計算特徵參數
    const omega0 = 1 / Math.sqrt(L * C);              // 自然頻率
    const zeta = R / (2 * Math.sqrt(L / C));          // 阻尼比
    
    if (zeta < 1) {
      // 欠阻尼情況
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta); // 阻尼頻率
      const A = zeta / Math.sqrt(1 - zeta * zeta);
      
      return V0 * (1 - Math.exp(-zeta * omega0 * t) * 
        (Math.cos(omegaD * t) + A * Math.sin(omegaD * t)));
    } 
    else if (Math.abs(zeta - 1) < 1e-6) {
      // 臨界阻尼
      return V0 * (1 - Math.exp(-omega0 * t) * (1 + omega0 * t));
    } 
    else {
      // 過阻尼
      const s1 = -zeta * omega0 + omega0 * Math.sqrt(zeta * zeta - 1);
      const s2 = -zeta * omega0 - omega0 * Math.sqrt(zeta * zeta - 1);
      const A1 = -s2 / (s1 - s2);
      const A2 = s1 / (s1 - s2);
      
      return V0 * (1 - A1 * Math.exp(s1 * t) - A2 * Math.exp(s2 * t));
    }
  }
  
  /**
   * 計算 RLC 諧振頻率
   */
  static rlcResonantFrequency(L: number, C: number): number {
    return 1 / (2 * Math.PI * Math.sqrt(L * C));
  }
  
  /**
   * 計算 RLC 阻尼比
   */
  static rlcDampingRatio(R: number, L: number, C: number): number {
    return R / (2 * Math.sqrt(L / C));
  }
  
  /**
   * 計算 RLC 品質因數
   */
  static rlcQualityFactor(R: number, L: number, C: number): number {
    return (1 / R) * Math.sqrt(L / C);
  }
  
  /**
   * 分壓器輸出電壓
   * 
   * Vout = Vin * R2 / (R1 + R2)
   */
  static voltageDivider(Vin: number, R1: number, R2: number): number {
    return Vin * R2 / (R1 + R2);
  }
  
  /**
   * RC 低通濾波器頻率響應（增益）
   * 
   * |H(jω)| = 1 / sqrt(1 + (ω * RC)²)
   * 
   * @param frequency - 頻率 (Hz)
   * @param R - 電阻 (Ω)
   * @param C - 電容 (F)
   * @returns 增益（線性）
   */
  static rcLowPassGain(frequency: number, R: number, C: number): number {
    const omega = 2 * Math.PI * frequency;
    const tau = R * C;
    return 1 / Math.sqrt(1 + (omega * tau) ** 2);
  }
  
  /**
   * RC 低通濾波器截止頻率
   * 
   * fc = 1 / (2π * RC)
   */
  static rcCutoffFrequency(R: number, C: number): number {
    return 1 / (2 * Math.PI * R * C);
  }
  
  /**
   * 增益轉 dB
   */
  static gainToDb(gain: number): number {
    return 20 * Math.log10(Math.abs(gain));
  }
  
  /**
   * dB 轉增益
   */
  static dbToGain(db: number): number {
    return Math.pow(10, db / 20);
  }
  
  /**
   * 惠斯通電橋輸出電壓
   * 
   * Vout = Vin * (R3/(R3+R4) - R1/(R1+R2))
   */
  static wheatstoneOutput(
    Vin: number, 
    R1: number, 
    R2: number, 
    R3: number, 
    R4: number
  ): number {
    const V1 = Vin * R2 / (R1 + R2);
    const V2 = Vin * R4 / (R3 + R4);
    return V2 - V1;
  }
  
  /**
   * 並聯電阻
   */
  static parallelResistance(...resistances: number[]): number {
    const sum = resistances.reduce((acc, R) => acc + 1/R, 0);
    return 1 / sum;
  }
  
  /**
   * 串聯電阻
   */
  static seriesResistance(...resistances: number[]): number {
    return resistances.reduce((acc, R) => acc + R, 0);
  }
}
