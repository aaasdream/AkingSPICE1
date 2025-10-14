# Run tests and capture only failure summary
npm test -- tests/pyramid/pwm_mosfet_rl.test.ts --run --reporter=verbose 2>&1 | Select-String -Pattern "FAIL|✗|×|expected|received|AssertionError" -Context 2, 2
