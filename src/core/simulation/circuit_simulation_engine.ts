/**
 * 🚀 AkingSPICE 2.1 通用电路仿真引擎
 *
 * 世界领先的通用电路仿真引擎，整合三大革命性技术：
 * - Generalized-α 时域积分器 (L-稳定，可控阻尼)
 * - 统一组件接口 (基础组件 + 智能设备)
 * - Ultra KLU WASM 求解器 (极致性能)
 *
 * 🏆 设计目标：
 * - 支持任意电路拓扑仿真
 * - 大规模电路高效处理 (1000+ 节点)
 * - 实时仿真能力 (μs 级时间步长)
 * - 工业级数值稳定性 (>99% 收敛率)
 * - 自适应仿真策略 (智能优化)
 *
 * 📚 技术架构：
 *   Event-Driven MNA + Generalized-α + 统一组件接口
 *   多时间尺度处理 + 自适应步长控制
 *   并行化友好设计 + 内存优化
 *
 * 🎯 应用领域：
 *   开关电源设计验证
 *   电力电子系统分析
 *   RF/模拟电路仿真
 *   多物理场耦合仿真
 */

// 导入语句部分，添加 VoltageSource
import { SparseMatrix } from '../../math/sparse/matrix';
import { Vector } from '../../math/sparse/vector';
import type {
  GminEnhancedConfig,
  IConvergenceHelper,
  IEvent,
  IMNASystem,
  ISparseMatrix,
  IVector,
  NewtonResult,
  Time
} from '../../types/index';
import { GeneralizedAlphaIntegrator } from '../integrator/generalized_alpha';
import { BackwardEulerIntegrator } from '../integrator/backward_euler';
import { TrapezoidalIntegrator } from '../integrator/trapezoidal';
import { ExtraVariableIndexManager, ExtraVariableType } from '../mna/extra_variable_manager';
// CHANGED: 导入统一的接口和新的类型守卫
import { GeneralizedHomotopy, type IHomotopySystem } from '../../math/numerical/homotopy';
import type {
  DeviceState
} from '../devices/intelligent_device_model';
import { isIntelligentDeviceModel } from '../devices/intelligent_device_model';
import { globalSnapshotManager } from '../diagnostics/failure_snapshot';
import { EventDetector } from '../events/detector';
import { AssemblyContext, ComponentInterface } from '../interfaces/component';

/**
 * 仿真状态枚举
 */
export enum SimulationState {
  IDLE = 'idle',                    // 空闲状态
  INITIALIZING = 'initializing',    // 初始化中
  RUNNING = 'running',              // 运行中
  PAUSED = 'paused',               // 暂停
  CONVERGED = 'converged',         // 收敛完成
  FAILED = 'failed',               // 仿真失败
  COMPLETED = 'completed'          // 完成
}

/**
 * 仿真配置参数
 */
export interface SimulationConfig {
  // 时间设置
  readonly startTime: Time;        // 开始时间
  readonly endTime: Time;          // 结束时间
  readonly initialTimeStep: number; // 初始时间步长
  readonly minTimeStep: number;    // 最小时间步长
  readonly maxTimeStep: number;    // 最大时间步长

  // 收敛控制
  readonly voltageToleranceAbs: number;  // 电压绝对容差
  readonly voltageToleranceRel: number;  // 电压相对容差
  readonly currentToleranceAbs: number;  // 电流绝对容差
  readonly currentToleranceRel: number;  // 电流相对容差
  readonly maxNewtonIterations: number;  // 最大 Newton 迭代次数

  // 积分器设置
  readonly alphaf: number;         // Generalized-α 参数
  readonly alpham: number;         // Generalized-α 参数
  readonly beta: number;           // Newmark 参数
  readonly gamma: number;          // Newmark 参数

  // 性能优化
  readonly enableAdaptiveTimeStep: boolean;  // 自适应时间步长
  readonly enablePredictiveAnalysis: boolean; // 预测性分析
  readonly enableParallelization: boolean;   // 并行化
  readonly maxMemoryUsage: number;           // 最大内存使用 (MB)

  // 调试选项
  readonly verboseLogging: boolean;          // 详细日志
  readonly saveIntermediateResults: boolean; // 保存中间结果
  readonly enablePerformanceMonitoring: boolean; // 性能监控
}

/**
 * 仿真结果数据
 */
export interface SimulationResult {
  readonly success: boolean;
  readonly finalTime: Time;
  readonly totalSteps: number;
  readonly convergenceRate: number;
  readonly averageStepTime: number;
  readonly peakMemoryUsage: number;
  readonly waveformData: WaveformData;
  readonly performanceMetrics: PerformanceMetrics;
  readonly errorMessage?: string;
}

/**
 * 波形数据
 */
export interface WaveformData {
  readonly timePoints: readonly Time[];
  readonly nodeVoltages: Map<number, readonly number[]>; // 节点ID -> 电压序列
  readonly deviceCurrents: Map<string, readonly number[]>; // 设备ID -> 电流序列
  readonly deviceStates: Map<string, readonly string[]>; // 设备ID -> 状态序列
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  totalSimulationTime: number;    // 总仿真时间 (ms)
  matrixAssemblyTime: number;     // 矩阵装配时间 (ms)
  matrixSolutionTime: number;     // 矩阵求解时间 (ms)
  deviceEvaluationTime: number;   // 设备评估时间 (ms)
  convergenceCheckTime: number;   // 收敛检查时间 (ms)
  memoryPeakUsage: number;        // 内存峰值使用 (MB)
  averageIterationsPerStep: number; // 平均每步迭代次数
  failedSteps: number;            // 失败步数
  adaptiveStepChanges: number;    // 自适应步长变化次数
}

/**
 * 仿真事件
 */
export interface SimulationEvent {
  readonly time: Time;
  readonly type: string;
  readonly deviceId?: string | undefined;  // 明确允许undefined
  readonly description: string;
  readonly data?: any;
}

interface ScalableSource {
  scaleSource(factor: number): void;
  restoreSource(): void;
}

/**
 * 🚀 电路仿真引擎核心类
 *
 * 整合所有革命性技术的统一仿真平台
 * 提供工业级的大规模电路仿真能力
 */
export class CircuitSimulationEngine implements IMNASystem, IConvergenceHelper { // <--- 實現介面
  // 核心组件
  // @ts-ignore - 将在瞬态分析实现中使用
  private _integrator: GeneralizedAlphaIntegrator | BackwardEulerIntegrator | TrapezoidalIntegrator;
  private readonly _eventDetector: EventDetector;
  // CHANGED: 设备容器现在接受任何 ComponentInterface
  private readonly _devices: Map<string, ComponentInterface> = new Map();
  private readonly _nodeMapping: Map<string, number> = new Map();

  // 🆕 额外变数管理器
  private _extraVariableManager: ExtraVariableIndexManager | null = null;

  // 🔥 MCAS 状态机
  private _solverState: 'EASY' | 'NORMAL' | 'HARD' = 'NORMAL';
  private _consecutiveEasySteps: number = 0;
  private _consecutiveHardSteps: number = 0;
  private readonly _easyThreshold: number = 10;   // 连续 10 步简单则进入 EASY
  private readonly _hardThreshold: number = 3;    // 连续 3 步困难则进入 HARD

  // 🔥 瞬态分析 Gmin Stepping 策略 (用于 DC→瞬态过渡的数值稳定性)
  private _transientGminSteps: number = 0;        // 剩余需要使用 gmin 的时间步数
  private _transientGminCurrent: number = 0;      // 当前 gmin 值 (逐步衰减到0)

  // 仿真状态
  private _state: SimulationState = SimulationState.IDLE;
  private _config: SimulationConfig;
  private _currentTime: Time = 0;
  private _currentTimeStep: number = 1e-6;
  private _stepCount: number = 0;

  // System矩阵和向量
  private _systemMatrix: ISparseMatrix;
  private _rhsVector: IVector;
  private _solutionVector: IVector;
  private _previousSolutionVector: IVector;  // 🔧 保存上一个时间步的解

  // 🚀 積分器係數 (用於解耦無源元件)
  private _G_coeff: number | undefined = undefined;  // 電導係數 (電容用)
  private _I_coeff: number | undefined = undefined;  // 歷史電流係數 (電容用)
  private _R_coeff: number | undefined = undefined;  // 電阻係數 (電感用)
  private _V_coeff: number | undefined = undefined;  // 歷史電壓係數 (電感用)

  // 性能监控
  private _performanceMetrics: PerformanceMetrics;
  private _startTime: number = 0;
  private _events: SimulationEvent[] = [];

  // 波形数据存储
  private _waveformData: WaveformData;

  // 内存管理
  private _memoryUsage: number = 0;
  private readonly _maxNodes: number;

  constructor(config: Partial<SimulationConfig> = {}) {
    // 配置默认参数
    this._config = {
      startTime: 0,
      endTime: 1e-3,                    // 默认 1ms 仿真
      initialTimeStep: 1e-6,            // 默认 1μs 步长
      minTimeStep: 1e-9,                // 最小 1ns
      maxTimeStep: 1e-5,                // 最大 10μs
      voltageToleranceAbs: 1e-6,        // 1μV 绝对容差
      voltageToleranceRel: 1e-9,        // 1ppb 相对容差
      currentToleranceAbs: 1e-9,        // 1nA 绝对容差
      currentToleranceRel: 1e-9,        // 1ppb 相对容差
      maxNewtonIterations: 50,          // 最大 Newton 迭代
      alphaf: 0.4,                      // Generalized-α 参数 (数值阻尼)
      alpham: 0.2,                      // Generalized-α 参数
      beta: 0.36,                       // Newmark β
      gamma: 0.7,                       // Newmark γ
      enableAdaptiveTimeStep: true,     // 启用自适应步长
      enablePredictiveAnalysis: true,   // 启用预测分析
      enableParallelization: false,     // 暂不启用并行化
      maxMemoryUsage: 1024,             // 1GB 内存限制
      verboseLogging: false,            // 简洁日志
      saveIntermediateResults: true,    // 保存中间结果
      enablePerformanceMonitoring: true, // 启用性能监控
      ...config
    };

    // ✅ 允許用戶自行決定最小時間步長
    // 對於快速開關電路（如 Buck 轉換器），可能需要 ps 級別的時間步長
    // 如果數值不穩定，用戶應該增大 minTimeStep 而非由引擎強制限制
    if (this._config.minTimeStep < 1e-12) {
      console.warn(`⚠️ minTimeStep ${this._config.minTimeStep} 極小 (< 1ps)，可能影響性能。建議 ≥ 1e-12s`);
    }

    this._eventDetector = new EventDetector({
      minTimestep: this._config.minTimeStep,
    });

    // 初始化积分器
    // 🔧 使用 Trapezoidal 積分器 (完全按照 ngspice 實現)
    this._integrator = new TrapezoidalIntegrator({
      initialTimeStep: this._config.initialTimeStep,
      minTimeStep: this._config.minTimeStep,
      maxTimeStep: this._config.maxTimeStep,
      tolerance: this._config.voltageToleranceAbs,
      order: 2,  // Order 2 = 梯形法 (ngspice 默認)
      xmu: 0.5,  // 標準梯形法參數
      maxNewtonIterations: this._config.maxNewtonIterations,
      verbose: this._config.verboseLogging
    });

    // 估算最大节点数 (基于内存限制)
    this._maxNodes = Math.floor(this._config.maxMemoryUsage * 1024 * 1024 / (8 * 1000)); // 估算公式

    // 初始化矩阵和向量 (使用估算大小)
    const estimatedSize = Math.min(this._maxNodes, 1000); // 默认最大1000节点
    this._systemMatrix = new SparseMatrix(estimatedSize, estimatedSize);
    this._rhsVector = new Vector(estimatedSize);
    this._solutionVector = new Vector(estimatedSize);
    this._previousSolutionVector = new Vector(estimatedSize);  // 🔧 初始化历史解向量

    // 初始化性能指标
    this._performanceMetrics = {
      totalSimulationTime: 0,
      matrixAssemblyTime: 0,
      matrixSolutionTime: 0,
      deviceEvaluationTime: 0,
      convergenceCheckTime: 0,
      memoryPeakUsage: 0,
      averageIterationsPerStep: 0,
      failedSteps: 0,
      adaptiveStepChanges: 0
    };

    // 初始化波形数据
    this._waveformData = {
      timePoints: [],
      nodeVoltages: new Map(),
      deviceCurrents: new Map(),
      deviceStates: new Map()
    };
  }

  /**
   * 🔧 添加组件到电路 (统一接口)
   *
   * CHANGED: 现在接受任何 ComponentInterface，实现真正的统一架构
   */
  addDevice(device: ComponentInterface): void {
    if (this._state !== SimulationState.IDLE) {
      throw new Error('Cannot add devices while simulation is running');
    }

    // 使用统一的 name 属性作为键
    this._devices.set(device.name, device);

    // 统一处理节点映射 - 支持字符串和数字节点
    device.nodes.forEach((nodeId) => {
      const nodeName = nodeId.toString();
      if (!this._nodeMapping.has(nodeName)) {
        const globalNodeId = this._nodeMapping.size;
        this._nodeMapping.set(nodeName, globalNodeId);
      }
    });

    this._logEvent('DEVICE_ADDED', device.name, `Added ${device.type} device`);
  }

  /**
   * 🔧 批量添加设备 (便于复杂电路创建)
   *
   * CHANGED: 现在接受任何 ComponentInterface 数组
   */
  addDevices(devices: ComponentInterface[]): void {
    devices.forEach(device => this.addDevice(device));
  }

  /**
   * 🆕 按名称获取节点 ID
   */
  getNodeIdByName(name: string): number | undefined {
    return this._nodeMapping.get(name);
  }

  /**
   * ⚙️ 初始化仿真系统 (重构版本)
   *
   * 整合了额外变数管理器，现在支持电感、电压源和变压器
   */
  private async _initializeSimulation(): Promise<void> {
    this._logEvent('INFO', undefined, '� Initializing simulation system...');

    try {
      // Note: Don't set state here, let runSimulation() manage it
      // this._state = SimulationState.INITIALIZING;
      // const initStartTime = performance.now();

      this._validateCircuit();

      // 1. 預掃描以確定系統總大小
      const baseNodeCount = this._nodeMapping.size;
      let extraVarsCount = 0;
      for (const device of this._devices.values()) {
        if ('getExtraVariableCount' in device && typeof (device as any).getExtraVariableCount === 'function') {
          extraVarsCount += (device as any).getExtraVariableCount();
        }
      }

      // 2. 初始化管理器
      this._extraVariableManager = new ExtraVariableIndexManager(baseNodeCount);
      const totalSystemSize = baseNodeCount + extraVarsCount;

      // 3. 創建正確大小的矩陣和向量
      this._systemMatrix = new SparseMatrix(totalSystemSize, totalSystemSize);
      this._rhsVector = new Vector(totalSystemSize);
      this._solutionVector = new Vector(totalSystemSize);
      this._previousSolutionVector = new Vector(totalSystemSize);  // 🔧 重新初始化历史解向量

      // 4. 第二次掃描，為元件分配索引 (統一使用 setExtraVariableIndices)
      for (const device of this._devices.values()) {
        if ('getExtraVariableCount' in device && typeof (device as any).getExtraVariableCount === 'function') {
          const count = (device as any).getExtraVariableCount();
          const indices: number[] = [];

          if (device.type === 'V') {
            // 電壓源：1個額外變量（電流）
            indices.push(this._extraVariableManager.allocateIndex(
              ExtraVariableType.VOLTAGE_SOURCE_CURRENT, device.name
            ));
          } else if (device.type === 'L') {
            // 電感：1個額外變量（電流）
            indices.push(this._extraVariableManager.allocateIndex(
              ExtraVariableType.INDUCTOR_CURRENT, device.name
            ));
          } else if (device.type === 'K') {
            // 變壓器：2個額外變量（初級電流 + 次級電流）
            indices.push(this._extraVariableManager.allocateIndex(
              ExtraVariableType.TRANSFORMER_PRIMARY_CURRENT, device.name
            ));
            indices.push(this._extraVariableManager.allocateIndex(
              ExtraVariableType.TRANSFORMER_SECONDARY_CURRENT, device.name
            ));
          }

          // 統一調用 setExtraVariableIndices
          if ('setExtraVariableIndices' in device && typeof (device as any).setExtraVariableIndices === 'function') {
            (device as any).setExtraVariableIndices(indices);
          }
        }
      }

      this._logEvent('INIT', undefined, `System size: ${totalSystemSize} (${baseNodeCount} nodes + ${extraVarsCount} extra vars).`);

      // 关键修复：在开始 DC 分析之前，确保解向量是一个干净的全零向量
      this._solutionVector.fill(0);

      // 5. 計算 DC 工作點 (所有仿真類型都需要)
      await this._performDCAnalysis();

      // 🔧 初始化历史解向量为 DC 工作点 (瞬态分析的初始条件)
      this._previousSolutionVector = this._solutionVector.clone();

      // DC-only 分析 (endTime = 0) 到此結束
      if (this._config.endTime === 0) {
        // 🔧 關鍵修復：DC 分析後也需要保存波形數據
        this._saveWaveformPoint();
        this._state = SimulationState.COMPLETED;
        return;
      }

      // 🎯 瞬态分析：UIC (零初始條件) 將在元件層級處理
      // 移除舊的有害邏輯 - DC 解應該保持完整傳遞給瞬態分析
      // 電容和電感會在自己的 assemble() 方法中檢查 currentTime 來實現 UIC

      this._logEvent('INIT', undefined, '✅ Transient analysis initialized with consistent DC operating point.');

      // 6. 用完整的 DC 工作點解來啟動積分器
      await this._integrator.restart({
        time: this._config.startTime,
        solution: this._solutionVector as Vector,
        derivative: Vector.zeros(this._solutionVector.size)
      });
      console.log('🔄 Generalized-α integrator restarted with consistent DC operating point.');

      // 6. 初始化波形数据存储
      this._initializeWaveformStorage();

      // 7. 设置初始时间和步长
      this._currentTime = this._config.startTime;
      this._currentTimeStep = this._config.initialTimeStep;
      this._stepCount = 0;

      // 🔥 关键修复：为瞬态分析启用 Gmin Stepping 策略
      // 在初始几个时间步使用渐进的 gmin 来改善矩阵条件数
      this._transientGminSteps = 3;  // 前3步使用 gmin
      this._transientGminCurrent = 1e-6;  // 初始 gmin = 1µS
      this._logEvent('INIT', undefined, `🛡️ Transient Gmin Stepping enabled: ${this._transientGminSteps} steps, initial gmin=${this._transientGminCurrent.toExponential(2)}S`);
    } catch (error) {
      this._state = SimulationState.FAILED;
      // 增加更详细的错误日志
      console.error('Detailed error in _initializeSimulation:', error);
      // Re-throw the error to be caught by the main runSimulation catch block
      throw new Error(`Simulation initialization failed: ${error}`);
    }
  }

  /**
   * 🚀 运行主要仿真循环
   */
  async runSimulation(): Promise<SimulationResult> {
    this._startTime = performance.now();
    this._state = SimulationState.RUNNING;

    try {
      // 1. 初始化仿真
      await this._initializeSimulation();

      this._logEvent('INFO', undefined, '✅ Simulation initialization complete.');

      // 🚀 关键修复：DC→瞬态转换时的平滑步长启动策略
      // 如果初始步长太大，会导致伴随模型产生剧烈跳变 (R_eq = L/dt)
      // 策略：第一步使用极小步长，让积分器自然增长到目标步长
      if (this._stepCount === 0 && this._currentTimeStep > 1e-10) {
        const SMOOTH_START_DT = Math.max(this._config.minTimeStep, 1e-11); // 10ps
        this._logEvent('INIT', undefined,
          `🛡️ Smooth start: reducing first step from ${this._currentTimeStep.toExponential(2)}s to ${SMOOTH_START_DT.toExponential(2)}s (prevent companion model discontinuity)`);
        this._currentTimeStep = SMOOTH_START_DT;
      }

      // 2. 主仿真循环
      while (this._currentTime < this._config.endTime && this._state === SimulationState.RUNNING) {
        try {
          const stepSuccess = await this._performTimeStep();

          if (!stepSuccess) {
            // 步长减半重试
            if (this._currentTimeStep > this._config.minTimeStep * 2) {
              this._currentTimeStep *= 0.5;
              this._performanceMetrics.adaptiveStepChanges++;
              continue;
            } else {
              // 无法继续，仿真失败
              this._state = SimulationState.FAILED;
              this._logEvent('FATAL', undefined, 'Time step fell below minimum and could not recover.');

              // 🔬 捕獲失敗快照
              console.log(`🔬 準備捕獲快照: t=${this._currentTime}, enabled=${globalSnapshotManager.isEnabled()}`);
              if (globalSnapshotManager.isEnabled()) {
                try {
                  console.log('🔬 開始捕獲快照...');

                  // 使用系統矩陣和RHS (如果可用)
                  const systemSize = this._solutionVector.size;
                  const matrix = this._systemMatrix || new SparseMatrix(systemSize, systemSize);
                  const rhsVector = this._rhsVector || new Vector(systemSize);

                  // 計算 residual = b - J*x
                  const Jx = matrix.multiply(this._solutionVector) as Vector;
                  const residual = rhsVector.minus(Jx);

                  // 捕獲快照
                  const snapshotFile = globalSnapshotManager.captureSnapshot(
                    'timestep_minimum',
                    this._currentTime,
                    this._currentTimeStep,
                    this._solutionVector,
                    residual,  // 正確的 residual
                    matrix,
                    [], // Newton history 不可用
                    {
                      tolerance: 1e-8,
                      maxIterations: 50,
                      failureReason: 'Time step fell below minimum',
                      failureLayer: 'TIMESTEP_CONTROL',
                      rhs: rhsVector  // 🔥 NEW: Include RHS for debugging
                    }
                  );
                  console.log(`✅ 快照已保存: ${snapshotFile}`);
                } catch (snapshotError) {
                  console.error('快照捕獲失敗:', snapshotError);
                }
              }

              break;
            }
          }
        } catch (stepError) {
          console.error(`💥 Error within simulation loop at t=${this._currentTime}:`, stepError);
          throw stepError; // Re-throw to be caught by the main catch block
        }

        // 3. 保存波形数据
        if (this._config.saveIntermediateResults) {
          this._saveWaveformPoint();
        }

        // 5. 内存使用检查
        if (this._memoryUsage > this._config.maxMemoryUsage * 1024 * 1024) {
          this._logEvent('MEMORY_WARNING', undefined, 'Memory usage exceeded limit');
          break;
        }

        this._stepCount++;
      }

      // Mark simulation as completed if we reached the end time normally
      if (this._currentTime >= this._config.endTime && this._state === SimulationState.RUNNING) {
        this._state = SimulationState.COMPLETED;
        this._logEvent('INFO', undefined, '✅ Simulation completed successfully.');
      }

      // 3. 生成最终结果
      return this._generateFinalResult();

    } catch (error) {
      this._state = SimulationState.FAILED;
      // 增加更详细的错误日志
      console.error('🔥 Detailed error object in runSimulation:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        finalTime: this._currentTime,
        totalSteps: this._stepCount,
        convergenceRate: 0,
        averageStepTime: 0,
        peakMemoryUsage: this._memoryUsage / (1024 * 1024),
        waveformData: this._waveformData,
        performanceMetrics: this._performanceMetrics,
        errorMessage: `Simulation failed: ${errorMessage}. Check console for detailed error object.`
      };
    }
  }

  /**
   * ⏸️ 暂停仿真
   */
  pauseSimulation(): void {
    if (this._state === SimulationState.RUNNING) {
      this._state = SimulationState.PAUSED;
      this._logEvent('SIMULATION_PAUSED', undefined, `Paused at t=${this._currentTime}`);
    }
  }

  /**
   ▶️ 恢复仿真
   */
  resumeSimulation(): void {
    if (this._state === SimulationState.PAUSED) {
      this._state = SimulationState.RUNNING;
      this._logEvent('SIMULATION_RESUMED', undefined, `Resumed at t=${this._currentTime}`);
    }
  }

  /**
   * ⏹️ 停止仿真
   */
  stopSimulation(): void {
    this._state = SimulationState.COMPLETED;
    this._logEvent('SIMULATION_STOPPED', undefined, `Stopped at t=${this._currentTime}`);
  }

  /**
   * 📊 获取当前仿真状态
   */
  getSimulationStatus() {
    return {
      state: this._state,
      currentTime: this._currentTime,
      progress: (this._currentTime - this._config.startTime) / (this._config.endTime - this._config.startTime),
      stepCount: this._stepCount,
      currentTimeStep: this._currentTimeStep,
      memoryUsage: this._memoryUsage / (1024 * 1024), // MB
      deviceCount: this._devices.size,
      nodeCount: this._nodeMapping.size
    };
  }

  // --- 實現 IMNASystem 所需的屬性 ---

  get size(): number {
    return this._systemMatrix.rows;
  }

  get systemMatrix(): ISparseMatrix {
    return this._systemMatrix;
  }

  getRHS(): IVector {
    return this._rhsVector;
  }

  getGroundNodeIndex(): number | undefined {
    return this._nodeMapping.get('0');
  }

  // --- 實現 IMNASystem 所需的核心方法 ---

  /**
   * 這個方法是積分器和引擎之間的橋樑。
   * 積分器在每一次內部 Newton 迭代時都會呼叫它。
   */
  /**
   * 🚀 設置積分器係數 (供 Generalized-α 積分器調用)
   *
   * 這些係數由積分器根據其內部公式計算，並在每個時間步開始時設置
   *
   * @param G_coeff 電導係數 (電容用)
   * @param I_coeff 歷史電流係數 (電容用)
   * @param R_coeff 電阻係數 (電感用)
   * @param V_coeff 歷史電壓係數 (電感用)
   */
  public setIntegrationCoefficients(
    G_coeff?: number,
    I_coeff?: number,
    R_coeff?: number,
    V_coeff?: number
  ): void {
    this._G_coeff = G_coeff;
    this._I_coeff = I_coeff;
    this._R_coeff = R_coeff;
    this._V_coeff = V_coeff;
  }

  public assemble(solution: IVector, time: Time): void {
    // 🔥 CRITICAL CHECK: Detect NaN in solution vector before assembly
    for (let i = 0; i < solution.size; i++) {
      const val = solution.get(i);
      if (!isFinite(val)) {
        console.error(`🚨 [ASSEMBLE] NaN/Inf detected in solution vector at index ${i}, value=${val}, time=${time}`);
        throw new Error(`Solution vector contains NaN/Inf at index ${i}. Cannot assemble system.`);
      }
    }

    // 更新當前解，以便 _assembleSystem 使用
    this._solutionVector = solution;

    // 🔥 瞬态分析初始阶段 Gmin Stepping 策略
    // 在 DC→瞬态过渡的前几步使用渐进的 gmin 来改善雅可比矩阵条件数
    let effectiveGmin = 1e-9; // 默认的 SPICE gmin (始终保持对角线元素非零)

    if (this._transientGminSteps > 0 && time > 0) {
      // 在瞬态分析初期，使用更大的 gmin 并逐步衰减
      effectiveGmin = this._transientGminCurrent;
      this._logEvent('TRANSIENT_GMIN', undefined, `Transient gmin=${effectiveGmin.toExponential(2)}S (${this._transientGminSteps} steps remaining)`);
    }

    // 🎯 瞬態分析時使用 this._currentTimeStep，DC 分析時使用 0
    this._assembleSystem(time, effectiveGmin, this._currentTimeStep);
  }

  // === 私有方法实现 ===

  private _validateCircuit(): void {
    if (this._devices.size === 0) {
      throw new Error('No devices found in circuit');
    }

    if (this._nodeMapping.size > this._maxNodes) {
      throw new Error(`Too many nodes: ${this._nodeMapping.size} > ${this._maxNodes}`);
    }

    // 验证节点连通性 (简化检查)
    const connectedNodes = new Set<number>();
    this._devices.forEach(device => {
      device.nodes.forEach(nodeId => {
        const globalNodeId = this._nodeMapping.get(nodeId.toString());
        if (globalNodeId !== undefined) {
          connectedNodes.add(globalNodeId);
        }
      });
    });

    if (connectedNodes.size !== this._nodeMapping.size) {
      console.warn('Warning: Some nodes may not be connected');
    }
  }

  /**
   * ⚙️ 执行 DC 工作点分析 (完全重构)
   * 实现了源步进 (外部循环) 和带步长阻尼的 Newton-Raphson (内部循环)
   */
  private async _performDCAnalysis(): Promise<void> {
    console.log('📊 開始 DC 工作點分析...');

    // 关键修复：在整个 DC 分析开始时，提供一个初始的非零猜测。
    // 这可以避免在 v=0 时的数值奇点（例如，在半导体器件模型中）。
    this._solutionVector.fill(1e-6);

    // 🔥 新增：檢測是否有非線性元件
    const hasNonlinear = this._hasNonlinearDevices();
    if (!hasNonlinear) {
      console.log('📐 檢測到純線性電路，直接使用標準求解器...');
      const dcResult = await this._solveDCNewtonRaphson(0); // gmin=0 for linear circuits
      if (dcResult) {
        this._logEvent('dc_converged', undefined, '線性電路直接求解收斂');
        return;
      } else {
        console.error('❌ 線性電路求解失敗！');
        throw new Error('Linear circuit DC analysis failed - this should not happen');
      }
    }

    // 🔥 步骤 1: 源步进 (作为首選方法 - 對二極體更穩健)
    console.log('🔄 非線性電路，優先嘗試源步進...');
    let dcResult = await this._sourceSteppingHomotopy();
    if (dcResult) {
      this._logEvent('dc_converged', undefined, '源步进收敛');
      return;
    }

    // 步骤 2: Gmin Stepping (作为備用方法)
    console.log('🔄 源步進失敗，嘗試 Gmin Stepping...');
    this._solutionVector.fill(1e-6); // 重置解向量
    dcResult = await this._gminSteppingHomotopy();
    console.log(`📊 Gmin Stepping 結果: ${dcResult ? '成功' : '失敗'}`);
    if (dcResult) {
      this._logEvent('dc_converged', undefined, 'Gmin Stepping 收敛');
      return;
    }

    // 步骤 3: 标准 Newton-Raphson (最后的尝试)
    console.log('🔄 Gmin Stepping 失败，最后尝试标准 Newton...');
    this._solutionVector.fill(1e-6); // 再次重置
    dcResult = await this._solveDCNewtonRaphson();
    console.log(`📊 標準 Newton 結果: ${dcResult ? '成功' : '失敗'}`);
    if (dcResult) {
      this._logEvent('dc_converged', undefined, '標準 Newton 收斂');
      return;
    }

    // 步骤 4: 廣義同倫延拓 (終極防線)
    console.log('🧭 標準方法均失敗，啟動廣義同倫延拓求解器...');
    this._solutionVector.fill(1e-6); // 重置為初始猜測
    dcResult = await this._tryGeneralizedHomotopy();
    if (dcResult) {
      this._logEvent('dc_converged', undefined, '廣義同倫延拓收斂');
      return;
    }

    // 最终失败
    this._logEvent('dc_failed', undefined, '所有 DC 方法失敗 (包含同倫延拓)');
    throw new Error('DC 工作點分析失敗');
  }

  private async _sourceSteppingHomotopy(): Promise<boolean> {
    const sources = Array.from(this._devices.values()).filter(d => 'scaleSource' in d) as (ComponentInterface & ScalableSource)[];
    console.log(`📊 源步進：找到 ${sources.length} 個可縮放的源`);
    if (sources.length === 0) {
      console.log('⚠️  沒有可縮放的源，跳過源步進');
      return false;
    }
    const stepFactors = [0.0, 0.25, 0.5, 0.75, 1.0];
    let converged = false;

    for (const factor of stepFactors) {
      this._logEvent('DC_SOURCE_STEP', undefined, `Setting source factor to ${(factor * 100).toFixed(0)}%`);
      // 🧠 智能初始猜测：当所有源为0时，最佳猜测就是0向量
      if (factor === 0.0) {
        this._solutionVector.fill(0);
      }

      for (const source of sources) {
        source.scaleSource(factor);
      }

      // 🧠 使用更鲁棒的阻尼策略进行源步进
      converged = await this._solveDCNewtonRaphson(0);

      if (!converged) {
        this._logEvent('DC_STEP_FAILED', undefined, `Newton-Raphson failed to converge at source factor ${factor}`);
        for (const source of sources) {
          source.restoreSource();
        }
        return false;
      }
    }

    for (const source of sources) {
      source.restoreSource();
    }

    // 🔍 關鍵修復：驗證最終解是否真正有效（物理合理性檢查）
    if (converged) {
      const isValid = this._isSolutionPhysicallyPlausible();
      if (!isValid) {
        console.log('⚠️ 源步進收斂，但解不符合物理預期，將嘗試其他方法');
        return false;
      }
    }

    return converged;
  }

  /**
   * 🔍 檢查 DC 解是否物理合理
   *
   * 這是防止虛假收斂的關鍵檢查。即使數值上 ||F(x)|| < tol，
   * 解也可能陷入平凡解（例如全零）而不是真實的物理工作點。
   *
   * @returns true 如果解看起來合理，false 如果可能是虛假收斂
   */
  private _isSolutionPhysicallyPlausible(): boolean {
    const solutionVector = this._solutionVector as Vector;
    const baseNodeCount = this._nodeMapping.size;

    console.log(`   >>> PHYSICAL_CHECK: solution_size=${solutionVector.size}, nodes=${baseNodeCount}`);

    // 檢查 1：是否有電壓源？
    const voltageSources = Array.from(this._devices.values()).filter(d => {
      if (d.type !== 'V') return false;
      // 🔥 FIX: 不要只检查 dcValue，因为 SIN/PULSE 等波形的 dcValue 可能是 0
      // 只要 type === 'V' 就算作有电压源
      return true;
    });

    console.log(`   >>> PHYSICAL_CHECK: voltage_sources_found=${voltageSources.length}`);

    if (voltageSources.length === 0) {
      // 沒有電壓源，全零解是合理的
      console.log('   >>> PHYSICAL_CHECK: No voltage sources, zero solution is valid');
      return true;
    }

    // 🔥 FIX: 检查所有电压源的 DC 值是否都接近 0
    // 对于 SIN/PULSE 等波形，dcValue 可能是 0，此时全零解是合理的
    const hasNonZeroDcSource = voltageSources.some(d => {
      if ('dcValue' in d) {
        return Math.abs((d as any).dcValue) > 1e-6;
      }
      if ('value' in d) {
        return Math.abs((d as any).value) > 1e-6;
      }
      return false;
    });

    if (!hasNonZeroDcSource) {
      console.log('   >>> PHYSICAL_CHECK: All voltage sources have DC=0, zero solution is valid');
      return true;
    }

    // 檢查 2：統計節點電壓分佈
    let zeroCount = 0;
    let nonZeroCount = 0;
    let maxVoltage = 0;
    let voltageSum = 0;

    for (let i = 0; i < Math.min(baseNodeCount, solutionVector.size); i++) {
      const voltage = Math.abs(solutionVector.get(i));
      maxVoltage = Math.max(maxVoltage, voltage);
      voltageSum += voltage;

      if (voltage < 1e-3) {  // < 1mV 視為零
        zeroCount++;
      } else {
        nonZeroCount++;
      }
    }

    const avgVoltage = voltageSum / baseNodeCount;

    // 檢查 3：如果有非零電壓源，但幾乎所有節點都是零，這是虛假收斂
    console.log(`   >>> PHYSICAL_CHECK: zero_count=${zeroCount}/${baseNodeCount}, max_V=${maxVoltage.toFixed(6)}V`);
    if (zeroCount > baseNodeCount * 0.9 && maxVoltage < 0.01) {
      console.log(`   >>> PHYSICAL_CHECK_RESULT: FAIL - Most nodes are zero`);
      console.log(`   >>> Max voltage: ${maxVoltage.toExponential(2)}V, Average: ${avgVoltage.toExponential(2)}V`);
      return false;
    }

    // 檢查 4：對於有電壓源的電路，至少應該有一些節點有明顯電壓
    const minExpectedNonZeroNodes = Math.max(1, Math.floor(voltageSources.length * 0.5));
    if (nonZeroCount < minExpectedNonZeroNodes) {
      console.log(`   ❌ 物理檢查失敗：只有 ${nonZeroCount} 個非零節點，期望至少 ${minExpectedNonZeroNodes} 個`);
      return false;
    }

    // 檢查 5：檢查是否有明顯的數值異常（NaN, Inf）
    for (let i = 0; i < solutionVector.size; i++) {
      const value = solutionVector.get(i);
      if (!isFinite(value) || isNaN(value)) {
        console.log(`   >>> PHYSICAL_CHECK_RESULT: FAIL - Numerical anomaly at node ${i}: ${value}`);
        return false;
      }
    }

    console.log(`   >>> PHYSICAL_CHECK_RESULT: PASS (non_zero=${nonZeroCount}, max_V=${maxVoltage.toFixed(3)}V)`);
    return true;
  }

  // ==================================================================================
  // 🔥 MCAS - Multi-layered Convergence Assurance Strategy
  // IConvergenceHelper 接口实现
  // ==================================================================================

  /**
   * 实现 Gmin 增强牛顿法（适配瞬态单步求解）
   *
   * 与完整的 _gminSteppingHomotopy 不同，这个方法：
   * - 使用固定的小 Gmin（不做完整 Stepping）
   * - 从给定的初始猜测开始（而不是从零开始）
   * - 专为瞬态分析的单个时间步设计
   */
  async tryGminEnhancedNewton(
    initialGuess: Vector,
    time: Time,
    config: GminEnhancedConfig
  ): Promise<NewtonResult> {
    this._logEvent('convergence_helper', undefined,
      `[MCAS-L2] Trying Gmin-Enhanced Newton (gmin=${config.initialGmin.toExponential(2)})`);

    let solution = initialGuess.clone();
    let gmin = config.initialGmin;
    let bestResult: NewtonResult | null = null;
    let attempts = 0;
    const maxAttempts = config.allowGminIncrease ? 3 : 1;

    while (attempts < maxAttempts) {
      attempts++;

      let converged = false;
      let finalResidual = Infinity;

      for (let iter = 0; iter < config.maxIterations; iter++) {
        // 🔥 CRITICAL: Check for NaN BEFORE assembly
        const hasNaN = Array.from({ length: solution.size }, (_, i) => solution.get(i)).some(v => !isFinite(v));
        if (hasNaN) {
          this._logEvent('convergence_helper', undefined,
            `[MCAS-L2] NaN detected in solution at iter ${iter}, aborting Gmin-NR`);
          break;
        }

        // 组装系统（这会更新 _systemMatrix 和 _rhsVector）
        this.assemble(solution, time);

        const J = this._systemMatrix.clone();
        const b = this._rhsVector.clone();

        // 🔥 关键：增强对角占优性
        for (let i = 0; i < solution.size; i++) {
          (J as SparseMatrix).add(i, i, gmin);
        }

        // 计算残差
        const Jx = J.multiply(solution) as Vector;
        const residual = (b as Vector).minus(Jx) as Vector;
        finalResidual = residual.norm();

        if (finalResidual < config.tolerance) {
          converged = true;
          this._logEvent('convergence_helper', undefined,
            `[MCAS-L2] ✅ Gmin-NR converged in ${iter} iterations, residual=${finalResidual.toExponential(3)}`);
          break;
        }

        // 求解线性系统 J * delta = residual
        try {
          const delta = await this._solveLinearSystem(J, residual);

          // 简单的线搜索（阻尼）
          let alpha = 1.0;
          for (let ls = 0; ls < 3; ls++) {
            const solutionTrial = (solution as Vector).plus((delta as Vector).scale(alpha)) as Vector;
            this.assemble(solutionTrial, time);
            const JTrial = this._systemMatrix;
            const bTrial = this._rhsVector;
            const residualTrial = (bTrial as Vector).minus(JTrial.multiply(solutionTrial) as Vector) as Vector;
            const residualTrialNorm = residualTrial.norm();

            if (residualTrialNorm < finalResidual || ls === 2) {
              solution = solutionTrial;
              break;
            }
            alpha *= 0.5;
          }
        } catch (error) {
          this._logEvent('convergence_helper', undefined,
            `[MCAS-L2] Linear solve failed at iter ${iter}: ${error}`);
          break;
        }
      }

      if (converged) {
        return {
          solution,
          velocity: new Vector(solution.size),
          acceleration: new Vector(solution.size),
          converged: true,
          iterations: config.maxIterations,
          finalResidual
        };
      }

      // 如果失败且允许增加 Gmin，尝试更大的值
      if (config.allowGminIncrease && attempts < maxAttempts) {
        gmin *= 10;
        solution = initialGuess.clone(); // 重置解
        this._logEvent('convergence_helper', undefined,
          `[MCAS-L2] Increasing Gmin to ${gmin.toExponential(2)} (attempt ${attempts}/${maxAttempts})`);
      }

      if (bestResult === null || finalResidual < bestResult.finalResidual) {
        bestResult = {
          solution,
          velocity: new Vector(solution.size),
          acceleration: new Vector(solution.size),
          converged: false,
          iterations: config.maxIterations,
          finalResidual
        };
      }
    }

    this._logEvent('convergence_helper', undefined,
      `[MCAS-L2] ❌ Gmin-NR failed after ${attempts} attempts, best residual=${bestResult!.finalResidual.toExponential(3)}`);
    return bestResult!;
  }

  /**
   * 实现 Phoenix 伪瞬态求解器（最终保障）
   */
  async tryPhoenixSolver(
    initialGuess: Vector,
    time: Time,
    maxSteps: number
  ): Promise<NewtonResult> {
    this._logEvent('convergence_helper', undefined,
      `[MCAS-L3] Activating Phoenix solver (max ${maxSteps} steps)`);

    let x = initialGuess.clone();
    let pseudoTimeStep = 0.01;
    const minPseudoTimeStep = 1e-10;
    const growthFactor = 1.2;
    const shrinkFactor = 0.5;
    const tolerance = Math.max(this._config.voltageToleranceAbs, 1e-6);

    for (let step = 0; step < maxSteps; step++) {
      // 🔥 CRITICAL: Check for NaN BEFORE assembly
      const hasNaN = Array.from({ length: x.size }, (_, i) => x.get(i)).some(v => !isFinite(v));
      if (hasNaN) {
        this._logEvent('convergence_helper', undefined,
          `[MCAS-L3] NaN detected in solution at step ${step}, aborting Phoenix`);
        break;
      }

      // 计算残差
      this.assemble(x, time);
      const J = this._systemMatrix;
      const b = this._rhsVector;
      const Jx = J.multiply(x) as Vector;
      const G_x = (b as Vector).minus(Jx) as Vector;
      const residualNorm = G_x.norm();

      if (residualNorm < tolerance) {
        this._logEvent('convergence_helper', undefined,
          `[MCAS-L3] ✅ Phoenix converged in ${step} steps, residual=${residualNorm.toExponential(3)}`);
        return {
          solution: x,
          velocity: new Vector(x.size),
          acceleration: new Vector(x.size),
          converged: true,
          iterations: step,
          finalResidual: residualNorm
        };
      }

      // 构造伪瞬态雅可比 [J + (1/dτ)*I]
      const J_pseudo = (J as SparseMatrix).clone();
      const c = 1.0 / pseudoTimeStep;
      for (let i = 0; i < x.size; i++) {
        J_pseudo.add(i, i, c);
      }

      // 求解 [J + (1/dτ)*I] * delta = -G(x)
      try {
        const delta = await this._solveLinearSystem(J_pseudo, G_x);
        x = (x as Vector).plus(delta as Vector) as Vector;

        // 自适应步长
        const newResidualNorm = this._evaluateResidualNorm(x, time);
        if (newResidualNorm < residualNorm * 0.9) {
          pseudoTimeStep = Math.min(pseudoTimeStep * growthFactor, 1e6);
        } else if (newResidualNorm > residualNorm) {
          pseudoTimeStep = Math.max(pseudoTimeStep * shrinkFactor, minPseudoTimeStep);
        }
      } catch (error) {
        pseudoTimeStep = Math.max(pseudoTimeStep * 0.1, minPseudoTimeStep);
        if (pseudoTimeStep <= minPseudoTimeStep) {
          break;
        }
      }
    }

    const finalResidual = this._evaluateResidualNorm(x, time);
    this._logEvent('convergence_helper', undefined,
      `[MCAS-L3] ❌ Phoenix failed after ${maxSteps} steps, residual=${finalResidual.toExponential(3)}`);

    return {
      solution: x,
      velocity: new Vector(x.size),
      acceleration: new Vector(x.size),
      converged: false,
      iterations: maxSteps,
      finalResidual
    };
  }

  /**
   * 获取当前求解器状态
   */
  getSolverState(): 'EASY' | 'NORMAL' | 'HARD' {
    return this._solverState;
  }

  /**
   * 报告收敛结果（更新状态机）
   */
  reportConvergenceResult(
    converged: boolean,
    method: 'NR' | 'GMIN' | 'PHOENIX',
    iterations: number
  ): void {
    if (converged && method === 'NR' && iterations < 10) {
      // 简单收敛
      this._consecutiveEasySteps++;
      this._consecutiveHardSteps = 0;

      if (this._consecutiveEasySteps >= this._easyThreshold) {
        this._solverState = 'EASY';
        this._logEvent('state_machine', undefined, '[MCAS] Entering EASY state');
      }
    } else if (!converged || method === 'PHOENIX' || iterations > 30) {
      // 困难收敛
      this._consecutiveHardSteps++;
      this._consecutiveEasySteps = 0;

      if (this._consecutiveHardSteps >= this._hardThreshold) {
        this._solverState = 'HARD';
        this._logEvent('state_machine', undefined, '[MCAS] Entering HARD state');
      }
    } else {
      // 正常收敛
      if (this._consecutiveEasySteps > 0) this._consecutiveEasySteps--;
      if (this._consecutiveHardSteps > 0) this._consecutiveHardSteps--;

      if (this._consecutiveEasySteps === 0 && this._consecutiveHardSteps === 0) {
        this._solverState = 'NORMAL';
      }
    }
  }

  /**
   * 辅助方法：评估残差范数
   */
  private _evaluateResidualNorm(solution: Vector, time: Time): number {
    this.assemble(solution, time);
    const J = this._systemMatrix;
    const b = this._rhsVector;
    const Jx = J.multiply(solution) as Vector;
    const residual = (b as Vector).minus(Jx) as Vector;
    return residual.norm();
  }

  // ==================================================================================
  // End of MCAS Implementation
  // ==================================================================================

  /**
   * 🔥 新增：檢測電路中是否包含非線性元件
   * 用於決定是否需要 Gmin Stepping 等複雜收斂策略
   */
  private _hasNonlinearDevices(): boolean {
    for (const device of this._devices.values()) {
      const deviceType = device.constructor.name;
      // 檢測常見的非線性元件類型
      if (deviceType.includes('Diode') || 
          deviceType.includes('MOSFET') || 
          deviceType.includes('BJT') ||
          deviceType.includes('JFET') ||
          deviceType.includes('Thyristor') ||
          deviceType.includes('NgDiode') ||
          deviceType.includes('NgMosfet')) {
        return true;
      }
      // 也可以檢查是否實現了 limitUpdate 方法（非線性元件的特徵）
      if (typeof (device as any).limitUpdate === 'function') {
        return true;
      }
    }
    return false;
  }

  // 新方法: Gmin Stepping (DC 初始化专用)
  private async _gminSteppingHomotopy(): Promise<boolean> {
    // 🔥 優化參數以提高效率和穩定性
    const gminSteps = 8;         // 減少步數 (原 15 → 8)
    const initialGmin = 1e-3;    // 更合理的起始值 1mS (原 1S → 1mS)
    const finalGmin = 1e-12;     // 最終收斂到 1pS (接近理想開路)

    console.log(`🔄 開始 Gmin Stepping: ${gminSteps} 步, 從 ${initialGmin}S 到 ${finalGmin}S`);

    for (let step = 0; step <= gminSteps; step++) {
      const factor = step / gminSteps;
      // Use logarithmic stepping for gmin
      const currentGmin = initialGmin * Math.pow(finalGmin / initialGmin, factor);

      this._logEvent('gmin_step', undefined, `Gmin=${currentGmin.toExponential(2)}, Step ${step}/${gminSteps}`);

      // Pass the current Gmin value to the Newton-Raphson solver
      const newtonResult = await this._solveDCNewtonRaphson(currentGmin);

      if (!newtonResult) {
        this._logEvent('gmin_step_failed', undefined, `❌ Newton-Raphson failed with Gmin = ${currentGmin.toExponential(2)}`);
        console.error(`❌ Gmin Stepping 在步驟 ${step}/${gminSteps} 失敗`);
        return false;  // 🔥 快速失敗，不要無限重試
      }
    }

    // Final check with zero Gmin
    this._logEvent('gmin_step', undefined, 'Final convergence check with Gmin = 0');
    const finalConverged = await this._solveDCNewtonRaphson(0);

    // 物理合理性檢查
    console.log(`>>> GMIN_STEPPING_FINAL_CONVERGED: ${finalConverged}`);
    if (finalConverged) {
      console.log('>>> PHYSICAL_CHECK_STARTING');
      const isValid = this._isSolutionPhysicallyPlausible();
      console.log(`>>> PHYSICAL_CHECK_RESULT: ${isValid ? 'PASS' : 'FAIL'}`);
      if (!isValid) {
        console.log('>>> WARNING: Gmin Stepping converged numerically but solution is physically invalid');
        return false;
      }
    }

    return finalConverged;
  }

  /**
   * 🧭 廣義同倫延拓求解器 (終極防線)
   *
   * 當所有傳統方法 (Gmin Stepping, Source Stepping, Newton-Raphson) 均失敗時，
   * 使用數學上更完備的弧長延拓法來尋找 DC 工作點。
   *
   * 優勢：
   * - 可處理解路徑上的轉折點
   * - 對極端初始條件更魯棒
   * - 理論上完備（只要連續路徑存在）
   */
  private async _tryGeneralizedHomotopy(): Promise<boolean> {
    console.log('🧭🧭🧭 啟動廣義同倫延拓求解器 (終極防線) 🧭🧭🧭');
    console.log(`   系統大小: ${this._solutionVector.size} 節點`);

    // 創建同倫系統適配器
    const homotopySystem: IHomotopySystem = {
      size: this._solutionVector.size,

      assemble: (x: Vector, time: number) => {
        // 清空矩陣和 RHS
        this._systemMatrix.clear();
        this._rhsVector.fill(0);

        // 創建組裝上下文
        const context: AssemblyContext = {
          matrix: this._systemMatrix as SparseMatrix,
          rhs: this._rhsVector as Vector,
          nodeMap: this._nodeMapping,
          currentTime: time,
          dt: 0,
          solutionVector: x,
          previousSolutionVector: this._previousSolutionVector as Vector,
          getExtraVariableIndex: (componentName: string, variableType: string) =>
            this._extraVariableManager?.getIndex(componentName, variableType as ExtraVariableType)
        };

        // 組裝所有組件（DC 分析不需要 Gmin）
        for (const device of this._devices.values()) {
          try {
            device.assemble(context);
          } catch (error) {
            console.warn(`組件 ${device.name} 組裝失敗:`, error);
          }
        }
      },

      getJacobian: () => {
        return this._systemMatrix as SparseMatrix;
      },

      getRHS: () => {
        return this._rhsVector as Vector;
      },

      getSolution: () => {
        return this._solutionVector as Vector;
      }
    };

    // 🔥 關鍵修復：不使用可能是全零的解向量，而是創建一個非零初始猜測
    // 這是為了避免同倫路徑陷入平凡解（x=0）的陷阱
    //
    // 理論依據：如果起點 a≈0，並且 F(0)=0（平凡解），那麼同倫函數
    // H(x,λ) = F(x) - (1-λ)F(a) 在整個 λ∈[0,1] 上都滿足 H(0,λ)=0
    // 這會導致求解器沿著 x=0 這條平凡路徑前進，永遠找不到非零的物理解
    //
    // 解決方案：使用非零起點 a，使得 F(a)≠0，這樣 F(a) 項就像一個「推力」
    // 會把解路徑推離 x=0，迫使求解器尋找真正的物理解
    const initialGuess = new Vector(this._solutionVector.size);

    // 方案：使用混合的智能初始猜測
    // - 對於節點電壓：使用小的正值（模擬輕微的正偏壓）
    // - 對於額外變量（電流等）：使用小的隨機值打破對稱性
    const baseNodeCount = this._nodeMapping.size;
    for (let i = 0; i < initialGuess.size; i++) {
      if (i < baseNodeCount) {
        // 節點電壓：使用 0.1V 到 1.0V 之間的值
        initialGuess.set(i, 0.1 + Math.random() * 0.9);
      } else {
        // 額外變量（支路電流等）：使用 -0.01 到 0.01 之間的小隨機值
        initialGuess.set(i, (Math.random() - 0.5) * 0.02);
      }
    }

    console.log(`   初始猜測範圍: [${Math.min(...initialGuess.toArray()).toFixed(3)}, ${Math.max(...initialGuess.toArray()).toFixed(3)}]`);

    // 創建同倫求解器實例
    const homotopySolver = new GeneralizedHomotopy(homotopySystem, initialGuess, {
      maxSteps: 200,
      initialStepSize: 0.05,      // 較小的初始步長以提高穩定性
      minStepSize: 1e-4,
      maxStepSize: 0.3,           // 較保守的最大步長
      correctorTolerance: 1e-6,   // 與 Newton 容差一致
      correctorMaxIter: 15,
      targetLambda: 1.0
    });

    // 執行同倫延拓求解
    const result = homotopySolver.solve();

    if (result.success && result.solution) {
      console.log(`✅ 同倫延拓數值收斂！共 ${result.states.length} 步`);

      // 將解複製到系統解向量
      for (let i = 0; i < result.solution.size; i++) {
        this._solutionVector.set(i, result.solution.get(i));
      }

      // 驗證 1：檢查 KCL 殘差
      const finalResidual = this._computeKCLResidual(this._solutionVector as Vector);
      const residualNorm = finalResidual.norm();
      console.log(`  數值殘差: ||F(x)|| = ${residualNorm.toExponential(2)}`);

      if (residualNorm >= 1e-4) {
        console.log('❌ 同倫延拓：數值殘差過大');
        return false;
      }

      // 驗證 2：物理合理性檢查（關鍵！防止平凡解）
      const isPhysicallyValid = this._isSolutionPhysicallyPlausible();
      if (!isPhysicallyValid) {
        console.log('❌ 同倫延拓：解不符合物理預期（可能陷入平凡解）');
        return false;
      }

      console.log('✅ 同倫延拓完全成功：數值收斂 + 物理合理');
      return true;
    }

    console.log('❌ 同倫延拓數值求解失敗');
    return false;
  }

  /**
   * 🎯 计算 KCL 残差 F(x)
   *
   * 正确的方法：对于每个节点，计算所有流入/流出的电流总和
   * F[i] = Σ I_in[i] - Σ I_out[i] (应该为0，满足基尔霍夫电流定律)
   *
   * 这是 Newton-Raphson 的核心：我们需要找到 x 使得 F(x) = 0
   *
   * @param x - 当前的电压解向量
   * @returns 残差向量 F(x)
   */
  private _computeKCLResidual(x: Vector): Vector {
    const F = new Vector(x.size);
    F.fill(0);

    // 创建组装上下文用于 computeCurrent
    const context: AssemblyContext = {
      matrix: this._systemMatrix as SparseMatrix,
      rhs: this._rhsVector as Vector,
      nodeMap: this._nodeMapping,
      currentTime: 0, // DC 分析
      dt: 0,
      solutionVector: x,
      previousSolutionVector: this._previousSolutionVector as Vector,
      getExtraVariableIndex: (componentName: string, variableType: string) =>
        this._extraVariableManager?.getIndex(componentName, variableType as ExtraVariableType)
    };

    // 遍历所有组件，累加每个组件的电流贡献
    for (const device of this._devices.values()) {
      try {
        // 计算组件电流 (正值表示从正节点流向负节点)
        const current = device.computeCurrent(x, context);

        // 对于两端口组件，电流从正节点流出，流入负节点
        if (device.nodes.length >= 2) {
          const posNodeId = device.nodes[0];
          const negNodeId = device.nodes[1];

          if (posNodeId === undefined || negNodeId === undefined) {
            continue;  // 安全检查
          }

          const posNode = posNodeId.toString();
          const negNode = negNodeId.toString();

          const posIndex = this._nodeMapping.get(posNode);
          const negIndex = this._nodeMapping.get(negNode);

          // KCL: 流出为正，流入为负
          if (posIndex !== undefined && posIndex > 0) {  // 跳过地节点
            F.set(posIndex, F.get(posIndex) + current);  // 从正节点流出
          }
          if (negIndex !== undefined && negIndex > 0) {  // 跳过地节点
            F.set(negIndex, F.get(negIndex) - current);  // 流入负节点
          }
        }
      } catch (error) {
        console.error(`Error computing current for device ${device.name}: ${error}`);
        throw error;
      }
    }

    return F;
  }

  // 替換原有的 _solveDCNewtonRaphson 方法
  private async _solveDCNewtonRaphson(gmin: number = 0): Promise<boolean> {
    let iterations = 0;
    const x_k = this._solutionVector as Vector;

    while (iterations < this._config.maxNewtonIterations) {
      // 1. 根據當前的解 x_k 組裝雅可比矩陣 J(x_k) 和 RHS b(x_k)
      // 🎯 關鍵：assemble() 必須在當前 x_k 處線性化非線性組件
      this._assembleSystem(0, gmin, 0); // 🎯 time=0, gmin, dt=0 for DC analysis
      const J = this._systemMatrix;
      const b = this._rhsVector;

      // 🎯 **MNA 殘差**: F(x_k) = J(x_k) * x_k - b(x_k)
      // 對於正確組裝的 MNA 系統，這就是 KCL 殘差
      const F = (J.multiply(x_k) as Vector).minus(b);

      // 2. 求解線性系統 J(x_k) * Δx = -F(x_k)
      const F_neg = F.scale(-1);
      const delta_x = await this._solveLinearSystem(J, F_neg);

      // 🔥 FIX: 完整的 NaN 檢查 - 檢查向量中的每個元素
      // 不只檢查 norm()，因為 NaN 可能被掩蓋在部分元素中
      let hasNaN = false;
      const n = delta_x.size;
      for (let i = 0; i < n; i++) {
        const val = delta_x.get(i);
        if (!isFinite(val)) {  // 同時捕獲 NaN 和 Infinity
          hasNaN = true;
          // 嘗試找到節點名稱（如果可能）
          let nodeName = `index ${i}`;
          for (const [name, idx] of this._nodeMapping) {
            if (idx === i) {
              nodeName = name;
              break;
            }
          }
          this._logEvent('DC_SOLVER_ERROR', undefined,
            `[Iter ${iterations}] delta_x[${i}] = ${val} (non-finite at node '${nodeName}')`);
          break;
        }
      }

      if (hasNaN || isNaN(delta_x.norm())) {
        this._logEvent('DC_SOLVER_ERROR', undefined,
          `[Iter ${iterations}] Linear solver returned invalid solution. Possible causes: singular matrix, ill-conditioned system, or numerical overflow.`);
        return false;
      }

      // 3. 更新解 x_{k+1} = x_k + Δx
      // 注意：這裡的 this._solutionVector 就是 x_k，所以我們直接在它上面操作
      (this._solutionVector as Vector).addInPlace(delta_x);

      // 4. 檢查收斂性
      const deltaNorm = delta_x.norm();
      const solutionNorm = this._solutionVector.norm();
      const residualNorm = F.norm();

      if (this._config.verboseLogging) {
        console.log(`  [DC Iter ${iterations}] ||F(x)|| = ${residualNorm.toExponential(4)}, ||Δx|| = ${deltaNorm.toExponential(4)}`);
      }

      // 检查两个收斂条件：残差足够小 AND 更新足够小
      const residualConverged = residualNorm < this._config.currentToleranceAbs;
      const updateConverged = deltaNorm < (this._config.voltageToleranceRel * solutionNorm + this._config.voltageToleranceAbs);

      if (this._config.verboseLogging || iterations < 3 || iterations > 15) {
        // 前3次和超過15次時顯示詳細信息
        console.log(`  [DC Iter ${iterations}] residual=${residualNorm.toExponential(2)} (tol=${this._config.currentToleranceAbs.toExponential(2)}), ` +
                    `delta=${deltaNorm.toExponential(2)} (tol=${(this._config.voltageToleranceRel * solutionNorm + this._config.voltageToleranceAbs).toExponential(2)}), ` +
                    `converged=${residualConverged && updateConverged}`);
      }

      if (residualConverged && updateConverged) {
        this._logEvent('DC_NR_CONVERGED', undefined, `Newton-Raphson converged in ${iterations + 1} iterations.`);
        return true;
      }

      iterations++;
    }

    this._logEvent('DC_NR_FAILED', undefined, `Newton-Raphson exceeded max iterations (${this._config.maxNewtonIterations}).`);
    console.error(`❌ Newton-Raphson 達到最大迭代次數 ${this._config.maxNewtonIterations} 但未收斂`);
    return false;
  }



  /**
   * 🎯 執行單一時間步進（事件驅動架構 Event-Driven Architecture）
   *
   * 核心四階段流程：
   * 1. 🔮 預測 (Proactive Prediction): 檢查已知斷點 (如 PULSE 邊沿)
   * 2. ⚖️ 約束 (Constrain): 調整步長以精確命中斷點
   * 3. ⚙️ 積分 (Integrate): 執行不跨越斷點的「暫定」步驟
   * 4. 🔍 驗證 (Reactive Verification): 用零交叉檢測捕獲意外的狀態轉換
   *
   * 這種雙重保護機制確保：
   * - 已知不連續點 (breakpoints) 被精確命中
   * - 未預期的事件 (zero-crossings) 被及時捕獲
   */
  private async _performTimeStep(): Promise<boolean> {
    const t_start = this._currentTime;
    let dt = this._currentTimeStep;

    // --- 🌊 階段 0: 斜坡區間檢測 (Ramp Interval Detection) ---
    // 檢查當前時間是否處於電壓源的斜坡變化區間
    let isInRamp = false;
    let rampEndTime = Infinity;
    let rampSource = 'None';

    for (const device of this._devices.values()) {
      if ((device as any).getRampIntervals) {
        try {
          const ramps: [number, number][] = (device as any).getRampIntervals(t_start, t_start + dt);
          for (const [tStart, tEnd] of ramps) {
            // 檢查當前時間是否在此斜坡區間內
            if (t_start >= tStart && t_start < tEnd) {
              isInRamp = true;
              rampEndTime = tEnd;
              rampSource = device.name;
              // 約束步長，確保不會超出斜坡區間
              dt = Math.min(dt, tEnd - t_start);
              break;
            }
          }
        } catch (error) {
          // 容錯處理
          continue;
        }
      }
      if (isInRamp) break;
    }

    // 🔥 如果在斜坡區間，使用更保守的步長控制
    if (isInRamp) {
      // 🎯 關鍵策略：在斜坡區間使用比 minTimeStep 更大的步長
      // 這樣可以避免時間步過小導致的數值剛性問題
      const RAMP_MAX_DT = 1e-9; // 1ns - 是 minTimeStep (1e-10) 的 10 倍
      const RAMP_MIN_DT = 5e-10; // 0.5ns - 斜坡區間的最小步長

      // 使用較大的步長，但不超過斜坡剩餘長度
      dt = Math.max(RAMP_MIN_DT, Math.min(dt, RAMP_MAX_DT, rampEndTime - t_start));

      console.log(`[RAMP_DEBUG] In ramp from ${rampSource}, t=${t_start.toExponential(4)}s, setting dt to ${dt.toExponential(3)}s (ramp: ${RAMP_MIN_DT.toExponential(1)}s-${RAMP_MAX_DT.toExponential(1)}s), ramp ends at ${rampEndTime.toExponential(4)}s`);
      this._logEvent('RAMP_DETECTED', rampSource, `In ramp, using dt=${dt.toExponential(2)}s`);
    }

    // --- 🔮 階段 1: 預測 (Proactive Prediction) ---
    // 檢查是否有已知的斷點 (如 PULSE 源的邊沿)
    let earliestBreakpoint = Infinity;
    let breakpointSource = 'None';
    for (const device of this._devices.values()) {
      if (device.getBreakpoints) {
        try {
          const breakpoints = device.getBreakpoints(t_start, t_start + dt);
          if (breakpoints && breakpoints.length > 0) {
            const firstBreakpoint = breakpoints[0];
            if (firstBreakpoint !== undefined && firstBreakpoint < earliestBreakpoint) {
              earliestBreakpoint = firstBreakpoint;
              breakpointSource = device.name; // 記錄是哪個設備的斷點
            }
          }
        } catch (error) {
          // 某些設備的 getBreakpoints 可能出錯，容錯處理
          continue;
        }
      }
    }

    // 🔥🔥 關鍵調試日誌 🔥🔥
    if (earliestBreakpoint < Infinity) {
      console.log(`[BREAKPOINT_DEBUG] t=${t_start.toExponential(4)}s, dt=${dt.toExponential(4)}s. Found breakpoint from ${breakpointSource} at t=${earliestBreakpoint.toExponential(4)}s.`);
    }

    // --- ⚖️ 階段 2: 約束 (Constrain) ---
    // 如果斷點在當前步長內，則縮小步長以精確命中斷點
    let willHitBreakpoint = false;
    if (earliestBreakpoint < t_start + dt) {
      const constrainedDt = earliestBreakpoint - t_start;

      // 🔥 關鍵修復：如果斷點非常接近（小於 minTimeStep），直接跳到斷點！
      // 這是因為我們不能跨越斷點，即使距離很小
      if (constrainedDt > this._config.minTimeStep * 0.1) {
        // 正常情況：斷點距離合理，使用約束步長
        dt = constrainedDt;
        willHitBreakpoint = true;
        this._logEvent('BREAKPOINT_ADJUST', breakpointSource, `Time step constrained to ${dt.toExponential(3)}s to hit breakpoint at ${earliestBreakpoint.toExponential(3)}s.`);
      } else if (constrainedDt > 0) {
        // 🔥 特殊情況：斷點就在眼前（< 0.1 * minTimeStep），強制使用極小步長直接跳到斷點
        // 不能忽略它，因為跨越斷點會導致 Newton 發散！
        dt = constrainedDt;
        willHitBreakpoint = true;
        console.log(`[BREAKPOINT_DEBUG] Breakpoint is very close (${constrainedDt.toExponential(2)}s), forcing step to hit it exactly.`);
        this._logEvent('BREAKPOINT_ADJUST', breakpointSource, `Forcing tiny step ${dt.toExponential(3)}s to hit imminent breakpoint at ${earliestBreakpoint.toExponential(3)}s.`);
      } else {
        // constrainedDt <= 0：我們已經在斷點上或已經過了（浮點數誤差）
        console.log(`[BREAKPOINT_DEBUG] Already at or past breakpoint (${constrainedDt.toExponential(2)}s), proceeding normally.`);
      }
    }

    // --- ⚙️ 階段 3: 積分 (Integrate) ---
    // 執行一個不跨越任何已知斷點的 "暫定" 時間步
    let integratorResult;
    try {
      integratorResult = await this._integrator.step(this, t_start, dt, this._solutionVector);
    } catch (error) {
      console.error(`💥 Integrator step failed at t=${t_start}:`, error);
      throw new Error(`Integrator error: ${error}`);
    }

    if (!integratorResult.converged) {
      this._logEvent('INTEGRATOR_FAILURE', undefined, `Integrator failed at t=${t_start.toExponential(3)}s with dt=${dt.toExponential(3)}s`);
      return false; // 積分失敗，由外層循環處理步長減小
    }
    const tentativeSolution = integratorResult.solution;
    const t_end = t_start + dt;

    // --- 🔍 階段 4: 驗證 (Reactive Verification) ---
    // 即使沒有預測到斷點，也要用零交叉檢測來捕獲意外的狀態轉換事件
    let events: IEvent[] = [];
    try {
      const eventfulComponents = Array.from(this._devices.values()).filter(d => d.hasEvents && d.hasEvents());
      events = this._eventDetector.detectEvents(
        eventfulComponents,
        t_start, t_end, this._solutionVector, tentativeSolution,
        this._nodeMapping
      );
    } catch (error) {
      console.error(`💥 Event detection failed at t=${t_start}:`, error);
      throw new Error(`Event detection error: ${error}`);
    }

    if (events.length === 0) {
      // --- ✅ 情況 A: 安全的一步，沒有事件 ---
      this._currentTime = t_end;

      // 更新解向量並保存為歷史（供下一步使用）
      this._previousSolutionVector = this._solutionVector.clone();
      this._solutionVector = tentativeSolution;

      await this._updateDeviceStates(); // 更新智能設備的內部狀態

      // 🔥 關鍵修復：如果我們剛剛命中了一個斷點，必須重啟積分器
      // 因為在斷點處，系統的連續性可能被打破（例如電壓源跳變）
      if (willHitBreakpoint) {
        console.log(`[BREAKPOINT_DEBUG] Hit breakpoint at t=${t_end.toExponential(4)}s, restarting integrator.`);

        // 🎯 在斷點處重新計算 DC 工作點作為新的初始狀態
        // 這確保了解與新的電壓源值一致
        try {
          console.log(`[BREAKPOINT_DEBUG] Recomputing DC operating point at breakpoint...`);
          this.assemble(this._solutionVector, this._currentTime);
          // 使用當前解作為初始猜測，執行幾步 Newton 迭代來改善它
          const J = this.systemMatrix;
          const b = this.getRHS();
          const residual = b.minus(J.multiply(this._solutionVector)) as Vector;
          const residualNorm = residual.norm();
          console.log(`[BREAKPOINT_DEBUG] Initial residual at breakpoint: ${residualNorm.toExponential(3)}`);

          if (residualNorm > 1e-6) {
            // 執行幾步 Newton 來改善解
            const MAX_BP_NEWTON = 5;
            for (let i = 0; i < MAX_BP_NEWTON; i++) {
              try {
                const delta = (J as any).solve(residual);
                this._solutionVector = (this._solutionVector as Vector).plus(delta) as Vector;
                // 強制地節點為 0
                const groundIndex = this.getGroundNodeIndex();
                if (groundIndex !== undefined) {
                  this._solutionVector.set(groundIndex, 0.0);
                }
                this.assemble(this._solutionVector, this._currentTime);
                const newResidual = this.getRHS().minus(this.systemMatrix.multiply(this._solutionVector)) as Vector;
                const newNorm = newResidual.norm();
                console.log(`[BREAKPOINT_DEBUG] After Newton step ${i + 1}: residual = ${newNorm.toExponential(3)}`);
                if (newNorm < 1e-8) break;
              } catch (error) {
                console.log(`[BREAKPOINT_DEBUG] Newton step ${i + 1} failed, continuing with current solution`);
                break;
              }
            }
          }
        } catch (error) {
          console.log(`[BREAKPOINT_DEBUG] DC recomputation failed, using existing solution: ${error}`);
        }

        await this._integrator.restart({
          time: this._currentTime,
          solution: this._solutionVector as Vector,
          // 在斷點處，導數可能不連續，最安全的假設是從零開始
          derivative: Vector.zeros(this._solutionVector.size),
        });
        this._logEvent('INTEGRATOR_RESTART', breakpointSource, `Integrator restarted at breakpoint t=${t_end.toExponential(3)}s.`);

        // 🎯 斷點後使用更大的初始步長，避免過小步長導致的數值剛性
        // 特別是對於進入斜坡區間的情況
        const POST_BREAKPOINT_DT = 1e-9; // 1ns - 比 minTimeStep 大 10 倍
        this._currentTimeStep = POST_BREAKPOINT_DT;
        console.log(`[BREAKPOINT_DEBUG] Set post-breakpoint dt to ${POST_BREAKPOINT_DT.toExponential(2)}s`);
      } else {
        // 正常情況：使用積分器建議的下一步長
        this._currentTimeStep = this._adaptTimeStep(integratorResult.nextDt);
      }

      // 🔥 瞬态 Gmin Stepping：成功一步后递减计数器并衰减 gmin
      if (this._transientGminSteps > 0) {
        this._transientGminSteps--;
        // 指数衰减：每步减半
        this._transientGminCurrent *= 0.5;

        if (this._transientGminSteps === 0) {
          this._logEvent('TRANSIENT_GMIN', undefined, '✅ Transient Gmin Stepping completed, switching to normal gmin=1e-9S');
        }
      }

      this._logEvent('STEP_ACCEPTED', undefined, `Step to ${t_end.toExponential(3)}s. Next dt: ${this._currentTimeStep.toExponential(3)}s.`);
      return true;

    } else {
      // --- ⚠️ 情況 B: 檢測到事件，需要精確處理 ---
      const firstEvent = events[0];
      if (!firstEvent) {
        return true; // 防禦性檢查
      }

      this._logEvent('EVENT_DETECTED', firstEvent.component.name, `Event '${firstEvent.type}' detected in [${t_start.toExponential(3)}, ${t_end.toExponential(3)}]`);
      return await this._handleDetectedEvent(firstEvent, t_start);
    }
  }

  /**
   * 🎯 處理檢測到的事件（封裝事件處理複雜邏輯）
   *
   * 完整流程：
   * a. 使用二分法精確定位事件時間
   * b. 精確積分到事件發生點
   * c. 更新狀態到事件點並保存波形數據
   * d. 調用設備的 handleEvent() 並重啟積分器
   * e. 設置事件後的安全步長
   */
  private async _handleDetectedEvent(event: IEvent, t_start: Time): Promise<boolean> {
    // a. 使用二分法精確定位事件時間
    const eventTime = await this._eventDetector.locateEventTime(
      event,
      (time: Time) => this._integrator.interpolate(time),
      this._nodeMapping
    );
    this._logEvent('EVENT_LOCATED', event.component.name, `Event '${event.type}' located precisely at t=${eventTime.toExponential(3)}s.`);

    // b. 精確積分到事件發生點
    const eventDt = eventTime - t_start;
    if (eventDt < this._config.minTimeStep) {
      // 如果事件就在眼前，直接處理，避免零步長
      this._logEvent('EVENT_IMMEDIATE', event.component.name, `Event is immediate, handling now.`);
      this._currentTime = eventTime;
      this._handleEvent(event); // 處理事件並重啟積分器
      return true;
    }

    const finalResult = await this._integrator.step(this, t_start, eventDt, this._solutionVector);

    if (!finalResult.converged) {
      this._logEvent('INTEGRATOR_FAILURE_TO_EVENT', event.component.name, `Integrator failed to step to event at t=${eventTime.toExponential(3)}s`);
      return false; // 連到事件點都失敗，情況很糟
    }

    // c. 更新狀態到事件點
    this._currentTime = eventTime;
    this._previousSolutionVector = this._solutionVector.clone();
    this._solutionVector = finalResult.solution;
    await this._updateDeviceStates();
    this._saveWaveformPoint(); // 在事件點保存一個數據點

    // d. 處理事件並重啟積分器
    this._handleEvent(event);

    // e. 事件後，強制使用一個非常小的安全步長來開始
    this._currentTimeStep = Math.max(this._config.minTimeStep, this._config.initialTimeStep / 100);
    this._logEvent('POST_EVENT_RESTART', undefined, `Post-event step size set to ${this._currentTimeStep.toExponential(3)}s`);

    return true;
  }

  /**
   * 🔧 處理單個事件（調用設備並重啟積分器）
   *
   * 關鍵職責：
   * 1. 讓設備自己更新內部狀態 (通過 handleEvent())
   * 2. 重啟積分器，因為系統連續性已被打破
   */
  private _handleEvent(event: IEvent): void {
    const device = event.component as ComponentInterface;

    // 1. 讓設備自己更新內部狀態
    if (device && device.handleEvent) {
      const context: AssemblyContext = {
        matrix: this._systemMatrix as SparseMatrix,
        rhs: this._rhsVector as Vector,
        nodeMap: this._nodeMapping,
        currentTime: this._currentTime,
        solutionVector: this._solutionVector as Vector,
        dt: this._currentTimeStep,
        previousSolutionVector: this._previousSolutionVector as Vector,
        getExtraVariableIndex: (componentName: string, variableType: string) =>
          this._extraVariableManager?.getIndex(componentName, variableType as ExtraVariableType)
      };
      device.handleEvent(event, context);
      this._logEvent('DEVICE_HANDLE_EVENT', device.name, `Device handled event '${event.type}'.`);
    }

    // 2. 關鍵！重啟積分器，因為系統的連續性已被打破
    this._integrator.restart({
      time: this._currentTime,
      solution: this._solutionVector as Vector,
      // 事件發生後，我們無法知道導數是什麼，最安全的假設是0
      derivative: Vector.zeros(this._solutionVector.size),
    });

    this._logEvent('INTEGRATOR_RESTART', device.name, `Integrator restarted after event ${event.type}.`);
  }

  /**
   * 🚀 系统矩阵装配 (重构版本)
   *
   * 使用统一的组装接口，消除 stamp() vs load() 的分裂
   * 所有组件都通过 assemble() 方法提供其 MNA 贡献
   *
   * @param time - 装配时的仿真时间 (默认使用当前时间)
   * @param gmin - Gmin Stepping 的电导值
   * @param dt - 时间步长 (默认使用当前时间步长，DC 分析时应传入 0)
   */
  private _assembleSystem(time: number = this._currentTime, gmin: number = 0, dt: number = this._currentTimeStep): void {
    const assemblyStartTime = performance.now();

    // 清空矩阵和向量
    this._systemMatrix.clear();
    this._rhsVector.fill(0);

    // 創建統一的組裝上下文
    const assemblyContext: AssemblyContext = {
      matrix: this._systemMatrix as SparseMatrix,
      rhs: this._rhsVector as Vector,
      nodeMap: this._nodeMapping,
      currentTime: time,
      dt: dt,  // 🎯 使用传入的 dt 参数，DC 分析时为 0
      previousSolutionVector: this._previousSolutionVector as Vector, // 🔧 使用历史解向量
      solutionVector: this._solutionVector as Vector,
      gmin: gmin,
      getExtraVariableIndex: (componentName: string, variableType: string) =>
        this._extraVariableManager?.getIndex(componentName, variableType as ExtraVariableType),

      // 🚀 新增：積分器係數 (從 Generalized-α 傳遞過來)
      // 只有在瞬態分析時這些係數才會被設置
      ...(this._G_coeff !== undefined && { G_coeff: this._G_coeff }),
      ...(this._I_coeff !== undefined && { I_coeff: this._I_coeff }),
      ...(this._R_coeff !== undefined && { R_coeff: this._R_coeff }),
      ...(this._V_coeff !== undefined && { V_coeff: this._V_coeff })
    };

    // ✅ 這就是先進架構的威力：一個簡單、統一的迴圈！
    for (const device of this._devices.values()) {
      try {
        device.assemble(assemblyContext);
      } catch (error) {
        throw new Error(`Assembly failed for component ${device.name}: ${error}`);
      }
    }

    // 🔥🔥 關鍵修復：全局 Gmin Shunting 🔥🔥
    // 只有在 DC 分析且 gmin > 0 時才應用
    // 這確保了即使在拓撲上存在浮動節點，矩陣依然是非奇異的
    if (gmin > 0) {
      for (const [nodeName, nodeIndex] of this._nodeMapping.entries()) {
        // 跳過接地節點 '0'
        if (nodeName !== '0') {
          // 在雅可比矩陣的對角線元素上加上 gmin
          // 這等效於在每個非接地節點和地之間連接一個 1/gmin 的電阻
          this._systemMatrix.add(nodeIndex, nodeIndex, gmin);
        }
      }
    }
    // 🔥🔥 Gmin Shunting 結束 🔥🔥

    // 🧠 **Ground Node Handling**
    // We use the submatrix method in _solveLinearSystem to properly handle the ground node.
    // NO NEED to modify the matrix here - it will be handled correctly during solve.
    //
    // ❌ REMOVED: The old code that cleared ground node row/column was HARMFUL!
    //    It deleted voltage source KVL equations (e.g., J[iv, groundIndex] = -1)
    //    which caused residual = voltage instead of residual = 0
    //
    // ✅ NOW: Let devices assemble normally, then use submatrix method to remove ground node

    this._performanceMetrics.matrixAssemblyTime += performance.now() - assemblyStartTime;
  }

  private async _solveLinearSystem(A: ISparseMatrix, b: IVector): Promise<IVector> {
    const groundNodeIndex = this._nodeMapping.get('0');

    if (groundNodeIndex === undefined) {
      console.warn('⚠️ No ground node ("0") found. Matrix may be singular.');
      // Proceed with the original matrix, but it's likely to fail.
      return (A as SparseMatrix).solve(b);
    }

    // 🔥 CRITICAL FIX: Ensure gmin is applied to all non-ground nodes BEFORE extracting submatrix
    // This prevents matrix singularity for nodes connected only to voltage sources
    const GMIN = 1e-12; // Small conductance to ground for numerical stability
    for (const [nodeName, nodeIndex] of this._nodeMapping.entries()) {
      if (nodeName !== '0' && nodeIndex !== groundNodeIndex) {
        const diagBefore = (A as SparseMatrix).get(nodeIndex, nodeIndex);
        (A as SparseMatrix).set(nodeIndex, nodeIndex, diagBefore + GMIN);
      }
    }

    // 🧠 **The Submatrix Method: The Correct Way to Handle Ground**
    // 1. Extract the submatrix and sub-vector by removing the ground node's row/column.
    const { matrix: subMatrix, mapping: inverseMapping } = A.submatrix([groundNodeIndex], [groundNodeIndex]);

    const subRhs = new Vector(b.size - 1);
    let subIndex = 0;
    for (let i = 0; i < b.size; i++) {
      if (i !== groundNodeIndex) {
        subRhs.set(subIndex++, b.get(i));
      }
    }

    // 🔬 2a. 診斷並修復零對角元素 (Critical Fix for Matrix Singularity)
    const MIN_DIAGONAL = 1e-15; // 最小對角元素閾值
    let zerodiagonalCount = 0;
    for (let i = 0; i < subRhs.size; i++) {
      const diagValue = (subMatrix as SparseMatrix).get(i, i);
      if (Math.abs(diagValue) < MIN_DIAGONAL) {
        console.warn(`⚠️ [Diagonal Fix] Row ${i}: diagonal = ${diagValue.toExponential(2)} → forcing to 1e-12`);
        (subMatrix as SparseMatrix).set(i, i, 1e-12);
        zerodiagonalCount++;
      }
    }
    if (zerodiagonalCount > 0) {
      console.warn(`⚠️ [Diagonal Fix] Fixed ${zerodiagonalCount} near-zero diagonal elements`);
    }

    // 2b. Solve the smaller, non-singular system.
    let subSolution: IVector;
    try {
      subSolution = (subMatrix as SparseMatrix).solve(subRhs);
    } catch (error) {
      // 🔥 FALLBACK: 当 numeric.js 失败时，尝试添加对角占优后重试
      console.warn(`[Submatrix Solver] Primary solver failed, trying diagonal enhancement...`);
      try {
        const enhancedMatrix = subMatrix.clone() as SparseMatrix;
        const diagBoost = 1e-6; // 小的对角增强值
        for (let i = 0; i < subRhs.size; i++) {
          enhancedMatrix.add(i, i, diagBoost);
        }
        subSolution = enhancedMatrix.solve(subRhs);
        console.warn(`[Submatrix Solver] ✅ Diagonal-enhanced solver succeeded!`);
      } catch (fallbackError) {
        console.error(`[Submatrix Solver] ABORT: Both solvers failed. Error: ${error}`);
        // 🔥 FIX: Never return NaN! Throw an exception to trigger time step reduction
        throw new Error(`Linear solver failed: ${error}`);
      }
    }

    // 3. Reconstruct the full solution vector.
    const fullSolution = new Vector(b.size);
    fullSolution.fill(0); // Initialize with zeros, ground node voltage is already 0.

    for (let i = 0; i < subSolution.size; i++) {
      const originalIndex = inverseMapping[i]!
      fullSolution.set(originalIndex, subSolution.get(i));
    }

    return fullSolution;
  }

  /**
   * CHANGED: 状态更新 - 只为智能设备更新状态
   */
  private async _updateDeviceStates(): Promise<void> {
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if (isIntelligentDeviceModel(device)) {
        // 创建新的设备状态 (只对智能设备)
        const newState: DeviceState = {
          deviceId: device.deviceId,
          time: this._currentTime,
          voltage: this._solutionVector as Vector,
          current: new Vector(device.nodes.length), // TODO: 计算实际电流
          operatingMode: 'normal',
          parameters: device.parameters,
          internalStates: {},
          temperature: 300
        };

        device.updateState(newState);
      }
      // 基础组件不需要状态更新，因为它们是无状态的
    }
  }

  // 輔助方法：自適應步長調整
  private _adaptTimeStep(suggestedDt: number): number {
    let newDt = suggestedDt;
    // 可以在此加入更多邏輯，例如基於 Newton 迭代次數的調整
    newDt = Math.max(this._config.minTimeStep, Math.min(newDt, this._config.maxTimeStep));
    return newDt;
  }

  private _saveWaveformPoint(): void {
    // 保存当前时间点的波形数据
    (this._waveformData.timePoints as Time[]).push(this._currentTime);

    // 保存节点电压
    for (let i = 0; i < this._solutionVector.size; i++) {
      if (!this._waveformData.nodeVoltages.has(i)) {
        (this._waveformData.nodeVoltages as Map<number, number[]>).set(i, []);
      }
      (this._waveformData.nodeVoltages.get(i) as number[]).push(this._solutionVector.get(i));
    }

    // 保存设备电流和状态 (简化实现) - 只对智能设备
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if (isIntelligentDeviceModel(device)) {
        const deviceId = device.deviceId;

        if (!this._waveformData.deviceCurrents.has(deviceId)) {
          (this._waveformData.deviceCurrents as Map<string, number[]>).set(deviceId, []);
          (this._waveformData.deviceStates as Map<string, string[]>).set(deviceId, []);
        }

        // TODO: 获取实际设备电流
        (this._waveformData.deviceCurrents.get(deviceId) as number[]).push(0);
        (this._waveformData.deviceStates.get(deviceId) as string[]).push('normal');
      } else {
        // 对基础组件，使用统一的 name 属性
        const deviceId = device.name;

        if (!this._waveformData.deviceCurrents.has(deviceId)) {
          (this._waveformData.deviceCurrents as Map<string, number[]>).set(deviceId, []);
          (this._waveformData.deviceStates as Map<string, string[]>).set(deviceId, []);
        }

        // 🎯 获取实际设备电流
        let current = 0;
        // 对于电感，电流存储在 extraVariable 中
        if (device.type === 'L') {
          const currentIndex = this._extraVariableManager?.getIndex(device.name, ExtraVariableType.INDUCTOR_CURRENT);
          if (currentIndex !== undefined && currentIndex >= 0) {
            current = this._solutionVector.get(currentIndex);
          }
        }
        // 对于电压源，电流也存储在 extraVariable 中
        else if (device.type === 'V') {
          const currentIndex = this._extraVariableManager?.getIndex(device.name, ExtraVariableType.VOLTAGE_SOURCE_CURRENT);
          if (currentIndex !== undefined && currentIndex >= 0) {
            current = this._solutionVector.get(currentIndex);
          }
        }
        // 对于电阻，计算通过的电流 I = (V1 - V2) / R
        else if (device.type === 'R' && 'nodes' in device && 'resistance' in device) {
          const nodes = device.nodes as readonly [string, string];
          const n1 = this._nodeMapping.get(nodes[0]);
          const n2 = this._nodeMapping.get(nodes[1]);
          const v1 = (n1 !== undefined && n1 >= 0) ? this._solutionVector.get(n1) : 0;
          const v2 = (n2 !== undefined && n2 >= 0) ? this._solutionVector.get(n2) : 0;
          const resistance = (device as any).resistance;
          current = (v1 - v2) / resistance;
        }
        // 对于电容，使用伴侣模型计算瞬时电流 I = C * dV/dt
        // 这里简化处理，使用历史电压差除以时间步
        else if (device.type === 'C' && 'nodes' in device) {
          // 电容电流在瞬态中为 I = C * dV/dt
          // 暂时设为 0，需要更复杂的实现
          current = 0;
        }

        (this._waveformData.deviceCurrents.get(deviceId) as number[]).push(current);
        (this._waveformData.deviceStates.get(deviceId) as string[]).push('normal');
      }
    }
  }

  private _generateFinalResult(): SimulationResult {
    const totalTime = performance.now() - this._startTime;
    this._performanceMetrics.totalSimulationTime = totalTime;

    const convergenceRate = 1 - (this._performanceMetrics.failedSteps / Math.max(this._stepCount, 1));

    return {
      success: this._state === SimulationState.COMPLETED || this._currentTime >= this._config.endTime,
      finalTime: this._currentTime,
      totalSteps: this._stepCount,
      convergenceRate,
      averageStepTime: totalTime / Math.max(this._stepCount, 1),
      peakMemoryUsage: this._performanceMetrics.memoryPeakUsage,
      waveformData: this._waveformData,
      performanceMetrics: this._performanceMetrics
    };
  }

  private _initializeWaveformStorage(): void {
    // 预分配波形数据存储
    // 开始瞬态分析 (暂时跳过，集中精力于DC分析)

    // 节点电压存储
    for (let nodeId = 0; nodeId < this._nodeMapping.size; nodeId++) {
      (this._waveformData.nodeVoltages as Map<number, number[]>).set(nodeId, []);
    }

    // 设备电流和状态存储
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      const deviceId = isIntelligentDeviceModel(device) ? device.deviceId : device.name;
      (this._waveformData.deviceCurrents as Map<string, number[]>).set(deviceId, []);
      (this._waveformData.deviceStates as Map<string, string[]>).set(deviceId, []);
    }
  }

  private _logEvent(type: string, deviceId?: string, description: string = ''): void {
    const event: SimulationEvent = {
      time: this._currentTime,
      type,
      deviceId,
      description,
      data: null
    };

    this._events.push(event);

    if (this._config.verboseLogging) {
      console.log(`[${type}] t=${this._currentTime.toExponential(3)} ${deviceId ? `[${deviceId}]` : ''}: ${description}`);
    }
  }

  /**
   * 📊 获取仿真事件日志
   */
  getSimulationEvents(): readonly SimulationEvent[] {
    return this._events;
  }

  /**
   * ♻️ 清理资源 - 对所有组件安全地调用 dispose
   */
  dispose(): void {
    // 对所有组件安全地调用 dispose 方法
    this._devices.forEach(device => {
      // Cast to any to bypass TypeScript's strict check, as dispose is optional.
      if (device && typeof (device as any).dispose === 'function') {
        (device as any).dispose();
      }
    });
    this._devices.clear();
    this._events = [];
    this._state = SimulationState.IDLE;
  }
}
