/**
 * 🔗 耦合组件模块 - AkingSPICE 2.1
 * 
 * 本模块包含各种耦合元件的实现，如变压器、互感器等
 * 这些组件通过磁耦合或其他方式连接多个电路
 */

// 理想变压器
export { 
  IdealTransformer, 
  TransformerFactory, 
  TransformerTest 
} from './transformer';

// 导入类型和命名空间以便在本文件中使用
import { 
  type IdealTransformer, 
  TransformerFactory, 
  TransformerTest 
} from './transformer';

/**
 * 🎯 耦合组件类型定义
 */
export type CouplingComponent = IdealTransformer;

/**
 * 📚 耦合组件工厂集合
 */
export const CouplingComponentFactory = {
  Transformer: TransformerFactory,
} as const;

/**
 * 🧪 耦合组件测试工具集合
 */
export const CouplingComponentTest = {
  Transformer: TransformerTest,
} as const;

/**
 * 📋 支持的耦合组件类型
 */
export const SUPPORTED_COUPLING_TYPES = [
  'K', // 理想变压器
] as const;

export type SupportedCouplingType = typeof SUPPORTED_COUPLING_TYPES[number];

/**
 * 🔍 类型守卫函数
 */
export namespace CouplingTypeGuards {
  export function isIdealTransformer(component: any): component is IdealTransformer {
    return component && component.type === 'K' && 'turnsRatio' in component;
  }
  
  export function isCouplingComponent(component: any): component is CouplingComponent {
    return isIdealTransformer(component);
  }
}

/**
 * 📖 耦合组件帮助信息
 */
export const COUPLING_COMPONENT_HELP = {
  K: {
    description: '理想变压器 - 无损耗的磁耦合器件',
    parameters: [
      {
        name: 'turnsRatio',
        description: '匝数比 (初级匝数/次级匝数)',
        type: 'number' as const,
        required: true,
        range: [1e-6, 1e6] as [number, number],
        unit: ''
      }
    ],
    nodes: 4,
    nodeDescription: '[初级正端, 初级负端, 次级正端, 次级负端]',
    examples: [
      'K1 n1 n2 n3 n4 2.0  // 2:1降压变压器',
      'K2 vin vgnd vout vgnd 0.5  // 1:2升压变压器',
      'K3 p1 p2 s1 s2 1.0  // 1:1隔离变压器'
    ],
    notes: [
      '理想变压器假设无损耗、无漏感',
      '满足电压关系: Vp/Vs = n',
      '满足电流关系: n*Ip + Is = 0',
      '满足功率守恒: Pp = Ps'
    ]
  }
} as const;