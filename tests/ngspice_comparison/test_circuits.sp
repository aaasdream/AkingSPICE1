**********************************************
* NGSpice 對比驗證測試電路
* 用於與 AkingSPICE 結果對比
**********************************************

.title Diode Test Circuits

* Test 1: Simple Diode Forward Bias
.subckt diode_test_0.7V
V1 n1 0 DC 0.7
D1 n1 n2 DMOD
R1 n2 0 1k
.model DMOD D (IS=1e-14 N=1.0 RS=0.1)
.ends

* Test 2: NMOS Saturation Test
.subckt nmos_sat_test
VDD vdd 0 DC 5
VGS gate 0 DC 3
RD vdd drain 1k
M1 drain gate 0 0 NMOS W=10u L=10u
.model NMOS NMOS (VTO=0.7 KP=2e-4 LAMBDA=0.02)
.ends

* Test 3: Diode Different Forward Voltages
.subckt diode_sweep
V1 n1 0 DC 0.5
D1 n1 n2 DMOD
R1 n2 0 1k
.model DMOD D (IS=1e-14 N=1.0 RS=0.1)
.ends

* Analysis Commands
.control
* Test 1
op
print V(n1) V(n2) @D1[id]

* Test 2
op
print V(vdd) V(gate) V(drain) @M1[id]

* Sweep Test
dc V1 0 1 0.1
plot V(n2) @D1[id]
.endc

.end
