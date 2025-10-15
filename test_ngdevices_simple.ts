// 簡單測試 NGDevices
import { NgDeviceFactory } from './src/core/ngdevices/ng_device_factory';

console.log('=== NGDevices 測試開始 ===\n');

try {
  // 測試創建二極體
  console.log('1. 測試創建二極體...');
  const diode = NgDeviceFactory.createDiode('D1', 'anode', 'cathode', {
    IS: 1e-14,
    N: 1.0,
    RS: 0,
    BV: 1e10,
    TEMP: 27
  });
  console.log(`   ✓ 二極體創建成功: ${diode.name}, 類型: ${diode.type}`);
  console.log(`   - 節點: [${diode.nodes.join(', ')}]`);

  // 測試創建 MOSFET
  console.log('\n2. 測試創建 NMOS...');
  const mosfet = NgDeviceFactory.createNMOS('M1', 'drain', 'gate', 'source', 'bulk', {
    VTO: 0.7,
    KP: 2e-5,
    LAMBDA: 0.01,
    PHI: 0.6,
    GAMMA: 0.4,
    TEMP: 27
  });
  console.log(`   ✓ MOSFET 創建成功: ${mosfet.name}, 類型: ${mosfet.type}`);
  console.log(`   - 節點: [${mosfet.nodes.join(', ')}]`);

  // 測試驗證方法
  console.log('\n3. 測試元件驗證...');
  const diodeValidation = diode.validate();
  const mosfetValidation = mosfet.validate();
  console.log(`   ✓ 二極體驗證: ${diodeValidation.isValid ? '通過' : '失敗'}`);
  console.log(`   ✓ MOSFET 驗證: ${mosfetValidation.isValid ? '通過' : '失敗'}`);

  // 測試元件資訊
  console.log('\n4. 測試元件資訊...');
  const diodeInfo = diode.getInfo();
  const mosfetInfo = mosfet.getInfo();
  console.log(`   ✓ 二極體資訊:`, diodeInfo);
  console.log(`   ✓ MOSFET 資訊:`, mosfetInfo);

  console.log('\n=== ✓ 所有測試通過 ===');
  process.exit(0);
} catch (error) {
  console.error('\n=== ✗ 測試失敗 ===');
  console.error('錯誤:', error);
  process.exit(1);
}
