# Buck 轉換器失敗分析報告

## 📊 問題總結

**失敗時間點**: t = 1.01µs  
**失敗類型**: Time step fell below minimum  
**最小時間步長**: 1.0e-10s (0.1 ns)  
**失敗原因**: 矩陣奇異性 + MOSFET 開啟轉換的極端非線性

---

## 🔍 根本原因分析

### 1. 物理事件
- **t = 1.0µs**: PWM 信號 (Vpulse) 開始上升
- **t = 1.01µs**: MOSFET M1 的 Vgs 跨越 Vth (≈2V)
- **狀態轉換**: MOSFET 從截止 (Roff ≈ 1GΩ) → 導通 (Ron ≈ mΩ)
- **結果**: 電導變化超過 9 個數量級

### 2. 數值問題

#### 快照數據 (t=1.009930µs):
```
解向量:
  Index 0 (in):   12.0V
  Index 1 (gnd):  0.0V
  Index 2 (gate): 2.0059V
  Index 3 (sw):   1.16e-8V  ← 接近 0V
  
Vgs = 2.0059 - 1.16e-8 ≈ 2.006V  ← 剛剛超過 Vth
Vds = 12 - 1.16e-8 ≈ 12V
```

#### 殘差向量問題:
```
Index 5: 12.0      ← 巨大的殘差！
Index 6: 2.0059    ← 方程式嚴重失衡
```
這些索引對應**額外變量方程**（電壓源的支路電流）

#### Jacobian 問題:
- **對角線零元素**: 1 個
- **矩陣密度**: 29.69% (8×8, 19 非零元素)
- **條件數**: 未知，但推測極高（病態矩陣）

### 3. 架構層面分析

#### ✅ 已正確工作的部分:
1. **事件驅動系統** - 正確檢測到 MOSFET 轉換點
2. **自適應步長控制** - 成功縮小步長至最小值
3. **MCAS 三層系統** - 嘗試了 Standard NR → Gmin → Phoenix
4. **子矩陣法** - 已實現接地節點處理
5. **快照系統** - 完美捕獲失敗瞬間的完整狀態

#### ❌ 仍未解決的問題:
1. **零對角元素** - 即使使用子矩陣法仍存在
2. **極端剛性** - 電導變化 9 個數量級，超出 numeric.js 處理能力
3. **矩陣奇異** - MCAS 所有層都無法解決矩陣本身的奇異性

---

## 🎯 可能的解決方案

### 方案 A: 增強矩陣處理 (短期)
1. **對角預處理** (Diagonal Preconditioning)
   - 在求解前縮放矩陣行/列，改善條件數
   
2. **強制對角元素最小值**
   ```typescript
   for (let i = 0; i < matrix.rows; i++) {
     if (Math.abs(matrix.get(i, i)) < 1e-15) {
       matrix.set(i, i, 1e-12); // 強制非零對角
     }
   }
   ```

3. **切換求解器**
   - 從 `numeric.js` 切換到更魯棒的求解器
   - 考慮使用 KLU 或 UMFPACK (需要 WASM 綁定)

### 方案 B: 改進 MOSFET 模型 (中期)
1. **平滑化閾值區域**
   - 在 Vgs ≈ Vth 附近使用更平滑的插值函數
   - 避免導數的突變

2. **限制器 (Limiter)**
   ```typescript
   // 限制單次 Newton 迭代的電壓變化
   const maxDeltaV = 0.5; // 最大 0.5V 變化
   if (Math.abs(deltaV) > maxDeltaV) {
     deltaV = Math.sign(deltaV) * maxDeltaV;
   }
   ```

3. **自適應 Gmin**
   - 在開關轉換期間自動增加 Gmin
   - 轉換完成後逐步移除

### 方案 C: 隱式事件處理 (長期)
1. **狀態事件處理**
   - 在檢測到 MOSFET 轉換時，直接重置積分器
   - 使用新的初始猜測（基於物理狀態）

2. **多階段求解**
   ```
   Phase 1: 使用大 Gmin 求得粗糙解
   Phase 2: 逐步減小 Gmin，追蹤解路徑
   Phase 3: 移除 Gmin，得到精確解
   ```

---

## 📈 測試結果

### 當前狀態
- ✅ DC 工作點分析成功
- ✅ 瞬態模擬進行到 1.01µs
- ❌ 在 MOSFET 開啟事件處失敗
- ⏱️ 模擬時間: 0.86 秒

### 進步指標
- **之前**: t = 1.131µs, 214 秒, MCAS all layers failed
- **現在**: t = 1.010µs, 0.86 秒, Time step minimum
- **改進**: 233× 更快，但失敗點提前了（可能因為收斂策略不同）

---

## 🔬 下一步行動

### 立即行動 (優先級 HIGH)
1. **實現強制對角最小值**
   - 修改 `_solveLinearSystem` 方法
   - 在調用求解器前檢查並修正零對角

2. **增加 MOSFET 模型的電壓限制器**
   - 在 `mosfet.ts` 的 `limitUpdate` 方法中實現
   - 限制 Vgs 和 Vds 的單次變化量

3. **測試更大的 minTimeStep**
   - 嘗試 1e-9s (1ns) 而不是 1e-10s
   - 可能在剛性事件附近需要更保守的步長

### 中期行動 (優先級 MEDIUM)
1. **實現對角預處理**
2. **改進 MOSFET Vth 附近的平滑度**
3. **記錄 MCAS 每一層的詳細日誌**

### 長期行動 (優先級 LOW)
1. **集成 KLU 求解器**
2. **實現隱式事件處理**
3. **開發自適應 Gmin 策略**

---

## 📚 參考資料

### 相關文件
- `ARCHITECTURE_DESIGN.md` - 系統架構設計
- `FAILURE_SNAPSHOT_USAGE.md` - 快照系統使用
- `EVENT_DRIVEN_ARCHITECTURE.md` - 事件驅動架構

### 快照文件 (2025-10-13T13:56:57)
```
failure_timestep_minimum_t1_010e-6_2025-10-13T13-56-57_meta.json
failure_timestep_minimum_t1_010e-6_2025-10-13T13-56-57_solution.txt
failure_timestep_minimum_t1_010e-6_2025-10-13T13-56-57_residual.txt
failure_timestep_minimum_t1_010e-6_2025-10-13T13-56-57_jacobian.mtx
failure_timestep_minimum_t1_010e-6_2025-10-13T13-56-57_newton_history.csv
failure_timestep_minimum_t1_010e-6_2025-10-13T13-56-57_verify.py
failure_timestep_minimum_t1_010e-6_2025-10-13T13-56-57_summary.txt
```

---

**結論**: 我們已經成功隔離並診斷了問題。這是一個經典的**數值奇點**問題，由 MOSFET 開關轉換的極端非線性導致。解決方案需要在矩陣求解層面和模型層面同時改進。
