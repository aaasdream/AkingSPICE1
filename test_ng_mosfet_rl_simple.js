"use strict";
/**
 * 簡單 RL MOSFET 測試 - 基於 NgMosfet 模型
 *
 * 電路拓撲：
 * Vdd(12V) --> [R=1Ω] --> [L=1mH] --> [MOSFET Drain]
 *                                      [MOSFET Source] --> GND
 * Gate: PWM信號 (0-12V, 10kHz, 50% duty)
 * Bulk: 接地
 *
 * 目標：
 * 1. 驗證 MOSFET 能正確開關
 * 2. 驗證電感電流上升和下降
 * 3. 檢查數值穩定性
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const circuit_simulation_engine_1 = require("./src/core/simulation/circuit_simulation_engine");
const resistor_1 = require("./src/components/passive/resistor");
const inductor_1 = require("./src/components/passive/inductor");
const voltage_source_1 = require("./src/components/sources/voltage_source");
const ng_mosfet_1 = require("./src/core/ngdevices/ng_mosfet");
const fs = __importStar(require("fs"));
function testNgMosfetRLCircuit() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('='.repeat(80));
        console.log('測試：NgMosfet RL 電路');
        console.log('='.repeat(80));
        // 電路參數
        const VDD = 12;
        const R = 1; // 1Ω
        const L = 1e-3; // 1mH
        const PWM_FREQ = 10e3; // 10kHz
        const PWM_PERIOD = 1 / PWM_FREQ;
        const DUTY_CYCLE = 0.5;
        const T_ON = PWM_PERIOD * DUTY_CYCLE;
        const T_OFF = PWM_PERIOD * (1 - DUTY_CYCLE);
        // MOSFET 參數 (類似 IRF530)
        const mosfetParams = {
            TYPE: 'NMOS',
            VTO: 4.0, // 閾值電壓 4V
            KP: 20e-3, // 20mA/V²
            W: 1.0, // 1m 寬度
            L: 10e-6, // 10μm 長度
            LAMBDA: 0.01, // 通道長度調製
            PHI: 0.6,
            GAMMA: 0.5
        };
        console.log('\n電路參數:');
        console.log(`  Vdd: ${VDD}V`);
        console.log(`  R: ${R}Ω`);
        console.log(`  L: ${L * 1e3}mH`);
        console.log(`  PWM: ${PWM_FREQ / 1e3}kHz, ${DUTY_CYCLE * 100}% duty`);
        console.log('\nMOSFET 參數:');
        console.log(`  VTO: ${mosfetParams.VTO}V`);
        console.log(`  KP: ${mosfetParams.KP * 1e3}mA/V²`);
        console.log(`  W/L: ${mosfetParams.W / mosfetParams.L}`);
        // 創建電路組件
        const vdd = voltage_source_1.VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], VDD);
        // PWM 閘極驅動信號
        const vgate = voltage_source_1.VoltageSourceFactory.createPulse('Vgate', ['gate', '0'], 0, // v1: 低電平 0V
        12, // v2: 高電平 12V
        0, // td: 無延遲
        1e-9, // tr: 1ns 上升時間
        1e-9, // tf: 1ns 下降時間
        T_ON, // pw: 脈寬
        PWM_PERIOD // per: 週期
        );
        const resistor = resistor_1.ResistorFactory.create('R1', ['vdd', 'n_rl'], R);
        const inductor = inductor_1.InductorFactory.create('L1', ['n_rl', 'n_drain'], L);
        // 創建 MOSFET (D, G, S, B)
        const mosfet = new ng_mosfet_1.NgMosfet('M1', 'n_drain', // Drain
        'gate', // Gate
        '0', // Source (接地)
        '0', // Bulk (接地)
        mosfetParams);
        // 配置仿真引擎
        const engine = new circuit_simulation_engine_1.CircuitSimulationEngine({
            endTime: PWM_PERIOD * 3, // 模擬 3 個週期
            initialTimeStep: PWM_PERIOD / 1000, // 初始步長
            maxTimeStep: PWM_PERIOD / 100, // 最大步長
            minTimeStep: 1e-12 // 最小步長
        });
        // 添加組件
        engine.addDevices([vdd, vgate, resistor, inductor, mosfet]);
        console.log('\n開始仿真...');
        const startTime = Date.now();
        try {
            const result = yield engine.runSimulation();
            const endTime = Date.now();
            console.log('\n仿真結果:');
            console.log(`  狀態: ${result.success ? '✓ 成功' : '✗ 失敗'}`);
            console.log(`  耗時: ${(endTime - startTime) / 1000}秒`);
            console.log(`  數據點: ${((_a = result.waveformData) === null || _a === void 0 ? void 0 : _a.timePoints.length) || 0}`);
            if (result.success && result.waveformData) {
                const { timePoints, nodeVoltages } = result.waveformData;
                // 構建節點名稱到索引的映射
                const nodeMap = engine['_nodeMapping'];
                const getNodeVoltages = (nodeName) => {
                    const idx = nodeMap.get(nodeName);
                    return idx !== undefined ? nodeVoltages.get(idx) : undefined;
                };
                const vGate = getNodeVoltages('gate');
                const vDrain = getNodeVoltages('n_drain');
                const vRL = getNodeVoltages('n_rl');
                // 分析結果
                console.log('\n關鍵節點分析:');
                // 找到 PWM 週期的關鍵時間點
                const period1End = PWM_PERIOD;
                const period2End = PWM_PERIOD * 2;
                let idx1 = 0, idx2 = 0;
                for (let i = 0; i < timePoints.length; i++) {
                    if (timePoints[i] >= period1End && idx1 === 0)
                        idx1 = i;
                    if (timePoints[i] >= period2End && idx2 === 0)
                        idx2 = i;
                }
                // 計算電感電流 (透過電壓推算)
                const calcInductorCurrent = (idx) => {
                    const vdrain = (vDrain === null || vDrain === void 0 ? void 0 : vDrain[idx]) || 0;
                    const vsource = 0; // 接地
                    const vds = vdrain - vsource;
                    // 估算電流：當 MOSFET 導通時，I_L ≈ (Vdd - Vdrain) / R
                    if (vds < 1) { // MOSFET 導通
                        const vrl = (vRL === null || vRL === void 0 ? void 0 : vRL[idx]) || 0;
                        return (VDD - vrl) / R;
                    }
                    return 0;
                };
                // 分析第一個週期
                console.log('\n第一個 PWM 週期:');
                const t1 = idx1 > 0 ? timePoints[idx1] : 0;
                const vgate1 = (vGate === null || vGate === void 0 ? void 0 : vGate[idx1]) || 0;
                const vdrain1 = (vDrain === null || vDrain === void 0 ? void 0 : vDrain[idx1]) || 0;
                const il1 = calcInductorCurrent(idx1);
                console.log(`  時間: ${(t1 * 1e6).toFixed(3)}μs`);
                console.log(`  V_gate: ${vgate1.toFixed(3)}V`);
                console.log(`  V_drain: ${vdrain1.toFixed(3)}V`);
                console.log(`  I_L (估): ${il1.toFixed(3)}A`);
                // 分析第二個週期
                console.log('\n第二個 PWM 週期:');
                const t2 = idx2 > 0 ? timePoints[idx2] : 0;
                const vgate2 = (vGate === null || vGate === void 0 ? void 0 : vGate[idx2]) || 0;
                const vdrain2 = (vDrain === null || vDrain === void 0 ? void 0 : vDrain[idx2]) || 0;
                const il2 = calcInductorCurrent(idx2);
                console.log(`  時間: ${(t2 * 1e6).toFixed(3)}μs`);
                console.log(`  V_gate: ${vgate2.toFixed(3)}V`);
                console.log(`  V_drain: ${vdrain2.toFixed(3)}V`);
                console.log(`  I_L (估): ${il2.toFixed(3)}A`);
                // 檢查穩定性
                console.log('\n穩定性檢查:');
                let hasNaN = false;
                let hasInf = false;
                let maxVoltage = 0;
                nodeVoltages.forEach((voltageArray) => {
                    voltageArray.forEach((v) => {
                        if (isNaN(v))
                            hasNaN = true;
                        if (!isFinite(v))
                            hasInf = true;
                        maxVoltage = Math.max(maxVoltage, Math.abs(v));
                    });
                });
                console.log(`  NaN 檢測: ${hasNaN ? '✗ 發現' : '✓ 無'}`);
                console.log(`  Inf 檢測: ${hasInf ? '✗ 發現' : '✓ 無'}`);
                console.log(`  最大電壓: ${maxVoltage.toFixed(3)}V`);
                // 保存數據到文件 (簡化版本)
                const outputData = {
                    time: Array.from(timePoints),
                    nodeCount: nodeVoltages.size,
                    params: {
                        VDD,
                        R,
                        L,
                        PWM_FREQ,
                        DUTY_CYCLE,
                        mosfet: mosfetParams
                    }
                };
                fs.writeFileSync('test_ng_mosfet_rl_output.json', JSON.stringify(outputData, null, 2));
                console.log('\n數據已保存到: test_ng_mosfet_rl_output.json');
                // 生成簡單的 CSV 用於繪圖
                let csv = 'time,v_gate,v_drain,v_rl\n';
                for (let i = 0; i < timePoints.length; i++) {
                    csv += `${timePoints[i]},${(vGate === null || vGate === void 0 ? void 0 : vGate[i]) || 0},${(vDrain === null || vDrain === void 0 ? void 0 : vDrain[i]) || 0},${(vRL === null || vRL === void 0 ? void 0 : vRL[i]) || 0}\n`;
                }
                fs.writeFileSync('test_ng_mosfet_rl_output.csv', csv);
                console.log('CSV 數據已保存到: test_ng_mosfet_rl_output.csv');
                // 判斷測試是否通過
                const testPassed = result.success && !hasNaN && !hasInf && maxVoltage < 100;
                console.log('\n' + '='.repeat(80));
                console.log(`測試結果: ${testPassed ? '✓ 通過' : '✗ 失敗'}`);
                console.log('='.repeat(80));
            }
            else {
                console.error('\n錯誤:', result.errorMessage);
                console.log('\n' + '='.repeat(80));
                console.log('測試結果: ✗ 失敗');
                console.log('='.repeat(80));
            }
        }
        catch (error) {
            console.error('\n仿真過程中發生異常:', error);
            if (error instanceof Error) {
                console.error('錯誤堆疊:', error.stack);
            }
            console.log('\n' + '='.repeat(80));
            console.log('測試結果: ✗ 失敗');
            console.log('='.repeat(80));
        }
    });
}
// 執行測試
testNgMosfetRLCircuit().catch(console.error);
