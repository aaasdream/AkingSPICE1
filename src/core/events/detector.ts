/**
 * 🔄 事件驅動檢測器 - AkingSPICE 2.0
 * 
 * 替代 MCP-LCP 的現代開關檢測系統
 * 
 * 核心功能：
 * - 零交叉檢測 (Zero-crossing detection)
 * - 二分法精確定位事件時刻
 * - 多組件並行事件檢測
 * - 事件優先級排序
 * 
 * 這是 SPICE、Cadence、Ngspice 的標準做法
 */

import type {
  IEvent,
  Time,
  VoltageVector,
  IVector,
} from '../../types/index';
import { EventType } from '../../types/index';
import type { ComponentInterface } from '../interfaces/component';

/**
 * 🆕 新增類型：電壓插值函數
 * 引擎提供此函數，讓檢測器能在任意時間點獲取電壓
 */
export type Interpolator = (time: Time) => IVector;

/**
 * 事件檢測器主類
 */
export class EventDetector {
  private readonly _tolerance: number;
  private readonly _maxBisections: number;
  private readonly _minTimestep: number;

  constructor(options: EventDetectorOptions = {}) {
    this._tolerance = options.tolerance ?? 1e-12;
    this._maxBisections = options.maxBisections ?? 50;
    this._minTimestep = options.minTimestep ?? 1e-15;
  }

  /**
   * 檢測所有組件在時間區間內的事件
   * 
   * @param components 需要檢查的組件列表
   * @param t0 起始時間
   * @param t1 結束時間  
   * @param v0 起始電壓向量
   * @param v1 結束電壓向量
   * @param nodeMap 節點名稱到索引的映射
   * @returns 按時間排序的事件列表
   */
  detectEvents(
    components: ComponentInterface[],
    t0: Time,
    t1: Time,
    v0: VoltageVector,
    v1: VoltageVector,
    nodeMap: Map<string, number>, // ✅ 新增參數
  ): IEvent[] {
    const events: IEvent[] = [];

    for (const component of components) {
      const eventFunctions = component.getEventFunctions?.();
      if (!eventFunctions) continue;

      for (const { type, condition } of eventFunctions) {
        const val0 = condition(v0, nodeMap); // ✅ 傳入 nodeMap
        const val1 = condition(v1, nodeMap); // ✅ 傳入 nodeMap

        if (Math.sign(val0) !== Math.sign(val1)) {
          // Zero-crossing detected, create an event
          events.push({
            type,
            component,
            time: (t0 + t1) / 2, // Approximate time, to be refined by locateEventTime
            tLow: t0,
            tHigh: t1,
            condition, // Pass the condition function itself
            priority: 1,
            description: `Zero-crossing for event type ${type}`,
          });
        }
      }
    }

    // 按時間排序並過濾重複事件
    return this._sortAndFilterEvents(events);
  }

  /**
   * 精確定位單個事件的時刻
   * 
   * 使用二分法在區間 [t0, t1] 內精確定位事件發生時刻
   */
  async locateEventTime(
    event: IEvent,
    interpolator: Interpolator,
    nodeMap: Map<string, number> // ✅ 新增參數
  ): Promise<Time> {
    let tLow = event.tLow!;
    let tHigh = event.tHigh!;
    let iterations = 0;

    const condition = event.condition;
    if (!condition) {
      throw new Error(`Event is missing a condition function for location.`);
    }

    // 初始檢查邊界
    const conditionLow = condition(interpolator(tLow), nodeMap); // ✅ 傳入 nodeMap
    const conditionHigh = condition(interpolator(tHigh), nodeMap); // ✅ 傳入 nodeMap

    // 如果兩端符號相同，表示事件可能不在這個區間內或發生了多次
    if (Math.sign(conditionLow) === Math.sign(conditionHigh)) {
      // 返回區間中點作為近似值
      console.warn(`Event ${event.type} on ${event.component.name} conditions are the same at boundaries.`);
      return (tLow + tHigh) / 2;
    }

    while (tHigh - tLow > this._tolerance && iterations < this._maxBisections) {
      const tMid = 0.5 * (tLow + tHigh);
      const vMid = interpolator(tMid);
      const conditionMid = condition(vMid, nodeMap); // ✅ 傳入 nodeMap

      if (Math.sign(conditionMid) === Math.sign(conditionLow)) {
        tLow = tMid;
      } else {
        tHigh = tMid;
      }
      iterations++;
    }

    return (tLow + tHigh) / 2;
  }

  /**
   * 檢查時間區間是否過小
   */
  isTimestepTooSmall(dt: Time): boolean {
    return dt < this._minTimestep;
  }

  private _sortAndFilterEvents(events: IEvent[]): IEvent[] {
    // 按時間排序
    events.sort((a, b) => a.time - b.time);

    // 過濾同時發生的重複事件
    const filtered: IEvent[] = [];
    let lastTime = -Infinity;

    for (const event of events) {
      if (Math.abs(event.time - lastTime) > this._tolerance) {
        filtered.push(event);
        lastTime = event.time;
      } else {
        // 同一時刻的事件，選擇優先級更高的
        const lastEvent = filtered[filtered.length - 1]!;
        if (this._getEventPriority(event) > this._getEventPriority(lastEvent)) {
          filtered[filtered.length - 1] = event;
        }
      }
    }

    return filtered;
  }

  private _getEventPriority(event: IEvent): number {
    // 事件優先級：開關 > 二極體 > MOSFET
    switch (event.type) {
      case EventType.SWITCH_ON:
      case EventType.SWITCH_OFF:
        return 100;
      case EventType.DIODE_FORWARD:
      case EventType.DIODE_REVERSE:
        return 90;
      case EventType.MOSFET_LINEAR:
      case EventType.MOSFET_SATURATION:
      case EventType.MOSFET_CUTOFF:
        return 80;
      default:
        return 50;
    }
  }
}

/**
 * 事件檢測器配置選項
 */
export interface EventDetectorOptions {
  readonly tolerance?: number;
  readonly maxBisections?: number;
  readonly minTimestep?: number;
}

/**
 * 事件統計信息
 */
export interface EventStatistics {
  readonly totalEvents: number;
  readonly eventsByType: Map<EventType, number>;
  readonly averageLocalizationTime: number;
  readonly maxBisections: number;
}

/**
 * 事件歷史記錄器
 */
export class EventLogger {
  private _events: IEvent[] = [];
  private _statistics: EventStatistics | undefined;

  logEvent(event: IEvent): void {
    this._events.push(event);
    this._statistics = undefined; // 重新計算統計
  }

  getEvents(): readonly IEvent[] {
    return this._events;
  }

  getStatistics(): EventStatistics {
    if (!this._statistics) {
      this._statistics = this._computeStatistics();
    }
    return this._statistics;
  }

  clear(): void {
    this._events = [];
    this._statistics = undefined;
  }

  private _computeStatistics(): EventStatistics {
    const eventsByType = new Map<EventType, number>();
    
    for (const event of this._events) {
      const eventType = event.type as EventType;
      const count = eventsByType.get(eventType) ?? 0;
      eventsByType.set(eventType, count + 1);
    }

    return {
      totalEvents: this._events.length,
      eventsByType,
      averageLocalizationTime: 0, // 需要從定位器獲取
      maxBisections: 0
    };
  }
}