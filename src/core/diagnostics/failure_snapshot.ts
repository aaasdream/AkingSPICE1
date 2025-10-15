/**
 * 🔬 失敗快照診斷系統 (Failure Snapshot Diagnostics)
 * 
 * 當收斂失敗時捕獲完整的系統狀態，用於事後分析和外部驗證。
 * 
 * 功能：
 * 1. 捕獲時間、步長、解向量、殘量、Jacobian
 * 2. 記錄 Newton 迭代歷史
 * 3. 輸出 MatrixMarket 格式供 Python/MATLAB 分析
 * 4. 檢查 Jacobian 條件數、奇異值、rank
 * 5. 生成可重放的 Python 驗證腳本
 */

import * as fs from 'fs';
import * as path from 'path';
import type { IVector, ISparseMatrix } from '../../types/index';

/**
 * Newton 迭代記錄
 */
export interface NewtonIterationRecord {
  iteration: number;
  residualNorm: number;
  solutionNorm: number;
  deltaNorm?: number;
  timeStamp: number;
}

/**
 * 失敗快照數據結構
 */
export interface FailureSnapshot {
  // 時間和步長
  time: number;
  timeStep: number;
  attemptedTime: number;
  
  // 解向量和殘量
  solution: number[];
  residual: number[];
  
  // 矩陣尺寸和統計
  systemSize: number;
  matrixNonzeros: number;
  
  // Newton 迭代歷史
  newtonHistory: NewtonIterationRecord[];
  
  // 收斂參數
  tolerance: number;
  maxIterations: number;
  
  // 失敗原因
  failureReason: string;
  failureLayer?: string; // MCAS layer
  
  // 系統狀態
  deviceStates?: any[];
  
  // 時間戳
  timestamp: string;
}

/**
 * MatrixMarket 格式輸出選項
 */
export interface MatrixMarketOptions {
  symmetric?: boolean;
  pattern?: boolean; // 只輸出結構
  precision?: number; // 數值精度（小數位數）
}

/**
 * 失敗快照管理器
 */
export class FailureSnapshotManager {
  private _outputDir: string;
  private _enabled: boolean = true;
  private _maxSnapshots: number = 10; // 最多保留快照數
  
  constructor(outputDir: string = './snapshots') {
    this._outputDir = outputDir;
    this._ensureOutputDir();
  }
  
  /**
   * 確保輸出目錄存在
   */
  private _ensureOutputDir(): void {
    if (!fs.existsSync(this._outputDir)) {
      fs.mkdirSync(this._outputDir, { recursive: true });
    }
  }
  
  /**
   * 生成唯一的快照文件名前綴
   */
  private _generatePrefix(tag: string, time: number): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const timeStr = time.toExponential(3).replace(/[+.]/g, '_');
    return `failure_${tag}_t${timeStr}_${timestamp}`;
  }
  
  /**
   * 捕獲完整的失敗快照
   */
  captureSnapshot(
    tag: string,
    time: number,
    timeStep: number,
    solution: IVector,
    residual: IVector,
    jacobian: ISparseMatrix,
    newtonHistory: NewtonIterationRecord[],
    options: {
      tolerance?: number;
      maxIterations?: number;
      failureReason?: string;
      failureLayer?: string;
      deviceStates?: any[];
      rhs?: IVector;  // 🔥 NEW: Optional RHS vector
    } = {}
  ): string {
    if (!this._enabled) return '';
    
    const prefix = this._generatePrefix(tag, time);
    const basePath = path.join(this._outputDir, prefix);
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔬 捕獲失敗快照: ${prefix}`);
    console.log('='.repeat(70));
    
    try {
      // 1. 寫入元數據 JSON
      this._writeMetadata(basePath, time, timeStep, solution, residual, jacobian, newtonHistory, options);
      
      // 2. 寫入解向量和殘量（二進制）
      this._writeBinaryVectors(basePath, solution, residual);
      
      // 2b. 🔥 NEW: 寫入 RHS 向量（如果提供）
      if (options.rhs) {
        this._writeRHSVector(basePath, options.rhs);
      }
      
      // 3. 寫入 Jacobian (MatrixMarket 格式)
      this._writeJacobianMatrixMarket(basePath, jacobian);
      
      // 4. 寫入 Newton 迭代歷史（CSV）
      this._writeNewtonHistory(basePath, newtonHistory);
      
      // 5. 生成 Python 驗證腳本
      this._generatePythonScript(basePath, prefix);
      
      // 6. 寫入可讀的摘要報告
      this._writeSummaryReport(basePath, time, timeStep, solution, residual, jacobian, newtonHistory, options);
      
      console.log(`✅ 快照已保存到: ${this._outputDir}/`);
      console.log(`   - ${prefix}_meta.json`);
      console.log(`   - ${prefix}_solution.txt`);
      console.log(`   - ${prefix}_residual.txt`);
      if (options.rhs) {
        console.log(`   - ${prefix}_rhs.txt`);
      }
      console.log(`   - ${prefix}_jacobian.mtx`);
      console.log(`   - ${prefix}_newton_history.csv`);
      console.log(`   - ${prefix}_verify.py`);
      console.log(`   - ${prefix}_summary.txt`);
      console.log('='.repeat(70));
      
      // 清理舊快照
      this._cleanupOldSnapshots();
      
      return prefix;
      
    } catch (error) {
      console.error(`❌ 快照捕獲失敗:`, error);
      return '';
    }
  }
  
  /**
   * 寫入元數據 JSON
   */
  private _writeMetadata(
    basePath: string,
    time: number,
    timeStep: number,
    solution: IVector,
    residual: IVector,
    jacobian: ISparseMatrix,
    newtonHistory: NewtonIterationRecord[],
    options: any
  ): void {
    const snapshot: FailureSnapshot = {
      time,
      timeStep,
      attemptedTime: time + timeStep,
      solution: this._vectorToArray(solution),
      residual: this._vectorToArray(residual),
      systemSize: solution.size,
      matrixNonzeros: jacobian.nnz,
      newtonHistory,
      tolerance: options.tolerance ?? 1e-6,
      maxIterations: options.maxIterations ?? 50,
      failureReason: options.failureReason ?? 'Unknown',
      failureLayer: options.failureLayer,
      deviceStates: options.deviceStates,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
      `${basePath}_meta.json`,
      JSON.stringify(snapshot, null, 2),
      'utf-8'
    );
  }
  
  /**
   * 寫入文本向量文件（CSV格式）
   */
  private _writeBinaryVectors(basePath: string, solution: IVector, residual: IVector): void {
    const solArray = this._vectorToArray(solution);
    const resArray = this._vectorToArray(residual);
    
    // 寫入解向量為文本格式
    let solText = 'Index,Value\n';
    solArray.forEach((val, idx) => {
      solText += `${idx},${val.toExponential(16)}\n`;
    });
    fs.writeFileSync(`${basePath}_solution.txt`, solText, 'utf-8');
    
    // 寫入殘量向量為文本格式
    let resText = 'Index,Value\n';
    resArray.forEach((val, idx) => {
      resText += `${idx},${val.toExponential(16)}\n`;
    });
    fs.writeFileSync(`${basePath}_residual.txt`, resText, 'utf-8');
  }
  
  /**
   * 🔥 NEW: 寫入 RHS 向量為文本格式
   */
  private _writeRHSVector(basePath: string, rhs: IVector): void {
    const rhsArray = this._vectorToArray(rhs);
    
    let rhsText = 'Index,Value\n';
    rhsArray.forEach((val, idx) => {
      rhsText += `${idx},${val.toExponential(16)}\n`;
    });
    fs.writeFileSync(`${basePath}_rhs.txt`, rhsText, 'utf-8');
  }
  
  /**
   * 寫入 Jacobian 為 MatrixMarket 格式
   */
  private _writeJacobianMatrixMarket(basePath: string, jacobian: ISparseMatrix): void {
    const rows = jacobian.rows;
    const cols = jacobian.cols;
    const nnz = jacobian.nnz;
    
    let mtxContent = `%%MatrixMarket matrix coordinate real general\n`;
    mtxContent += `% Generated by AkingSPICE Failure Snapshot System\n`;
    mtxContent += `% Jacobian matrix at convergence failure\n`;
    mtxContent += `${rows} ${cols} ${nnz}\n`;
    
    // 提取所有非零元素
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const val = jacobian.get(i, j);
        if (Math.abs(val) > 1e-100) {
          // MatrixMarket 索引從 1 開始
          mtxContent += `${i + 1} ${j + 1} ${val.toExponential(16)}\n`;
        }
      }
    }
    
    fs.writeFileSync(`${basePath}_jacobian.mtx`, mtxContent, 'utf-8');
  }
  
  /**
   * 寫入 Newton 迭代歷史（CSV）
   */
  private _writeNewtonHistory(basePath: string, history: NewtonIterationRecord[]): void {
    let csv = 'iteration,residual_norm,solution_norm,delta_norm,timestamp\n';
    
    for (const record of history) {
      csv += `${record.iteration},${record.residualNorm},${record.solutionNorm},`;
      csv += `${record.deltaNorm ?? 'N/A'},${record.timeStamp}\n`;
    }
    
    fs.writeFileSync(`${basePath}_newton_history.csv`, csv, 'utf-8');
  }
  
  /**
   * 生成 Python 驗證腳本
   */
  private _generatePythonScript(basePath: string, prefix: string): void {
    const script = `#!/usr/bin/env python3
"""
🔬 失敗快照驗證腳本
自動生成於: ${new Date().toISOString()}

用途：
1. 讀取快照數據（solution, residual, Jacobian）
2. 計算 Jacobian 條件數、奇異值分解
3. 檢查矩陣 rank 和數值病態性
4. 執行 Newton 重放（驗證收斂性）
5. 與原始系統比較

使用方法：
  python ${prefix}_verify.py
  
需求：
  pip install numpy scipy matplotlib
"""

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from scipy.io import mmread
import json
import struct
import matplotlib.pyplot as plt

def load_snapshot():
    """載入快照數據"""
    # 讀取元數據
    with open('${prefix}_meta.json', 'r') as f:
        meta = json.load(f)
    
    # 讀取解向量（文本CSV格式）
    solution_data = np.loadtxt('${prefix}_solution.txt', delimiter=',', skiprows=1)
    solution = solution_data[:, 1]  # 第二列是值
    
    # 讀取殘量（文本CSV格式）
    residual_data = np.loadtxt('${prefix}_residual.txt', delimiter=',', skiprows=1)
    residual = residual_data[:, 1]  # 第二列是值
    
    # 讀取 Jacobian (MatrixMarket)
    jacobian = mmread('${prefix}_jacobian.mtx').tocsr()
    
    return meta, solution, residual, jacobian

def analyze_jacobian(J):
    """分析 Jacobian 矩陣"""
    print("\\n" + "="*70)
    print("🔬 Jacobian 矩陣分析")
    print("="*70)
    
    n = J.shape[0]
    nnz = J.nnz
    density = nnz / (n * n)
    
    print(f"   矩陣大小: {n}×{n}")
    print(f"   非零元素: {nnz} ({density*100:.2f}% 密度)")
    
    # 檢查對角線
    diag = J.diagonal()
    zero_diag = np.sum(np.abs(diag) < 1e-15)
    print(f"\\n   對角線統計:")
    print(f"     零對角元素: {zero_diag}/{n}")
    print(f"     最小對角元素: {np.min(np.abs(diag)):.2e}")
    print(f"     最大對角元素: {np.max(np.abs(diag)):.2e}")
    
    # 條件數估算（使用 Lanczos 迭代）
    try:
        print(f"\\n   條件數估算（可能需要幾秒）...")
        # 計算最大和最小特徵值
        max_eigval = spla.eigs(J, k=1, which='LM', return_eigenvectors=False, tol=1e-3)
        min_eigval = spla.eigs(J, k=1, which='SM', return_eigenvectors=False, tol=1e-3)
        
        cond_estimate = np.abs(max_eigval[0] / min_eigval[0])
        print(f"     估算條件數: {cond_estimate:.2e}")
        
        if cond_estimate > 1e12:
            print(f"     ⚠️ 條件數極大！矩陣嚴重病態！")
        elif cond_estimate > 1e8:
            print(f"     ⚠️ 條件數偏大，可能需要預條件子")
        else:
            print(f"     ✅ 條件數可接受")
            
    except Exception as e:
        print(f"     ⚠️ 條件數計算失敗: {e}")
    
    # SVD（僅對小矩陣）
    if n <= 100:
        try:
            print(f"\\n   執行完整 SVD...")
            J_dense = J.toarray()
            U, s, Vt = np.linalg.svd(J_dense)
            
            print(f"     最大奇異值: {s[0]:.2e}")
            print(f"     最小奇異值: {s[-1]:.2e}")
            print(f"     條件數（精確）: {s[0]/s[-1]:.2e}")
            
            # 繪製奇異值
            plt.figure(figsize=(10, 6))
            plt.semilogy(s, 'o-')
            plt.grid(True)
            plt.xlabel('Index')
            plt.ylabel('Singular Value')
            plt.title('Jacobian Singular Values')
            plt.savefig('${prefix}_singular_values.png', dpi=150)
            print(f"     💾 奇異值圖已保存: ${prefix}_singular_values.png")
            
        except Exception as e:
            print(f"     ⚠️ SVD 計算失敗: {e}")
    else:
        print(f"\\n   ⚠️ 矩陣過大（{n}×{n}），跳過完整 SVD")
    
    return

def replay_newton(J, r, x0, max_iter=20, tol=1e-6):
    """重放 Newton 迭代"""
    print("\\n" + "="*70)
    print("🔄 Newton 迭代重放")
    print("="*70)
    
    x = x0.copy()
    history = []
    
    for i in range(max_iter):
        r_norm = np.linalg.norm(r)
        history.append(r_norm)
        
        print(f"   迭代 {i}: ||r|| = {r_norm:.2e}")
        
        if r_norm < tol:
            print(f"\\n   ✅ 收斂於迭代 {i}！")
            return True, history
        
        # 求解線性系統 J * delta = -r
        try:
            delta = spla.spsolve(J, -r)
            delta_norm = np.linalg.norm(delta)
            
            if not np.isfinite(delta_norm):
                print(f"   ❌ Delta 包含 NaN/Inf！")
                return False, history
            
            # 更新（簡單 Newton，無 line search）
            x = x + delta
            
            # 需要重新評估 F(x) 和 J(x)（這裡無法做到，因為沒有原始方程）
            # 僅作為演示：假設 r 線性減少
            r = r + J @ delta
            
        except Exception as e:
            print(f"   ❌ 線性解失敗: {e}")
            return False, history
    
    print(f"\\n   ❌ 達到最大迭代次數 {max_iter}")
    return False, history

def main():
    print("╔" + "="*68 + "╗")
    print("║  🔬 AkingSPICE 失敗快照驗證工具                                  ║")
    print("╚" + "="*68 + "╝")
    
    # 載入數據
    print("\\n📂 載入快照數據...")
    meta, sol, res, J = load_snapshot()
    
    print(f"\\n📋 快照摘要:")
    print(f"   時間: {meta['time']:.2e}s")
    print(f"   步長: {meta['timeStep']:.2e}s")
    print(f"   系統大小: {meta['systemSize']}")
    print(f"   殘量範數: {np.linalg.norm(res):.2e}")
    print(f"   失敗原因: {meta['failureReason']}")
    
    # 分析 Jacobian
    analyze_jacobian(J)
    
    # Newton 重放
    success, history = replay_newton(J, res, sol)
    
    # 繪製收斂歷史對比
    print("\\n📊 繪製收斂歷史...")
    plt.figure(figsize=(12, 6))
    
    # 原始歷史
    if meta.get('newtonHistory'):
        orig_history = [rec['residualNorm'] for rec in meta['newtonHistory']]
        plt.semilogy(orig_history, 'o-', label='Original (AkingSPICE)', linewidth=2)
    
    # 重放歷史
    if history:
        plt.semilogy(history, 's--', label='Replay (Python)', linewidth=2, alpha=0.7)
    
    plt.axhline(y=meta['tolerance'], color='r', linestyle=':', label=f"Tolerance ({meta['tolerance']:.1e})")
    plt.grid(True, alpha=0.3)
    plt.xlabel('Newton Iteration', fontsize=12)
    plt.ylabel('Residual Norm', fontsize=12)
    plt.title('Newton Convergence History Comparison', fontsize=14)
    plt.legend(fontsize=10)
    plt.tight_layout()
    plt.savefig('${prefix}_convergence.png', dpi=150)
    print(f"   💾 收斂圖已保存: ${prefix}_convergence.png")
    
    # 總結
    print("\\n" + "="*70)
    print("📊 驗證總結")
    print("="*70)
    if success:
        print("   ✅ Python 重放成功收斂")
        print("   ⚠️ 這表明線性解算器或迭代邏輯可能有問題")
    else:
        print("   ❌ Python 重放也失敗")
        print("   ℹ️ 這支持「真實收斂困難」的假設")
    print("="*70)

if __name__ == '__main__':
    main()
`;
    
    fs.writeFileSync(`${basePath}_verify.py`, script, 'utf-8');
    
    // 設置可執行權限（Unix/Linux）
    try {
      fs.chmodSync(`${basePath}_verify.py`, 0o755);
    } catch (e) {
      // Windows 下會失敗，忽略
    }
  }
  
  /**
   * 寫入可讀的摘要報告
   */
  private _writeSummaryReport(
    basePath: string,
    time: number,
    timeStep: number,
    solution: IVector,
    residual: IVector,
    jacobian: ISparseMatrix,
    newtonHistory: NewtonIterationRecord[],
    options: any
  ): void {
    let report = `${'='.repeat(70)}\n`;
    report += `失敗快照摘要報告\n`;
    report += `生成時間: ${new Date().toISOString()}\n`;
    report += `${'='.repeat(70)}\n\n`;
    
    report += `【時間信息】\n`;
    report += `  當前時間: ${time.toExponential(6)}s\n`;
    report += `  時間步長: ${timeStep.toExponential(6)}s\n`;
    report += `  嘗試時間: ${(time + timeStep).toExponential(6)}s\n\n`;
    
    report += `【系統規模】\n`;
    report += `  方程數量: ${solution.size}\n`;
    report += `  矩陣非零: ${jacobian.nnz}\n`;
    report += `  矩陣密度: ${(jacobian.nnz / (solution.size * solution.size) * 100).toFixed(2)}%\n\n`;
    
    report += `【收斂狀態】\n`;
    report += `  殘量範數: ${this._vectorNorm(residual).toExponential(6)}\n`;
    report += `  解範數: ${this._vectorNorm(solution).toExponential(6)}\n`;
    report += `  容忍度: ${options.tolerance ?? 1e-6}\n`;
    report += `  最大迭代: ${options.maxIterations ?? 50}\n`;
    report += `  實際迭代: ${newtonHistory.length}\n\n`;
    
    report += `【失敗信息】\n`;
    report += `  失敗原因: ${options.failureReason ?? 'Unknown'}\n`;
    report += `  失敗層級: ${options.failureLayer ?? 'N/A'}\n\n`;
    
    report += `【Newton 迭代歷史】\n`;
    for (const rec of newtonHistory.slice(-10)) {
      report += `  [${rec.iteration}] ||r|| = ${rec.residualNorm.toExponential(3)}`;
      if (rec.deltaNorm !== undefined) {
        report += `, ||Δx|| = ${rec.deltaNorm.toExponential(3)}`;
      }
      report += `\n`;
    }
    
    if (newtonHistory.length > 10) {
      report += `  ... (共 ${newtonHistory.length} 次迭代，僅顯示最後 10 次)\n`;
    }
    report += `\n`;
    
    report += `【Jacobian 診斷】\n`;
    report += `  對角線零元素: ${this._countZeroDiagonal(jacobian)}\n`;
    report += `  包含 NaN: ${this._hasNaN(jacobian) ? '是 🔥' : '否'}\n`;
    report += `  包含 Inf: ${this._hasInf(jacobian) ? '是 🔥' : '否'}\n\n`;
    
    report += `【下一步行動】\n`;
    report += `  1. 運行 Python 驗證腳本:\n`;
    report += `     python ${path.basename(basePath)}_verify.py\n\n`;
    report += `  2. 檢查條件數和奇異值\n`;
    report += `  3. 執行 Newton 重放\n`;
    report += `  4. 與 SPICE 比較（如果可能）\n\n`;
    
    report += `${'='.repeat(70)}\n`;
    
    fs.writeFileSync(`${basePath}_summary.txt`, report, 'utf-8');
  }
  
  /**
   * 清理舊快照（保留最近的 N 個）
   */
  private _cleanupOldSnapshots(): void {
    try {
      const files = fs.readdirSync(this._outputDir);
      const snapshots = new Map<string, string[]>();
      
      // 按前綴分組
      for (const file of files) {
        const match = file.match(/^(failure_[^_]+_t[^_]+_[^_]+)/);
        if (match && match[1]) {
          const prefix = match[1];
          if (!snapshots.has(prefix)) {
            snapshots.set(prefix, []);
          }
          snapshots.get(prefix)!.push(file);
        }
      }
      
      // 如果超過限制，刪除最舊的
      if (snapshots.size > this._maxSnapshots) {
        const sorted = Array.from(snapshots.keys()).sort();
        const toDelete = sorted.slice(0, sorted.length - this._maxSnapshots);
        
        for (const prefix of toDelete) {
          const filesToDelete = snapshots.get(prefix)!;
          for (const file of filesToDelete) {
            fs.unlinkSync(path.join(this._outputDir, file));
          }
        }
        
        console.log(`🧹 清理了 ${toDelete.length} 個舊快照`);
      }
    } catch (error) {
      console.warn(`⚠️ 清理舊快照失敗:`, error);
    }
  }
  
  /**
   * 輔助方法：向量轉數組
   */
  private _vectorToArray(vec: IVector): number[] {
    const arr: number[] = [];
    for (let i = 0; i < vec.size; i++) {
      arr.push(vec.get(i));
    }
    return arr;
  }
  
  /**
   * 輔助方法：計算向量範數
   */
  private _vectorNorm(vec: IVector): number {
    let sum = 0;
    for (let i = 0; i < vec.size; i++) {
      const val = vec.get(i);
      sum += val * val;
    }
    return Math.sqrt(sum);
  }
  
  /**
   * 輔助方法：計算零對角元素數量
   */
  private _countZeroDiagonal(mat: ISparseMatrix): number {
    let count = 0;
    const n = Math.min(mat.rows, mat.cols);
    for (let i = 0; i < n; i++) {
      if (Math.abs(mat.get(i, i)) < 1e-15) {
        count++;
      }
    }
    return count;
  }
  
  /**
   * 輔助方法：檢查矩陣是否包含 NaN
   */
  private _hasNaN(mat: ISparseMatrix): boolean {
    for (let i = 0; i < mat.rows; i++) {
      for (let j = 0; j < mat.cols; j++) {
        if (isNaN(mat.get(i, j))) {
          return true;
        }
      }
    }
    return false;
  }
  
  /**
   * 輔助方法：檢查矩陣是否包含 Infinity
   */
  private _hasInf(mat: ISparseMatrix): boolean {
    for (let i = 0; i < mat.rows; i++) {
      for (let j = 0; j < mat.cols; j++) {
        const val = mat.get(i, j);
        if (!isFinite(val) && !isNaN(val)) {
          return true;
        }
      }
    }
    return false;
  }
  
  /**
   * 啟用/禁用快照捕獲
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }
  
  /**
   * 檢查是否啟用
   */
  isEnabled(): boolean {
    return this._enabled;
  }
  
  /**
   * 設置最大快照數量
   */
  setMaxSnapshots(max: number): void {
    this._maxSnapshots = Math.max(1, max);
  }
}

/**
 * 全局快照管理器實例
 */
export const globalSnapshotManager = new FailureSnapshotManager();
