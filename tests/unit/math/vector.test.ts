/**
 * 🧪 Vector 單元測試
 * 
 * 測試向量基本操作的正確性
 */

import { describe, test, expect } from 'vitest';
import { Vector } from '../../../src/math/sparse/vector';

describe('Vector - 基本操作', () => {
  test('創建向量 - 正常情況', () => {
    const v = new Vector(5, 0);
    expect(v.size).toBe(5);
  });
  
  test('創建向量 - 非法大小應拋出異常', () => {
    expect(() => new Vector(0)).toThrow();
    expect(() => new Vector(-1)).toThrow();
  });
  
  test('get/set 操作', () => {
    const v = new Vector(3);
    v.set(0, 1.5);
    v.set(1, 2.5);
    v.set(2, 3.5);
    
    expect(v.get(0)).toBe(1.5);
    expect(v.get(1)).toBe(2.5);
    expect(v.get(2)).toBe(3.5);
  });
  
  test('索引越界應拋出異常', () => {
    const v = new Vector(3);
    
    expect(() => v.get(-1)).toThrow();
    expect(() => v.get(3)).toThrow();
    expect(() => v.set(-1, 0)).toThrow();
    expect(() => v.set(3, 0)).toThrow();
  });
  
  test('add 操作 - 累加元素', () => {
    const v = new Vector(3, 1.0);
    
    v.add(0, 2.0);
    v.add(0, 3.0);
    v.add(1, 1.5);
    
    expect(v.get(0)).toBeCloseTo(6.0, 10);
    expect(v.get(1)).toBeCloseTo(2.5, 10);
    expect(v.get(2)).toBeCloseTo(1.0, 10);
  });
});

describe('Vector - 向量運算', () => {
  test('scale - 標量乘法', () => {
    const v = new Vector(3);
    v.set(0, 1.0);
    v.set(1, 2.0);
    v.set(2, 3.0);
    
    const v2 = v.scale(2.0);
    
    expect(v2.get(0)).toBeCloseTo(2.0, 10);
    expect(v2.get(1)).toBeCloseTo(4.0, 10);
    expect(v2.get(2)).toBeCloseTo(6.0, 10);
  });
  
  test('scaleInPlace - 就地標量乘法', () => {
    const v = new Vector(3);
    v.set(0, 1.0);
    v.set(1, 2.0);
    v.set(2, 3.0);
    
    v.scaleInPlace(2.0);
    
    expect(v.get(0)).toBeCloseTo(2.0, 10);
    expect(v.get(1)).toBeCloseTo(4.0, 10);
    expect(v.get(2)).toBeCloseTo(6.0, 10);
  });
  
  test('dot - 點積', () => {
    const v1 = new Vector(3);
    v1.set(0, 1.0);
    v1.set(1, 2.0);
    v1.set(2, 3.0);
    
    const v2 = new Vector(3);
    v2.set(0, 4.0);
    v2.set(1, 5.0);
    v2.set(2, 6.0);
    
    const result = v1.dot(v2);
    // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
    expect(result).toBeCloseTo(32.0, 10);
  });
  
  test('dot - 大小不匹配應拋出異常', () => {
    const v1 = new Vector(3);
    const v2 = new Vector(2);
    
    expect(() => v1.dot(v2)).toThrow();
  });
  
  test('norm - 2-範數', () => {
    const v = new Vector(3);
    v.set(0, 3.0);
    v.set(1, 4.0);
    v.set(2, 0.0);
    
    const norm = v.norm();
    // sqrt(3^2 + 4^2) = sqrt(9 + 16) = 5
    expect(norm).toBeCloseTo(5.0, 10);
  });
  
  test('plus/minus - 向量加減法', () => {
    const v1 = new Vector(3);
    v1.set(0, 1.0);
    v1.set(1, 2.0);
    v1.set(2, 3.0);
    
    const v2 = new Vector(3);
    v2.set(0, 4.0);
    v2.set(1, 5.0);
    v2.set(2, 6.0);
    
    const sum = v1.plus(v2);
    expect(sum.get(0)).toBeCloseTo(5.0, 10);
    expect(sum.get(1)).toBeCloseTo(7.0, 10);
    expect(sum.get(2)).toBeCloseTo(9.0, 10);
    
    const diff = v2.minus(v1);
    expect(diff.get(0)).toBeCloseTo(3.0, 10);
    expect(diff.get(1)).toBeCloseTo(3.0, 10);
    expect(diff.get(2)).toBeCloseTo(3.0, 10);
  });
  
  test('addInPlace/subtractInPlace - 就地向量運算', () => {
    const v1 = new Vector(3);
    v1.set(0, 10.0);
    v1.set(1, 20.0);
    v1.set(2, 30.0);
    
    const v2 = new Vector(3);
    v2.set(0, 1.0);
    v2.set(1, 2.0);
    v2.set(2, 3.0);
    
    v1.addInPlace(v2);
    expect(v1.get(0)).toBeCloseTo(11.0, 10);
    expect(v1.get(1)).toBeCloseTo(22.0, 10);
    expect(v1.get(2)).toBeCloseTo(33.0, 10);
    
    v1.subtractInPlace(v2);
    expect(v1.get(0)).toBeCloseTo(10.0, 10);
    expect(v1.get(1)).toBeCloseTo(20.0, 10);
    expect(v1.get(2)).toBeCloseTo(30.0, 10);
  });
});

describe('Vector - 工具方法', () => {
  test('clone - 克隆向量', () => {
    const v1 = new Vector(3);
    v1.set(0, 1.0);
    v1.set(1, 2.0);
    v1.set(2, 3.0);
    
    const v2 = v1.clone();
    
    expect(v2.size).toBe(v1.size);
    expect(v2.get(0)).toBe(v1.get(0));
    expect(v2.get(1)).toBe(v1.get(1));
    expect(v2.get(2)).toBe(v1.get(2));
    
    // 修改 v2 不應影響 v1
    v2.set(0, 99.0);
    expect(v1.get(0)).toBe(1.0);
  });
  
  test('fill - 填充向量', () => {
    const v = new Vector(4);
    v.fill(7.5);
    
    for (let i = 0; i < v.size; i++) {
      expect(v.get(i)).toBe(7.5);
    }
  });
  
  test('fill - 填充後再清零', () => {
    const v = new Vector(3);
    v.set(0, 1.0);
    v.set(1, 2.0);
    v.set(2, 3.0);
    
    v.fill(0);
    
    expect(v.get(0)).toBe(0);
    expect(v.get(1)).toBe(0);
    expect(v.get(2)).toBe(0);
  });
  
  test('isZero - 零向量檢測', () => {
    const v1 = Vector.zeros(3);
    expect(v1.isZero()).toBe(true);
    
    const v2 = new Vector(3);
    v2.set(0, 1e-13);
    expect(v2.isZero()).toBe(true);  // 小於容差
    
    const v3 = new Vector(3);
    v3.set(0, 0.001);
    expect(v3.isZero()).toBe(false);
  });
  
  test('toArray - 轉換為數組', () => {
    const v = new Vector(3);
    v.set(0, 1.5);
    v.set(1, 2.5);
    v.set(2, 3.5);
    
    const arr = v.toArray();
    
    expect(arr).toEqual([1.5, 2.5, 3.5]);
  });
  
  test('from - 從數組創建', () => {
    const arr = [1.5, 2.5, 3.5];
    const v = Vector.from(arr);
    
    expect(v.size).toBe(3);
    expect(v.get(0)).toBe(1.5);
    expect(v.get(1)).toBe(2.5);
    expect(v.get(2)).toBe(3.5);
  });
  
  test('zeros/ones - 特殊向量創建', () => {
    const zeros = Vector.zeros(4);
    for (let i = 0; i < zeros.size; i++) {
      expect(zeros.get(i)).toBe(0);
    }
    
    const ones = Vector.ones(4);
    for (let i = 0; i < ones.size; i++) {
      expect(ones.get(i)).toBe(1);
    }
  });
  
  test('basis - 標準基向量', () => {
    const e1 = Vector.basis(3, 0);
    expect(e1.get(0)).toBe(1);
    expect(e1.get(1)).toBe(0);
    expect(e1.get(2)).toBe(0);
    
    const e2 = Vector.basis(3, 1);
    expect(e2.get(0)).toBe(0);
    expect(e2.get(1)).toBe(1);
    expect(e2.get(2)).toBe(0);
  });
});

describe('Vector - 數值穩定性', () => {
  test('處理極小值', () => {
    const v = new Vector(2);
    v.set(0, 1e-15);
    v.set(1, 1e-15);
    
    expect(v.get(0)).toBe(1e-15);
    expect(v.get(1)).toBe(1e-15);
  });
  
  test('處理極大值', () => {
    const v = new Vector(2);
    v.set(0, 1e15);
    v.set(1, 1e15);
    
    expect(v.get(0)).toBe(1e15);
    expect(v.get(1)).toBe(1e15);
  });
  
  test('累加不應導致精度丟失（小範圍）', () => {
    const v = new Vector(1, 0);
    
    // 累加 1000 次 0.001
    for (let i = 0; i < 1000; i++) {
      v.add(0, 0.001);
    }
    
    expect(v.get(0)).toBeCloseTo(1.0, 6); // 允許微小誤差
  });
});
