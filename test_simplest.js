"use strict";
/**
 * 最簡單的測試 - 只有電壓源和電阻
 */
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
const voltage_source_1 = require("./src/components/sources/voltage_source");
function testSimplest() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log('最簡單測試：Vdd -> R -> GND');
        console.log('預期：V(n1) = 12V, I = 12V / 1Ω = 12A');
        const vdd = voltage_source_1.VoltageSourceFactory.createDC('Vdd', ['n1', '0'], 12);
        const r1 = resistor_1.ResistorFactory.create('R1', ['n1', '0'], 1);
        const engine = new circuit_simulation_engine_1.CircuitSimulationEngine({
            endTime: 0,
            initialTimeStep: 0
        });
        engine.addDevices([vdd, r1]);
        console.log('\n節點映射:');
        const nodeMap = engine['_nodeMapping'];
        nodeMap.forEach((idx, name) => {
            console.log(`  ${name} -> ${idx}`);
        });
        const result = yield engine.runSimulation();
        if (result.success && result.waveformData) {
            const { nodeVoltages } = result.waveformData;
            console.log('\n結果:');
            const n1Idx = nodeMap.get('n1');
            const gndIdx = nodeMap.get('0');
            if (n1Idx !== undefined) {
                const v_n1 = ((_a = nodeVoltages.get(n1Idx)) === null || _a === void 0 ? void 0 : _a[0]) || 0;
                console.log(`  V(n1) = ${v_n1.toFixed(3)}V`);
                console.log(`  預期 V(n1) = 12.000V`);
                if (Math.abs(v_n1 - 12) < 0.001) {
                    console.log('  ✓ 正確！');
                }
                else {
                    console.log(`  ✗ 錯誤！誤差 = ${(v_n1 - 12).toFixed(3)}V`);
                }
            }
            if (gndIdx !== undefined) {
                const v_gnd = ((_b = nodeVoltages.get(gndIdx)) === null || _b === void 0 ? void 0 : _b[0]) || 0;
                console.log(`  V(0) = ${v_gnd.toFixed(3)}V`);
                console.log(`  預期 V(0) = 0.000V`);
                if (Math.abs(v_gnd) < 0.001) {
                    console.log('  ✓ 正確！');
                }
                else {
                    console.log(`  ✗ 錯誤！GND 應該是 0V`);
                }
            }
        }
        else {
            console.error('仿真失敗:', result.errorMessage);
        }
    });
}
testSimplest().catch(console.error);
