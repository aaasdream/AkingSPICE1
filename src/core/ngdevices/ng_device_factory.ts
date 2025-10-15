/**
 * NGDevice Factory
 * 
 * Factory for creating NGSpice-based nonlinear devices
 * Provides a unified interface for device creation
 */

import { ComponentInterface } from '../interfaces/component';
import { NgDiode, NgDiodeModelParams } from './ng_diode';
import { NgMosfet, NgMosfetModelParams } from './ng_mosfet';

/**
 * Device type enumeration
 */
export enum NgDeviceType {
  DIODE = 'D',
  NMOS = 'NMOS',
  PMOS = 'PMOS'
}

/**
 * Unified device parameters
 */
export interface NgDeviceParams {
  // Common parameters
  name: string;
  nodes: string[];
  
  // Device-specific model parameters
  modelParams?: NgDiodeModelParams | NgMosfetModelParams;
}

/**
 * NGDevice Factory Class
 */
export class NgDeviceFactory {
  /**
   * Create a diode
   */
  static createDiode(
    name: string,
    posNode: string,
    negNode: string,
    modelParams?: NgDiodeModelParams
  ): NgDiode {
    return new NgDiode(name, posNode, negNode, modelParams);
  }
  
  /**
   * Create an NMOS transistor
   */
  static createNMOS(
    name: string,
    drainNode: string,
    gateNode: string,
    sourceNode: string,
    bulkNode: string,
    modelParams?: NgMosfetModelParams
  ): NgMosfet {
    const params: NgMosfetModelParams = {
      ...modelParams,
      TYPE: 'NMOS'
    };
    return new NgMosfet(name, drainNode, gateNode, sourceNode, bulkNode, params);
  }
  
  /**
   * Create a PMOS transistor
   */
  static createPMOS(
    name: string,
    drainNode: string,
    gateNode: string,
    sourceNode: string,
    bulkNode: string,
    modelParams?: NgMosfetModelParams
  ): NgMosfet {
    const params: NgMosfetModelParams = {
      ...modelParams,
      TYPE: 'PMOS'
    };
    return new NgMosfet(name, drainNode, gateNode, sourceNode, bulkNode, params);
  }
  
  /**
   * Generic device creation method
   */
  static createDevice(
    deviceType: NgDeviceType,
    params: NgDeviceParams
  ): ComponentInterface {
    switch (deviceType) {
      case NgDeviceType.DIODE:
        if (params.nodes.length < 2) {
          throw new Error('Diode requires 2 nodes');
        }
        return this.createDiode(
          params.name,
          params.nodes[0]!,
          params.nodes[1]!,
          params.modelParams as NgDiodeModelParams
        );
        
      case NgDeviceType.NMOS:
        if (params.nodes.length < 4) {
          throw new Error('MOSFET requires 4 nodes (D, G, S, B)');
        }
        return this.createNMOS(
          params.name,
          params.nodes[0]!,  // Drain
          params.nodes[1]!,  // Gate
          params.nodes[2]!,  // Source
          params.nodes[3]!,  // Bulk
          params.modelParams as NgMosfetModelParams
        );
        
      case NgDeviceType.PMOS:
        if (params.nodes.length < 4) {
          throw new Error('MOSFET requires 4 nodes (D, G, S, B)');
        }
        return this.createPMOS(
          params.name,
          params.nodes[0]!,  // Drain
          params.nodes[1]!,  // Gate
          params.nodes[2]!,  // Source
          params.nodes[3]!,  // Bulk
          params.modelParams as NgMosfetModelParams
        );
        
      default:
        throw new Error(`Unknown device type: ${deviceType}`);
    }
  }
}

// Export device classes for direct use
export { NgDiode, NgMosfet };
export type { NgDiodeModelParams, NgMosfetModelParams };
