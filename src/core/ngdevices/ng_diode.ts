/**
 * NGSpice-based Diode Implementation
 * 
 * This implementation closely follows ngspice's diode model (dioload.c)
 * to ensure convergence and numerical stability.
 */

import { ComponentInterface, AssemblyContext, ValidationResult, ComponentInfo } from '../interfaces/component';
import { Vector } from '../../math/sparse/vector';

/**
 * Diode model parameters (based on ngspice diodefs.h)
 */
export interface NgDiodeModelParams {
  IS?: number;      // Saturation current (default: 1e-14)
  N?: number;       // Emission coefficient (default: 1.0)
  RS?: number;      // Series resistance (default: 0)
  BV?: number;      // Reverse breakdown voltage (default: infinity)
  TEMP?: number;    // Operating temperature (default: 27°C)
  
  // Junction capacitance parameters
  CJO?: number;     // Zero-bias junction capacitance (default: 0)
  VJ?: number;      // Junction potential (default: 1.0V)
  M?: number;       // Grading coefficient (default: 0.5)
  FC?: number;      // Forward-bias depletion capacitance coefficient (default: 0.5)
  TT?: number;      // Transit time (default: 0)
}

export class NgDiode implements ComponentInterface {
  readonly name: string;
  readonly type: string = 'D';
  readonly nodes: readonly string[];
  
  private posNode: string;
  private negNode: string;
  
  // Model parameters
  private IS: number;
  private N: number;
  private _RS: number;  // Prefix with _ to mark as intentionally unused for now
  private BV: number;
  private TEMP: number;
  
  // Junction capacitance parameters
  private CJO: number;
  private VJ: number;
  private M: number;
  private FC: number;
  private TT: number;
  
  // Temperature-adjusted parameters
  private tSatCur: number = 1e-14;
  private tVcrit: number = 0.6;
  
  // State variables
  private voltage: number = 0;
  private current: number = 0;
  private charge: number = 0;  // Junction charge for capacitance
  
  // Constants
  private readonly CONSTKoverQ = 8.617385e-5;  // Boltzmann constant / electron charge (V/K)
  private readonly CONSTe = Math.E;
  
  // Voltage limiting parameters (from ngspice limit.c)
  private readonly DvFwdMax = 50.0e-3;  // 50mV forward increment limit
  private readonly DvRevMax = 0.5;      // 0.5V reverse increment limit
  
  constructor(
    name: string,
    posNode: string,
    negNode: string,
    modelParams: NgDiodeModelParams = {}
  ) {
    this.name = name;
    this.posNode = posNode;
    this.negNode = negNode;
    this.nodes = [posNode, negNode];
    
    // Initialize model parameters with defaults
    this.IS = modelParams.IS ?? 1e-14;
    this.N = modelParams.N ?? 1.0;
    this._RS = modelParams.RS ?? 0;
    this.BV = modelParams.BV ?? Infinity;
    this.TEMP = modelParams.TEMP ?? 300.15;  // 27°C in Kelvin
    
    // Initialize junction capacitance parameters
    this.CJO = modelParams.CJO ?? 0;
    this.VJ = modelParams.VJ ?? 1.0;
    this.M = modelParams.M ?? 0.5;
    this.FC = modelParams.FC ?? 0.5;
    this.TT = modelParams.TT ?? 0;
    
    this.updateTemperature();
  }
  
  private updateTemperature(): void {
    const vt = this.CONSTKoverQ * this.TEMP;
    this.tSatCur = this.IS;
    
    // Calculate critical voltage (Vcrit) for limiting
    // Vcrit is the voltage where exponential becomes too large
    this.tVcrit = vt * Math.log(vt / (Math.SQRT2 * this.tSatCur));
  }
  
  /**
   * Calculate junction capacitance and charge
   * Based on ngspice dioload.c diode capacitance model
   */
  private calculateCapacitance(vd: number): { capCharge: number; capValue: number } {
    if (this.CJO === 0) {
      // No junction capacitance
      return { capCharge: 0, capValue: 0 };
    }
    
    let czero = this.CJO;
    let czof2 = czero / (1 - this.M);
    let czof3 = 1 - this.FC;
    
    // Junction capacitance calculation
    let capCharge = 0;
    let capValue = 0;  // dQ/dV (capacitance value in Farads)
    
    const vte = this.N * this.CONSTKoverQ * this.TEMP;
    const arg = vd / this.VJ;
    
    if (vd < this.FC * this.VJ) {
      // Normal reverse and slightly forward bias
      // C = CJ0 / (1 - V/VJ)^M
      // Q = CJ0 * VJ / (1-M) * (1 - (1-V/VJ)^(1-M))
      const sarg = Math.exp(-arg * this.M * Math.LN2);
      capCharge = czof2 * this.VJ * (1 - sarg);
      capValue = czero / Math.pow(1 - arg, this.M);
    } else {
      // Forward bias beyond FC
      // Use linear continuation to avoid singularity
      const f2 = Math.pow(czof3, 1 + this.M);
      const f3 = 1 - this.FC * (1 + this.M);
      capCharge = czero * (czof2 * czof3 + (1 - this.FC * (1 + this.M) + 0.5 * this.M * vd / this.VJ) * vd / this.VJ);
      capValue = czero * (f3 + this.M * vd / this.VJ) / f2;
    }
    
    // Add transit time charge (diffusion capacitance)
    if (this.TT > 0) {
      const cd = this.current;  // DC current (must be calculated first)
      capCharge += this.TT * cd;
      
      // Transit time capacitance = TT * dI/dV
      // For simplicity, use the DC conductance as an approximation
      const gd = Math.abs(cd / (vd + 1e-12));  // Avoid division by zero
      capValue += this.TT * gd;
    }
    
    return { capCharge, capValue };
  }
  
  /**
   * Limit new junction voltage using ngspice's DEVpnjlim algorithm
   * This is critical for convergence in forward-biased junctions
   */
  private pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
    // If voltage is increasing and is above critical voltage
    if (vnew > vcrit && Math.abs(vnew - vold) > (vt + vt)) {
      if (vold > 0) {
        // Limit exponential increase
        const arg = 1 + (vnew - vold) / vt;
        if (arg > 0) {
          vnew = vold + vt * Math.log(arg);
        } else {
          vnew = vcrit;
        }
      } else {
        // Starting from negative/zero, limit to vcrit
        vnew = vt * Math.log(vnew / vt);
        if (vnew > vcrit) {
          vnew = vcrit;
        }
      }
    } else {
      // Normal limiting for smaller changes
      if (vnew > vold) {
        // Forward direction - limit increment
        const vinc = vold > 0.65 ? this.DvFwdMax : 2.0 * this.DvFwdMax;
        const vlim = vold + vinc;
        if (vnew > vlim) {
          vnew = vlim;
        }
      } else if (vnew < vold) {
        // Reverse direction - check for zero crossing
        if (vnew < 0.0 && vold <= 0.05 && vold > 0.0) {
          vnew = 0.0;  // Limit to zero when crossing
        } else {
          const vinc = 2.0 * this.DvFwdMax;
          const vlim = vold - vinc;
          if (vnew < vlim) {
            vnew = vlim;
          }
        }
      }
    }
    return vnew;
  }
  
  assemble(context: AssemblyContext): void {
    // Get node indices
    const posIdx = context.nodeMap.get(String(this.posNode));
    const negIdx = context.nodeMap.get(String(this.negNode));
    
    if (posIdx === undefined || negIdx === undefined) {
      throw new Error(`NgDiode ${this.name}: Node mapping not found`);
    }
    
    // Get current voltage across diode
    let vd = 0;
    if (context.solutionVector) {
      // 🔥 FIX: 使用 >= 0 而不是 > 0，因为节点索引可以是 0
      const vPos = (posIdx !== undefined && posIdx >= 0) ? context.solutionVector.get(posIdx) : 0;
      const vNeg = (negIdx !== undefined && negIdx >= 0) ? context.solutionVector.get(negIdx) : 0;
      vd = vPos - vNeg;
    }
    
    const vt = this.CONSTKoverQ * this.TEMP;
    const vte = this.N * vt;
    
    // Limit voltage change to improve convergence
    vd = this.pnjlim(vd, this.voltage, vte, this.tVcrit);
    
    let cd = 0;
    let gd = 0;
    
    // Compute DC current and derivatives (following ngspice dioload.c)
    const csat = this.tSatCur;
    
    if (vd >= -3 * vte) {
      // Forward bias
      const evd = Math.exp(vd / vte);
      cd = csat * (evd - 1);
      gd = csat * evd / vte;
    } else if (!isFinite(this.BV) || vd >= -this.BV) {
      // Reverse bias (but not breakdown)
      const arg = 3 * vte / (vd * this.CONSTe);
      const arg3 = arg * arg * arg;
      cd = -csat * (1 + arg3);
      gd = csat * 3 * arg3 / vd;
    } else {
      // Breakdown region
      const vtebrk = vte;  // Simplified: use same emission coefficient
      const evrev = Math.exp(-(this.BV + vd) / vtebrk);
      cd = -csat * evrev;
      gd = csat * evrev / vtebrk;
    }
    
    // Add Gmin for numerical stability
    const gmin = context.gmin ?? 1e-12;
    gd = gd + gmin;
    cd = cd + gmin * vd;
    
    // Store DC state
    this.voltage = vd;
    this.current = cd;
    
    // 🔬 DEBUG: DC 计算诊断
    if (context.currentTime <= 1e-3) {
      console.log(`\n[DIODE ${this.name}] DC calculation at t=${context.currentTime.toExponential(3)}s:`);
      console.log(`  Vd=${vd.toFixed(9)}V`);
      console.log(`  cd=${cd.toExponential(6)}A (${(cd*1000).toFixed(9)}mA)`);
      console.log(`  gd=${gd.toExponential(6)}S`);
      console.log(`  csat=${csat.toExponential(3)}A, vte=${vte.toFixed(6)}V`);
      console.log(`  ceq (before cap)=${(cd - gd * vd).toExponential(6)}A`);
    }
    
    // Calculate junction capacitance (for transient analysis)
    let geq = gd;  // Equivalent conductance
    let ceq = cd - gd * vd;  // Equivalent current source
    
    // Transient analysis: add capacitive effects
    if (context.G_coeff !== undefined && this.CJO > 0) {
      // Calculate junction capacitance
      const { capCharge, capValue } = this.calculateCapacitance(vd);
      
      // Store charge
      const qNew = capCharge;
      const qOld = this.charge;
      this.charge = qNew;
      
      // 🔬 DEBUG: 診斷電容計算
      if (context.currentTime <= 1e-3) {
        console.log(`\n[DIODE ${this.name}] t=${context.currentTime.toExponential(3)}s`);
        console.log(`  Vd=${vd.toFixed(6)}V, Id=${(cd*1000).toFixed(6)}mA`);
        console.log(`  capValue=${capValue.toExponential(3)}F, capCharge=${capCharge.toExponential(3)}C`);
        console.log(`  G_coeff=${context.G_coeff.toExponential(3)}, dt=${context.dt?.toExponential(3)}s`);
        console.log(`  posNode=${this.posNode}, negNode=${this.negNode}`);
        if (context.solutionVector) {
          const posIdx = context.nodeMap.get(String(this.posNode));
          const negIdx = context.nodeMap.get(String(this.negNode));
          if (posIdx !== undefined && negIdx !== undefined) {
            const vPos = (posIdx >= 0) ? context.solutionVector.get(posIdx) : 0;
            const vNeg = (negIdx >= 0) ? context.solutionVector.get(negIdx) : 0;
            console.log(`  V(${this.posNode})=${vPos.toFixed(6)}V, V(${this.negNode})=${vNeg.toFixed(6)}V`);
          }
        }
      }
      
      // Companion model for capacitor: C dV/dt
      // Using backward difference: dV/dt ≈ (V_new - V_old) / dt
      // Capacitive current: I_cap = C * dV/dt
      // Equivalent conductance: G_cap = C / dt = C * G_coeff
      // Equivalent current: I_cap_eq = C * V_old / dt = C * V_old * G_coeff
      
      const gCap = capValue * context.G_coeff;
      
      // Get previous voltage
      let vOld = 0;
      if (context.previousSolutionVector) {
        const vPosOld = (posIdx >= 0) ? context.previousSolutionVector.get(posIdx) : 0;
        const vNegOld = (negIdx >= 0) ? context.previousSolutionVector.get(negIdx) : 0;
        vOld = vPosOld - vNegOld;
      }
      
      const iCapEq = capValue * vOld * context.G_coeff;
      
      if (context.currentTime <= 1e-6) {
        console.log(`  vOld=${vOld.toFixed(6)}V, gCap=${gCap.toExponential(3)}S`);
        console.log(`  iCapEq=${(iCapEq*1000).toFixed(6)}mA`);
        console.log(`  gd=${gd.toExponential(3)}S, geq=${(gd+gCap).toExponential(3)}S`);
      }
      
      // Add capacitive contribution
      geq = gd + gCap;
      ceq = (cd - gd * vd) + iCapEq;
    }
    
    // Load RHS vector
    // 🔥 FIX: 使用 >= 0 而不是 > 0，因为节点索引可以是 0
    if (posIdx !== undefined && posIdx >= 0) {
      context.rhs.add(posIdx, -ceq);
    }
    if (negIdx !== undefined && negIdx >= 0) {
      context.rhs.add(negIdx, ceq);
    }
    
    // Load Jacobian matrix
    // 🔥 FIX: 同样使用 >= 0
    if (posIdx !== undefined && posIdx >= 0 && negIdx !== undefined && negIdx >= 0) {
      context.matrix.add(posIdx, posIdx, geq);
      context.matrix.add(posIdx, negIdx, -geq);
      context.matrix.add(negIdx, posIdx, -geq);
      context.matrix.add(negIdx, negIdx, geq);
    } else if (posIdx !== undefined && posIdx >= 0) {
      context.matrix.add(posIdx, posIdx, geq);
    } else if (negIdx !== undefined && negIdx >= 0) {
      context.matrix.add(negIdx, negIdx, geq);
    }
  }
  
  computeCurrent(voltages: Vector, context: AssemblyContext): number {
    // Get voltage across diode
    const posIdx = context.nodeMap.get(String(this.posNode));
    const negIdx = context.nodeMap.get(String(this.negNode));
    
    if (posIdx === undefined || negIdx === undefined) {
      return 0;
    }
    
    const vPos = (posIdx >= 0) ? voltages.get(posIdx) : 0;
    const vNeg = (negIdx >= 0) ? voltages.get(negIdx) : 0;
    const vd = vPos - vNeg;
    
    const vt = this.CONSTKoverQ * this.TEMP;
    const vte = this.N * vt;
    const csat = this.tSatCur;
    
    let cd = 0;
    
    if (vd >= -3 * vte) {
      // Forward bias
      const evd = Math.exp(vd / vte);
      cd = csat * (evd - 1);
    } else if (!isFinite(this.BV) || vd >= -this.BV) {
      // Reverse bias (but not breakdown)
      const arg = 3 * vte / (vd * this.CONSTe);
      const arg3 = arg * arg * arg;
      cd = -csat * (1 + arg3);
    } else {
      // Breakdown region
      const vtebrk = vte;
      const evrev = Math.exp(-(this.BV + vd) / vtebrk);
      cd = -csat * evrev;
    }
    
    const gmin = context?.gmin ?? 1e-12;
    cd = cd + gmin * vd;
    
    return cd;
  }
  
  /**
   * Limit voltage update to prevent divergence
   * This is called by the solver when Newton-Raphson iteration is having trouble
   */
  limitUpdate(deltaV: Vector, context: AssemblyContext): boolean {
    const posIdx = context.nodeMap.get(String(this.posNode));
    const negIdx = context.nodeMap.get(String(this.negNode));
    
    if (posIdx === undefined || negIdx === undefined) {
      return false;
    }
    
    // Calculate proposed voltage change
    const dvPos = (posIdx >= 0) ? deltaV.get(posIdx) : 0;
    const dvNeg = (negIdx >= 0) ? deltaV.get(negIdx) : 0;
    const dv = dvPos - dvNeg;
    
    // If change is too large, limit it
    const vt = this.CONSTKoverQ * this.TEMP;
    const vte = this.N * vt;
    const maxChange = 2.0 * vte;  // Limit to 2*Vt per iteration
    
    if (Math.abs(dv) > maxChange) {
      const scale = maxChange / Math.abs(dv);
      
      // Scale down the voltage update
      if (posIdx >= 0) {
        deltaV.set(posIdx, dvPos * scale);
      }
      if (negIdx >= 0) {
        deltaV.set(negIdx, dvNeg * scale);
      }
      
      return true;  // Indicates that limiting was applied
    }
    
    return false;  // No limiting needed
  }
  
  validate(): ValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }
  
  getInfo(): ComponentInfo {
    return {
      name: this.name,
      type: this.type,
      nodes: this.nodes.map(n => String(n)),
      parameters: {
        IS: this.IS,
        N: this.N,
        BV: this.BV,
        voltage: this.voltage,
        current: this.current
      }
    };
  }
  
  /**
   * NgDiode does not require extra variables
   * @returns 0 (no extra variables needed)
   */
  getExtraVariableCount(): number {
    return 0;
  }
  
  /**
   * Set extra variable indices (not used for diode)
   * Included for API consistency
   */
  setExtraVariableIndices(indices: number[]): void {
    if (indices.length !== 0) {
      throw new Error(`${this.name}: Diode does not use extra variables, but ${indices.length} indices were provided.`);
    }
    // No-op for diode
  }
}
