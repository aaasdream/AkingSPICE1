# 📊 快照系統實現總結

## ✅ 已完成的修改

### 1. 文件格式改為文本 (txt/csv)

**修改文件**: `src/core/diagnostics/failure_snapshot.ts`

**變更內容**:
- ❌ **之前**: 解向量和殘量向量保存為二進制 `.bin` 文件
- ✅ **現在**: 保存為文本 CSV 格式 `.txt` 文件

**優點**:
```
# 可以直接查看
cat snapshots/failure_*_solution.txt

# 可以用任何文本編輯器打開
notepad snapshots/failure_*_residual.txt

# 可以用 Excel 打開分析
```

**格式範例**:
```csv
Index,Value
0,1.2000001926747734e+1
1,0.0000000000000000e+0
2,1.0000001594188900e+1
3,7.6132374420600870e+0
...
```

### 2. 更新 Python 驗證腳本

**變更**: `_generatePythonScript()` 方法

**之前**:
```python
# 讀取二進制文件
solution = np.frombuffer(f.read(), dtype=np.float64)
```

**現在**:
```python
# 讀取文本 CSV
solution_data = np.loadtxt('*_solution.txt', delimiter=',', skiprows=1)
solution = solution_data[:, 1]  # 第二列是值
```

### 3. 更新 .gitignore

**新增規則**:
```gitignore
# 快照診斷文件（可能很大）
snapshots/
*.mtx
*_solution.txt
*_residual.txt
*_newton_history.csv
```

**原因**: 防止大型診斷文件被提交到 Git

### 4. 創建使用文檔

**新文檔**: `docs/FAILURE_SNAPSHOT_USAGE.md`

包含:
- 📁 文件格式詳解
- 🔧 啟用方法
- 📈 診斷流程
- 🎯 常見問題解決方案
- 📝 文件管理策略

---

## 📂 生成的文件清單

每次失敗生成 **7 個文件**（全部可讀）:

| 文件 | 格式 | 大小 | 可讀性 |
|------|------|------|--------|
| `*_meta.json` | JSON | ~1 KB | ✅ 文本 |
| `*_solution.txt` | CSV | ~1 KB | ✅ 文本 |
| `*_residual.txt` | CSV | ~1 KB | ✅ 文本 |
| `*_jacobian.mtx` | MatrixMarket | ~5 KB | ✅ 文本 |
| `*_newton_history.csv` | CSV | ~5 KB | ✅ 文本 |
| `*_summary.txt` | 純文本 | ~2 KB | ✅ 文本 |
| `*_verify.py` | Python | ~10 KB | ✅ 文本 |

**總計**: ~25 KB / 次失敗

**優點**: 全部是文本格式，您可以：
- 用記事本直接打開
- 用 `cat`/`type` 命令查看
- 用 Excel 打開 CSV 文件
- 用 Git diff 比較不同快照

---

## 🎯 使用範例

### 查看解向量

```bash
# PowerShell
Get-Content snapshots\failure_*_solution.txt

# 或用記事本
notepad snapshots\failure_*_solution.txt
```

**輸出**:
```
Index,Value
0,1.2000001926747734e+1    <- 節點0電壓: 12V
1,0.0000000000000000e+0    <- 地線
2,1.0000001594188900e+1    <- 節點2電壓: 10V
3,7.6132374420600870e+0    <- 節點3電壓: 7.6V
...
```

### 查看殘量

```bash
Get-Content snapshots\failure_*_residual.txt
```

**輸出**:
```
Index,Value
0,2.3921343790311855e-5    <- KCL 誤差: 23.9 μA
1,0.0000000000000000e+0    <- 無誤差（地線）
2,1.9968993135860729e-5    <- KCL 誤差: 20.0 μA
...
```

### 查看 Newton 歷史

```bash
Get-Content snapshots\failure_*_newton_history.csv
```

**輸出**:
```
iteration,residual_norm,solution_norm,delta_norm
0,0.00003232,17.377,0.00003127      <- 初始
1,1.164e-10,17.377,3.963e-13        <- 第1次迭代後
2,1.164e-10,17.377,1.208e-15        <- 收斂（卡住）
```

### 查看摘要報告

```bash
Get-Content snapshots\failure_*_summary.txt
```

**輸出**: （見上面文檔中的範例）

### 用 Excel 分析

1. 打開 Excel
2. **數據** → **從文本/CSV**
3. 選擇 `failure_*_newton_history.csv`
4. 插入圖表 → 折線圖
5. 查看收斂曲線

---

## 🔍 診斷工作流程

### 快速診斷（3分鐘）

```bash
# 1. 查看摘要
cat snapshots/failure_*_summary.txt

# 2. 看 Newton 是否收斂
cat snapshots/failure_*_newton_history.csv | tail -5

# 3. 檢查殘量範數
grep "殘量範數" snapshots/failure_*_summary.txt
```

**判斷**:
- 殘量 < 1e-6 → 可能是容忍度問題
- 殘量 > 1e-3 → 真正的收斂失敗
- Newton 迭代卡住 → Jacobian 病態

### 深度診斷（10分鐘）

```bash
# 1. 運行 Python 驗證
cd snapshots
python failure_*_verify.py
```

**檢查輸出**:
- 條件數 < 1e10: 矩陣健康
- 條件數 > 1e12: 需要預條件子
- Python 能收斂: 您的求解器有 BUG
- Python 也不能: 真正的數值問題

### 外部驗證（20分鐘）

```python
# 2. 用 NumPy 檢查 Jacobian
import numpy as np
from scipy.io import mmread

J = mmread('failure_*_jacobian.mtx').todense()
r = np.loadtxt('failure_*_residual.txt', delimiter=',', skiprows=1)[:, 1]

# 條件數
print(f'Condition: {np.linalg.cond(J):.2e}')

# Rank
print(f'Rank: {np.linalg.matrix_rank(J)}/{J.shape[0]}')

# 最小特徵值
eigvals = np.linalg.eigvals(J)
print(f'Min |λ|: {np.min(np.abs(eigvals)):.2e}')
```

---

## 🎓 學到的教訓

### 用戶的核心理念

> "將所有問題都歸咎於'收斂失敗'是一種思維惰性"

**快照系統的價值**:
1. **證據導向**: 不是猜測，而是檢查
2. **外部驗證**: Python/MATLAB 獨立確認
3. **區分病因**: BUG vs 真正的數值問題

### 實際案例

**Buck 轉換器失敗**:
- ❌ **之前假設**: "這是收斂問題，需要 Matrix Preconditioning"
- ✅ **快照揭示**: 導數計算錯誤（MOSFET/Diode 截止區 BUG）
- 💡 **修復成本**: < 10 行代碼，< 2 小時
- 🎯 **避免浪費**: 2-3 週的 ILU 實現

---

## 📊 當前狀態

### Buck 轉換器（使用快照診斷）

**失敗時刻**: t = 1.131 μs  
**失敗原因**: MCAS 三層全部失敗

**快照分析結果**:
```
系統規模: 8×8
Jacobian 非零: 42 (65.63% 密度)
初始殘量: 3.232e-5
最終殘量: 1.164e-10
迭代次數: 50 (達到上限)

⚠️ Newton 收斂到 1e-10 但被判定失敗
   可能原因: 容忍度設置太嚴格？
```

**下一步行動**:
1. 檢查容忍度設置
2. 運行 Python verify 確認是否真的不收斂
3. 如果 Python 能收斂 → 檢查收斂判斷邏輯

---

## 🛠️ 維護指南

### 如何添加新的診斷項

**位置**: `src/core/diagnostics/failure_snapshot.ts`

**範例**: 添加條件數計算

```typescript
private _writeSummaryReport(...) {
  // ... 現有代碼 ...
  
  // 新增: 條件數估算
  try {
    const condNum = this._estimateConditionNumber(jacobian);
    report += `\n條件數估算: ${condNum.toExponential(2)}`;
    if (condNum > 1e12) {
      report += ` ⚠️ 嚴重病態！\n`;
    }
  } catch (e) {
    report += `\n條件數計算失敗: ${e}\n`;
  }
}

private _estimateConditionNumber(J: ISparseMatrix): number {
  // 使用 power method 或 Lanczos
  // ...
}
```

### 如何自定義快照內容

```typescript
// 在 captureSnapshot 調用時添加自定義字段
snapshotManager.captureSnapshot(
  'custom',
  t, dt,
  solution, residual, jacobian,
  newtonHistory,
  {
    deviceStates: [
      { name: 'M1', mode: 'cutoff', Vgs: 0.5, Vds: 12 },
      { name: 'D1', mode: 'reverse', Vd: -1.0 }
    ],
    customData: {
      temperature: 27,
      gminValue: 1e-6
    }
  }
);
```

---

## 📚 相關文檔

- [`FAILURE_SNAPSHOT_USAGE.md`](FAILURE_SNAPSHOT_USAGE.md): 完整使用手冊
- [`FORENSIC_ANALYSIS_REPORT.md`](../FORENSIC_ANALYSIS_REPORT.md): 法醫分析報告範例
- `src/core/diagnostics/failure_snapshot.ts`: 源代碼

---

**總結**: 快照系統現在完全使用文本格式，您可以直接查看所有診斷文件，無需任何特殊工具。所有輸出都是人類可讀和機器可處理的。

**文檔版本**: 1.0  
**最後更新**: 2025-10-13  
**作者**: AkingSPICE 開發團隊
