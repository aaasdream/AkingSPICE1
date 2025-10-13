好的，這是一份根據您提供的最新程式碼庫完全更新的 AkingSPICE 2.1 專案架構與開發者指南。舊文件中的內容已被新架構的設計和實現細節所取代，並加入了針對新開發者的上手指南。

---

## AkingSPICE 2.1 增強版架構設計與開發者指南

### 1.0 專案概述

#### 1.1 專案定位
AkingSPICE 2.1 是一個專為現代電力電子應用設計的高性能、通用電路仿真引擎。它旨在解決高頻開關電路中常見的數值剛性 (Stiffness) 和收斂性挑戰，提供一個兼具工業級魯棒性與學術級靈活性的仿真平台。

#### 1.2 核心技術支柱
*   **擴展修正節點分析 (Extended MNA)**: 作為核心數學框架，通過引入額外電流變數，原生支持電感、電壓源、變壓器等元件。`ExtraVariableIndexManager` 模塊專職管理此過程。
*   **統一組件接口 (`ComponentInterface`)**: 革命性的統一接口，消除了基礎元件與智能設備之間的架構鴻溝。所有電路元素，無論簡單或複雜，都通過統一的 `assemble(context)` 方法與仿真引擎交互。
*   **Generalized-α 積分器**: 採用 L-穩定、二階精度且具有可控數值阻尼的時間積分器，專為處理電力電子中的剛性微分代數方程組 (DAE) 而設計。
*   **事件驅動的瞬態分析**: 採用現代的 `EventDetector`，基於零交叉檢測和二分法精確定位開關事件，確保在不連續點的仿真精度和穩定性。
*   **魯棒的非線性求解器**: `CircuitSimulationEngine` 實現了先進的 Newton-Raphson 循環，並結合了多種全局收斂策略：
    *   **DC 分析**: 採用 **Source Stepping** 和 **Gmin Stepping** 等 Homotopy 方法確保收斂。
    *   **瞬態分析**: 應用 **步長阻尼 (Damped Steps)** 和 **線搜索 (Line Search)** 策略來處理強非線性問題。

### 2.0 系統架構

#### 2.1 架構流程圖
**SPICE 網表解析器** → **仿真引擎 (`CircuitSimulationEngine`)** → **MNA 系統構建 (含 `ExtraVariableManager`)** → **DC 分析求解器 (含 Homotopy)** → **瞬態分析求解器 (GeneralizedAlphaIntegrator + Newton-Raphson 循環)** → **稀疏矩陣求解器** → **波形數據存儲**。

#### 2.2 目錄結構與模塊職責

```
AkingSPICE/
└── src/
    ├── components/              # 🧩 通用基礎元件庫 (無狀態、可重用)
    │   ├── coupling/            # 耦合元件 (e.g., IdealTransformer)
    │   ├── passive/             # 無源元件 (Resistor, Inductor, Capacitor)
    │   └── sources/             # 獨立源 (VoltageSource)
    │
    ├── core/                    # 🔥 仿真引擎核心 (通用算法與框架)
    │   ├── devices/             # 🧠 智能非線性設備 (MOSFET, Diode) - 具備複雜狀態和收斂邏輯
    │   ├── events/              # 🔄 事件檢測系統 (EventDetector)
    │   ├── integrator/          # 📈 時間積分器 (Generalized-α)
    │   ├── interfaces/          # 📋 核心接口定義 (ComponentInterface, AssemblyContext)
    │   ├── mna/                 # ⚙️ MNA 系統構建與額外變量管理
    │   ├── parser/              # 📝 SPICE 網表解析器
    │   └── simulation/          # 🚀 仿真主引擎 (CircuitSimulationEngine)
    │
    ├── math/                    # 🧮 數學庫
    │   ├── numerical/           # 數值穩定性與安全工具
    │   └── sparse/              # 稀疏矩陣與向量實現
    │
    ├── types/                   # 🏷️ 全局類型定義 (IVector, ISparseMatrix, Time, etc.)
    │
    └── applications/            # 🎯 具體應用 (架構預留) - 使用核心引擎和元件庫構建特定電路
```

### 3.0 核心抽象與設計

#### 3.1 革命性的統一組件接口 (Unified Component Interface)

舊架構中 `stamp()` 和 `load()` 的分裂已被徹底解決。所有電路元素現在都遵循一個統一、清晰的契約。

*   **`AssemblyContext` (`/src/core/interfaces/component.ts`)**: 一個傳遞給所有組件的上下文對象，包含了 MNA 裝配所需的一切信息。
    ```typescript
    export interface AssemblyContext {
      readonly matrix: SparseMatrix;
      readonly rhs: Vector;
      readonly nodeMap: Map<string, number>;
      readonly currentTime: number;
      readonly dt: number;
      readonly solutionVector?: Vector;
      readonly previousSolutionVector?: Vector;
      readonly getExtraVariableIndex?: (name: string, type: string) => number | undefined;
    }
    ```

*   **`ComponentInterface` (`/src/core/interfaces/component.ts`)**: 所有元件的基石。
    ```typescript
    export interface ComponentInterface {
      readonly name: string;
      readonly type: string;
      readonly nodes: readonly (string | number)[];

      // 統一的組裝方法
      assemble(context: AssemblyContext): void;

      // 事件檢測相關 (可選)
      hasEvents?(): boolean;
      getEventFunctions?(): { type: string, condition: (v: IVector) => number }[];
      handleEvent?(event: IEvent, context: AssemblyContext): void;
      
      validate(): ValidationResult;
      getInfo(): ComponentInfo;
    }
    ```

#### 3.2 智能設備模型 (`IIntelligentDeviceModel`)

對於 MOSFET、Diode 等複雜非線性元件，它們不僅僅是被動地貢獻 MNA 矩陣，而是主動參與到仿真收斂的過程中。

*   **繼承與擴展**: `IIntelligentDeviceModel` 繼承自 `ComponentInterface`，並增加了控制非線性迭代的關鍵方法。
*   **核心職責**:
    *   `assemble()`: 實現統一的組裝接口，內部通常調用一個私有的 `load()` 方法來計算當前工作點的線性和非線性貢獻。
    *   `checkConvergence()`: 允許設備根據其物理特性（如工作區是否穩定）來判斷收斂性。
    *   `limitUpdate()`: 在 Newton 迭代發散時，對電壓更新步長 `deltaV` 進行限制，防止出現非物理的解。
    *   `getEventFunctions()`: 向事件檢測器提供條件函數，用於精確定位狀態轉換（如 Vgs 穿過 Vth）。

#### 3.3 擴展 MNA 與 `ExtraVariableIndexManager`

*   **為何需要擴展?**: 標準 MNA 只能求解節點電壓。對於電壓源、電感等元件，它們的支路電流也是未知的。擴展 MNA 將這些電流作為新的未知數加入到求解向量 `x` 中。
*   **管理器職責 (`/src/core/mna/extra_variable_manager.ts`)**:
    1.  在仿真初始化時，遍歷所有元件。
    2.  調用元件的 `getExtraVariableCount()` 方法（如果存在）來確定需要多少個額外變量。
    3.  為每個請求分配一個唯一的索引，該索引大於所有節點電壓的索引。
    4.  將分配的索引通過 `setCurrentIndex()` 或 `setCurrentIndices()` 等方法回傳給元件。
*   **元件實現**: 需要額外變量的元件（如 `Inductor`, `VoltageSource`, `IdealTransformer`）在其 `assemble` 方法中使用這些預先分配好的索引來填充擴展 MNA 矩陣的 `B`, `C`, `D` 部分。

### 4.0 開發者指南

#### 4.1 如何接手開發與貢獻

1.  **理解架構分層**:
    *   **添加新基礎元件** (例如：憶阻器): 在 `src/components/` 下創建新模塊，實現 `ComponentInterface`。
    *   **添加新智能半導體** (例如：IGBT): 在 `src/core/devices/` 下創建新模塊，繼承 `IntelligentDeviceModelBase`。
    *   **實現新電路應用** (例如：三相逆變器): 在預留的 `src/applications/` 目錄下創建，並使用元件工廠 (`TransformerFactory`, `CapacitorFactory`) 和智能設備工廠 (`SmartDeviceFactory`) 來程序化構建電路。
    *   **改進數值算法**: 修改 `src/core/integrator/` (積分器) 或 `src/core/simulation/` (非線性求解策略) 中的對應模塊。

2.  **開發新元件的標準流程**:

    **案例 1: 簡單無源元件 (例如：一個非線性電阻)**
    1.  **文件創建**: 在 `src/components/passive/` 下創建 `nonlinear_resistor.ts`。
    2.  **接口實現**: 實現 `ComponentInterface`。
    3.  **核心實現 `assemble()`**:
        ```typescript
        assemble(context: AssemblyContext): void {
          // 從 context.solutionVector 獲取當前節點電壓
          const v1 = context.solutionVector.get(nodeIndex1);
          const v2 = context.solutionVector.get(nodeIndex2);
          const v = v1 - v2;

          // 根據非線性關係 I = f(V) 計算電流和動態電導 g = dI/dV
          const current = f(v);
          const conductance = df_dv(v);

          // 裝配 Jacobian (電導矩陣)
          context.matrix.add(nodeIndex1, nodeIndex1, conductance);
          // ...

          // 裝配 RHS (殘差向量)
          // I_eq = I_nonlinear - G_linear * V
          const equivalentCurrent = current - conductance * v;
          context.rhs.add(nodeIndex1, -equivalentCurrent);
          context.rhs.add(nodeIndex2, equivalentCurrent);
        }
        ```
    4.  **解析器集成**: 更新 `SpiceNetlistParser` 以識別和創建此元件。
    5.  **單元測試**: 編寫測試驗證 `assemble` 方法的正確性。

    **案例 2: 需要額外變量的元件 (例如：電流控制電壓源 CCVS)**
    1.  **文件創建**: `src/components/controlled_sources/ccvs.ts`。
    2.  **接口實現**: 實現 `ComponentInterface`。
    3.  **聲明變量需求**:
        ```typescript
        getExtraVariableCount(): number {
          return 1; // 需要一個額外變量來表示輸出電壓源的電流
        }
        setCurrentIndex(index: number): void {
          this._outputCurrentIndex = index;
        }
        ```
    4.  **核心實現 `assemble()`**:
        *   使用 `_outputCurrentIndex` 來填充擴展 MNA 矩陣的 `B` 和 `C` 部分，類似 `VoltageSource`。
        *   實現控制關係 `V_out = r * I_control` 作為一個新的支路方程，填充到擴展矩陣的 `D` 部分。
    5.  **測試**: 編寫測試驗證控制關係和 MNA 矩陣裝配的正確性。

#### 4.2 項目規範
*   **目標導向**: 所有開發決策應以達成**通用電力電子模擬器**為目標，避免為特定應用範例進行硬編碼。
*   **代碼規範**: 項目內只存放 `.ts` 原始碼。所有 `.js` 文件均為編譯產物，不應提交到 `src` 或其任何子目錄中。

### 5.0 成功標準
AkingSPICE 2.1 的成功由以下幾點衡量：
*   ✅ **可擴展性**: 新開發者可以輕鬆地添加從簡單線性元件到複雜智能設備的各類模型。
*   ✅ **通用性**: 能夠準確仿真任意拓撲的 SPICE 電路，而不局限於特定類型。
*   ✅ **解耦性**: 核心仿真算法（積分、求解）與具體的元件物理模型完全分離。
*   ✅ **魯棒性**: 對於電力電子中常見的剛性、強非線性問題具有工業級的收斂性和數值穩定性。
*   ✅ **高性能**: 能夠利用稀疏數據結構和高效求解器處理大規模電路（千節點級別）。