# PWM MOSFET 調試總結

## 🐛 已發現並修復的 BUG

### BUG #1: VoltageSource PULSE 參數名不匹配
**位置**: `src/components/sources/voltage_source.ts` 行 123-143

**問題**: 
- 代碼讀取：`delay`, `rise_time`, `fall_time`, `pulse_width`, `period`
- 測試傳入：`td`, `tr`, `tf`, `pw`, `per`
- 結果：所有 PWM 參數都用了默認值

**狀態**: ✅ **已識別**（但測試文件可能還需更新）

---

## ❌ 未解決的核心問題

### 問題：MOSFET PWM 在開關瞬間 Newton 完全卡死

**失敗點**: t=1.002μs → 1.003μs（PWM 第一個上升沿結束時刻）

**症狀**:
```
殘量範數: 1.499900e-2  (15mV - 不大不小)
解範數: 1.200000e+1     (12V)
Newton 更新: 7.466e+1   (很大但不發散)
實際迭代: 200 次        (❌ 完全沒進展！)
```

**快照位置**: 
- `snapshots/failure_simplified_newton_failed_t1_002e-6_2025-10-14T15-06-28_*`

**Jacobian 狀態**:
- ✅ 無 NaN/Inf
- ✅ 無零對角線
- ❌ **但 Newton 方向完全無效**

---

## 📊 測試現狀

### ✅ 通過的測試
1. **單元測試**（9/9）：解析器、MOSFET DC 模型 ✅
2. **整合測試**（4/4）：DC 工作點、MNA 組裝 ✅
3. **簡化測試**：純 DC 12V → RC 濾波器 ✅

### ❌ 失敗的測試
1. PWM RL 電路完整瞬態分析 ❌
2. 不同 PWM 占空比 ❌
3. PWM 波形週期性檢測 ❌

**失敗模式**: 所有 PWM MOSFET 測試都在 **t≈1μs** 失敗（PWM 開關瞬間）

---

## 🔍 可能的根本原因

### 假設 1: MOSFET 模型在開關區的數值問題
- MOSFET 從 OFF → ON 時，跨越 cutoff/linear/saturation 三個區域
- 可能在區域邊界有導數不連續或極端值

### 假設 2: 時間步長問題
- 1ns 時間步對於 MOSFET 開關來說可能太大
- 但時間步控制已經降到最小值 (1ns)

### 假設 3: PWM 電壓源的 breakpoint 未正確處理
- 積分器可能沒在關鍵時刻停止
- 導致跨越了不應跨越的不連續點

### 假設 4: 電感 + MOSFET 的 stiffness
- RL 電路 + 開關 → 極度 stiff
- 簡化的 Backward Euler 可能不夠穩定

---

## 🎯 下一步調試方向

### 優先級 1: 檢查 MOSFET 開關瞬間的實際狀態
- [ ] 讀取失敗快照的 solution 向量
- [ ] 計算 MOSFET 的 Vgs, Vds, Id
- [ ] 確認 MOSFET 處於哪個工作區

### 優先級 2: 檢查 PWM breakpoint 是否生效
- [ ] 確認 `getBreakpoints()` 返回的時間點
- [ ] 確認積分器在 t=1μs 是否停止
- [ ] 檢查 `getRampIntervals()` 是否返回正確的斜坡區間

### 優先級 3: 簡化 MOSFET 電路
- [ ] 用純電阻替換 MOSFET（理想開關）
- [ ] 移除電感，只保留電阻負載
- [ ] 逐步加回複雜元件，找出臨界點

### 優先級 4: 檢查 Jacobian 條件數
- [ ] 運行快照中的 `verify.py`
- [ ] 計算 condition number
- [ ] 檢查是否有極小的特徵值

---

## 📝 相關文件

### 核心代碼
- `src/components/sources/voltage_source.ts` - PWM 電壓源實現
- `src/components/intelligent/intelligent_mosfet.ts` - MOSFET 模型
- `src/core/integrator/generalized_alpha.ts` - 時間積分器（簡化模式）

### 測試文件
- `tests/pyramid/pwm_mosfet_rl.test.ts` - 主要失敗測試
- `tests/simple_buck.test.ts` - 簡化 Buck 測試（部分通過）

### 快照
- `snapshots/failure_simplified_newton_failed_t1_002e-6_2025-10-14T15-06-28_*`
- `snapshots/failure_timestep_minimum_t1_002e-6_2025-10-14T15-06-28_*`

---

## 💡 重要發現

1. **純 DC 電路工作正常** → 說明基礎 Newton solver、MNA 組裝、MOSFET DC 模型都OK
2. **失敗總是在 t≈1μs** → 高度相關於 PWM 開關時刻
3. **Newton 完全卡死而非發散** → Jacobian 方向問題，不是數值穩定性問題
4. **殘量 15mV 不算很大** → 說明解已經很接近真解了，但 Newton 找不到方向

---

**更新時間**: 2025-10-14 15:06
**狀態**: 調查中
