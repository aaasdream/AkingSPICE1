# Quick test run with minimal output
$ErrorActionPreference = "Continue"
npm test -- tests/pyramid/pwm_mosfet_rl.test.ts --run 2>&1 | Select-String -Pattern "passed|failed|Tests.*\|" | Select-Object -Last 5
