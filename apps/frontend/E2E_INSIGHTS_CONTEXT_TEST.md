# E2E Insights and Context Test (Subtask 3-3)

**Purpose:** Verify that Insights analysis and Context refresh features work correctly in the Windows .exe build without Python import errors.

**Prerequisites:**
- Windows 10/11 machine
- Built Windows .exe (see `WINDOWS_BUILD_VERIFICATION.md` for build instructions)
- All previous fixes applied (subtasks 1-1 through 2-4)
- Completed subtask-3-2 (spec creation test) successfully

## Test Overview

This test verifies two critical features that previously failed with `ModuleNotFoundError`:

1. **Insights Feature** - Analyzes project structure and provides development insights
2. **Context Refresh** - Updates project context and file structure analysis

Both features rely on Python packages (anthropic, graphiti_core) that were not importable in broken .exe builds.

## Test Procedure

### Part 1: Insights Feature Test

#### 1.1 Launch Packaged .exe

```powershell
cd dist/win-unpacked
.\Auto-Claude.exe
```

**Expected:**
- Application launches without errors
- Main window displays
- DevTools Console available (View → Toggle Developer Tools)

#### 1.2 Navigate to Insights Tab

**Steps:**
1. In the Auto-Claude application, locate the Insights section/tab
   - This may be in the sidebar navigation
   - Or accessible via a menu item
2. Click to open the Insights view

**Expected:**
- Insights view loads without JavaScript errors
- Loading indicator appears if analysis is in progress
- No console errors in DevTools

#### 1.3 Wait for Analysis to Complete

**Monitor DevTools Console for:**
- ✓ Python subprocess spawn logs (if logging enabled in subtask-2-1)
- ✓ Insights analysis progress messages
- ✗ **No ModuleNotFoundError** for anthropic, graphiti_core, or other packages
- ✗ **No Python import errors**

**Timeline:**
- Small projects: 10-30 seconds
- Medium projects: 30-60 seconds
- Large projects: 1-2 minutes

**Expected:**
- Analysis completes without errors
- Insights data populates in the UI
- No timeout or crash

#### 1.4 Verify Insights Displayed

**Check that Insights view shows:**
- ✓ Project statistics (file count, languages, etc.)
- ✓ Code quality metrics or suggestions
- ✓ Architecture insights
- ✓ No error messages or blank screens

**Screenshot recommended:** Capture the Insights view for verification

### Part 2: Context Refresh Feature Test

#### 2.1 Navigate to Context/Project Structure View

**Steps:**
1. Locate the Context or Project Structure section
   - May be in sidebar, separate tab, or within Insights
2. Open the Context view

**Expected:**
- Context view loads successfully
- Current project structure displayed
- Refresh button/option visible

#### 2.2 Trigger Context Refresh

**Steps:**
1. Locate the "Refresh" button or equivalent action
   - May be labeled "Refresh Context", "Update Project Structure", etc.
2. Click the refresh button

**Monitor DevTools Console for:**
- ✓ Context refresh initiated message
- ✓ Python subprocess activity (if logged)
- ✗ **No ModuleNotFoundError**
- ✗ **No import errors**
- ✗ **No timeout errors**

**Expected:**
- Refresh operation begins
- Loading indicator appears
- No immediate errors

#### 2.3 Verify Project Structure Updates

**After refresh completes (10-60 seconds):**

**Check that:**
- ✓ Project structure tree updates/refreshes
- ✓ File counts are accurate
- ✓ Directory structure reflects actual project
- ✓ No error dialogs or messages
- ✓ DevTools Console shows no errors

**Optional verification:**
1. Create a new file in your project directory
2. Trigger Context refresh again
3. Verify the new file appears in the structure

**Screenshot recommended:** Capture the updated Context view

### Part 3: Error Verification

#### 3.1 Check Application Logs

**DevTools Console:**
1. Open DevTools (View → Toggle Developer Tools)
2. Check Console tab for errors
3. Search for keywords:
   - `ModuleNotFoundError`
   - `ImportError`
   - `timeout`
   - `Failed to`

**Expected:**
- No ModuleNotFoundError related to Python packages
- No import errors
- No unhandled exceptions during Insights/Context operations

#### 3.2 Check Python Logs (if available)

**If Python logging is accessible:**
```powershell
# Check for Python errors in logs
Get-Content $env:APPDATA\Auto-Claude\logs\*.log | Select-String "ModuleNotFoundError|ImportError|Traceback"
```

**Expected:**
- No Python import errors
- No package resolution failures

## Success Criteria

**✅ Test PASSES if ALL of the following are true:**

### Insights Feature:
- [x] Insights tab opens without errors
- [x] Analysis completes within reasonable time (< 2 minutes)
- [x] Insights data displays in the UI
- [x] No ModuleNotFoundError in DevTools Console
- [x] No Python import errors in logs
- [x] No application crashes or freezes

### Context Refresh Feature:
- [x] Context/Project Structure view opens successfully
- [x] Refresh button/action is functional
- [x] Refresh operation completes without errors
- [x] Project structure updates correctly
- [x] No ModuleNotFoundError in DevTools Console
- [x] No timeout errors
- [x] UI remains responsive during and after refresh

### General:
- [x] Application remains stable throughout testing
- [x] No unhandled exceptions in DevTools
- [x] Features that worked before still work

## Failure Scenarios

### ❌ Test FAILS if ANY of the following occur:

**Critical Failures:**
- ModuleNotFoundError for dotenv, anthropic, graphiti_core, or claude_agent_sdk
- Python import errors in DevTools or logs
- Application crashes during Insights analysis or Context refresh
- Timeout errors during feature execution
- Features completely non-functional (blank screens, infinite loading)

**Non-Critical Issues (report but may not block):**
- Slow performance (> 2 minutes for small projects)
- UI glitches or layout issues (not related to Python imports)
- Missing data in Insights (if Python runs without errors)

## Troubleshooting

### Issue 1: ModuleNotFoundError During Insights Analysis

**Symptom:**
```
ModuleNotFoundError: No module named 'anthropic'
ModuleNotFoundError: No module named 'graphiti_core'
```

**Diagnosis:**
1. Check Python imports:
   ```powershell
   cd dist\win-unpacked
   .\resources\python\python.exe -c "import anthropic; import graphiti_core; print('OK')"
   ```

**If import fails:**
- Python packages not bundled correctly
- sitecustomize.py missing or not working

**Fix:**
1. Run verification script:
   ```powershell
   cd apps\frontend
   .\scripts\verify-windows-build.ps1
   ```
2. Check `resources\python\Lib\site-packages\` has packages
3. Verify `sitecustomize.py` exists in `Lib\site-packages\`
4. If missing, rebuild: `npm run package:win`

### Issue 2: Context Refresh Hangs/Timeouts

**Symptom:**
- Refresh button clicked but nothing happens
- Loading spinner never stops
- Timeout error after 60+ seconds

**Diagnosis:**
1. Check DevTools Console for subprocess errors
2. Look for agent initialization timing logs (added in subtask-2-1)

**Fix:**
1. Verify agent subprocess configuration:
   - `agent-process.ts` should have `stdio: 'pipe'`
   - `windowsHide: true` should be set
2. Check if Python subprocess can be spawned:
   ```powershell
   cd dist\win-unpacked
   .\resources\python\python.exe -c "print('Python works')"
   ```
3. Restart the application
4. If persistent, rebuild with latest fixes

### Issue 3: Insights View Blank/Empty

**Symptom:**
- Insights tab loads but shows no data
- No errors in console
- Analysis appears to complete

**Possible Causes:**
- Analysis ran successfully but UI not updating
- Data format issue (not related to Python imports)
- Empty project (no files to analyze)

**Diagnosis:**
1. Check DevTools Console for warnings
2. Verify project has files to analyze
3. Check if Insights data exists (look for API responses in Network tab)

**Fix:**
- Restart analysis
- Try with a different project
- Check UI component rendering (may be a frontend issue, not Python)

### Issue 4: "Cannot find python.exe"

**Symptom:**
- Error about missing Python executable
- Features fail before attempting imports

**Fix:**
1. Verify build structure:
   ```powershell
   Test-Path dist\win-unpacked\resources\python\python.exe
   ```
2. If missing, rebuild: `npm run package:win`
3. Verify `extraResources` in `package.json` includes Python runtime

## Reporting Results

### If Test Passes ✓

**Update implementation_plan.json:**
```json
{
  "id": "subtask-3-3",
  "status": "completed",
  "notes": "Insights and Context features tested successfully in .exe. No ModuleNotFoundError, both features work as expected."
}
```

**Update build-progress.txt:**
```
Session XX (Coder - subtask-3-3):
- Tested Insights and Context features in Windows .exe
- Insights analysis completed without Python import errors
- Context refresh successful, Project Structure updates correctly
- No ModuleNotFoundError for anthropic, graphiti_core, or other packages
- Committed: auto-claude: subtask-3-3 - Test Insights and Context features in .exe
- Status: COMPLETED ✓
```

### If Test Fails ✗

**Collect diagnostic information:**

1. **Screenshots:**
   - Error dialogs
   - DevTools Console (showing errors)
   - Insights view (if blank or broken)
   - Context view (if not updating)

2. **Error messages:**
   ```powershell
   # From DevTools Console - copy full error stack traces
   ```

3. **Python verification:**
   ```powershell
   # Test Python imports
   cd dist\win-unpacked
   .\resources\python\python.exe -c "import sys; import anthropic; import graphiti_core; print('OK')"

   # Show sys.path
   .\resources\python\python.exe -c "import sys; print('\n'.join(sys.path))"

   # List site-packages
   dir resources\python\Lib\site-packages\
   ```

4. **Timing information:**
   - How long before error occurred
   - Which feature failed (Insights, Context, or both)
   - Steps to reproduce

5. **Build verification:**
   ```powershell
   cd apps\frontend
   .\scripts\verify-windows-build.ps1
   ```

**Report to:** Update `build-progress.txt` with failure details and diagnostic output

## Platform Limitations

**IMPORTANT:** This test requires a Windows environment.

**macOS/Linux developers:**
- ✓ Can create test documentation (this file)
- ✓ Can verify code changes are correct
- ✗ **Cannot execute Windows .exe files**
- ✗ **Cannot run actual E2E tests**

**Solution:** Coordinate with Windows testers or use Windows VM/CI for verification.

## Next Steps

After this test completes:

1. **If PASSED:**
   - Proceed to subtask-3-4 (Git version regression test)
   - Update implementation plan status
   - Prepare for QA sign-off

2. **If FAILED:**
   - Collect full diagnostic information (see Reporting Results above)
   - Identify root cause
   - Apply fixes
   - Rebuild and retest
   - Do not proceed to subtask-3-4 until this passes

## Reference

**Related Documentation:**
- `WINDOWS_BUILD_VERIFICATION.md` - Build structure verification
- `E2E_SPEC_CREATION_TEST.md` - Spec creation testing (subtask-3-2)
- `TESTING_GUIDE.md` - Overall testing workflow

**Related Subtasks:**
- subtask-1-1 through 1-4: Python path fixes (MUST be applied)
- subtask-2-1 through 2-4: Agent timeout fixes (MUST be applied)
- subtask-3-1: Build verification (prerequisite)
- subtask-3-2: E2E spec creation test (prerequisite)

**Key Fix Applied:**
- Python packages now bundled to `python/Lib/site-packages` (correct path)
- `sitecustomize.py` injected to add packages to sys.path
- These fixes resolve ModuleNotFoundError that previously blocked Insights and Context features
