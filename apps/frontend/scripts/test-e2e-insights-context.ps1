#!/usr/bin/env pwsh
# Test script for E2E Insights and Context features (Subtask 3-3)
# This script provides automated pre-test and post-test verification

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("pretest", "posttest", "full")]
    [string]$Phase = "full"
)

$ErrorActionPreference = "Continue"
$buildPath = "dist/win-unpacked"
$resourcesPath = "$buildPath/resources"
$pythonPath = "$resourcesPath/python/python.exe"
$sitePackagesPath = "$resourcesPath/python/Lib/site-packages"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "E2E Insights & Context Test (Subtask 3-3)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Test-PreConditions {
    Write-Host "[Pre-Test] Verifying build structure and Python environment..." -ForegroundColor Yellow
    Write-Host ""

    $allPassed = $true

    # Check 1: Build directory exists
    Write-Host "1. Checking build directory..." -NoNewline
    if (Test-Path $buildPath) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "   Build directory not found: $buildPath" -ForegroundColor Red
        Write-Host "   Run: npm run package:win" -ForegroundColor Yellow
        $allPassed = $false
    }

    # Check 2: Python executable exists
    Write-Host "2. Checking Python executable..." -NoNewline
    if (Test-Path $pythonPath) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "   Python not found: $pythonPath" -ForegroundColor Red
        $allPassed = $false
    }

    # Check 3: site-packages directory exists
    Write-Host "3. Checking site-packages directory..." -NoNewline
    if (Test-Path $sitePackagesPath) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "   site-packages not found: $sitePackagesPath" -ForegroundColor Red
        $allPassed = $false
    }

    # Check 4: sitecustomize.py exists
    Write-Host "4. Checking sitecustomize.py..." -NoNewline
    $sitecustomizePath = "$sitePackagesPath/sitecustomize.py"
    if (Test-Path $sitecustomizePath) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "   sitecustomize.py not found in site-packages" -ForegroundColor Red
        $allPassed = $false
    }

    # Check 5: Required packages for Insights/Context
    Write-Host "5. Checking required packages..." -NoNewline
    $requiredPackages = @("anthropic", "graphiti_core", "dotenv", "claude_agent_sdk")
    $missingPackages = @()

    foreach ($package in $requiredPackages) {
        $packagePath = "$sitePackagesPath/$package"
        # Handle different package naming conventions
        $alternativePaths = @(
            "$sitePackagesPath/$package",
            "$sitePackagesPath/$($package.Replace('_', '-'))",
            "$sitePackagesPath/$($package.Replace('-', '_'))"
        )

        $found = $false
        foreach ($altPath in $alternativePaths) {
            if (Test-Path $altPath) {
                $found = $true
                break
            }
        }

        if (-not $found) {
            $missingPackages += $package
        }
    }

    if ($missingPackages.Count -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "   Missing packages: $($missingPackages -join ', ')" -ForegroundColor Red
        $allPassed = $false
    }

    # Check 6: Python imports work (CRITICAL for Insights/Context)
    Write-Host "6. Testing Python imports (anthropic, graphiti_core)..." -NoNewline
    try {
        $importTest = & $pythonPath -c "import anthropic; import graphiti_core; import dotenv; print('OK')" 2>&1
        if ($LASTEXITCODE -eq 0 -and $importTest -eq "OK") {
            Write-Host " OK" -ForegroundColor Green
        } else {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Host "   Import error: $importTest" -ForegroundColor Red
            $allPassed = $false
        }
    } catch {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "   Exception: $_" -ForegroundColor Red
        $allPassed = $false
    }

    # Check 7: Agent subprocess test (optional, may take time)
    if (Test-Path "apps/frontend/scripts/test-agent-subprocess.cjs") {
        Write-Host "7. Agent subprocess test available (optional - not running automatically)" -ForegroundColor Gray
        Write-Host "   To run manually: node apps/frontend/scripts/test-agent-subprocess.cjs" -ForegroundColor Gray
    }

    Write-Host ""
    if ($allPassed) {
        Write-Host "[Pre-Test] All checks PASSED ✓" -ForegroundColor Green
        Write-Host "Ready for E2E Insights and Context testing" -ForegroundColor Green
    } else {
        Write-Host "[Pre-Test] Some checks FAILED ✗" -ForegroundColor Red
        Write-Host "Fix the issues above before testing" -ForegroundColor Yellow
    }
    Write-Host ""

    return $allPassed
}

function Test-PostConditions {
    Write-Host "[Post-Test] Verifying test results..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This is a manual verification phase." -ForegroundColor Gray
    Write-Host "Please confirm the following from your manual testing:" -ForegroundColor Gray
    Write-Host ""

    # Manual verification prompts
    Write-Host "Insights Feature:" -ForegroundColor Cyan
    $insightsLoaded = Read-Host "  Did Insights tab load without errors? (y/n)"
    $insightsCompleted = Read-Host "  Did analysis complete successfully? (y/n)"
    $insightsData = Read-Host "  Was insights data displayed in the UI? (y/n)"
    $insightsNoErrors = Read-Host "  Were there NO ModuleNotFoundError in DevTools? (y/n)"

    Write-Host ""
    Write-Host "Context Refresh Feature:" -ForegroundColor Cyan
    $contextLoaded = Read-Host "  Did Context/Project Structure view load? (y/n)"
    $contextRefreshed = Read-Host "  Did refresh operation complete? (y/n)"
    $contextUpdated = Read-Host "  Did Project Structure update correctly? (y/n)"
    $contextNoErrors = Read-Host "  Were there NO errors in DevTools? (y/n)"

    Write-Host ""
    Write-Host "General Stability:" -ForegroundColor Cyan
    $nocrashes = Read-Host "  Did the application remain stable (no crashes)? (y/n)"
    $responsive = Read-Host "  Did the UI remain responsive? (y/n)"

    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor Cyan

    # Evaluate results
    $allYes = @(
        $insightsLoaded, $insightsCompleted, $insightsData, $insightsNoErrors,
        $contextLoaded, $contextRefreshed, $contextUpdated, $contextNoErrors,
        $nocrashes, $responsive
    ) | Where-Object { $_ -eq "y" }

    if ($allYes.Count -eq 10) {
        Write-Host ""
        Write-Host "[Post-Test] All criteria MET ✓" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Green
        Write-Host "1. Update implementation_plan.json: set subtask-3-3 status to 'completed'" -ForegroundColor White
        Write-Host "2. Update build-progress.txt with test results" -ForegroundColor White
        Write-Host "3. Commit changes:" -ForegroundColor White
        Write-Host "   git add ." -ForegroundColor Gray
        Write-Host "   git commit -m 'auto-claude: subtask-3-3 - Test Insights and Context features in .exe'" -ForegroundColor Gray
        Write-Host "4. Proceed to subtask-3-4 (Git version regression test)" -ForegroundColor White
        Write-Host ""
        return $true
    } else {
        Write-Host ""
        Write-Host "[Post-Test] Some criteria NOT MET ✗" -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting steps:" -ForegroundColor Yellow
        Write-Host "1. Review E2E_INSIGHTS_CONTEXT_TEST.md troubleshooting section" -ForegroundColor White
        Write-Host "2. Check DevTools Console for specific errors" -ForegroundColor White
        Write-Host "3. Run diagnostic: node scripts/test-agent-subprocess.cjs" -ForegroundColor White
        Write-Host "4. Verify Python imports:" -ForegroundColor White
        Write-Host "   .\resources\python\python.exe -c 'import anthropic; import graphiti_core'" -ForegroundColor Gray
        Write-Host "5. Collect screenshots and error messages" -ForegroundColor White
        Write-Host "6. Update build-progress.txt with failure details" -ForegroundColor White
        Write-Host ""
        return $false
    }
}

function Show-TestInstructions {
    Write-Host "[Manual Test] Follow these steps:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Part 1: Insights Feature Test" -ForegroundColor Cyan
    Write-Host "  1. Launch: .\dist\win-unpacked\Auto-Claude.exe" -ForegroundColor White
    Write-Host "  2. Open Insights tab/view" -ForegroundColor White
    Write-Host "  3. Wait for analysis to complete" -ForegroundColor White
    Write-Host "  4. Verify insights data is displayed" -ForegroundColor White
    Write-Host "  5. Open DevTools (View → Toggle Developer Tools)" -ForegroundColor White
    Write-Host "  6. Check Console for NO ModuleNotFoundError" -ForegroundColor White
    Write-Host ""
    Write-Host "Part 2: Context Refresh Feature Test" -ForegroundColor Cyan
    Write-Host "  1. Navigate to Context/Project Structure view" -ForegroundColor White
    Write-Host "  2. Click Refresh button" -ForegroundColor White
    Write-Host "  3. Wait for refresh to complete" -ForegroundColor White
    Write-Host "  4. Verify Project Structure updates" -ForegroundColor White
    Write-Host "  5. Check DevTools Console for NO errors" -ForegroundColor White
    Write-Host ""
    Write-Host "See E2E_INSIGHTS_CONTEXT_TEST.md for detailed instructions" -ForegroundColor Gray
    Write-Host ""
}

# Main execution
switch ($Phase) {
    "pretest" {
        $result = Test-PreConditions
        if ($result) {
            Write-Host "Pre-test checks passed. Ready to run manual tests." -ForegroundColor Green
            Write-Host "See: E2E_INSIGHTS_CONTEXT_TEST.md for test procedure" -ForegroundColor Gray
            exit 0
        } else {
            Write-Host "Pre-test checks failed. Fix issues before testing." -ForegroundColor Red
            exit 1
        }
    }
    "posttest" {
        $result = Test-PostConditions
        exit ($result ? 0 : 1)
    }
    "full" {
        Write-Host "Running full test workflow..." -ForegroundColor Cyan
        Write-Host ""

        # Pre-test
        $preResult = Test-PreConditions
        if (-not $preResult) {
            Write-Host "Pre-test failed. Cannot proceed." -ForegroundColor Red
            exit 1
        }

        # Manual test instructions
        Write-Host ""
        Show-TestInstructions

        # Wait for user to complete manual test
        Write-Host "Press Enter when manual testing is complete..." -ForegroundColor Yellow
        Read-Host

        # Post-test
        $postResult = Test-PostConditions
        exit ($postResult ? 0 : 1)
    }
}
