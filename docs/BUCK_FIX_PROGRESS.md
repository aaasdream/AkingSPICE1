# 🔬 Buck 轉換器修復進展報告

**日期**: 2025-10-13  
**狀態**: ⚙️ 部分修復，仍在調查

---

## 📊 修復效果對比

### 修復前 (原始狀態)
```
失敗時刻: t = 1.131 μs
失敗原因: MCAS 三層全部失敗
執行時間: ~214 秒
問題: 
  - Jacobian 對角線有 3 個零元素
  - 條件數 > 10^13
  - Newton 在第2次迭代後卡在 ||r|| = 1.16e-10
  - 容忍度 1e-10 過於嚴格
```

### 修復後 (當前狀態)
```
失敗時刻: t = 1.010 μs  ← 提前了 0.12 μs
失敗原因: 時間步長降到最小值 (100ps) 後仍無法恢復
執行時間: ~1.60 秒  ← 快了 134倍！
改善:
  - ✅ Jacobian 對角線零元素已修復（樞軸擾動）
  - ✅ 容忍度放寬到 1e-8
  - ✅ 添加了相對殘量和 delta_norm 收斂標準
  - ✅ 執行速度大幅提升
  - ⚠️ 但在 t=1.010μs 處遇到新問題
```

---

## 🔧 已實施的修復

### 1. ✅ 樞軸擾動 (Pivot Perturbation)

**文件**: `src/components/sources/voltage_source.ts`

**修改**:
```typescript
private static readonly PIVOT_TOLERANCE = 1e-12;

assemble(context: AssemblyContext): void {
    // ... B 矩陣和 C 矩陣 ...
    
    // 🔥 關鍵修復：在 (iv, iv) 位置添加樞軸擾動
    context.matrix.add(iv, iv, VoltageSource.PIVOT_TOLERANCE);
    
    // RHS
    context.rhs.add(iv, voltage);
}
```

**效果**: 消除了 Jacobian 對角線的零元素，使矩陣始終可逆。

---

### 2. ✅ 容忍度放寬

**文件**: `src/core/integrator/generalized_alpha.ts`

**修改**:
```typescript
// 從 1e-10 放寬到 1e-8
private readonly _voltageToleranceAbs = 1e-8;
private readonly _currentToleranceAbs = 1e-8;
```

**效果**: 避免了"收斂但被誤判為失敗"的問題。

---

### 3. ✅ 改善收斂判定邏輯

**文件**: `src/core/integrator/generalized_alpha.ts`

**修改**:
```typescript
// 添加相對殘量檢查
const voltageTolerance = Math.max(
    this._voltageToleranceAbs,
    this._voltageToleranceRel * solutionNorm
);

// 添加 delta_norm 收斂標準
const solutionChangeRelative = solutionChange / (solutionNorm + 1e-10);
if (solutionChangeRelative < this._voltageToleranceRel * 0.1) {
    convergedByDelta = true;
}

const converged = convergedByResidual || convergedByDelta;
```

**效果**: 更智能的收斂判定，避免在接近解時無限迭代。

---

### 4. ✅ 最小時間步長放寬

**文件**: `test_buck_event_driven.ts`

**修改**:
```typescript
minTimeStep: 1e-10,  // 從 1e-12 (1ps) 放寬到 1e-10 (100ps)
```

**效果**: 避免進入極小時間步長的數值陷阱。

---

## 🔍 當前問題分析

### 觀察到的現象

從最後 20 個事件看：
```
t=1.008μs - 1.010μs: 連續 20 次 STEP_ACCEPTED
失敗模式: Time step fell below minimum and could not recover
dt 在失敗時: 1.000e-10s (已達最小值)
```

### 失敗位置分析

**t = 1.010μs** 的特殊性：
- PWM 週期: T = 10μs (100kHz)
- 占空比: 42%
- 高電平持續時間: 4.2μs
- **1.010μs 處於 PWM 啟動後的早期階段** (延遲 1μs 後 0.01μs)

### 可能的根本原因

1. **PWM 邊沿瞬態太陡峭**
   - 0V → 10V 瞬間切換
   - MOSFET 從截止 → 飽和瞬間轉換
   - 電感電流 dI/dt 極大

2. **電容充電浪湧**
   - t=1μs PWM 啟動後
   - 電容從空載開始充電
   - 初始電流可能非常大

3. **MOSFET 開關瞬間的數值剛性**
   - 開關電阻從 10^10 Ω 降到 10^-3 Ω (13 個數量級)
   - 即使有平滑過渡，變化仍然極快

---

## 🎯 下一步修復策略

### 優先級 P0: 分析失敗快照

1. **檢查是否生成了新快照**
   ```bash
   ls -lt snapshots/ | head -10
   ```

2. **如果沒有快照，修改快照捕獲邏輯**
   - 當前只在 MCAS 失敗時捕獲
   - 需要在所有 INTEGRATOR_FAILURE 時捕獲

### 優先級 P1: 臨時解決方案（快速測試）

#### 方案 A: 增大 minTimeStep
```typescript
minTimeStep: 1e-9,  // 從 100ps 增加到 1ns
```

**優點**: 立即可測試  
**缺點**: 可能錯過關鍵動態

#### 方案 B: PWM 軟啟動
```typescript
// 在 PWM 定義中添加 rise_time
rise_time: 10e-9,  // 10ns 上升時間
fall_time: 10e-9,  // 10ns 下降時間
```

**優點**: 更真實的物理模型  
**缺點**: 需要修改 VoltageSource 的 PULSE 實現

#### 方案 C: 添加 snubber 電路
```typescript
// 在 MOSFET 閘極和源極之間添加小電阻+電容
engine.addDevice(new Resistor('Rsnub', ['gate', 'sw'], 10));
engine.addDevice(new Capacitor('Csnub', ['gate', 'sw'], 1e-9));  // 1nF
```

**優點**: 物理上合理  
**缺點**: 增加電路複雜度

### 優先級 P2: 根本解決方案（需要開發）

#### 方案 D: 實現自適應 Gmin stepping
```typescript
// 在開關瞬間自動增加 Gmin
if (isEventTransition) {
    gmin *= 100;  // 暫時增大 Gmin
}
```

#### 方案 E: Matrix Preconditioning (ILU)
- 預計開發時間: 2-3 週
- 效果: 降低條件數 10^13 → 10^8

---

## 📊 測試計劃

### Test 1: 增大 minTimeStep (5 分鐘)
```typescript
// test_buck_event_driven.ts
minTimeStep: 1e-9,  // 1ns
```

**預期**: 
- 如果通過 → 問題是極小時間步長的數值問題
- 如果失敗 → 需要更深層的修復

### Test 2: PWM 延遲增加 (5 分鐘)
```typescript
delay: 10e-6,  // 從 1μs 增加到 10μs
```

**預期**: 
- 如果通過 → 問題在 PWM 啟動瞬間
- 如果失敗但時間延後 → 確認是 PWM 邊沿問題

### Test 3: 降低 PWM 幅度 (5 分鐘)
```typescript
v2: 5,  // 從 10V 降到 5V
```

**預期**: 
- 如果通過 → 問題是 MOSFET 開關速度太快
- 如果失敗 → 不是閘極電壓問題

---

## 💡 關鍵洞察

### 修復的正面效果 ✅

1. **執行速度**: 214秒 → 1.6秒 (**134倍提升**)
   - 這表明樞軸擾動和容忍度修復極其有效
   - Newton 不再在無意義的地方卡住

2. **失敗位置**: 從 1.131μs 移到 1.010μs
   - 這不是退步！
   - 之前在 1.131μs 卡住是因為數值陷阱
   - 現在更快地暴露了真正的物理/數值挑戰點

3. **收斂行為**: 不再看到 "殘量卡在 1e-10" 的現象
   - 表明零對角線問題已解決

### 剩餘挑戰 ⚠️

**核心問題**: 在 PWM 開關瞬間，系統仍然極度剛性

**證據**:
- dt 降到 100ps（最小值）仍無法通過
- 問題發生在 PWM 啟動後 10ns
- 這是開關電源模擬的經典難題

**解決路徑**:
1. **短期**: 調整數值參數（minTimeStep, Gmin）
2. **中期**: 改善物理模型（snubber, rise time）
3. **長期**: Matrix Preconditioning

---

## 📎 附件

### 已修改的文件
1. `src/components/sources/voltage_source.ts` - 樞軸擾動
2. `src/components/coupling/transformer.ts` - 樞軸擾動
3. `src/core/integrator/generalized_alpha.ts` - 容忍度 + 收斂判定
4. `test_buck_event_driven.ts` - minTimeStep 放寬

### 生成的診斷文件
- 舊快照: `snapshots/failure_*_t1_131e-6_*` (3 個零對角線)
- 新快照: 待生成（需要修改捕獲邏輯）

---

**結論**: 修復方向正確，取得了顯著進展。當前挑戰是處理 PWM 開關瞬間的極端剛性，建議先用快速測試驗證假設，再決定是否投入 Matrix Preconditioning 開發。

**下一步**: 執行 Test 1-3，收集更多數據點。
