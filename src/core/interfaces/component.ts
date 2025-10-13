/**
 * 🔧 AkingSPICE 2.1 - 统一组件接口定义
 * 
 * 本文件定义了所有电路组件必须遵循的标准接口
 * 确保组件与仿真引擎的解耦和可扩展性
 */

import { SparseMatrix } from '../../math/sparse/matrix';
import { Vector } from '../../math/sparse/vector';
import { IEvent, IVector } from '../../types/index';

// 类型别名，简化接口
type Matrix = SparseMatrix;

/**
 * 🎯 统一组装上下文接口
 * 
 * 为所有组件提供统一的 MNA 组装环境
 * 解决 stamp() vs load() 的接口分裂问题
 */
export interface AssemblyContext {
  /** MNA 系统矩阵 */
  readonly matrix: SparseMatrix;
  
  /** 右侧向量 */
  readonly rhs: Vector;
  
  /** 节点名称到矩阵索引的映射 */
  readonly nodeMap: Map<string, number>;
  
  /** 当前仿真时间 */
  readonly currentTime: number;
  
  /** 当前解向量 (供智能设备使用) */
  readonly solutionVector?: Vector;
  
  /** Gmin 参数 (供 Gmin Stepping 使用) */
  readonly gmin?: number;
  
  /** 当前时间步长 */
  readonly dt: number;
  
  /** 上一个时间点的解 */
  readonly previousSolutionVector?: Vector;

  /** 额外变数索引管理器的引用 (供需要额外变数的组件使用) */
  readonly getExtraVariableIndex?: (componentName: string, variableType: string) => number | undefined;
}

/**
 * 🎯 核心组件接口 (重构版本)
 * 
 * 所有电路组件必须实现此接口
 * 统一了基础组件和智能设备的交互方式
 */
export interface ComponentInterface {
  /** 组件唯一标识符 */
  readonly name: string;
  
  /** 组件类型 (R, L, C, V, I, M, D, Q, etc.) */
  readonly type: string;
  
  /** 组件连接的节点列表 */
  readonly nodes: readonly (string | number)[];
  
  /**
   * ✅ 统一组装方法 (NEW!)
   * 
   * 替代原本的 stamp() 和 load() 方法
   * 所有组件使用相同的方式与仿真引擎交互
   * 
   * @param context - 组装上下文，包含所有必要的信息
   */
  assemble(context: AssemblyContext): void;
  
  /**
   * ⚡️ 检查此组件是否可能产生事件
   */
  hasEvents?(): boolean;

  /**
   * 🆕 返回一个或多个条件函数，其零点对应一个事件。
   * @returns { type: EventType, condition: (v: IVector) => number }[]
   */
  getEventFunctions?(): { type: string, condition: (v: IVector) => number }[];

  /**
   * 📢 处理一个已确认发生的事件
   * @param event 发生的事件
   * @param context 组装上下文
   */
  handleEvent?(event: IEvent, context: AssemblyContext): void;

  /**
   * 🎯 获取断点时间列表 (Breakpoint Detection)
   * 
   * 返回激励源或设备状态会发生突变的时间点
   * 积分器会强制在这些时间点停止,避免跨越不连续点
   * 
   * 典型应用:
   * - PULSE 波形的上升/下降边沿
   * - PWM 信号的切换时刻
   * - 事件驱动的状态改变
   * 
   * @param startTime - 查询起始时间
   * @param endTime - 查询结束时间
   * @returns 断点时间数组 (升序排列,且在 [startTime, endTime] 范围内)
   */
  getBreakpoints?(startTime: number, endTime: number): number[];

  
  /**
   * 🔍 组件参数验证
   * 
   * 验证组件参数的合理性
   * 在添加到仿真引擎前调用
   * 
   * @returns 验证结果信息
   */
  validate(): ValidationResult;
  
  /**
   * 📊 获取组件信息
   * 
   * 用于调试和可视化
   */
  getInfo(): ComponentInfo;
  
  /**
   * ⚡ 计算通过组件的电流 (用于 KCL 残差计算)
   * 
   * 根据给定的电压向量计算组件的实际电流
   * 对于线性组件，使用 Ohm 定律或伴侣模型
   * 对于非线性组件，必须包括指数项 (例如 Shockley 方程)
   * 
   * @param voltages - 系统的完整电压向量
   * @param context - 组装上下文 (可选，用于获取额外变量)
   * @returns 组件电流 (正值表示从正节点流向负节点)
   */
  computeCurrent(voltages: Vector, context?: AssemblyContext): number;
}

/**
 * 🆕 可缩放激励源接口
 * 
 * 用于源步进 DC 分析
 */
export interface ScalableSource {
  scaleSource(factor: number): void;
  restoreSource(): void;
}

/**
 * 🧠 智能设备接口
 * 
 * 针对非线性器件（MOSFET, Diode等）的高级接口
 * 继承基础组件接口，添加智能建模功能
 */
export interface SmartDeviceInterface extends ComponentInterface {
  /**
   * 🔄 更新工作点
   * 
   * 根据当前电压电流更新器件的线性化模型
   * 在每次Newton迭代中调用
   * 
   * @param voltages - 各节点电压
   * @param currents - 各支路电流  
   */
  updateOperatingPoint(voltages: Vector, currents: Vector): void;
  
  /**
   * ✅ 检查收敛性
   * 
   * 判断器件是否已收敛到稳定工作点
   * 
   * @returns 收敛状态信息
   */
  checkConvergence(): ConvergenceInfo;
  
  /**
   * 🎛️ 获取线性化模型
   * 
   * 返回当前工作点的小信号线性模型
   * 用于 AC 分析
   */
  getLinearizedModel(): LinearModel;
}

/**
 * 🔋 激励源接口
 * 
 * 针对电压源、电流源等激励的特化接口
 */
export interface SourceInterface extends ComponentInterface {
  /**
   * 📈 获取当前激励值
   * 
   * @param time - 当前时间
   * @returns 激励值（电压或电流）
   */
  getValue(time: number): number;
  
  /**
   * 🌊 设置激励波形
   * 
   * @param waveform - 波形描述
   */
  setWaveform(waveform: WaveformDescriptor): void;
}

/**
 * 📏 验证结果
 */
export interface ValidationResult {
  /** 是否通过验证 */
  isValid: boolean;
  
  /** 错误消息列表 */
  errors: string[];
  
  /** 警告消息列表 */
  warnings: string[];
}

/**
 * 📋 组件信息
 */
export interface ComponentInfo {
  /** 组件类型 */
  type: string;
  
  /** 组件名称 */
  name: string;
  
  /** 连接节点 */
  nodes: string[];
  
  /** 参数列表 */
  parameters: Record<string, any>;
  
  /** 单位信息 */
  units?: Record<string, string>;
}

/**
 * 🎯 收敛信息
 */
export interface ConvergenceInfo {
  /** 是否收敛 */
  converged: boolean;
  
  /** 最大变化量 */
  maxChange: number;
  
  /** 收敛容限 */
  tolerance: number;
  
  /** 迭代次数 */
  iterations: number;
}

/**
 * 📐 线性模型
 */
export interface LinearModel {
  /** 小信号电导矩阵 */
  conductance: Matrix;
  
  /** 小信号电流源 */
  currentSource: Vector;
  
  /** 频率响应（可选） */
  frequencyResponse?: (frequency: number) => Complex;
}

/**
 * 🌊 波形描述符
 */
export interface WaveformDescriptor {
  /** 波形类型 */
  type: 'DC' | 'AC' | 'PULSE' | 'SIN' | 'EXP' | 'PWL';
  
  /** 波形参数 */
  parameters: Record<string, number>;
}

/**
 * 🔢 复数类型
 */
export interface Complex {
  real: number;
  imag: number;
}

/**
 * 🏭 组件工厂接口
 * 
 * 标准化组件创建流程
 */
export interface ComponentFactory {
  /**
   * 🔧 创建组件
   * 
   * @param type - 组件类型
   * @param name - 组件名称  
   * @param nodes - 连接节点
   * @param parameters - 组件参数
   * @returns 创建的组件实例
   */
  createComponent(
    type: string,
    name: string, 
    nodes: string[],
    parameters: Record<string, any>
  ): ComponentInterface;
  
  /**
   * 📋 获取支持的组件类型
   */
  getSupportedTypes(): string[];
  
  /**
   * ❓ 获取组件帮助信息
   */
  getComponentHelp(type: string): ComponentHelp;
}

/**
 * 📚 组件帮助信息
 */
export interface ComponentHelp {
  /** 组件描述 */
  description: string;
  
  /** 参数说明 */
  parameters: ParameterInfo[];
  
  /** 使用示例 */
  examples: string[];
  
  /** 注意事项 */
  notes?: string[];
}

/**
 * 📊 参数信息
 */
export interface ParameterInfo {
  /** 参数名称 */
  name: string;
  
  /** 参数描述 */
  description: string;
  
  /** 参数类型 */
  type: 'number' | 'string' | 'boolean';
  
  /** 是否必需 */
  required: boolean;
  
  /** 默认值 */
  defaultValue?: any;
  
  /** 取值范围 */
  range?: [number, number];
  
  /** 单位 */
  unit?: string;
}

/**
 * 🎨 组件创建辅助函数
 * 
 * 具体实现将在对应的组件文件中提供
 */

/**
 * 🔍 类型守卫函数
 */
export namespace TypeGuards {
  export function isSmartDevice(component: ComponentInterface): component is SmartDeviceInterface {
    return 'updateOperatingPoint' in component && 'checkConvergence' in component;
  }
  
  export function isSource(component: ComponentInterface): component is SourceInterface {
    return 'getValue' in component && 'setWaveform' in component;
  }
  
  export function isPassiveComponent(component: ComponentInterface): boolean {
    return ['R', 'L', 'C'].includes(component.type);
  }
  
  export function isActiveComponent(component: ComponentInterface): boolean {
    return ['M', 'Q', 'J', 'D'].includes(component.type);
  }
}