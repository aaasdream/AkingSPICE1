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
  
  // Temperature-adjusted parameters
  private tSatCur: number = 1e-14;
  private tVcrit: number = 0.6;
  
  // State variables
  private voltage: number = 0;
  private current: number = 0;
  
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
      const vPos = posIdx > 0 ? context.solutionVector.get(posIdx) : 0;
      const vNeg = negIdx > 0 ? context.solutionVector.get(negIdx) : 0;
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
    
    // Store state
    this.voltage = vd;
    this.current = cd;
    
    // Compute equivalent current source: Ieq = Id - Gd * Vd
    const cdeq = cd - gd * vd;
    
    // Load RHS vector
    if (posIdx > 0) {
      context.rhs.add(posIdx, -cdeq);
    }
    if (negIdx > 0) {
      context.rhs.add(negIdx, cdeq);
    }
    
    // Load Jacobian matrix
    if (posIdx > 0 && negIdx > 0) {
      context.matrix.add(posIdx, posIdx, gd);
      context.matrix.add(posIdx, negIdx, -gd);
      context.matrix.add(negIdx, posIdx, -gd);
      context.matrix.add(negIdx, negIdx, gd);
    } else if (posIdx > 0) {
      context.matrix.add(posIdx, posIdx, gd);
    } else if (negIdx > 0) {
      context.matrix.add(negIdx, negIdx, gd);
    }
  }
  
  computeCurrent(voltages: Vector, context: AssemblyContext): number {
    // Get voltage across diode
    const posIdx = context.nodeMap.get(String(this.posNode));
    const negIdx = context.nodeMap.get(String(this.negNode));
    
    if (posIdx === undefined || negIdx === undefined) {
      return 0;
    }
    
    const vPos = posIdx > 0 ? voltages.get(posIdx) : 0;
    const vNeg = negIdx > 0 ? voltages.get(negIdx) : 0;
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
    const dvPos = posIdx > 0 ? deltaV.get(posIdx) : 0;
    const dvNeg = negIdx > 0 ? deltaV.get(negIdx) : 0;
    const dv = dvPos - dvNeg;
    
    // If change is too large, limit it
    const vt = this.CONSTKoverQ * this.TEMP;
    const vte = this.N * vt;
    const maxChange = 2.0 * vte;  // Limit to 2*Vt per iteration
    
    if (Math.abs(dv) > maxChange) {
      const scale = maxChange / Math.abs(dv);
      
      // Scale down the voltage update
      if (posIdx > 0) {
        deltaV.set(posIdx, dvPos * scale);
      }
      if (negIdx > 0) {
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
