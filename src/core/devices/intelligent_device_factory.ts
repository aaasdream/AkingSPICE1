/**
 * 🧠 智能设备工厂 - AkingSPICE 2.1 重构版
 * 
 * 专注于非线性智能器件的创建和配置
 * 只包含 MOSFET、Diode 等需要智能建模的器件
 * 
 * 📋 重构说明：
 * - 移除基础组件 (R,L,C) - 它们在 src/components/ 中
 * - 专注智能设备的非线性建模和优化
 * - 提供电力电子应用的预设配置
 * 
 * 🎯 支持器件：
 * - MOSFET: 开关建模、寄生效应、温度特性
 * - Diode: 反向恢复、正向压降、热建模
 */

import { 
  IIntelligentDeviceModel,
  MOSFETParameters,
  DiodeParameters
} from './intelligent_device_model';
import { IntelligentMOSFET } from './intelligent_mosfet';
import { IntelligentDiode } from './intelligent_diode';

/**
 * 🧠 智能设备工厂
 * 
 * 专注非线性智能器件的创建和优化配置
 * 为电力电子应用提供预设参数
 */
export class SmartDeviceFactory {
  /**
   * 创建 MOSFET 智能模型
   */
  static createMOSFET(
    deviceId: string,
    nodes: [string, string, string], // [Drain, Gate, Source]
    parameters: Partial<MOSFETParameters>
  ): IIntelligentDeviceModel {
    // 参数验证和默认值
    const validatedParams: MOSFETParameters = {
      ...parameters,
      Vth: parameters.Vth ?? 3.0,
      Kp: parameters.Kp ?? 0.1,
      lambda: parameters.lambda ?? 0.01,
      Cgs: parameters.Cgs ?? 1e-11,
      Cgd: parameters.Cgd ?? 2e-12,
      Roff: parameters.Roff ?? 1e9,
      Ron: parameters.Ron ?? 0.1,
      Vmax: parameters.Vmax ?? 50,
      Imax: parameters.Imax ?? 10,
    };
    // SmartDeviceFactory._validateMOSFETParameters(validatedParams);
    return new IntelligentMOSFET(deviceId, nodes, validatedParams);
  }
  
  /**
   * 创建二极管智能模型  
   */
  static createDiode(
    deviceId: string,
    nodes: [string, string], // [Anode, Cathode]
    parameters: Partial<DiodeParameters>
  ): IIntelligentDeviceModel {
    // 参数验证和默认值
    const validatedParams: DiodeParameters = {
      Is: parameters.Is ?? 1e-14,        // 默认反向饱和电流 1fA
      n: parameters.n ?? 1.0,            // 默认理想因子
      Rs: parameters.Rs ?? 0.01,         // 默认串联电阻 10mΩ
      Cj0: parameters.Cj0 ?? 1e-12,      // 默认零偏结电容 1pF
      Vj: parameters.Vj ?? 0.7,
      m: parameters.m ?? 0.5,
      BV: parameters['BV'] ?? Infinity,
      tt: parameters.tt ?? 0,
    };
    // SmartDeviceFactory._validateDiodeParameters(validatedParams);
    return new IntelligentDiode(deviceId, nodes, validatedParams);
  }

  /**
   * 🎯 预设配置：创建 Buck 变换器 MOSFET
   */
  static createBuckMOSFET(
    deviceId: string,
    nodes: [string, string, string],
    voltage: number = 12, // 工作电压
    current: number = 5   // 工作电流
  ): IIntelligentDeviceModel {
    const optimizedParams: MOSFETParameters = {
      Vth: Math.min(voltage * 0.1, 3.0),  // 阈值电压为工作电压的10%
      Kp: 2 * current / (voltage * voltage * 0.8 * 0.8), // 根据工作电流和电压估算Kp
      lambda: 0.01, // 默认沟道长度调制效应
      Cgs: 10e-12,  // 10pF
      Cgd: 2e-12,   // 2pF
      Roff: 1e9,    // 1GΩ
      Ron: 0.1,     // Default ON resistance
      Vmax: voltage * 1.5,
      Imax: current * 2,
    };
    return SmartDeviceFactory.createMOSFET(deviceId, nodes, optimizedParams);
  }

  /**
   * 🎯 预设配置：创建续流二极管
   */
  static createFreewheelDiode(
    deviceId: string,
    nodes: [string, string],
    voltage: number = 12,
    _current: number = 5
  ): IIntelligentDeviceModel {
    const optimizedParams: DiodeParameters = {
      Is: 1e-12,                           // 适中的反向电流
      n: 1.1,                              // 理想因子
      Rs: 0.02,                            // 串联电阻
      Cj0: 50e-12,                         // 较大的结电容
      Vj: 0.7,
      m: 0.5,
      BV: voltage * 1.5, // 反向击穿电压
      tt: 50e-9, // 50ns reverse recovery time
    };
    return SmartDeviceFactory.createDiode(deviceId, nodes, optimizedParams);
  }

  /**
   * 🎯 预设配置：创建同步整流 MOSFET
   */
  static createSyncRectMOSFET(
    deviceId: string,
    nodes: [string, string, string],
    voltage: number = 12,
    current: number = 5
  ): IIntelligentDeviceModel {
    const optimizedParams: MOSFETParameters = {
      Vth: Math.min(voltage * 0.08, 2.0), // 更低的阈值电压
      Kp: 2 * current / (voltage * voltage * 0.9 * 0.9),
      lambda: 0.005,
      Cgs: 20e-12,
      Cgd: 5e-12,
      Roff: 1e8,
      Ron: 0.05,
      Vmax: voltage * 1.2,
      Imax: current * 2.5,
    };
    return SmartDeviceFactory.createMOSFET(deviceId, nodes, optimizedParams);
  }

  /**
   * 🎯 预设配置：创建肖特基整流二极管
   */
  static createSchottkyDiode(
    deviceId: string,
    nodes: [string, string],
    voltage: number = 12,
    _current: number = 5
  ): IIntelligentDeviceModel {
    const optimizedParams: DiodeParameters = {
      Is: 1e-8,                            // 肖特基二极管较高的反向电流
      n: 1.05,                             // 接近理想的理想因子
      Rs: 0.01,
      Cj0: 100e-12,
      Vj: 0.4,
      m: 0.3,
      BV: voltage * 1.2,
      tt: 1e-9, // 1ns reverse recovery time
    };
    return SmartDeviceFactory.createDiode(deviceId, nodes, optimizedParams);
  }

  /**
   * 创建一个完整的 Buck 变换器拓扑结构
   * @param inputVoltage 输入电压
   * @param outputVoltage 目标输出电压
   * @param outputCurrent 负载电流
   * @returns 包含主开关、续流二极管/同步整流MOSFET的对象
   */
  static createBuckConverterTopology(
    inputVoltage: number,
    _outputVoltage: number,
    outputCurrent: number
  ) {
    return {
      // 主开关 MOSFET
      mainSwitch: SmartDeviceFactory.createBuckMOSFET(
        'M1', ['Vin', 'Control', 'SW'], // [Drain=Vin, Gate=Control, Source=SW]
        inputVoltage, outputCurrent * 1.2
      ),
      
      // 续流二极管 (或同步整流MOSFET)
      freewheelDiode: SmartDeviceFactory.createFreewheelDiode(
        'D1', ['0', 'SW'], // [Anode=GND, Cathode=SW]  
        inputVoltage, outputCurrent * 1.2
      ),

      // 可选：同步整流MOSFET (替代续流二极管)
      syncRectMOSFET: SmartDeviceFactory.createSyncRectMOSFET(
        'M2', ['0', 'SyncCtrl', 'SW'], // [Drain=GND, Gate=SyncCtrl, Source=SW]
        inputVoltage, outputCurrent * 1.2
      ),
      
      // 设计参数总结
      designSummary: {
        dutyCycle: _outputVoltage / inputVoltage,
      }
    };
  }

  // --- 验证函数 (未来可以扩展) ---
  /*
  private static _validateDiodeParameters(params: DiodeParameters): void {
    if (params.Is <= 0) throw new Error("Saturation current (Is) must be positive.");
    if (params.n < 1) throw new Error("Ideality factor (n) must be >= 1.");
  }

  private static _validateMOSFETParameters(params: MOSFETParameters): void {
    if (params.Kp <= 0) throw new Error("Transconductance parameter (Kp) must be positive.");
  }
  */
}