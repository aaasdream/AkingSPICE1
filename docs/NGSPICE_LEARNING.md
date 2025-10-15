# 從ngspice學習的關鍵收斂技術

## 📚 參考源碼
- `ngspice/src/spicelib/devices/devsup.c` - Voltage limiting函數
- `ngspice/src/spicelib/devices/mos1/mos1load.c` - MOSFET load實現
- `ngspice/src/spicelib/analysis/dctran.c` - 瞬態分析控制

---

## 🎯 核心問題診斷

### 我們的現狀
- ✅ 純R電路工作正常 (test_simple_r.js 成功)
- ❌ MOSFET+RL電路無限循環/不收斂
- ❌ NgMosfet沒有voltage limiting機制

### ngspice的成功秘訣

#### 1. **Voltage Limiting** (最關鍵！)
ngspice在每次Newton iteration中都會限制電壓變化量，防止數值爆炸。

**DEVlimvds** - VDS限制：
```c
if(vold >= 3.5) {
    if(vnew > vold) {
        vnew = MIN(vnew, (3*vold)+2);  // 高電壓時更保守
    }
} else {
    vnew = MIN(vnew, 4);  // 低電壓時限制在4V以下
    vnew = MAX(vnew, -0.5);  // 不允許低於-0.5V
}
```

**DEVfetlim** - VGS限制：
```c
double vtsthi = fabs(2*(vold-vto)) + 2;  // 動態調整限制範圍
double vtstlo = fabs(vold-vto) + 1;
// 根據當前工作區域（截止/導通）選擇不同策略
```

**DEVpnjlim** - PN Junction限制：
```c
if((vnew > vcrit) && (fabs(vnew - vold) > (vt + vt))) {
    if(vold > 0) {
        arg = (vnew - vold) / vt;
        vnew = vold + vt * (2+log(arg-2));  // 對數平滑
    }
}
```

#### 2. **Newton失敗處理**
```c
if(converged != 0) {
    ckt->CKTtime = ckt->CKTtime - ckt->CKTdelta;  // 回退時間
    ckt->CKTdelta = ckt->CKTdelta / 8;  // 步長縮減1/8
    ckt->CKTorder = 1;  // 降階
}
```

#### 3. **LTE檢查寬鬆策略**
```c
if(newdelta > 0.9 * ckt->CKTdelta) {
    // 只要新步長 > 90%當前步長就接受
    // 允許10%的LTE增長
}
```

#### 4. **Bypass機制**
當電壓變化很小時，直接複製上次結果，跳過重複計算：
```c
if((fabs(delvbs) < tol) && (fabs(delvbd) < tol) && 
   (fabs(delvgs) < tol) && (fabs(delvds) < tol)) {
    // bypass - 使用上次的值
    goto bypass;
}
```

---

## 🔧 我們需要實現的改進

### 優先級1: NgMosfet Voltage Limiting ⭐⭐⭐
**位置**: `src/core/ngdevices/ng_mosfet.ts`

在`assemble()`方法中，計算新電壓後立即應用limiting：

```typescript
// 1. 獲取舊電壓
const vgs_old = this.previousVgs;
const vds_old = this.previousVds;
const vbs_old = this.previousVbs;

// 2. 計算新電壓
let vgs_new = vg - vs;
let vds_new = vd - vs;
let vbs_new = vb - vs;

// 3. 應用limiting (參考ngspice)
vgs_new = this.limitFetVoltage(vgs_new, vgs_old, this.params.VTO);
vds_new = this.limitDrainSourceVoltage(vds_new, vds_old);
vbs_new = this.limitJunctionVoltage(vbs_new, vbs_old);

// 4. 使用限制後的電壓進行MOSFET模型計算
```

### 優先級2: 改進步長控制策略 ⭐⭐
**位置**: `src/core/integrator/generalized_alpha.ts`

- ✅ 已實現：Newton失敗時步長/8
- ✅ 已實現：Newton tolerance 1e-7
- ⭕ 待改進：LTE檢查更寬鬆（參考ngspice 90%策略）

### 優先級3: 電感初始條件處理 ⭐
**位置**: `src/components/passive/inductor.ts`

確保第一個時間步時電感電流初始值=0，並且companion model的係數正確。

### 優先級4: Bypass機制 (可選)
實現bypass可以大幅提升速度，但對收斂性影響較小。

---

## 📊 測試計劃

### 階段1: 基礎驗證
1. ✅ test_simple_r.js - 純R電路 (已通過)
2. 🔄 test_simple_rl.js - R+L電路 (創建中)
3. 🔄 test_mosfet_cutoff.js - MOSFET截止態 (已通過)

### 階段2: NgMosfet Limiting實現
1. 在ng_mosfet.ts中加入voltage limiting
2. 重新測試test_mosfet_dc_rl.js
3. 觀察Newton iteration次數變化

### 階段3: PWM應用
1. test_mosfet_pwm_rl.js - PWM開關電路
2. 驗證連續多個週期的穩定性

---

## 🎓 學習總結

### ngspice成功的核心原因
1. **Voltage Limiting是第一道防線** - 防止Newton iteration中電壓跳變過大
2. **激進的步長縮減策略** - 失敗時立即/8，不是/2
3. **寬鬆的LTE容忍度** - 只要不惡化10%以上就接受
4. **簡單有效的bypass** - 避免重複計算

### 我們的收穫
- 確認了基礎架構正確（純R電路工作）
- 定位了問題根源（NgMosfet缺少limiting）
- 學習了工業級SPICE的實戰技巧
- 獲得了清晰的改進路線圖

---

## 📝 後續行動

### 立即實施
1. 在NgMosfet中實現voltage limiting機制
2. 創建測試驗證limiting效果
3. 記錄Newton iteration次數變化

### 中期目標
1. 完整實現ngspice的limiting策略
2. 優化LTE檢查邏輯
3. 實現bypass機制提升速度

### 長期目標
1. 支持更多ngdevice類型（BJT, Diode等）
2. 實現advanced MOSFET models (BSIM3等)
3. 達到與ngspice相當的收斂性能
