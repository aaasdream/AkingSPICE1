"use strict";
/**
 * 調試版本的 NgMosfet DC 測試
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
const ng_mosfet_1 = require("./src/core/ngdevices/ng_mosfet");
function testDebug() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        console.log('='.repeat(80));
        console.log('調試：檢查 MOSFET 矩陣組裝');
        console.log('='.repeat(80));
        const mosfetParams = {
            TYPE: 'NMOS',
            VTO: 2.0,
            KP: 50e-3,
            W: 100e-6,
            L: 10e-6,
            LAMBDA: 0.01,
            PHI: 0.6,
            GAMMA: 0
        };
        const vdd = voltage_source_1.VoltageSourceFactory.createDC('Vdd', ['vdd', '0'], 12);
        const vgate = voltage_source_1.VoltageSourceFactory.createDC('Vgate', ['gate', '0'], 10);
        const resistor = resistor_1.ResistorFactory.create('R1', ['vdd', 'n_drain'], 1);
        const mosfet = new ng_mosfet_1.NgMosfet('M1', 'n_drain', 'gate', '0', '0', mosfetParams);
        const engine = new circuit_simulation_engine_1.CircuitSimulationEngine({
            endTime: 0,
            initialTimeStep: 0
        });
        engine.addDevices([vdd, vgate, resistor, mosfet]);
        console.log('\n節點映射:');
        const nodeMap = engine['_nodeMapping'];
        nodeMap.forEach((idx, name) => {
            console.log(`  ${name} -> ${idx}`);
        });
        console.log('\n手動計算預期值:');
        console.log('  假設 MOSFET 在飽和區:');
        console.log('  V_GS = 10V, V_OV = 10-2 = 8V');
        const beta = mosfetParams.KP * (mosfetParams.W / mosfetParams.L);
        console.log(`  β = KP * W/L = ${beta * 1e3}mA/V²`);
        const iD_sat = 0.5 * beta * 8 * 8;
        console.log(`  I_D(sat) = 0.5 * β * V_OV² = ${(iD_sat * 1e3).toFixed(3)}mA`);
        const vD_sat = 12 - iD_sat * 1;
        console.log(`  V_D = Vdd - I_D*R = ${vD_sat.toFixed(3)}V`);
        console.log(`  V_DS = V_D - 0 = ${vD_sat.toFixed(3)}V`);
        if (vD_sat > 8) {
            console.log(`  ✓ V_DS (${vD_sat.toFixed(1)}V) > V_OV (8V) -> 確實在飽和區`);
        }
        else {
            console.log(`  ✗ V_DS (${vD_sat.toFixed(1)}V) < V_OV (8V) -> 應該在線性區`);
        }
        console.log('\n開始仿真...\n');
        try {
            const result = yield engine.runSimulation();
            if (result.success && result.waveformData) {
                const { nodeVoltages } = result.waveformData;
                console.log('\n實際仿真結果:');
                const drainIdx = nodeMap.get('n_drain');
                const vddIdx = nodeMap.get('vdd');
                const gateIdx = nodeMap.get('gate');
                if (drainIdx !== undefined && vddIdx !== undefined && gateIdx !== undefined) {
                    const vD = ((_a = nodeVoltages.get(drainIdx)) === null || _a === void 0 ? void 0 : _a[0]) || 0;
                    const vVdd = ((_b = nodeVoltages.get(vddIdx)) === null || _b === void 0 ? void 0 : _b[0]) || 0;
                    const vG = ((_c = nodeVoltages.get(gateIdx)) === null || _c === void 0 ? void 0 : _c[0]) || 0;
                    console.log(`  V_vdd節點: ${vVdd.toFixed(3)}V`);
                    console.log(`  V_gate節點: ${vG.toFixed(3)}V`);
                    console.log(`  V_drain節點: ${vD.toFixed(3)}V`);
                    console.log(`  電阻壓降: ${(vVdd - vD).toFixed(3)}V`);
                    console.log(`  電流: ${((vVdd - vD) / 1.0 * 1000).toFixed(3)}mA`);
                    // 檢查 MOSFET 內部狀態
                    const info = mosfet.getInfo();
                    console.log('\nMOSFET 內部狀態:');
                    console.log(`  vgs: ${(_e = (_d = info.parameters) === null || _d === void 0 ? void 0 : _d.vgs) === null || _e === void 0 ? void 0 : _e.toFixed(3)}V`);
                    console.log(`  vds: ${(_g = (_f = info.parameters) === null || _f === void 0 ? void 0 : _f.vds) === null || _g === void 0 ? void 0 : _g.toFixed(3)}V`);
                    console.log(`  id: ${(((_h = info.parameters) === null || _h === void 0 ? void 0 : _h.id) * 1000).toFixed(3)}mA`);
                    console.log(`  mode: ${(_j = info.parameters) === null || _j === void 0 ? void 0 : _j.mode}`);
                    const expectedSign = vD > 0 ? '+' : '-';
                    const actualSign = vD > 0 ? '+' : '-';
                    console.log(`\n極性檢查:`);
                    console.log(`  預期 V_drain: ${expectedSign} (應該是正的，接近 ${vD_sat.toFixed(1)}V)`);
                    console.log(`  實際 V_drain: ${actualSign}${Math.abs(vD).toFixed(3)}V`);
                    if (vD < 0) {
                        console.log('\n❌ 錯誤！V_drain 是負值，這表示電流方向錯誤');
                        console.log('   可能的原因：');
                        console.log('   1. 矩陣組裝時符號錯誤');
                        console.log('   2. RHS 向量的電流方向錯誤');
                        console.log('   3. Mode 判斷或 xnrm/xrev 邏輯錯誤');
                    }
                    else if (Math.abs(vD - vD_sat) < 0.5) {
                        console.log('\n✓ V_drain 值合理，接近理論值');
                    }
                    else {
                        console.log(`\n⚠️ V_drain 與理論值差距較大 (誤差: ${Math.abs(vD - vD_sat).toFixed(3)}V)`);
                    }
                }
            }
            else {
                console.error('\n仿真失敗:', result.errorMessage);
            }
        }
        catch (error) {
            console.error('\n異常:', error);
        }
    });
}
testDebug().catch(console.error);
