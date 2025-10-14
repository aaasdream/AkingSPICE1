@echo off
REM Run PWM test and save result
echo Running PWM MOSFET RL tests...
call npm test -- tests/pyramid/pwm_mosfet_rl.test.ts --run > test_results_latest.txt 2>&1
echo Test completed. Results saved to test_results_latest.txt
echo.
echo === Test Summary ===
findstr /C:"passed" /C:"failed" /C:"Tests" test_results_latest.txt | findstr /V "stdout"
