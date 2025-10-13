# 斷點處理修復總結

## 🎯 問題診斷

### 原始問題
Buck 轉換器模擬在 t=1.010µs 失敗，報錯"Time step fell below minimum"。

### 根本原因分析
通過詳細調試發現了**跨越不連續點（Straddling a Discontinuity）**的問題：

1. **斷點被忽略**：當斷點距離 < `minTimeStep` (1e-10s) 時，原代碼會忽略它
2. **試圖跨越不連續點**：積分器試圖在單個時間步內處理 Vpwm 從 0V 到上升過程的劇變
3. **Newton 無法收斂**：系統方程在不連續點處發生劇變，導致收斂失敗

## ✅ 已實施的修復

### 修復 1：添加斷點調試日誌
**文件**: `src/core/simulation/circuit_simulation_engine.ts`

```typescript
// 追踪是哪個設備的斷點
let breakpointSource = 'None';

if (earliestBreakpoint < Infinity) {
  console.log(`[BREAKPOINT_DEBUG] t=${t_start.toExponential(4)}s, dt=${dt.toExponential(4)}s. Found breakpoint from ${breakpointSource} at t=${earliestBreakpoint.toExponential(4)}s.`);
}
```

**結果**: 可以清楚看到斷點檢測是否正常工作

### 修復 2：改善斷點精度容差
**文件**: `src/components/sources/voltage_source.ts`

```typescript
// 添加極小時間容差避免浮點數精度問題
const epsilon = 1e-15;
const effectiveStartTime = startTime + epsilon;

// 使用 effectiveStartTime 避免斷點被意外忽略
if (t_start >= effectiveStartTime && t_start <= endTime) 
  breakpoints.push(t_start);
```

**結果**: 避免了浮點數比較導致的斷點遺漏

### 修復 3：強制處理接近的斷點 🔥 **關鍵修復**
**文件**: `src/core/simulation/circuit_simulation_engine.ts`

```typescript
if (constrainedDt > this._config.minTimeStep * 0.1) {
  // 正常情況：使用約束步長
  dt = constrainedDt;
  willHitBreakpoint = true;
} else if (constrainedDt > 0) {
  // 🔥 特殊情況：即使斷點非常接近，也強制跳到它
  // 不能忽略，因為跨越斷點會導致 Newton 發散！
  dt = constrainedDt;
  willHitBreakpoint = true;
  console.log(`[BREAKPOINT_DEBUG] Forcing tiny step to hit imminent breakpoint.`);
}
```

**之前的行為**: 
```
[BREAKPOINT_DEBUG] Breakpoint is too close (6.49e-11s), ignoring for this step.
```

**修復後的行為**:
```
[BREAKPOINT_DEBUG] Forcing step to hit breakpoint exactly.
t=9.999e-7s [BREAKPOINT_ADJUST] Vpwm: Time step constrained to 6.485e-11s to hit breakpoint at 1.000e-6s.
```

### 修復 4：在斷點處重啟積分器
**文件**: `src/core/simulation/circuit_simulation_engine.ts`

```typescript
// 如果我們剛剛命中了一個斷點，必須重啟積分器
if (willHitBreakpoint) {
  await this._integrator.restart({
    time: this._currentTime,
    solution: this._solutionVector as Vector,
    // 在斷點處，導數可能不連續，最安全的假設是從零開始
    derivative: Vector.zeros(this._solutionVector.size),
  });
  this._logEvent('INTEGRATOR_RESTART', breakpointSource, 
    `Integrator restarted at breakpoint t=${t_end.toExponential(3)}s.`);
}
```

**結果**: 
```
t=1.000e-6s [INTEGRATOR_RESTART] Vpwm: Integrator restarted at breakpoint t=1.000e-6s.
t=1.000e-6s [STEP_ACCEPTED] unknown: Step to 1.000e-6s. Next dt: 1.000e-10s.
```

## 📊 當前狀態

### ✅ 成功項
1. ✅ **成功到達斷點**: 模擬精確停在 t=1.000µs
2. ✅ **斷點檢測機制正常**: `getBreakpoints()` 正確報告斷點
3. ✅ **斷點約束機制正常**: 時間步被正確約束到命中斷點
4. ✅ **積分器重啟機制正常**: 在斷點處自動重啟

### ❌ 仍存在的問題

**斷點後第一步收斂失敗**:
```
t=1.000e-6s [INTEGRATOR_FAILURE] unknown: Integrator failed at t=1.000e-6s with dt=1.000e-10s
```

**失敗統計**:
- 殘量範數: 2.001e-2 (太大！)
- 解範數: 1.200e+1
- 實際迭代: 0 (Newton 未執行就失敗)
- Phoenix 1000 步後仍無法收斂

## 🔍 根本原因分析 (斷點後失敗)

### Vpwm 波形參數
```typescript
v1: 0V,            // 低電平
v2: 10V,           // 高電平
rise_time: 50e-9,  // 上升時間 50ns
delay: 1e-6,       // 在 t=1µs 開始上升
```

### 問題分析
1. **在 t=1µs**：Vpwm 開始從 0V 上升
2. **上升速率**：ΔV/Δt = 10V / 50ns = **200 MV/s** (極快！)
3. **時間步**：dt=1e-10s (0.1ns)，遠小於 rise_time
4. **系統剛性**：快速變化的電壓源使系統變得極度剛性

### 物理意義
- 在 t=1.0000µs：Vpwm ≈ 0.02V (剛開始上升)
- 在 t=1.0001µs：Vpwm ≈ 0.2V
- 在 t=1.001µs：Vpwm ≈ 2V (MOSFET 開始導通)

## 🎯 建議的下一步解決方案

### 方案 1：放寬斷點後的收斂容差 (快速)
在斷點後的幾步內，使用更寬鬆的收斂標準：

```typescript
if (justRestarted && stepsAfterRestart < 5) {
  tolerance *= 10;  // 臨時放寬
}
```

### 方案 2：使用更大的重啟時間步 (推薦)
斷點後不使用 minTimeStep，而是使用更大的初始步長：

```typescript
if (willHitBreakpoint) {
  await this._integrator.restart({...});
  // 設置較大的安全步長
  this._currentTimeStep = Math.min(dt * 10, maxTimeStep);
}
```

### 方案 3：檢查電壓源上升斜率 (長期)
對於陡峭的電壓源變化，添加內部細分：

```typescript
if (dV/dt > threshold) {
  // 在內部自動細分為多個小段
  breakpoints.push(t_rise_end/4, t_rise_end/2, 3*t_rise_end/4);
}
```

### 方案 4：改善 MOSFET 模型 (根本)
當前 MOSFET 可能在 Vgs 接近 Vth 時有數值問題：
- 添加更平滑的 Ids(Vgs) 過渡
- 改善雅可比矩陣的條件數
- 使用更好的 sub-threshold 模型

## 📈 修復進展時間線

| 時間點 | 失敗位置 | 問題 | 修復 |
|--------|----------|------|------|
| 初始 | t=1.010µs | 未知 | - |
| 修復 gmin | t=1.001µs | 矩陣奇異 | gmin=1e-9 |
| 修復地節點 | t=0.9999µs | 地節點不為0 | 強制 V_ground=0 |
| 修復斷點忽略 | **t=1.000µs** | 跨越斷點 | 強制命中斷點 |
| **當前** | t=1.000µs 之後 | 上升過快 | **待修復** |

## 🎓 經驗教訓

1. **永不跨越斷點**：即使距離小於 minTimeStep，也必須精確命中
2. **斷點處必須重啟**：積分器的歷史數據在不連續點處無效
3. **調試日誌關鍵**：`[BREAKPOINT_DEBUG]` 清楚顯示了問題所在
4. **分階段修復**：每次只修復一個問題，逐步推進

## ✨ 成就
- ✅ 成功診斷並修復"跨越不連續點"問題
- ✅ 實現完整的斷點檢測→約束→命中→重啟流程
- ✅ 模擬從 0µs 推進到 1µs（之前只能到 0.999µs）
- ✅ 斷點處理機制現在完全正常工作

**下一個里程碑**: 解決斷點後的剛性問題，使模擬成功越過 t=1µs 並繼續前進！
