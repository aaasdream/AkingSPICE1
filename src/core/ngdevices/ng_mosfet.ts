/**
 * NGSpice-based MOSFET Level 1 Implementation
 * 
 * Simplified implementation based on ngspice MOS1 model
 * This is a basic Shichman-Hodges model for N-channel and P-channel MOSFETs
 */

import { ComponentInterface, AssemblyContext, ValidationResult, ComponentInfo } from '../interfaces/component';
import { Vector } from '../../math/sparse/vector';

export interface NgMosfetModelParams {
  VTO?: number;     // Zero-bias threshold voltage (default: 0 for NMOS, 0 for PMOS)
  KP?: number;      // Transconductance parameter (default: 2e-5 A/V²)
  LAMBDA?: number;  // Channel-length modulation (default: 0)
  PHI?: number;     // Surface potential (default: 0.6 V)
  GAMMA?: number;   // Body effect parameter (default: 0)
  W?: number;       // Channel width (default: 1e-6 m)
  L?: number;       // Channel length (default: 1e-6 m)
  TYPE?: 'NMOS' | 'PMOS';  // Device type (default: NMOS)
  TEMP?: number;    // Operating temperature (default: 300.15 K)
}

export class NgMosfet implements ComponentInterface {
  readonly name: string;
  readonly type: string = 'M';
  readonly nodes: readonly string[];
  
  private drainNode: string;
  private gateNode: string;
  private sourceNode: string;
  private bulkNode: string;
  
  // Model parameters
  private VTO: number;
  private KP: number;
  private LAMBDA: number;
  private PHI: number;
  private GAMMA: number;
  private W: number;
  private L: number;
  private deviceType: number;  // 1 for NMOS, -1 for PMOS
  private TEMP: number;
  
  // State variables
  private vgs: number = 0;
  private vds: number = 0;
  private vbs: number = 0;
  private id: number = 0;
  private gm: number = 0;
  private gds: number = 0;
  private gmbs: number = 0;
  
  // Operating mode
  private mode: number = 1;  // 1 for normal, -1 for reverse
  
  // Constants
  private readonly CONSTKoverQ = 8.617385e-5;
  
  constructor(
    name: string,
    drainNode: string,
    gateNode: string,
    sourceNode: string,
    bulkNode: string,
    modelParams: NgMosfetModelParams = {}
  ) {
    this.name = name;
    this.drainNode = drainNode;
    this.gateNode = gateNode;
    this.sourceNode = sourceNode;
    this.bulkNode = bulkNode;
    this.nodes = [drainNode, gateNode, sourceNode, bulkNode];
    
    const type = modelParams.TYPE ?? 'NMOS';
    this.deviceType = type === 'NMOS' ? 1 : -1;
    
    // Initialize model parameters
    this.VTO = modelParams.VTO ?? (type === 'NMOS' ? 1.0 : -1.0);
    this.KP = modelParams.KP ?? 2e-5;
    this.LAMBDA = modelParams.LAMBDA ?? 0;
    this.PHI = modelParams.PHI ?? 0.6;
    this.GAMMA = modelParams.GAMMA ?? 0;
    this.W = modelParams.W ?? 1e-6;
    this.L = modelParams.L ?? 1e-6;
    this.TEMP = modelParams.TEMP ?? 300.15;
  }
  
  /**
   * Limit FET voltages to prevent numerical issues
   */
  private fetlim(vnew: number, vold: number, vto: number): number {
    const vtsthi = Math.abs(2 * (vold - vto)) + 2;
    const vtstlo = vtsthi / 2;
    const vtox = vto + 3.5;
    const delv = vnew - vold;
    
    if (vold >= vto) {
      if (vold >= vtox) {
        if (delv <= 0) {
          // Going down
          if (vnew >= vtox) {
            if (-delv > vtstlo) {
              vnew = vold - vtstlo;
            }
          } else {
            vnew = Math.max(vnew, vto + 2);
          }
        } else {
          // Going up
          if (delv >= vtsthi) {
            vnew = vold + vtsthi;
          }
        }
      } else {
        // Middle region
        if (delv <= 0) {
          if (vnew <= vto + 0.5) {
            if (vold <= vto + 0.5) {
              vnew = Math.max(vnew, vto);
            } else {
              vnew = vto + 0.5;
            }
          }
        } else {
          vnew = Math.min(vnew, vto + 4);
        }
      }
    } else {
      // Vgs < Vto (cutoff)
      if (delv <= 0) {
        if (delv <= -vtsthi) {
          vnew = vold - vtsthi;
        }
      } else {
        const vtemp = vto + 2;
        if (vnew >= vtemp) {
          if (delv >= vtsthi) {
            vnew = vold + vtsthi;
          }
        } else {
          vnew = Math.min(vnew, vtemp);
        }
      }
    }
    return vnew;
  }
  
  assemble(context: AssemblyContext): void {
    // Get node indices
    const dIdx = context.nodeMap.get(String(this.drainNode));
    const gIdx = context.nodeMap.get(String(this.gateNode));
    const sIdx = context.nodeMap.get(String(this.sourceNode));
    const bIdx = context.nodeMap.get(String(this.bulkNode));
    
    if (dIdx === undefined || gIdx === undefined || 
        sIdx === undefined || bIdx === undefined) {
      throw new Error(`NgMosfet ${this.name}: Node mapping not found`);
    }
    
    // Get current voltages
    let vgs_new, vds_new, vbs_new;
    if (context.solutionVector) {
      const vd = dIdx > 0 ? context.solutionVector.get(dIdx) : 0;
      const vg = gIdx > 0 ? context.solutionVector.get(gIdx) : 0;
      const vs = sIdx > 0 ? context.solutionVector.get(sIdx) : 0;
      const vb = bIdx > 0 ? context.solutionVector.get(bIdx) : 0;
      
      vgs_new = this.deviceType * (vg - vs);
      vds_new = this.deviceType * (vd - vs);
      vbs_new = this.deviceType * (vb - vs);
    } else {
      vgs_new = 0;
      vds_new = 0;
      vbs_new = 0;
    }
    
    // Limit voltages for convergence
    vgs_new = this.fetlim(vgs_new, this.vgs, this.VTO);
    vds_new = Math.max(vds_new, 0);  // Ensure vds >= 0
    
    // Determine operating mode
    if (vds_new >= 0) {
      this.mode = 1;  // Normal mode
    } else {
      this.mode = -1;  // Reverse mode
      const temp = vds_new;
      vds_new = -vds_new;
      const vgs_temp = vgs_new;
      vgs_new = vgs_new - temp;
    }
    
    // Calculate threshold voltage with body effect
    const phi = this.PHI;
    const vth = this.VTO + this.GAMMA * (Math.sqrt(phi - vbs_new) - Math.sqrt(phi));
    
    let id = 0;
    let gm = 0;
    let gds = 0;
    let gmbs = 0;
    
    const gmin = context.gmin ?? 1e-12;
    const beta = this.KP * (this.W / this.L);
    
    if (vgs_new <= vth) {
      // Cutoff region
      id = 0;
      gm = 0;
      gds = gmin;
      gmbs = 0;
    } else {
      // Calculate drain current and transconductances
      const vgs_eff = vgs_new - vth;
      const vdsat = vgs_eff;  // Saturation voltage
      
      if (vds_new < vdsat) {
        // Linear (triode) region
        id = beta * ((vgs_eff - 0.5 * vds_new) * vds_new) * (1 + this.LAMBDA * vds_new);
        gm = beta * vds_new * (1 + this.LAMBDA * vds_new);
        gds = beta * (vgs_eff - vds_new) * (1 + this.LAMBDA * vds_new) + 
              beta * ((vgs_eff - 0.5 * vds_new) * vds_new) * this.LAMBDA + gmin;
      } else {
        // Saturation region
        id = 0.5 * beta * vgs_eff * vgs_eff * (1 + this.LAMBDA * vds_new);
        gm = beta * vgs_eff * (1 + this.LAMBDA * vds_new);
        gds = 0.5 * beta * vgs_eff * vgs_eff * this.LAMBDA + gmin;
      }
      
      // Body transconductance
      if (this.GAMMA > 0 && (phi - vbs_new) > 0) {
        gmbs = -gm * this.GAMMA / (2 * Math.sqrt(phi - vbs_new));
      }
    }
    
    // Store state
    this.vgs = vgs_new;
    this.vds = vds_new;
    this.vbs = vbs_new;
    this.id = id;
    this.gm = gm;
    this.gds = gds;
    this.gmbs = gmbs;
    
    // Build equivalent circuit
    // Id = gm*Vgs + gds*Vds + gmbs*Vbs + Ieq
    const ieq = id - gm * vgs_new - gds * vds_new - gmbs * vbs_new;
    
    // Load matrix and RHS based on mode
    const sign = this.deviceType * this.mode;
    
    // Current flows from drain to source
    if (dIdx > 0) {
      context.rhs.add(dIdx, -sign * ieq);
      if (dIdx > 0) context.matrix.add(dIdx, dIdx, gds);
      if (sIdx > 0) context.matrix.add(dIdx, sIdx, -gds);
      if (gIdx > 0) context.matrix.add(dIdx, gIdx, gm);
      if (bIdx > 0) context.matrix.add(dIdx, bIdx, gmbs);
    }
    
    if (sIdx > 0) {
      context.rhs.add(sIdx, sign * ieq);
      if (dIdx > 0) context.matrix.add(sIdx, dIdx, -gds);
      if (sIdx > 0) context.matrix.add(sIdx, sIdx, gds);
      if (gIdx > 0) context.matrix.add(sIdx, gIdx, -gm);
      if (bIdx > 0) context.matrix.add(sIdx, bIdx, -gmbs);
    }
  }
  
  computeCurrent(voltages: Vector, context: AssemblyContext): number {
    const dIdx = context.nodeMap.get(String(this.drainNode));
    const gIdx = context.nodeMap.get(String(this.gateNode));
    const sIdx = context.nodeMap.get(String(this.sourceNode));
    const bIdx = context.nodeMap.get(String(this.bulkNode));
    
    if (dIdx === undefined || gIdx === undefined || 
        sIdx === undefined || bIdx === undefined) {
      return 0;
    }
    
    const vd = dIdx > 0 ? voltages.get(dIdx) : 0;
    const vg = gIdx > 0 ? voltages.get(gIdx) : 0;
    const vs = sIdx > 0 ? voltages.get(sIdx) : 0;
    const vb = bIdx > 0 ? voltages.get(bIdx) : 0;
    
    let vgs = this.deviceType * (vg - vs);
    let vds = this.deviceType * (vd - vs);
    const vbs = this.deviceType * (vb - vs);
    
    // Handle reverse mode
    let sign = 1;
    if (vds < 0) {
      vds = -vds;
      vgs = vgs - this.deviceType * (vd - vs);
      sign = -1;
    }
    
    const phi = this.PHI;
    const vth = this.VTO + this.GAMMA * (Math.sqrt(phi - vbs) - Math.sqrt(phi));
    
    if (vgs <= vth) {
      return 0;
    }
    
    const beta = this.KP * (this.W / this.L);
    const vgs_eff = vgs - vth;
    const vdsat = vgs_eff;
    
    let id = 0;
    if (vds < vdsat) {
      id = beta * ((vgs_eff - 0.5 * vds) * vds) * (1 + this.LAMBDA * vds);
    } else {
      id = 0.5 * beta * vgs_eff * vgs_eff * (1 + this.LAMBDA * vds);
    }
    
    return this.deviceType * sign * id;
  }
  
  /**
   * Limit voltage update to prevent divergence
   * Based on ngspice's MOSFET limiting strategy
   */
  limitUpdate(deltaV: Vector, context: AssemblyContext): boolean {
    const dIdx = context.nodeMap.get(String(this.drainNode));
    const gIdx = context.nodeMap.get(String(this.gateNode));
    const sIdx = context.nodeMap.get(String(this.sourceNode));
    
    if (dIdx === undefined || gIdx === undefined || sIdx === undefined) {
      return false;
    }
    
    // Get proposed voltage changes
    const dvd = dIdx > 0 ? deltaV.get(dIdx) : 0;
    const dvg = gIdx > 0 ? deltaV.get(gIdx) : 0;
    const dvs = sIdx > 0 ? deltaV.get(sIdx) : 0;
    
    // Calculate terminal voltage changes
    const dvgs = dvg - dvs;
    const dvds = dvd - dvs;
    
    let limited = false;
    
    // Limit VGS change (critical for convergence)
    const maxDvgs = 0.5;  // 0.5V max change per iteration
    if (Math.abs(dvgs) > maxDvgs) {
      const scale = maxDvgs / Math.abs(dvgs);
      if (gIdx > 0) deltaV.set(gIdx, dvg * scale);
      if (sIdx > 0) deltaV.set(sIdx, dvs * scale);
      limited = true;
    }
    
    // Limit VDS change
    const maxDvds = 1.0;  // 1V max change per iteration
    if (Math.abs(dvds) > maxDvds) {
      const scale = maxDvds / Math.abs(dvds);
      if (dIdx > 0) deltaV.set(dIdx, dvd * scale);
      if (sIdx > 0) deltaV.set(sIdx, dvs * scale);
      limited = true;
    }
    
    // Additional limiting near threshold
    if (Math.abs(this.vgs - this.VTO) < 0.1) {
      // Near threshold, be more conservative
      const conservativeMaxDvgs = 0.1;
      if (Math.abs(dvgs) > conservativeMaxDvgs) {
        const scale = conservativeMaxDvgs / Math.abs(dvgs);
        if (gIdx > 0) deltaV.set(gIdx, dvg * scale);
        if (sIdx > 0) deltaV.set(sIdx, dvs * scale);
        limited = true;
      }
    }
    
    return limited;
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
        VTO: this.VTO,
        KP: this.KP,
        W: this.W,
        L: this.L,
        vgs: this.vgs,
        vds: this.vds,
        id: this.id,
        mode: this.mode === 1 ? 'normal' : 'reverse'
      }
    };
  }

  /**
   * Get the number of extra variables required by this component
   * NgMosfet does not require extra variables
   * @returns 0 (no extra variables needed)
   */
  getExtraVariableCount(): number {
    return 0;
  }

  /**
   * Set the indices for extra variables in the solution vector
   * NgMosfet does not use extra variables, so this must be empty
   * @param indices - Array of indices (must be empty for NgMosfet)
   * @throws Error if indices array is not empty
   */
  setExtraVariableIndices(indices: number[]): void {
    if (indices.length !== 0) {
      throw new Error(`NgMosfet ${this.name} does not use extra variables but received ${indices.length} indices`);
    }
  }
}
