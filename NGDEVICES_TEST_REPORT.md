# NGDevices 測試報告與問題診斷

## 測試執行狀態

### 成功的測試 ✅
1. **test_ngdevices_simple.ts** - 基本設備創建和參數驗證
   - 二極體創建成功
   - NMOS 創建成功
   - PMOS 創建成功

2. **test_ngdevices_dc.ts** - DC 分析測試
   - 二極體電路 DC 分析：**收斂成功**
     - V(n1) = 5V (電源)
     - V(n2) = 5V (異常 - 應為 ~4.3V)
     - 二極體壓降 = 0V (異常 - 應為 ~0.7V)
   
   - NMOS 電路 DC 分析：**收斂成功**
     - VGS = 3V
     - VDS = 4.94V
     - VD = 4.94V (合理 - MOSFET 導通)
   
   - PMOS 電路 DC 分析：**收斂成功**
     - VSG = 3V
     - VSD = 3.93V  
     - VS = 3.93V (需要進一步驗證)

3. **test_ngdevices_enhanced.ts** - 多區域測試
   - 所有測試均收斂
   - 部分數值精度問題（二極體顯示 5V 壓降）

### 失敗的測試 ❌

4. **test_ngdevices_transient.ts** - 瞬態分析（原始版本）
   - **狀態：無法完成**
   - **症狀：** 陷入無限 Gmin Stepping 循環
   - **輸出：** 不斷重複 "使用 numeric 矩陣求解器" → "numeric.js 矩陣失敗"

5. **test_ngdevices_validation.ts** - 保守的瞬態測試
   - **測試 1 (RC 充電)：** 陷入 Gmin Stepping 循環
   - **測試 2 (二極體 DC)：** 未執行
   - **測試 3 (NMOS DC)：** 未執行
   - **關鍵發現：** 即使是簡單的 RC 線性電路也無法完成 DC 操作點求解

6. **test_ngdevices_debug.ts** - 調試版本
   - **狀態：** 與 validation 測試相同問題
   - **症狀：** 矩陣求解器失敗後不斷重試

## 根本原因分析

### 問題 1: 矩陣求解器無限重試循環

**位置：** `src/core/simulation/circuit_simulation_engine.ts:1959`

**現象：**
```
🔹 使用 numeric 矩陣求解器 矩陣 3x3 線性系統...
🔥 使用 numeric.js 矩陣線性求解器...
❌ numeric.js 矩陣失敗
```
這個模式不斷重複，沒有退出機制。

**分析：**
1. `_gminSteppingHomotopy()` 方法中，每個 gmin step 調用 `_solveDCNewtonRaphson(currentGmin)`
2. Newton-Raphson 求解器內部調用矩陣求解器
3. 矩陣求解器失敗後觸發 fallback 邏輯（diagonal enhancement）
4. Fallback 邏輯也失敗，但錯誤處理不正確，導致重試
5. 沒有最大重試次數限制，形成無限循環

**證據：**
- 即使是 3x3 的簡單 RC 電路矩陣也無法求解
- 錯誤發生在 DC 操作點初始化階段，不涉及非線性設備

### 問題 2: 二極體數值精度問題

**現象：** 二極體顯示 5V 壓降（與電源電壓相同）

**可能原因：**
1. 二極體電流計算中的指數運算溢出
2. pnjlim 電壓限制邏輯過於保守
3. 初始猜測值不合理（可能直接設為 5V）
4. Gmin 添加的位置或數值不正確

**需要檢查：**
- `ng_diode.ts` 中的 `assemble()` 方法
- `pnjlim()` 電壓限制函數的實現
- 電流計算中的數值穩定性處理

### 問題 3: Gmin Stepping 策略過於激進

**配置：** `circuit_simulation_engine.ts:1182-1186`
```typescript
const gminSteps = 15;
const initialGmin = 1.0;     // 從 1S 開始
const finalGmin = 1e-12;     // 到 1pS
```

**問題：**
- 15 步可能太多
- 1S 的初始 Gmin 太大（相當於每個節點對地短路 1Ω）
- 對簡單線性電路來說完全不需要 Gmin Stepping

## 建議修復方案

### 優先級 1：修復矩陣求解器循環（緊急）

**方案 A：添加最大重試計數**
```typescript
private async _solveDCNewtonRaphson(gmin: number, maxRetries = 3): Promise<boolean> {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      // ... 現有邏輯 ...
      break; // 成功則退出
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        console.error(`矩陣求解器失敗，已重試 ${maxRetries} 次`);
        return false;
      }
    }
  }
}
```

**方案 B：跳過線性電路的 Gmin Stepping**
```typescript
private _hasNonlinearDevices(): boolean {
  for (const device of this._devices.values()) {
    if (device.constructor.name.includes('Diode') || 
        device.constructor.name.includes('MOSFET')) {
      return true;
    }
  }
  return false;
}

private async _solveDCOperatingPoint(): Promise<boolean> {
  if (!this._hasNonlinearDevices()) {
    // 線性電路：直接求解，不需要 Gmin Stepping
    return await this._solveDCNewtonRaphson(0);
  }
  // 非線性電路：使用完整 Gmin Stepping
  return await this._gminSteppingHomotopy();
}
```

### 優先級 2：調整 Gmin Stepping 參數

```typescript
const gminSteps = 5;          // 減少步數
const initialGmin = 1e-3;     // 更合理的起始值 (1mS)
const finalGmin = 1e-12;
```

### 優先級 3：修復二極體數值問題

**檢查 `ng_diode.ts` 中的電流計算：**
```typescript
private computeCurrent(vd: number): number {
  const { IS, N, RS } = this.params;
  const Vt = 0.02585; // 300K
  
  // 防止指數溢出
  const maxExp = 700;
  let vd_rs = vd;
  
  if (Math.abs(vd / (N * Vt)) > maxExp) {
    // 使用線性近似
    const sign = vd > 0 ? 1 : -1;
    return sign * IS * Math.exp(maxExp) / (1 + RS * /* gd calculation */);
  }
  
  // 正常指數計算
  const id = IS * (Math.exp(vd / (N * Vt)) - 1);
  return vd_rs / (1 + RS * /* ... */);
}
```

### 優先級 4：改進電壓初始猜測

在 DC 操作點求解前，為非線性元件設置合理的初始電壓：
- 二極體：anode = 電源電壓，cathode = 電源電壓 - 0.7V
- NMOS：drain = 中間值 (VDD/2)，gate = 根據 VGS 設置
- PMOS：source = VDD，drain = VDD/2

## 下一步行動計劃

1. **立即修復矩陣求解器循環**
   - 實施方案 A 或方案 B
   - 執行 test_ngdevices_debug.ts 驗證

2. **優化 Gmin Stepping**
   - 調整參數（減少步數和初始值）
   - 添加線性電路檢測

3. **修復二極體精度問題**
   - 檢查 ng_diode.ts 的 assemble() 方法
   - 添加數值溢出保護
   - 改進初始猜測

4. **執行瞬態分析測試**
   - 修復完成後重新執行 test_ngdevices_validation.ts
   - 比較 AkingSPICE 與 NGSpice 的結果

5. **創建 NGSpice 對比測試**
   - 執行 tests/ngspice_comparison/test_circuits.sp
   - 記錄差異並調整參數

## 當前實現概況

### 已實現功能 ✅
- NgDiode 類 (ng_diode.ts, 275 lines)
  - pnjlim 電壓限制
  - limitUpdate() 方法
  - 指數二極體模型 (Shockley equation)

- NgMosfet 類 (ng_mosfet.ts, 343+ lines)
  - Level 1 模型 (Shichman-Hodges)
  - 三個工作區域 (cutoff/linear/saturation)
  - Body effect (體效應)
  - Channel-length modulation (溝道長度調變)
  - limitUpdate() 方法

- NgDeviceFactory (ng_device_factory.ts)
  - createDiode()
  - createNMOS()
  - createPMOS()

### 測試覆蓋率
- ✅ 基本功能測試（設備創建）
- ✅ DC 分析測試（收斂但精度有問題）
- ✅ 多區域測試
- ❌ 瞬態分析測試（矩陣求解器循環）
- ⏳ NGSpice 對比測試（待執行）

## 結論

**核心問題：** 矩陣求解器的錯誤處理邏輯有缺陷，導致無限重試循環。這阻止了所有瞬態分析測試的執行。

**次要問題：** 二極體數值計算精度問題，需要改進指數運算的數值穩定性和初始猜測。

**優先級：** 必須先修復矩陣求解器循環，否則無法進行任何瞬態分析測試和進一步的模型校準工作。

**時間估計：**
- 修復矩陣求解器循環：30 分鐘
- 優化 Gmin Stepping：15 分鐘
- 修復二極體精度：1 小時
- NGSpice 對比測試：30 分鐘
- **總計：~2.5 小時**

---

**生成時間：** 2025-01-15  
**測試環境：** Windows, PowerShell, Node.js + ts-node  
**框架版本：** AkingSPICE 2.1
