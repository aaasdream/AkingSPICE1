# Extract test failure info from test_results.txt
$content = Get-Content "test_results.txt" -Raw

# Look for test failures  (✓ for pass, × for fail in Vitest output)
$lines = Get-Content "test_results.txt"

$inFailure = $false
$failureLines = @()
$lineNum = 0

foreach ($line in $lines) {
    $lineNum++

    # Check for test failure indicators
    if ($line -match "FAIL|× |✗ |AssertionError|Error:|expected|received") {
        $failureLines += "Line $lineNum : $line"
        $inFailure = $true
    }
    elseif ($inFailure -and $line.Trim() -ne "") {
        $failureLines += "Line $lineNum : $line"

        # Stop after 3 lines of context
        if ($failureLines.Count -gt 50) {
            break
        }
    }
}

if ($failureLines.Count -gt 0) {
    Write-Output "=== TEST FAILURES FOUND ==="
    $failureLines | ForEach-Object { Write-Output $_ }
}
else {
    Write-Output "No clear failure messages found in standard grep patterns"
    Write-Output "Checking last 100 lines of file..."
    Get-Content "test_results.txt" | Select-Object -Last 100
}
