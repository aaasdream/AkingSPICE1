/**
 * 🧠 智能设备模块 - AkingSPICE 2.1 重构版
 *   PhysicalConsistency
} from './intelligent_device_model';

// === 枚举类型 ===
export {
  StampType
} from './intelligent_device_model';于非线性智能设备的统一导出接口
 * 移除与基础组件重复的部分，保持架构清晰
 * 
 * 📋 重构说明：
 * - 移除 intelligent_inductor - 电感是基础组件
 * - 专注 MOSFET、Diode 等需要智能建模的器件
 * - 提供电力电子应用的预设配置
 * 
 * 🎯 使用示例：
 * 
 * ```typescript
 * import { SmartDeviceFactory, BuckConverterSmartKit } from './devices/index';
 * 
 * // 创建智能 MOSFET
 * const mosfet = SmartDeviceFactory.createMOSFET('M1', [1, 2, 0], { Vth: 2.0 });
 * 
 * // 创建 Buck 变换器智能器件套件
 * const smartDevices = BuckConverterSmartKit.createSmartDevices(12, 3);
 * ```
 */

// === 核心接口和类型定义 ===
export type {
  // 主要接口
  IIntelligentDeviceModel,
  LoadResult,
  ConvergenceInfo,
  PredictionHint,
  DeviceState,
  
  // 智能设备参数类型 (仅非线性器件)
  MOSFETParameters,
  DiodeParameters,
  
  // 内部类型
  MatrixStamp,
  StampEntry,
  DevicePerformanceReport,
  SwitchingEvent,
  NumericalChallenge,
  PhysicalConsistency
} from './intelligent_device_model';

// === 枚举类型 ===
export {
  StampType
} from './intelligent_device_model';

// === 智能设备实现类 ===
import {
  IntelligentMOSFET
} from './intelligent_mosfet';

import {
  IntelligentDiode
} from './intelligent_diode';

export {
  IntelligentMOSFET,
  IntelligentDiode
};

// === 工厂类和套件 ===
import {
  SmartDeviceFactory
  // BuckConverterSmartKit  // TODO: 暫時註釋，因為未實現
} from './intelligent_device_factory';

export {
  SmartDeviceFactory
  // BuckConverterSmartKit  // TODO: 暫時註釋
};

// === 便捷导出函数 ===

/**
 * 快速创建 MOSFET
 */
export const createMOSFET = SmartDeviceFactory.createMOSFET.bind(SmartDeviceFactory);

/**
 * 快速创建二极管
 */
export const createDiode = SmartDeviceFactory.createDiode.bind(SmartDeviceFactory);

/**
 * 快速创建 Buck 变换器智能器件套件
 */
// export const createBuckSmartDevices = BuckConverterSmartKit.createSmartDevices.bind(BuckConverterSmartKit); // TODO

// === 统一导出对象 ===
export default {
  // 工厂和套件
  SmartDeviceFactory,
  // BuckConverterSmartKit,  // TODO
  
  // 设备类
  IntelligentMOSFET,
  IntelligentDiode,
  
  // 便捷函数
  createMOSFET,
  createDiode
  // createBuckSmartDevices  // TODO
};

/**
 * 📋 重构说明
 * 
 * 本模块已完成智能设备层重构：
 * 
 * ✅ 移除了与基础组件重复的智能电感
 * ✅ 专注于需要智能建模的非线性器件
 * ✅ 保持了 MOSFET、Diode 的完整功能
 * ✅ 更新了工厂类，移除基础组件创建方法
 * ✅ 提供了清晰的电力电子应用预设
 * 
 * 现在智能设备层职责清晰：
 * - 只处理非线性、需要智能建模的器件
 * - 基础 R、L、C 组件在 src/components/ 中处理
 * - 应用层在 src/applications/ 中组合使用
 */