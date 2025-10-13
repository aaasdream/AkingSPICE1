/**
 * 🔧 CircuitBuilder - 測試電路構建工具
 * 
 * 提供程序化構建測試電路的便捷方法
 * 支持鏈式調用和預定義經典電路模板
 */

import { ComponentInterface } from '../../src/core/interfaces/component';
import { Resistor } from '../../src/components/passive/resistor';
import { Capacitor } from '../../src/components/passive/capacitor';
import { Inductor } from '../../src/components/passive/inductor';
import { VoltageSource } from '../../src/components/sources/voltage_source';

export interface Circuit {
  components: ComponentInterface[];
  nodes: Set<string>;
}

export class CircuitBuilder {
  private components: ComponentInterface[] = [];
  private nodes: Set<string> = new Set();
  
  /**
   * 添加電阻
   */
  addResistor(name: string, n1: string, n2: string, R: number): this {
    this.components.push(new Resistor(name, [n1, n2], R));
    this.nodes.add(n1);
    this.nodes.add(n2);
    return this;
  }
  
  /**
   * 添加電容
   */
  addCapacitor(name: string, n1: string, n2: string, C: number): this {
    this.components.push(new Capacitor(name, [n1, n2], C));
    this.nodes.add(n1);
    this.nodes.add(n2);
    return this;
  }
  
  /**
   * 添加電感
   */
  addInductor(name: string, n1: string, n2: string, L: number): this {
    this.components.push(new Inductor(name, [n1, n2], L));
    this.nodes.add(n1);
    this.nodes.add(n2);
    return this;
  }
  
  /**
   * 添加電壓源
   */
  addVoltageSource(name: string, nP: string, nN: string, V: number): this {
    this.components.push(new VoltageSource(name, [nP, nN], V));
    this.nodes.add(nP);
    this.nodes.add(nN);
    return this;
  }
  
  /**
   * 添加任意組件
   */
  addComponent(component: ComponentInterface): this {
    this.components.push(component);
    component.nodes.forEach(node => {
      if (typeof node === 'string') {
        this.nodes.add(node);
      }
    });
    return this;
  }
  
  /**
   * 構建電路
   */
  build(): Circuit {
    return {
      components: [...this.components],
      nodes: new Set(this.nodes)
    };
  }
  
  /**
   * 獲取組件列表
   */
  getComponents(): ComponentInterface[] {
    return [...this.components];
  }
  
  /**
   * 獲取節點列表
   */
  getNodes(): string[] {
    return Array.from(this.nodes);
  }
  
  /**
   * 清空電路
   */
  clear(): this {
    this.components = [];
    this.nodes.clear();
    return this;
  }
  
  // ==================== 預定義經典電路 ====================
  
  /**
   * 分壓器電路
   * 
   *     Vin
   *      |
   *     R1
   *      |---- Vout
   *     R2
   *      |
   *     GND
   */
  static buildVoltageDivider(Vin: number, R1: number, R2: number): Circuit {
    return new CircuitBuilder()
      .addVoltageSource('Vin', 'in', 'gnd', Vin)
      .addResistor('R1', 'in', 'out', R1)
      .addResistor('R2', 'out', 'gnd', R2)
      .build();
  }
  
  /**
   * RC 低通濾波器
   * 
   *     Vin --[R]--+--[C]-- GND
   *                |
   *              Vout
   */
  static buildRCLowPass(Vin: number, R: number, C: number): Circuit {
    return new CircuitBuilder()
      .addVoltageSource('Vin', 'in', 'gnd', Vin)
      .addResistor('R', 'in', 'out', R)
      .addCapacitor('C', 'out', 'gnd', C)
      .build();
  }
  
  /**
   * RL 電路
   * 
   *     Vin --[R]--[L]-- GND
   */
  static buildRL(Vin: number, R: number, L: number): Circuit {
    return new CircuitBuilder()
      .addVoltageSource('Vin', 'in', 'gnd', Vin)
      .addResistor('R', 'in', 'mid', R)
      .addInductor('L', 'mid', 'gnd', L)
      .build();
  }
  
  /**
   * 串聯 RLC 諧振電路
   * 
   *     Vin --[R]--[L]--[C]-- GND
   */
  static buildSeriesRLC(Vin: number, R: number, L: number, C: number): Circuit {
    return new CircuitBuilder()
      .addVoltageSource('Vin', 'in', 'gnd', Vin)
      .addResistor('R', 'in', 'n1', R)
      .addInductor('L', 'n1', 'n2', L)
      .addCapacitor('C', 'n2', 'gnd', C)
      .build();
  }
  
  /**
   * 並聯 RLC 諧振電路
   * 
   *     Vin --+--[R]-- GND
   *           |
   *           +--[L]-- GND
   *           |
   *           +--[C]-- GND
   */
  static buildParallelRLC(Vin: number, R: number, L: number, C: number): Circuit {
    return new CircuitBuilder()
      .addVoltageSource('Vin', 'in', 'gnd', Vin)
      .addResistor('R', 'in', 'gnd', R)
      .addInductor('L', 'in', 'gnd', L)
      .addCapacitor('C', 'in', 'gnd', C)
      .build();
  }
  
  /**
   * 惠斯通電橋
   * 
   *         R1      R3
   *     +---WWW---+---WWW---+
   *     |         |         |
   *    Vin       out       GND
   *     |         |         |
   *     +---WWW---+---WWW---+
   *         R2      R4
   */
  static buildWheatstone(Vin: number, R1: number, R2: number, R3: number, R4: number): Circuit {
    return new CircuitBuilder()
      .addVoltageSource('Vin', 'in', 'gnd', Vin)
      .addResistor('R1', 'in', 'mid', R1)
      .addResistor('R2', 'in', 'mid', R2)
      .addResistor('R3', 'mid', 'gnd', R3)
      .addResistor('R4', 'mid', 'gnd', R4)
      .build();
  }
  
  /**
   * 簡單 RC 充放電電路
   */
  static buildRCChargeDischarge(Vin: number, R: number, C: number): Circuit {
    return new CircuitBuilder()
      .addVoltageSource('Vin', 'in', 'gnd', Vin)
      .addResistor('R', 'in', 'out', R)
      .addCapacitor('C', 'out', 'gnd', C)
      .build();
  }
}
