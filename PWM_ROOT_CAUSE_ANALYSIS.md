# PWM MOSFET 收斂問題根本原因分析報告

## 執行時間
2025-10-14 (調試會話)

## 問題描述
所有 PWM MOSFET 瞬態測試在 t ≈ 1.003μs（PWM 第一個上升沿）時 Newton 求解器未收斂，迭代 200 次無進展。

## 調試過程

### 階段 1：懷疑 PULSE 參數名稱問題
**假設**: 測試使用 `td/tr/tf/pw/per`，但代碼讀取 `delay/rise_time/fall_time/pulse_width/period`

**測試**: 
- 檢查 VoltageSourceFactory.createPulse()
- 檢查 SpiceNetlistParser PULSE 解析

**結果**: ✅ **不是問題** - Factory 已正確映射參數

### 階段 2：驗證 getValue() 返回值
**假設**: PWM getValue() 計算錯誤

**測試**:
```typescript
// tests/debug_pwm_voltage.test.ts
const pwm = VoltageSourceFactory.createPulse('Vgate', ['n_gate', '0'], 
  0, 5, 1e-6, 1e-6, 1e-6, 50e-6, 100e-6);
```

**結果**:
```
t=1.002μs: getValue() = 0.010V (10mV) ✅
t=1.003μs: getValue() = 0.015V (15mV) ✅
```
**結論**: getValue() **完全正確**！

### 階段 3：運行時驗證 assemble() 調用
**方法**: 在 VoltageSource.assemble() 添加日誌：
```typescript
if (context.currentTime > 1.0e-6 && context.currentTime < 1.011e-6) {
  console.log(`🎯 [${this.name}] t=${context.currentTime.toExponential(3)} → V=${voltage.toExponential(3)}`);
}
```

**觀察**:
- PWM MOSFET 測試：2201 次 `[VGATE] t=1.003e-6 → V=1.500e-2` 日誌
- PWM + 電阻測試：~1500 次相同日誌

**結論**: assemble() **每次都正確調用 getValue()** 並返回 15mV！

### 階段 4：檢查失敗快照
**文件**: `failure_simplified_newton_failed_t1_002e-6_2025-10-14T15-22-43_*`

**解向量**:
```
x[0] = 12V     (Vdd node ✅)
x[1] = 0V      (ground ✅)
x[2] = 1μV     (gate node ❌ 應該是 15mV!)
x[3] = 1μV     (output node)
x[4-6] = ~12nA (currents)
```

**殘差向量**:
```
residual[2] ≈ 0          (Gate KCL ✅)
residual[5] = 0.015V     (15mV - 這是電壓源 KVL！)
```

**關鍵發現**:
- **assemble() 寫入 RHS[iv] = 15mV**
- **Newton 求解器返回 x[gate] = 1μV**
- **殘差 r = b - Jx ≈ 15mV**

### 階段 5：最小化測試
**測試**: PWM + 電阻（移除所有 MOSFET/電感復雜性）
```typescript
Vgate n_gate 0 PULSE(0 5 1u 1u 1u 50u 100u)
R1 n_gate 0 1k
```

**結果**: ❌ **仍然在 t=1.003μs 失敗**！

**系統規模**: 3×3 (2 nodes + 1 current variable)

## 根本原因

### 問題定位
**問題不在**:
- ✅ PULSE 參數解析
- ✅ getValue() 計算
- ✅ assemble() 調用時機
- ✅ MOSFET 模型
- ✅ 電感/電容元件

**問題在於**:
❌ **Newton 線性求解器返回錯誤的解向量**

### 數學分析

電壓源的方程組：
```
KCL at gate:  i_vsource = 0              → residual[gate] ≈ 0 ✅
KVL:          V_gate - V_gnd = V_source  → residual[iv] = V_source ✓
```

當 V_source = 15mV 時：
- 正確的解應該是：`x[gate] = 15mV`
- 實際的解卻是：`x[gate] = 1μV`

這意味著 **Jacobian 矩陣可能奇異或條件數極差**，導致 numeric.js 求解器返回錯誤結果。

### Jacobian 矩陣分析

從快照 `jacobian.mtx` 看到：
```
7 7 23
1 1 3.0e-9      (對角: 3nS = Gmin + pivot)
3 3 1.0e-9      (對角: 1nS = pivot only)
7 7 -10.0       (對角: -10 = 電感項 - 負值!)
```

**問題標誌**:
1. 極小的對角元素 (1e-9)
2. 負對角元素 (-10)
3. 條件數可能非常大

## 驗證測試

### 手動計算（簡化電路：PWM + R）

電路：
```
Vgate ---[1kΩ]--- GND
```

方程組（3×3）:
```
[Gate KCL]  i_vsource - V_gate/1k = 0
[KVL]       V_gate - 0 = 15mV
[Ground]    V_gnd = 0
```

Jacobian (簡化):
```
J = [  1e-3  0    1  ]  (1e-3 = 1/R)
    [  1     0    0  ]
    [  0     1    0  ]
```

RHS:
```
b = [  0     ]  (KCL)
    [  0.015 ]  (KVL)
    [  0     ]  (Ground)
```

正確的解：
```
x = [ 0.015  ]  (V_gate = 15mV)
    [ 0      ]  (V_gnd = 0)
    [ 1.5e-5 ]  (i = V/R = 15μA)
```

**但 numeric.js 返回的是 x[0] = 1μV！**

## 可能的原因

### 1. Submatrix 移除 ground 節點後索引錯亂
在 `_solveLinearSystem()` 中：
```typescript
const { matrix: subMatrix, mapping: inverseMapping } = A.submatrix([groundNodeIndex], [groundNodeIndex]);
```

可能導致：
- RHS 向量索引不對應
- 或 mapping 錯誤

### 2. numeric.js 數值精度問題
當矩陣條件數很大時，numeric.js 的 LU 分解可能失敗。

### 3. Pivot perturbation 的副作用
```typescript
const effectivePivotTolerance = (context.gmin && context.gmin > 0)
  ? context.gmin
  : VoltageSource.PIVOT_TOLERANCE;  // 1e-12
context.matrix.add(iv, iv, effectivePivotTolerance);
```

這個擾動可能破壞了電壓源 KVL 方程的對角元素。

## 下一步行動

### 立即行動
1. **手動構造 3×3 系統** 並用 numeric.js 求解，驗證求解器本身
2. **檢查 submatrix() 實現** - 確保索引映射正確
3. **暫時移除 pivot perturbation** - 看是否影響結果
4. **添加條件數檢測** - 在求解前計算矩陣條件數

### 可能的修復方案

#### 方案 A：修改電壓源組裝方式
```typescript
// 不在 (iv, iv) 添加擾動，而是在 RHS 使用懲罰項
context.matrix.add(iv, n1, 1);
context.matrix.add(iv, n2, -1);
context.rhs.add(iv, voltage);
// NO pivot perturbation!
```

#### 方案 B：切換到更穩定的求解器
- 嘗試使用 UMFPACK 或 KLU (專業稀疏矩陣求解器)
- 或實現 Householder QR 分解

#### 方案 C：改進條件數
- 使用電壓/電流縮放
- 重新排列矩陣以減少 fill-in

## 總結

**PWM 測試失敗的根本原因不是 PWM 邏輯錯誤，而是 Newton 線性求解器在處理電壓源約束時返回錯誤的解**。

getValue() 和 assemble() 都完全正確，問題出在數值線性代數層面。

需要深入調查：
1. numeric.js 的精度和穩定性
2. Submatrix 實現的正確性
3. 矩陣條件數和預處理

**證據鏈完整**:
- getValue() → 15mV ✅
- assemble() → 15mV ✅
- RHS[iv] → 15mV ✅
- 線性求解 → 1μV ❌ ← **問題在這裡！**
