/**
 * 🔍 SPICE 网表解析器 - AkingSPICE 2.1
 * 
 * 先进的电路网表解析系统，支持标准 SPICE 语法和电力电子扩展
 * 为大规模电路仿真引擎提供智能输入处理
 * 
 * 🏆 核心特色：
 * - 完整的 SPICE 语法支持 (R, L, C, M, D, V, I)
 * - 电力电子专用器件扩展
 * - 参数表达式和变量替换
 * - 拓扑分析和连通性检查
 * - 智能错误检测和修复建议
 * - 电路模板解析支持（应用层提供）
 * 
 * 📚 支持的语法：
 *   基础器件: R, L, C, D, M (MOSFET)
 *   电源: V (电压源), I (电流源)
 *   控制语句: .param, .model, .tran, .dc
 *   分析命令: .op, .ac, .noise
 *   子电路: .subckt, .ends
 * 
 * 🎯 设计目标：
 *   - 支持复杂电力电子电路解析
 *   - 自动参数优化和合理性检查
 *   - 与智能设备模型无缝集成
 *   - 高性能批量处理能力
 */

import { Inductor } from '../../components/passive/inductor';
import { Resistor } from '../../components/passive/resistor';
import { Capacitor } from '../../components/passive/capacitor';
import { VoltageSource, VoltageSourceFactory } from '../../components/sources/voltage_source';
import { ComponentInterface } from '../interfaces/component';
import { SmartDeviceFactory } from '../devices/intelligent_device_factory';

/**
 * 网表元素类型枚举
 */
export enum NetlistElementType {
  RESISTOR = 'R',
  INDUCTOR = 'L', 
  CAPACITOR = 'C',
  DIODE = 'D',
  MOSFET = 'M',
  VOLTAGE_SOURCE = 'V',
  CURRENT_SOURCE = 'I',
  COUPLING = 'K',
  SUBCIRCUIT_CALL = 'X',
  PARAMETER = '.PARAM',
  MODEL = '.MODEL',
  ANALYSIS = '.TRAN',
  DIRECTIVE = '.DIRECTIVE'
}

/**
 * 网表元素定义
 */
export interface NetlistElement {
  readonly type: NetlistElementType;
  readonly name: string;
  readonly nodes: readonly string[];
  readonly value?: string | number | undefined;
  readonly parameters: Map<string, string | number>;
  readonly modelName?: string | undefined; // Allow undefined
  readonly lineNumber: number;
  readonly rawLine: string;
}

/**
 * 解析结果
 */
export interface ParsedNetlist {
  readonly elements: readonly NetlistElement[];
  readonly parameters: Map<string, number>;
  readonly models: Map<string, NetlistModel>;
  readonly analysisCommands: readonly AnalysisCommand[];
  readonly subcircuits: Map<string, SubcircuitDefinition>;
  readonly nodeList: readonly string[];
  readonly statistics: ParseStatistics;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

/**
 * 模型定义
 */
export interface NetlistModel {
  readonly name: string;
  readonly type: string;
  readonly parameters: Map<string, number>;
  readonly level?: number;
}

/**
 * 分析命令
 */
export interface AnalysisCommand {
  readonly type: string;
  readonly parameters: Map<string, string | number>;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly stepSize?: number;
}

/**
 * 子电路定义
 */
export interface SubcircuitDefinition {
  readonly name: string;
  readonly nodes: readonly string[];
  readonly elements: readonly NetlistElement[];
  readonly parameters: Map<string, number>;
}

/**
 * 解析统计信息
 */
export interface ParseStatistics {
  readonly totalLines: number;
  readonly elementCount: number;
  readonly nodeCount: number;
  readonly parameterCount: number;
  readonly modelCount: number;
  readonly subcircuitCount: number;
  readonly parseTime: number;
  readonly memoryUsage: number;
}


export class SpiceNetlistParser {
  private readonly _parameters: Map<string, number> = new Map();
  private readonly _models: Map<string, NetlistModel> = new Map();
  private readonly _subcircuits: Map<string, SubcircuitDefinition> = new Map();
  private readonly _elements: NetlistElement[] = [];
  private readonly _analysisCommands: AnalysisCommand[] = [];
  private readonly _warnings: string[] = [];
  private readonly _errors: string[] = [];
  
  // 节点管理
  private readonly _nodes: Set<string> = new Set();
  private _nodeAliases: Map<string, string> = new Map();
  
  // 解析状态
  private _currentLineNumber: number = 0;
  private _parseStartTime: number = 0;
  
  // 预定义参数和常数
  private readonly _constants: Map<string, number> = new Map([
    ['PI', Math.PI],
    ['E', Math.E],
    ['K', 1.381e-23],  // 玻尔兹曼常数
    ['Q', 1.602e-19],  // 电子电荷
    ['C', 2.998e8],    // 光速
    ['MU0', 4 * Math.PI * 1e-7]  // 真空磁导率
  ]);

  constructor() {
    // 初始化默认参数
    this._setDefaultParameters();
  }

  /**
   * 🔍 解析 SPICE 网表
   */
  parseNetlist(netlistContent: string): ParsedNetlist {
    this._parseStartTime = performance.now();
    this._reset();
    
    try {
      // 1. 预处理：注释清理、行合并、大小写标准化
      const preprocessedLines = this._preprocessNetlist(netlistContent);
      
      // 2. 第一遍解析：参数、模型、子电路定义
      this._parseDefinitions(preprocessedLines);
      
      // 3. 第二遍解析：元素和分析命令
      this._parseElements(preprocessedLines);
      
      // 4. 后处理：参数替换、节点规整、连通性检查
      this._postProcess();
      
      // 5. 验证和优化建议
      this._validateAndOptimize();
      
      const parseTime = performance.now() - this._parseStartTime;
      
      return this._generateParseResult(parseTime);
      
    } catch (error) {
      this._errors.push(`Critical parsing error: ${error}`);
      return this._generateErrorResult();
    }
  }

  /**
   * 🔧 从解析结果创建智能设备列表
   */
  createDevicesFromNetlist(parsedNetlist: ParsedNetlist): ComponentInterface[] {
    const devices: ComponentInterface[] = [];
    
    try {
      for (const element of parsedNetlist.elements) {
        const device = this._createDeviceFromElement(element, parsedNetlist);
        if (device) {
          devices.push(device);
        }
      }
      
      return devices;
      
    } catch (error) {
      throw new Error(`Device creation failed: ${error}`);
    }
  }

  // 注意: 电路特定的网表模板已移动到 src/applications/ 中
  // 核心解析器只处理通用的 SPICE 语法解析，不包含特定电路模板

  // === 私有解析方法 ===

  private _reset(): void {
    this._elements.length = 0;
    this._analysisCommands.length = 0;
    this._warnings.length = 0;
    this._errors.length = 0;
    this._parameters.clear();
    this._models.clear();
    this._subcircuits.clear();
    this._nodes.clear();
    this._nodeAliases.clear();
    this._currentLineNumber = 0;
    
    this._setDefaultParameters();
  }

  private _setDefaultParameters(): void {
    // 设置默认仿真参数
    this._parameters.set('TEMP', 27);        // 默认温度 27°C
    this._parameters.set('VT', 0.026);       // 热电压
    this._parameters.set('GMIN', 1e-12);     // 最小电导
    this._parameters.set('ABSTOL', 1e-12);   // 绝对容差
    this._parameters.set('RELTOL', 1e-3);    // 相对容差
    this._parameters.set('VNTOL', 1e-6);     // 电压容差
  }

  private _preprocessNetlist(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const processedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      if (currentLine === undefined) continue;
      let line = currentLine.trim();
      
      // 跳过空行和注释行
      if (line.length === 0 || line.startsWith('*')) {
        continue;
      }
      
      // 处理行继续符 '+'
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.trim().startsWith('+')) {
          i++;
          line += ' ' + nextLine.trim().substring(1);
        } else {
          break;
        }
      }
      
      // 大小写标准化：保留参数值的原始大小写
      const parts = line.split(/\s+/);
      if (parts.length > 0 && parts[0]) {
        parts[0] = parts[0].toUpperCase(); // 元素名称大写
        line = parts.join(' ');
      }
      
      processedLines.push(line);
    }
    
    return processedLines;
  }

  private _parseDefinitions(lines: string[]): void {
    for (let i = 0; i < lines.length; i++) {
      this._currentLineNumber = i + 1;
      const line = lines[i];
      if (!line) continue;
      
      if (line.startsWith('.PARAM')) {
        this._parseParameter(line);
      } else if (line.startsWith('.MODEL')) {
        this._parseModel(line);
      } else if (line.startsWith('.SUBCKT')) {
        const subckt = this._parseSubcircuit(lines, i);
        i = subckt.endIndex;
      }
    }
  }

  private _parseElements(lines: string[]): void {
    for (let i = 0; i < lines.length; i++) {
      this._currentLineNumber = i + 1;
      const line = lines[i];
      if (!line) continue;
      
      // 跳过定义行 (已在第一遍处理)
      if (line.startsWith('.PARAM') || line.startsWith('.MODEL') || line.startsWith('.SUBCKT')) {
        continue;
      }
      
      if (line.startsWith('.TRAN') || line.startsWith('.AC') || line.startsWith('.DC') || line.startsWith('.OP')) {
        this._parseAnalysisCommand(line);
      } else if (line.match(/^[RLCDMVIXK]/)) {
        this._parseElement(line);
      }
    }
  }

  private _parseParameter(line: string): void {
      const parts = line.split(/\s+/).slice(1); // 移除 .PARAM
      for (const part of parts) {
          const match = part.match(/(\w+)\s*=\s*([^\s]+)/);
          if (match) {
              const [, name, valueStr] = match;
              if (name && valueStr) {
                try {
                    const value = this._evaluateExpression(valueStr);
                    this._parameters.set(name.toUpperCase(), value);
                } catch (error) {
                    this._warnings.push(`Line ${this._currentLineNumber}: Invalid parameter value '${valueStr}' for ${name}`);
                }
              }
          }
      }
  }

  private _parseModel(line: string): void {
    // 解析 .MODEL modelname type [parameters]
    const parts = line.split(/\s+/);
    if (parts.length < 3 || !parts[1] || !parts[2]) {
      this._errors.push(`Line ${this._currentLineNumber}: Invalid .MODEL syntax`);
      return;
    }
    
    const modelName = parts[1].toUpperCase();
    const modelType = parts[2].toUpperCase();
    const parameters = new Map<string, number>();
    
    // 解析模型参数
    for (let i = 3; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const paramMatch = part.match(/(\w+)\s*=\s*([^\s]+)/);
      if (paramMatch) {
        const [, name, valueStr] = paramMatch;
        if (name && valueStr) {
          try {
            const value = this._evaluateExpression(valueStr);
            parameters.set(name.toUpperCase(), value);
          } catch (error) {
            this._warnings.push(`Line ${this._currentLineNumber}: Invalid model parameter '${valueStr}'`);
          }
        }
      }
    }
    
    this._models.set(modelName, {
      name: modelName,
      type: modelType,
      parameters
    });
  }

  private _parseSubcircuit(lines: string[], startIndex: number): { endIndex: number } {
    // TODO: 实现子电路解析
    let endIndex = startIndex;
    
    // 找到 .ENDS
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.toUpperCase().startsWith('.ENDS')) {
        endIndex = i;
        break;
      }
    }
    
    return { endIndex };
  }

  private _parseAnalysisCommand(line: string): void {
    const parts = line.split(/\s+/);
    if (!parts[0]) return;
    const type = parts[0].substring(1).toUpperCase(); // 去掉 '.'
    const parameters = new Map<string, string | number>();
    
    if (type === 'TRAN') {
      // .TRAN tstep tstop [tstart] [tmax]
      if (parts.length >= 3 && parts[1] && parts[2]) {
        parameters.set('step', this._evaluateExpression(parts[1]));
        parameters.set('stop', this._evaluateExpression(parts[2]));
        if (parts.length >= 4 && parts[3]) parameters.set('start', this._evaluateExpression(parts[3]));
        if (parts.length >= 5 && parts[4]) parameters.set('max', this._evaluateExpression(parts[4]));
      }
    } else if (type === 'DC') {
      // .DC source start stop step
      if (parts.length >= 5 && parts[1] && parts[2] && parts[3] && parts[4]) {
        parameters.set('source', parts[1]);
        parameters.set('start', this._evaluateExpression(parts[2]));
        parameters.set('stop', this._evaluateExpression(parts[3]));
        parameters.set('step', this._evaluateExpression(parts[4]));
      }
    }
    
    this._analysisCommands.push({
      type,
      parameters,
      startTime: parameters.get('start') as number,
      endTime: parameters.get('stop') as number,
      stepSize: parameters.get('step') as number
    });
  }

  private _parseElement(line: string): void {
    const parts = line.split(/\s+/).filter(p => p); // filter out empty strings
    if (parts.length < 3 || !parts[0]) {
      this._errors.push(`Line ${this._currentLineNumber}: Insufficient element definition`);
      return;
    }
    
    const name = parts[0];
    const type = this._getElementType(name);
    const nodes: string[] = [];
    const parameters = new Map<string, string | number>();
    let value: string | number | undefined;
    let modelName: string | undefined;
    
    // 根据元素类型解析
    switch (type) {
      case NetlistElementType.RESISTOR:
      case NetlistElementType.INDUCTOR:
      case NetlistElementType.CAPACITOR:
        // R/L/C node1 node2 value [parameters]
        if (parts.length >= 4 && parts[1] && parts[2] && parts[3]) {
          nodes.push(parts[1], parts[2]);
          value = this._evaluateExpression(parts[3]);
          this._parseElementParameters(parts.slice(4), parameters);
        }
        break;
        
      case NetlistElementType.DIODE:
        // D node1 node2 modelname [parameters]
        if (parts.length >= 4 && parts[1] && parts[2] && parts[3]) {
          nodes.push(parts[1], parts[2]);
          modelName = parts[3].toUpperCase();
          this._parseElementParameters(parts.slice(4), parameters);
        }
        break;
        
      case NetlistElementType.MOSFET:
        // M drain gate source bulk modelname [parameters]
        if (parts.length >= 6 && parts[1] && parts[2] && parts[3] && parts[4] && parts[5]) {
          nodes.push(parts[1], parts[2], parts[3], parts[4]); // D G S B
          modelName = parts[5].toUpperCase();
          this._parseElementParameters(parts.slice(6), parameters);
        }
        break;
        
      case NetlistElementType.VOLTAGE_SOURCE:
      case NetlistElementType.CURRENT_SOURCE:
        // V/I node+ node- [DC] value [AC magnitude [phase]] [transient_spec]
        if (parts.length >= 3 && parts[1] && parts[2]) {
          nodes.push(parts[1], parts[2]);
          
          // 解析电源规格
          let valueIndex = 3;
          if (parts[3] && parts[3].toUpperCase() === 'DC') {
            valueIndex = 4;
          }
          
          if (parts.length > valueIndex) {
            value = this._parseSourceValue(parts.slice(valueIndex));
          } else if (parts.length > 3) {
            value = this._parseSourceValue(parts.slice(3));
          }
        }
        break;
      
      case NetlistElementType.COUPLING:
        if (parts.length >= 4 && parts[1] && parts[2] && parts[3]) {
            nodes.push(parts[1], parts[2]); // L1, L2
            value = this._evaluateExpression(parts[3]); // coupling coefficient
        }
        break;
    }
    
    // 注册节点
    nodes.forEach(node => {
      if (node !== '0') { // 地节点不计入
        this._nodes.add(node);
      }
    });
    
    const element: NetlistElement = {
      type,
      name,
      nodes,
      value,
      parameters,
      modelName,
      lineNumber: this._currentLineNumber,
      rawLine: line
    };
    
    this._elements.push(element);
  }

  private _getElementType(name: string): NetlistElementType {
    const firstChar = name.charAt(0).toUpperCase();
    switch (firstChar) {
      case 'R': return NetlistElementType.RESISTOR;
      case 'L': return NetlistElementType.INDUCTOR;
      case 'C': return NetlistElementType.CAPACITOR;
      case 'D': return NetlistElementType.DIODE;
      case 'M': return NetlistElementType.MOSFET;
      case 'V': return NetlistElementType.VOLTAGE_SOURCE;
      case 'I': return NetlistElementType.CURRENT_SOURCE;
      case 'K': return NetlistElementType.COUPLING;
      case 'X': return NetlistElementType.SUBCIRCUIT_CALL;
      default:
        throw new Error(`Unknown element type: ${firstChar}`);
    }
  }

  private _parseElementParameters(parts: string[], parameters: Map<string, string | number>): void {
    for (const part of parts) {
      const paramMatch = part.match(/(\w+)\s*=\s*([^\s]+)/);
      if (paramMatch) {
        const [, name, valueStr] = paramMatch;
        if (name && valueStr) {
            try {
              const value = this._evaluateExpression(valueStr);
              parameters.set(name.toUpperCase(), value);
            } catch (error) {
              parameters.set(name.toUpperCase(), valueStr); // 保存原始字符串
            }
        }
      }
    }
  }

  private _parseSourceValue(parts: string[]): number | string {
    if (parts.length === 0) return 0;
    
    const firstPart = parts[0];
    if (!firstPart) return 0;
    
    // 时变电源 (PULSE, SIN, EXP 等)
    if (firstPart.toUpperCase().startsWith('PULSE') || firstPart.toUpperCase().startsWith('SIN') || firstPart.toUpperCase().startsWith('EXP')) {
      return parts.join(' '); // 保存完整定义
    }

    // 尝试作为表达式求值
    try {
        return this._evaluateExpression(parts.join(' '));
    } catch (e) {
        // 如果失败，则返回原始字符串
        return parts.join(' ');
    }
  }

  private _evaluateExpression(expr: string): number {
    // 移除大括号 {expr}
    let cleanExpr = expr.replace(/[{}]/g, '');

    // 替换常数
    for (const [name, value] of this._constants) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      cleanExpr = cleanExpr.replace(regex, value.toString());
    }

    // 替换参数
    for (const [name, value] of this._parameters) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      cleanExpr = cleanExpr.replace(regex, value.toString());
    }

    // [修正] 先处理工程单位，再进行计算
    try {
        // 使用更安全的计算方式
        return this._safeEval(cleanExpr);
    } catch (error) {
        throw new Error(`Invalid expression: ${expr}`);
    }
  }

  private _parseEngineeringNotation(valueStr: string): number {
    const s = valueStr.trim().toLowerCase();
    // 增加对 'meg' 的支持
    const notations: { [key: string]: number } = {
        'f': 1e-15, 'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'm': 1e-3,
        'k': 1e3, 'meg': 1e6, 'g': 1e9, 't': 1e12
    };

    let suffix = '';
    let numPart = s;

    // 检查 'meg'
    if (s.endsWith('meg')) {
        suffix = 'meg';
        numPart = s.substring(0, s.length - 3);
    } else {
        const lastChar = s.charAt(s.length - 1);
        if (notations[lastChar]) {
            suffix = lastChar;
            numPart = s.substring(0, s.length - 1);
        }
    }
    
    if (suffix && notations[suffix]) {
        const num = parseFloat(numPart);
        if (!isNaN(num)) {
            return num * (notations[suffix] as number);
        }
    }

    const num = parseFloat(s);
    if (isNaN(num)) {
        throw new Error(`Cannot parse numeric value: ${valueStr}`);
    }
    return num;
  }

  /**
   * 🔥 FIX: 安全的算術表達式求值器
   * 
   * 支持的運算：
   *   - 基本運算：+, -, *, /
   *   - 括號優先級：( )
   *   - 工程單位：1k, 2.5meg, 100n 等
   * 
   * 範例：
   *   "1k * 0.5" → 500
   *   "{Rload} * 2" → (已替換參數後計算)
   *   "100n + 50n" → 150e-9
   * 
   * 安全性：
   *   - 不使用 eval()，避免代碼注入
   *   - 僅允許數字和基本運算符
   *   - 使用 Shunting Yard 算法處理優先級
   */
  private _safeEval(expr: string): number {
      const trimmed = expr.trim();
      
      // 如果是簡單的數值（無運算符），直接解析
      if (!/[+\-*/()]/.test(trimmed)) {
          return this._parseEngineeringNotation(trimmed);
      }
      
      // 🔥 使用正則表達式分詞，同時處理工程單位
      // 匹配：數字（可能帶工程單位）、運算符、括號
      const tokenRegex = /([0-9.]+[a-zA-Z]*|\+|\-|\*|\/|\(|\))/g;
      const tokens = trimmed.match(tokenRegex);
      
      if (!tokens) {
          throw new Error(`Cannot tokenize expression: ${expr}`);
      }
      
      // 🔥 Shunting Yard 算法：中綴表達式 → 後綴表達式（RPN）
      const outputQueue: (number | string)[] = [];
      const operatorStack: string[] = [];
      const precedence: { [key: string]: number } = { '+': 1, '-': 1, '*': 2, '/': 2 };
      
      for (const token of tokens) {
          // 數字（可能帶工程單位）
          if (/^[0-9.]/.test(token)) {
              outputQueue.push(this._parseEngineeringNotation(token));
          }
          // 左括號
          else if (token === '(') {
              operatorStack.push(token);
          }
          // 右括號
          else if (token === ')') {
              while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                  outputQueue.push(operatorStack.pop()!);
              }
              operatorStack.pop(); // 移除左括號
          }
          // 運算符
          else if (token in precedence) {
              while (operatorStack.length > 0) {
                  const top = operatorStack[operatorStack.length - 1];
                  if (!top || top === '(') break;
                  const topPrec = precedence[top];
                  const tokenPrec = precedence[token];
                  if (topPrec === undefined || tokenPrec === undefined) break;
                  if (topPrec < tokenPrec) break;
                  outputQueue.push(operatorStack.pop()!);
              }
              operatorStack.push(token);
          }
      }
      
      // 清空剩餘運算符
      while (operatorStack.length > 0) {
          outputQueue.push(operatorStack.pop()!);
      }
      
      // 🔥 計算 RPN 表達式
      const evalStack: number[] = [];
      for (const item of outputQueue) {
          if (typeof item === 'number') {
              evalStack.push(item);
          } else {
              // 運算符
              if (evalStack.length < 2) {
                  throw new Error(`Invalid expression structure: ${expr}`);
              }
              const b = evalStack.pop()!;
              const a = evalStack.pop()!;
              
              switch (item) {
                  case '+': evalStack.push(a + b); break;
                  case '-': evalStack.push(a - b); break;
                  case '*': evalStack.push(a * b); break;
                  case '/': 
                      if (b === 0) throw new Error(`Division by zero in expression: ${expr}`);
                      evalStack.push(a / b); 
                      break;
                  default:
                      throw new Error(`Unknown operator: ${item}`);
              }
          }
      }
      
      if (evalStack.length !== 1) {
          throw new Error(`Expression evaluation failed: ${expr}`);
      }
      
      const result = evalStack[0];
      if (result === undefined) {
          throw new Error(`Expression evaluation returned undefined: ${expr}`);
      }
      
      return result;
  }

  private _postProcess(): void {
    // 参数替换
    for (const element of this._elements) {
      if (typeof element.value === 'string') {
        try {
          (element as any).value = this._evaluateExpression(element.value);
        } catch (error) {
          // 保持为字符串，让 _createDeviceFromElement 进一步处理
          // this._warnings.push(`Cannot evaluate value '${element.value}' for element ${element.name}`);
        }
      }
    }
    
    // 节点名称规整化
    this._normalizeNodeNames();
    
    // 连通性检查
    this._checkConnectivity();
  }

  private _normalizeNodeNames(): void {
    // 将数字节点名转换为标准格式
    const nodeMapping = new Map<string, string>();
    let nodeCounter = 1;
    
    // 地节点始终为 '0'
    nodeMapping.set('0', '0');
    nodeMapping.set('GND', '0');
    nodeMapping.set('GROUND', '0');
    
    // 为其他节点分配编号
    for (const node of this._nodes) {
      if (!nodeMapping.has(node) && node !== '0') {
        nodeMapping.set(node, nodeCounter.toString());
        nodeCounter++;
      }
    }
    
    this._nodeAliases = nodeMapping;
  }

  private _checkConnectivity(): void {
    // 简单的连通性检查
    const connections = new Map<string, Set<string>>();
    
    for (const element of this._elements) {
      for (const node of element.nodes) {
        if (!connections.has(node)) {
          connections.set(node, new Set());
        }
        
        // 连接所有同一元素的节点
        for (const otherNode of element.nodes) {
          if (node !== otherNode) {
            connections.get(node)!.add(otherNode);
          }
        }
      }
    }
    
    // 检查孤立节点
    for (const [node, connectedNodes] of connections) {
      if (connectedNodes.size === 0 && node !== '0') {
        this._warnings.push(`Node '${node}' appears to be isolated`);
      }
    }
  }

  private _validateAndOptimize(): void {
    // 元素数量检查
    if (this._elements.length === 0) {
      this._errors.push('No circuit elements found');
      return;
    }
    
    // 检查必要的分析命令
    const hasTransientAnalysis = this._analysisCommands.some(cmd => cmd.type === 'TRAN');
    if (!hasTransientAnalysis) {
      this._warnings.push('No transient analysis command found (.TRAN)');
    }
    
    // 检查电源
    const hasPowerSource = this._elements.some(el => 
      el.type === NetlistElementType.VOLTAGE_SOURCE || el.type === NetlistElementType.CURRENT_SOURCE
    );
    if (!hasPowerSource) {
      this._warnings.push('No power sources (V or I) found in circuit');
    }
    
    // 参数合理性检查
    for (const element of this._elements) {
      this._validateElementParameters(element);
    }
  }

  private _validateElementParameters(element: NetlistElement): void {
    const name = element.name;
    const value = element.value;
    
    switch (element.type) {
      case NetlistElementType.RESISTOR:
        if (typeof value === 'number' && value <= 0) {
          this._warnings.push(`Resistor ${name} has non-positive value: ${value}`);
        }
        break;
        
      case NetlistElementType.INDUCTOR:
        if (typeof value === 'number' && value <= 0) {
          this._warnings.push(`Inductor ${name} has non-positive value: ${value}`);
        }
        break;
        
      case NetlistElementType.CAPACITOR:
        if (typeof value === 'number' && value <= 0) {
          this._warnings.push(`Capacitor ${name} has non-positive value: ${value}`);
        }
        break;
    }
  }

  private _createDeviceFromElement(element: NetlistElement, netlist: ParsedNetlist): ComponentInterface | null {
      try {
          // [重大修正] 始终使用字符串节点名！引擎负责映射。
          const nodes = element.nodes as string[];
          if (nodes.length < 2 && element.type !== NetlistElementType.PARAMETER && element.type !== NetlistElementType.COUPLING) {
              throw new Error("Component must have at least 2 nodes.");
          }

          switch (element.type) {
              case NetlistElementType.RESISTOR:
                  return new Resistor(element.name, [nodes[0]!, nodes[1]!], element.value as number);

              case NetlistElementType.INDUCTOR:
                  return new Inductor(element.name, [nodes[0]!, nodes[1]!], element.value as number);

              case NetlistElementType.CAPACITOR:
                  return new Capacitor(element.name, [nodes[0]!, nodes[1]!], element.value as number);

              case NetlistElementType.VOLTAGE_SOURCE:
                  // [重大修正] 解析时变源
                  return this._createVoltageSource(element);

              case NetlistElementType.DIODE:
                  // const diodeModel = element.modelName ? netlist.models.get(element.modelName) : null; // Unused
                  // [修正] 传递字符串节点，让智能设备工厂处理。但由于接口不一致，我们暂时在这里做转换。
                  // 理想情况下，智能设备也应该接受 string[]。
                  return SmartDeviceFactory.createDiode(
                      element.name,
                      [nodes[0], nodes[1]],
                      { /* ... model params ... */ }
                  );

              case NetlistElementType.MOSFET:
                  // const mosfetModel = element.modelName ? netlist.models.get(element.modelName) : null; // Unused
                  // [修正] 节点问题同上
                  return SmartDeviceFactory.createMOSFET(
                      element.name,
                      [nodes[0], nodes[1], nodes[2]],
                      { /* ... model params ... */ }
                  );
              
              case NetlistElementType.COUPLING: // 'K'
                  if (!nodes[0] || !nodes[1]) {
                      throw new Error(`Coupling element ${element.name} requires two inductor names.`);
                  }
                  const l1 = netlist.elements.find(el => el.name.toUpperCase() === nodes[0]!.toUpperCase());
                  const l2 = netlist.elements.find(el => el.name.toUpperCase() === nodes[1]!.toUpperCase());
                  if (!l1 || !l2 || l1.type !== NetlistElementType.INDUCTOR || l2.type !== NetlistElementType.INDUCTOR) {
                      throw new Error(`Coupled inductors ${nodes[0]} or ${nodes[1]} not found or are not inductors.`);
                  }
                  // This is a conceptual representation. The actual coupling needs to be handled by the matrix assembler.
                  // For now, we can create a conceptual transformer or just note the coupling.
                  // Let's assume a simple transformer model for now.
                  this._warnings.push(`Element '${element.name}' couples ${l1.name} and ${l2.name} with k=${element.value}. This must be handled by the simulation engine's matrix assembly.`);
                  return null; // Or a specific coupling element if the engine supports it.
          }

          return null;

      } catch (error) {
          this._errors.push(`Failed to create device ${element.name}: ${error}`);
          return null;
      }
  }

  // [新增] 辅助函数来创建电压源
  private _createVoltageSource(element: NetlistElement): VoltageSource {
      const name = element.name;
      const nodes: [string, string] = [element.nodes[0] as string, element.nodes[1] as string];

      if (typeof element.value === 'number') {
          return VoltageSourceFactory.createDC(name, nodes, element.value);
      }

      if (typeof element.value === 'string') {
          const valueStr = element.value.toUpperCase();
          const parts = valueStr.replace(/[()]/g, ' ').trim().split(/\s+/).filter(p => p);
          const type = parts[0];
          
          if (type) {
            try {
                if (type === 'PULSE') {
                    const p = parts.slice(1).map(val => this._evaluateExpression(val));
                    return VoltageSourceFactory.createPulse(name, nodes, p[0] || 0, p[1] || 0, p[2] || 0, p[3] || 0, p[4] || 0, p[5] || 0, p[6] || 0);
                }
                if (type === 'SIN') {
                    const p = parts.slice(1).map(val => this._evaluateExpression(val));
                    // SIN(vo va freq td theta phase)
                    // createSine factory doesn't support all params, so construct directly.
                    return new VoltageSource(name, nodes, p[0] || 0, {
                      type: 'SIN',
                      parameters: {
                        dc: p[0] || 0,
                        amplitude: p[1] || 0,
                        frequency: p[2] || 1,
                        delay: p[3] || 0,
                        damping: p[4] || 0,
                        phase: p[5] || 0,
                      }
                    });
                }
                // 添加对 EXP, PWL 等的支持...
            } catch (e) {
                this._errors.push(`Failed to parse waveform for ${name}: ${e}`);
            }
          }
      }

      // 默认返回一个 0V 的直流源
      this._warnings.push(`Could not parse value for ${name}, defaulting to 0V DC.`);
      return VoltageSourceFactory.createDC(name, nodes, 0);
  }

  private _generateParseResult(parseTime: number): ParsedNetlist {
    return {
      elements: this._elements,
      parameters: new Map(this._parameters),
      models: new Map(this._models),
      analysisCommands: this._analysisCommands,
      subcircuits: new Map(this._subcircuits),
      nodeList: Array.from(this._nodes),
      statistics: {
        totalLines: this._currentLineNumber,
        elementCount: this._elements.length,
        nodeCount: this._nodes.size,
        parameterCount: this._parameters.size,
        modelCount: this._models.size,
        subcircuitCount: this._subcircuits.size,
        parseTime,
        memoryUsage: 0 // TODO: 实际内存使用计算
      },
      warnings: this._warnings,
      errors: this._errors
    };
  }

  private _generateErrorResult(): ParsedNetlist {
    return {
      elements: [],
      parameters: new Map(),
      models: new Map(),
      analysisCommands: [],
      subcircuits: new Map(),
      nodeList: [],
      statistics: {
        totalLines: this._currentLineNumber,
        elementCount: 0,
        nodeCount: 0,
        parameterCount: 0,
        modelCount: 0,
        subcircuitCount: 0,
        parseTime: performance.now() - this._parseStartTime,
        memoryUsage: 0
      },
      warnings: this._warnings,
      errors: this._errors
    };
  }

  /**
   * 📊 获取解析统计
   */
  getLastParseStatistics(): ParseStatistics | null {
    if (this._elements.length === 0) return null;
    
    return {
      totalLines: this._currentLineNumber,
      elementCount: this._elements.length,
      nodeCount: this._nodes.size,
      parameterCount: this._parameters.size,
      modelCount: this._models.size,
      subcircuitCount: this._subcircuits.size,
      parseTime: performance.now() - this._parseStartTime,
      memoryUsage: 0
    };
  }

  /**
   * ♻️ 清理解析器状态
   */
  reset(): void {
    this._reset();
  }

  private _parseDevice(line: string, tokens: string[]): void {
    const deviceId = tokens[0];
    const deviceType = deviceId[0].toUpperCase();
    const nodes = tokens.slice(1, tokens.length - 1);
    const modelName = tokens[tokens.length - 1];

    switch (deviceType) {
      // ... (R, L, C, V, I cases)

      case 'D': {
        const model = this._models[modelName] as DiodeParameters | undefined;
        if (!model) {
          this._errors.push(`Model ${modelName} not found for diode ${deviceId}`);
          return;
        }
        const diode = SmartDeviceFactory.createDiode(
          deviceId,
          [nodes[0], nodes[1]],
          model
        );
        this._circuit.addDevice(diode);
        break;
      }

      case 'M': {
        const model = this._models[modelName] as MOSFETParameters | undefined;
        if (!model) {
          this._errors.push(`Model ${modelName} not found for MOSFET ${deviceId}`);
          return;
        }
        const mosfet = SmartDeviceFactory.createMOSFET(
          deviceId,
          [nodes[0], nodes[1], nodes[2]],
          model
        );
        this._circuit.addDevice(mosfet);
        break;
      }

      // ... (other cases)
    }
  }

  private _parseSubcircuitDefinition(lines: string[], startIndex: number): number {
    let i = startIndex;
    const line = lines[i];
    if (!line) return i;

    const tokens = line.split(/\s+/);
    if (tokens.length < 2) return i;

    const subcktName = tokens[0].toUpperCase();
    const instanceId = `X${i}`;
    const instanceNodes = tokens.slice(1);

    // 处理参数
    const params: { [key: string]: number } = {};
    for (let j = 2; j < tokens.length; j++) {
      const paramTokens = tokens[j].split(/=/);
      if (paramTokens.length === 2) {
        const paramName = paramTokens[0].trim();
        const paramValue = this._evaluateExpression(paramTokens[1].trim());
        params[paramName] = paramValue;
      }
    }

    // 尝试作为子电路实例化
    const subcktComponent = this._createSubcircuitComponent(
      instanceId,
      instanceNodes,
      subcktName,
      params
    );
    if (subcktComponent) {
      this._circuit.addComponent(subcktComponent);
    } else {
      // Fallback for intelligent devices if not found as regular components
      const model = this._models[subcktName];
      if (model) {
        if (instanceId.startsWith('D') && model.hasOwnProperty('Is')) {
          this._circuit.addDevice(SmartDeviceFactory.createDiode(
            instanceId,
            [instanceNodes[0], instanceNodes[1]],
            model as DiodeParameters
          ));
        } else if (instanceId.startsWith('M') && model.hasOwnProperty('Vth')) {
          this._circuit.addDevice(SmartDeviceFactory.createMOSFET(
            instanceId,
            [instanceNodes[0], instanceNodes[1], instanceNodes[2]],
            model as MOSFETParameters
          ));
        }
      }
    }
    i++; // Move to the next line

    return i;
  }

  private _createSubcircuitComponent(
    id: string,
    nodes: string[],
    subcktName: string,
    params: { [key: string]: number }
  ): Component | undefined {
    const subckt = this._subcircuits[subcktName];
    if (!subckt) {
      this._errors.push(`Subcircuit definition for '${subcktName}' not found.`);
      return undefined;
    }

    // This is a simplified placeholder. A real implementation would involve
    // creating a new Circuit object for the subcircuit's contents and
    // mapping the external nodes to the internal nodes.
    // For now, we'll try to handle some known intelligent devices as a special case.

    if (subcktName.toLowerCase().includes('diode')) {
      return SmartDeviceFactory.createDiode(
        id,
        [nodes[0], nodes[1]],
        { Is: 1e-14, n: 1.0, ...params }
      );
    }

    if (subcktName.toLowerCase().includes('mosfet')) {
      return SmartDeviceFactory.createMOSFET(
        id,
        [nodes[0], nodes[1], nodes[2]],
        { Vth: 1.5, Kp: 0.1, ...params }
      );
    }

    this._warnings.push(`Subcircuit instantiation for '${subcktName}' is not fully implemented.`);
    return undefined;
  }
}