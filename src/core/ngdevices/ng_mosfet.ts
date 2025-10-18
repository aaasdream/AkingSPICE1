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
   * Limit drain-source voltage (DEVlimvds from ngspice devsup.c)
   */
  private limvds(vnew: number, vold: number): number {
    if (vold >= 3.5) {
      if (vnew > vold) {
        vnew = Math.min(vnew, 3 * vold + 2);
      } else {
        if (vnew < 3.5) {
          vnew = Math.max(vnew, 2);
        }
      }
    } else {
      if (vnew > vold) {
        vnew = Math.min(vnew, 4);
      } else {
        vnew = Math.max(vnew, -0.5);
      }
    }
    return vnew;
  }
  
  /**
   * Limit PN junction voltage (DEVpnjlim from ngspice devsup.c)
   */
  private pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
    let arg: number;
    
    if ((vnew > vcrit) && (Math.abs(vnew - vold) > (vt + vt))) {
      if (vold > 0) {
        arg = (vnew - vold) / vt;
        if (arg > 0) {
          vnew = vold + vt * (2 + Math.log(arg - 2));
        } else {
          vnew = vold - vt * (2 + Math.log(2 - arg));
        }
      } else {
        vnew = vt * Math.log(vnew / vt);
      }
    } else {
      if (vnew < 0) {
        if (vold > 0) {
          arg = -1 * vold - 1;
        } else {
          arg = 2 * vold - 1;
        }
        if (vnew < arg) {
          vnew = arg;
        }
      }
    }
    return vnew;
  }
  
  /**
   * Limit FET voltages to prevent numerical issues (DEVfetlim from ngspice devsup.c)
   */
  private fetlim(vnew: number, vold: number, vto: number): number {
    const vtsthi = Math.abs(2 * (vold - vto)) + 2;
    const vtstlo = Math.abs(vold - vto) + 1;  // Fixed: match ngspice exactly
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
          // Decreasing
          vnew = Math.max(vnew, vto - 0.5);
        } else {
          // Increasing
          vnew = Math.min(vnew, vto + 4);
        }
      }
    } else {
      // Vgs < Vto (cutoff/off)
      if (delv <= 0) {
        if (-delv > vtsthi) {
          vnew = vold - vtsthi;
        }
      } else {
        const vtemp = vto + 0.5;
        if (vnew <= vtemp) {
          if (delv > vtstlo) {
            vnew = vold + vtstlo;
          }
        } else {
          vnew = vtemp;
        }
      }
    }
    return vnew;
  }
  
  assemble(context: AssemblyContext): void {
    // Get node indices (similar to ngspice's node pointers)
    const dIdx = context.nodeMap.get(String(this.drainNode));
    const gIdx = context.nodeMap.get(String(this.gateNode));
    const sIdx = context.nodeMap.get(String(this.sourceNode));
    const bIdx = context.nodeMap.get(String(this.bulkNode));
    
    if (dIdx === undefined || gIdx === undefined || 
        sIdx === undefined || bIdx === undefined) {
      throw new Error(`NgMosfet ${this.name}: Node mapping not found`);
    }
    
    // Get current voltages (model->MOS1type factors in NMOS/PMOS polarity)
    let vgs, vds, vbs;
    if (context.solutionVector) {
      const vd = dIdx >= 0 ? context.solutionVector.get(dIdx) : 0;
      const vg = gIdx >= 0 ? context.solutionVector.get(gIdx) : 0;
      const vs = sIdx >= 0 ? context.solutionVector.get(sIdx) : 0;
      const vb = bIdx >= 0 ? context.solutionVector.get(bIdx) : 0;
      
      // Apply type multiplier (model->MOS1type in ngspice)
      vgs = this.deviceType * (vg - vs);
      vds = this.deviceType * (vd - vs);
      vbs = this.deviceType * (vb - vs);
    } else {
      vgs = 0;
      vds = 0;
      vbs = 0;
    }
    
    // Voltage limiting (from mos1load.c lines 360-380)
    const vt = this.CONSTKoverQ * this.TEMP;
    const vcrit = vt * Math.log(vt / (Math.sqrt(2) * 1e-14));
    
    const von = this.deviceType * this.VTO; // here->MOS1von
    
    const vgs_orig = vgs;
    const vds_orig = vds;
    const vbs_orig = vbs;
    
    if (this.vds >= 0) {
      vgs = this.fetlim(vgs, this.vgs, von);
      vds = vgs - (vgs - vds);
      vds = this.limvds(vds, this.vds);
    } else {
      const vgd = vgs - vds;
      const vgdo = this.vgs - this.vds;
      const vgd_limited = this.fetlim(vgd, vgdo, von);
      vds = vgs - vgd_limited;
      vds = -this.limvds(-vds, -this.vds);
      vgs = vgd_limited + vds;
    }
    
    if (vds >= 0) {
      vbs = this.pnjlim(vbs, this.vbs, vt, vcrit);
    } else {
      const vbd = vbs - vds;
      const vbd_limited = this.pnjlim(vbd, this.vbs - this.vds, vt, vcrit);
      vbs = vbd_limited + vds;
    }
    
    // 🔬 DEBUG: 電壓限制診斷
    if (context.G_coeff !== undefined && context.currentTime <= 1e-9) {
      const vgs_delta = Math.abs(vgs - vgs_orig);
      const vds_delta = Math.abs(vds - vds_orig);
      if (vgs_delta > 0.01 || vds_delta > 0.01) {
        console.log(`⚠️ ${this.name} 電壓限制: ΔVgs=${vgs_delta.toFixed(3)}V, ΔVds=${vds_delta.toFixed(3)}V`);
      }
    }
    
    // Store voltages
    this.vgs = vgs;
    this.vds = vds;
    this.vbs = vbs;
    
    // Determine mode (lines 450-458 in mos1load.c)
    let mode: number;
    if (vds >= 0) {
      mode = 1;  // normal mode
    } else {
      mode = -1; // inverse mode
    }
    this.mode = mode;
    
    // Calculate drain current (lines 474-524 in mos1load.c)
    // Use internal voltages for the mode-selected source/drain
    const vbs_calc = (mode === 1) ? vbs : (vbs - vds);
    const vgs_calc = (mode === 1) ? vgs : (vgs - vds);
    const vds_calc = Math.abs(vds);
    
    // Body effect on threshold
    const phi = this.PHI;
    let sarg: number;
    if (vbs_calc <= 0) {
      sarg = Math.sqrt(phi - vbs_calc);
    } else {
      sarg = Math.sqrt(phi);
      sarg = sarg - vbs_calc / (sarg + sarg);
      sarg = Math.max(0, sarg);
    }
    
    const von_calc = this.VTO + this.GAMMA * sarg;
    const vgst = vgs_calc - von_calc;
    const vdsat = Math.max(vgst, 0);
    
    let arg = 0;
    if (sarg > 0) {
      arg = this.GAMMA / (sarg + sarg);
    }
    
    const beta = this.KP * (this.W / this.L);
    const gmin = context.gmin ?? 1e-12;
    
    let cdrain = 0;
    let gm = 0;
    let gds = 0;
    let gmbs = 0;
    
    if (vgst <= 0) {
      // Cutoff region (lines 493-498)
      cdrain = 0;
      gm = 0;
      gds = 0;
      gmbs = 0;
    } else {
      // Active region
      const betap = beta * (1 + this.LAMBDA * vds_calc);
      
      if (vgst <= vds_calc) {
        // Saturation region (lines 502-506)
        cdrain = betap * vgst * vgst * 0.5;
        gm = betap * vgst;
        gds = this.LAMBDA * beta * vgst * vgst * 0.5;
        gmbs = gm * arg;
      } else {
        // Linear region (lines 508-515)
        cdrain = betap * vds_calc * (vgst - 0.5 * vds_calc);
        gm = betap * vds_calc;
        gds = betap * (vgst - vds_calc) + 
              this.LAMBDA * beta * vds_calc * (vgst - 0.5 * vds_calc);
        gmbs = gm * arg;
      }
    }
    
    // Add gmin for numerical stability
    gds += gmin;
    
    // ============================================
    // 🚀 Bulk-Drain 和 Bulk-Source PN 結電導
    // ============================================
    // ngspice 使用完整的二極體模型：g = Is*exp(V/Vt)/Vt + gmin
    // 目前簡化為 gmin（未來需要實現完整模型）
    // TODO: 實現 PN 結二極體模型，計算 gbd = f(vbd), gbs = f(vbs)
    const gbd = gmin;  // Bulk-Drain junction conductance
    const gbs = gmin;  // Bulk-Source junction conductance
    
    // Store state
    this.id = cdrain;
    this.gm = gm;
    this.gds = gds;
    this.gmbs = gmbs;
    
    // Calculate equivalent current (lines 886-893 in mos1load.c)
    let cdreq: number;
    let xnrm: number, xrev: number;
    
    if (mode >= 0) {
      // Normal mode
      xnrm = 1;
      xrev = 0;
      cdreq = this.deviceType * (cdrain - gds * vds - gm * vgs - gmbs * vbs);
    } else {
      // Reverse mode
      xnrm = 0;
      xrev = 1;
      const vbd = vbs - vds;
      const vgd = vgs - vds;
      cdreq = -this.deviceType * (cdrain - gds * (-vds) - gm * vgd - gmbs * vbd);
    }
    
    // 🔬 DEBUG: 瞬態分析診斷
    if (context.G_coeff !== undefined && context.currentTime <= 1e-9) {
      console.log('\n' + '='.repeat(60));
      console.log(`🔬 MOSFET ${this.name} 瞬態第一步診斷`);
      console.log('='.repeat(60));
      console.log(`時間: ${context.currentTime.toExponential(3)}s, dt: ${context.dt?.toExponential(3)}s`);
      console.log(`G_coeff: ${context.G_coeff.toExponential(3)}`);
      console.log(`\n電壓狀態:`);
      console.log(`  Vgs: ${vgs.toFixed(4)}V, Vds: ${vds_calc.toFixed(4)}V, Vbs: ${vbs.toFixed(4)}V`);
      console.log(`  mode: ${mode >= 0 ? 'normal' : 'reverse'}`);
      console.log(`\n電流與導數:`);
      console.log(`  cdrain: ${(cdrain * 1e3).toFixed(6)}mA`);
      console.log(`  gm: ${(gm * 1e3).toFixed(6)}mS`);
      console.log(`  gds: ${(gds * 1e3).toFixed(6)}mS`);
      console.log(`  gmbs: ${(gmbs * 1e3).toFixed(6)}mS`);
      console.log(`  cdreq: ${(cdreq * 1e3).toFixed(6)}mA`);
      console.log(`  xnrm: ${xnrm}, xrev: ${xrev}`);
      console.log('='.repeat(60));
    }
    
    // Load RHS (lines 894-900 in mos1load.c)
    // Note: ngspice uses -= for some and += for others based on current direction
    if (dIdx >= 0) {
      context.rhs.add(dIdx, -cdreq);
    }
    if (sIdx >= 0) {
      context.rhs.add(sIdx, cdreq);
    }
    
    // Load Jacobian matrix (lines 904-919 in mos1load.c)
    // Diagonal elements for Drain
    if (dIdx >= 0) {
      context.matrix.add(dIdx, dIdx, gds + gbd + xrev * (gm + gmbs));
    }
    
    // Diagonal elements for Gate
    // ngspice 有電容項 gcgd+gcgs+gcgb，我們沒有，加 gmin 防止奇異
    if (gIdx >= 0) {
      context.matrix.add(gIdx, gIdx, gmin);
    }
    
    // Diagonal elements for Source
    if (sIdx >= 0) {
      context.matrix.add(sIdx, sIdx, gds + gbs + xnrm * (gm + gmbs));
    }
    
    // Diagonal elements for Bulk
    if (bIdx >= 0) {
      context.matrix.add(bIdx, bIdx, gbd + gbs);
    }
    
    // Off-diagonal coupling: Drain-Gate
    if (dIdx >= 0 && gIdx >= 0) {
      context.matrix.add(dIdx, gIdx, (xnrm - xrev) * gm);  // ngspice: (xnrm-xrev)*gm
    }
    
    // Off-diagonal coupling: Drain-Source
    if (dIdx >= 0 && sIdx >= 0) {
      context.matrix.add(dIdx, sIdx, -gds - xnrm * (gm + gmbs));
    }
    
    // Off-diagonal coupling: Drain-Bulk
    if (dIdx >= 0 && bIdx >= 0) {
      context.matrix.add(dIdx, bIdx, -gbd + (xnrm - xrev) * gmbs);  // ngspice: -gbd+(xnrm-xrev)*gmbs
    }
    
    // Off-diagonal coupling: Source-Gate
    if (sIdx >= 0 && gIdx >= 0) {
      context.matrix.add(sIdx, gIdx, -(xnrm - xrev) * gm);  // ngspice: -(xnrm-xrev)*gm
    }
    
    // Off-diagonal coupling: Source-Drain
    if (sIdx >= 0 && dIdx >= 0) {
      context.matrix.add(sIdx, dIdx, -gds - xrev * (gm + gmbs));
    }
    
    // Off-diagonal coupling: Source-Bulk
    if (sIdx >= 0 && bIdx >= 0) {
      context.matrix.add(sIdx, bIdx, -gbs - (xnrm - xrev) * gmbs);  // ngspice: -gbs-(xnrm-xrev)*gmbs
    }
    
    // Off-diagonal coupling: Bulk-Drain
    if (bIdx >= 0 && dIdx >= 0) {
      context.matrix.add(bIdx, dIdx, -gbd);  // ngspice: -gbd
    }
    
    // Off-diagonal coupling: Bulk-Source
    if (bIdx >= 0 && sIdx >= 0) {
      context.matrix.add(bIdx, sIdx, -gbs);  // ngspice: -gbs
    }

    // ============================================
    // 🚀 瞬態分析：電容處理 (暫時禁用)
    // ============================================
    // ngspice 使用 Meyer 模型計算 Cgs, Cgd, Cgb
    // 由於尚未實現完整的電容模型，暫時禁用以測試基本 IV 特性
    // 
    // TODO: 實現 DEVqmeyer() 函數和完整的電容模型
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
