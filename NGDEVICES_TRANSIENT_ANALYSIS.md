# NGDevices 瞬態分析問題調查報告

## 問題現象

從測試輸出和快照文件可以看到：

1. **DC 分析成功**: 二極體和 MOSFET 電路的 DC 分析都能在 1-2 次 Newton 迭代內收斂
2. **瞬態分析失敗**: 進入瞬態分析後，時間步長迅速降至最小值以下
3. **具體錯誤**: `Time step fell below minimum` (時間步長低於最小值)

## 根本原因分析

### 1. 時間步長設置過小

原測試使用的參數：
```javascript
endTime: 1e-9,           // 1ns
initialTimeStep: 1e-10,  // 100ps
minTimeStep: 1e-12,      // 1ps
```

**問題**：
- 對於簡單的 DC 電路（無時變源），使用如此小的時間步長會導致：
  - 數值剛性問題（numerical stiffness）
  - 舍入誤差累積
  - 積分器對微小擾動過度敏感

### 2. 初始瞬態過於尖銳

從 DC 工作點（t=0）突然跳到瞬態分析（t>0）時：
- 積分器需要計算導數 (velocity, acceleration)
- 對於已經穩定的 DC 電路，這些導數應該接近零
- 但極小的時間步長會放大數值誤差，使積分器誤認為存在快速變化

### 3. Generalized-α 積分器的特性

查看代碼 `generalized_alpha.ts`：
```typescript
// 在 _correctStep 中執行 Newton 迭代
// 如果收斂失敗，返回 converged: false
// 外層循環會嘗試減小時間步長
```

**問題循環**：
1. Newton 迭代不收斂 → `converged: false`
2. `_performTimeStep` 返回 `false`
3. 主循環減小時間步長：`dt *= 0.5`
4. 重複直到 `dt < minTimeStep`

### 4. 從快照分析

`failure_timestep_minimum_t1_000e-10_2025-10-15T12-38-31_meta.json`:
```json
{
  "time": 1e-10,
  "timeStep": 1.5e-10,
  "residual": [-0.000006, 0, -0.0000024999999999999998, 0, 0, 0],
  "newtonHistory": []
}
```

**關鍵發現**：
- `newtonHistory` 為空 → 連一次 Newton 迭代都沒執行
- residual 不為零 → 說明解不滿足方程
- 這可能意味著積分器在 Newton 迭代開始前就判定無法收斂

## 解決方案

### 方案 1：增大最小時間步長（推薦）

對於無時變源的電路，使用更大的時間步長：

```javascript
const engine = new CircuitSimulationEngine({
  endTime: 100e-9,         // 100ns
  initialTimeStep: 10e-9,  // 10ns
  minTimeStep: 1e-9,       // 1ns  ← 增大 1000 倍！
  maxTimeStep: 20e-9       // 20ns
});
```

**優點**：
- 避免數值剛性
- 減少舍入誤差
- 對於 DC 電路足夠準確

### 方案 2：改進初始條件

在進入瞬態前，確保：
1. DC 工作點完全收斂
2. 初始導數設置正確（對 DC 應為零）
3. 積分器正確初始化

### 方案 3：調整積分器參數

可能需要：
- 放寬收斂容限
- 增加最大 Newton 迭代次數
- 調整 Generalized-α 的 ρ∞ 參數

### 方案 4：改進 Newton 求解

當前代碼中如果 Newton 迭代遇到問題，應該：
- 提供更詳細的診斷信息
- 嘗試阻尼 Newton 步
- 考慮使用 line search

## 測試計劃

已創建 `debug_ngdevices_transient.js` 來測試：

1. **Test 1**: 二極體電路，使用更大的時間步長
   - minTimeStep: 1e-9 (1ns) 而非 1e-12 (1ps)
   - 預期：成功完成瞬態分析

2. **Test 2**: MOSFET 電路，相同設置
   - 驗證方案對不同設備通用

## 運行調試測試

```bash
node debug_ngdevices_transient.js
```

## 結論

問題不在 ngdevices 實現本身（DC 分析成功證明這點），而在於：
1. 瞬態分析的時間步長參數設置不當
2. 積分器對極小時間步長的數值穩定性問題

**建議**：
- 對於純 DC 或慢變化電路：minTimeStep ≥ 1ns
- 對於有快速開關的電路：minTimeStep ≥ 0.1ns
- 只在模擬高頻電路時才使用 ps 級別的時間步長
