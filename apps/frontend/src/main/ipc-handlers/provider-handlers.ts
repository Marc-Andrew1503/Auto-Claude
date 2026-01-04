import { ipcMain } from 'electron';
import { execSync, spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { getSettingsPath, readSettingsFile } from '../settings-utils';
import { ClaudeProfileManager } from '../claude-profile-manager';

// Singleton instance of ClaudeProfileManager
let profileManager: ClaudeProfileManager | null = null;

function getProfileManager(): ClaudeProfileManager {
  if (!profileManager) {
    profileManager = new ClaudeProfileManager();
  }
  return profileManager;
}

// Types for provider management
export type Provider = 'claude' | 'ollama';
export type ProviderStatus = 'available' | 'unavailable' | 'degraded' | 'checking';

export interface ProviderHealth {
  provider: Provider;
  status: ProviderStatus;
  model_available: boolean;
  response_time_ms?: number;
  error_message?: string;
}

export interface GPUInfo {
  index: number;
  name: string;
  vram_total_gb: number;
  vram_used_gb: number;
  vram_free_gb: number;
  vram_percent: number;
  utilization: number;
  temperature: number | null;
  power_draw: number | null;
}

export interface HardwareInfo {
  cpu: {
    model: string;
    cores: number;
    threads: number;
    percent: number;
  };
  ram: {
    total_gb: number;
    used_gb: number;
    available_gb: number;
    percent: number;
  };
  gpus: GPUInfo[];
  platform: string;
  arch: string;
}

export interface RecommendedSettings {
  max_parallel_agents: number;
  ollama_model: string;
  context_window: number;
  hardware_profile: string | null;
  gpu_layers: number;
}

export interface ProviderInfo {
  current_provider: Provider;
  fallback_active: boolean;
  primary_provider: Provider;
  fallback_provider: Provider;
  current_model: string;
  max_parallel_agents: number;
  context_window: number;
  hardware_profile: string | null;
  auto_fallback_enabled: boolean;
  health: {
    claude: ProviderHealth;
    ollama: ProviderHealth;
  };
}

export interface ProviderSettings {
  primary_provider: Provider;
  fallback_provider: Provider;
  auto_fallback: boolean;
  ollama_model: string;
  max_parallel_agents: number;
  context_window: number;
}

/**
 * Detect GPU information using nvidia-smi
 */
async function detectGPUs(): Promise<GPUInfo[]> {
  const gpus: GPUInfo[] = [];

  try {
    // Try nvidia-smi for NVIDIA GPUs
    const result = execSync(
      'nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits',
      { encoding: 'utf-8', timeout: 10000 }
    );

    const lines = result.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 6) continue;

      try {
        const index = parseInt(parts[0], 10);
        const name = parts[1];
        const memoryTotal = parseFloat(parts[2]) / 1024; // MB to GB
        const memoryUsed = parseFloat(parts[3]) / 1024;
        const memoryFree = parseFloat(parts[4]) / 1024;
        const utilization = parseFloat(parts[5]);
        const temperature = parts[6] && parts[6] !== '[N/A]' ? parseFloat(parts[6]) : null;
        const powerDraw = parts[7] && parts[7] !== '[N/A]' ? parseFloat(parts[7]) : null;

        gpus.push({
          index,
          name,
          vram_total_gb: Math.round(memoryTotal * 100) / 100,
          vram_used_gb: Math.round(memoryUsed * 100) / 100,
          vram_free_gb: Math.round(memoryFree * 100) / 100,
          vram_percent: memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 1000) / 10 : 0,
          utilization: Math.round(utilization * 10) / 10,
          temperature,
          power_draw: powerDraw ? Math.round(powerDraw * 10) / 10 : null,
        });
      } catch (parseError) {
        console.warn('[provider-handlers] Failed to parse GPU line:', line, parseError);
      }
    }
  } catch (error) {
    // nvidia-smi not available or no NVIDIA GPU
    console.log('[provider-handlers] No NVIDIA GPU detected or nvidia-smi not available');
  }

  return gpus;
}

/**
 * Get CPU information
 */
function getCPUInfo(): { model: string; cores: number; threads: number; percent: number } {
  const cpus = os.cpus();
  const model = cpus.length > 0 ? cpus[0].model : 'Unknown';
  const cores = cpus.length;
  const threads = cpus.length;

  // Calculate CPU usage
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }
  const percent = Math.round((1 - totalIdle / totalTick) * 1000) / 10;

  return { model, cores, threads, percent };
}

/**
 * Get RAM information
 */
function getRAMInfo(): { total_gb: number; used_gb: number; available_gb: number; percent: number } {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    total_gb: Math.round((totalMem / (1024 ** 3)) * 100) / 100,
    used_gb: Math.round((usedMem / (1024 ** 3)) * 100) / 100,
    available_gb: Math.round((freeMem / (1024 ** 3)) * 100) / 100,
    percent: Math.round((usedMem / totalMem) * 1000) / 10,
  };
}

/**
 * Check Ollama health and available models
 */
async function checkOllamaHealth(ollamaModel: string): Promise<ProviderHealth> {
  const startTime = Date.now();

  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        provider: 'ollama',
        status: 'unavailable',
        model_available: false,
        error_message: `Ollama returned status ${response.status}`,
      };
    }

    const data = await response.json();
    const models = data.models || [];
    const modelNames = models.map((m: { name: string }) => m.name);

    // Check if the configured model is available
    const modelAvailable = modelNames.some((name: string) =>
      name === ollamaModel || name.startsWith(ollamaModel.split(':')[0])
    );

    return {
      provider: 'ollama',
      status: modelAvailable ? 'available' : 'degraded',
      model_available: modelAvailable,
      response_time_ms: Date.now() - startTime,
      error_message: modelAvailable ? undefined : `Model ${ollamaModel} not found. Available: ${modelNames.join(', ')}`,
    };
  } catch (error) {
    return {
      provider: 'ollama',
      status: 'unavailable',
      model_available: false,
      error_message: error instanceof Error ? error.message : 'Failed to connect to Ollama',
    };
  }
}

/**
 * Check Claude health using Claude Profile Manager
 * This properly checks if the user has valid authentication through profiles
 */
async function checkClaudeHealth(): Promise<ProviderHealth> {
  const startTime = Date.now();

  try {
    // Use Claude Profile Manager to check authentication
    const pm = getProfileManager();
    const activeProfile = pm.getActiveProfile();
    
    // Check if profile has valid authentication
    const hasAuth = pm.hasValidAuth();
    
    if (!hasAuth) {
      // Check if there's an API key in environment as fallback
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return {
          provider: 'claude',
          status: 'unavailable',
          model_available: false,
          error_message: 'No Claude authentication found. Please authenticate via Claude Profile or set ANTHROPIC_API_KEY.',
        };
      }
    }

    // Check if profile is rate limited
    const rateLimitStatus = pm.isProfileRateLimited(activeProfile.id);
    if (rateLimitStatus.limited) {
      const resetTime = rateLimitStatus.resetAt 
        ? new Date(rateLimitStatus.resetAt).toLocaleTimeString() 
        : 'unknown';
      return {
        provider: 'claude',
        status: 'degraded',
        model_available: true,
        response_time_ms: Date.now() - startTime,
        error_message: `Rate limited (${rateLimitStatus.type}). Resets at ${resetTime}`,
      };
    }

    // Try to make a lightweight API call to verify connectivity
    // Get the token from profile manager
    const profileEnv = pm.getActiveProfileEnv();
    const oauthToken = profileEnv.CLAUDE_CODE_OAUTH_TOKEN;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    // If we have auth but no token to test with, assume available
    // (the profile manager already validated auth)
    if (!oauthToken && !apiKey) {
      // Profile is authenticated via configDir, assume available
      return {
        provider: 'claude',
        status: 'available',
        model_available: true,
        response_time_ms: Date.now() - startTime,
        error_message: undefined,
      };
    }

    // Make a lightweight API call to check status
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    } else if (oauthToken) {
      headers['Authorization'] = `Bearer ${oauthToken}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    const responseTime = Date.now() - startTime;

    // Handle different response codes
    if (response.status === 200) {
      return {
        provider: 'claude',
        status: 'available',
        model_available: true,
        response_time_ms: responseTime,
      };
    }

    if (response.status === 429) {
      // Rate limited - this is DEGRADED, not unavailable!
      const retryAfter = response.headers.get('retry-after');
      return {
        provider: 'claude',
        status: 'degraded',
        model_available: true,
        response_time_ms: responseTime,
        error_message: `Rate limited${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      };
    }

    if (response.status === 401) {
      return {
        provider: 'claude',
        status: 'unavailable',
        model_available: false,
        response_time_ms: responseTime,
        error_message: 'Authentication failed. Please re-authenticate your Claude profile.',
      };
    }

    if (response.status === 503 || response.status === 502 || response.status === 500) {
      return {
        provider: 'claude',
        status: 'degraded',
        model_available: true,
        response_time_ms: responseTime,
        error_message: `Service temporarily unavailable (${response.status})`,
      };
    }

    if (response.status === 529) {
      return {
        provider: 'claude',
        status: 'degraded',
        model_available: true,
        response_time_ms: responseTime,
        error_message: 'API is overloaded',
      };
    }

    // Other errors - still degraded if we have auth
    return {
      provider: 'claude',
      status: 'degraded',
      model_available: true,
      response_time_ms: responseTime,
      error_message: `Unexpected response (${response.status})`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if we have valid auth even if the API call failed
    try {
      const pm = getProfileManager();
      if (pm.hasValidAuth()) {
        // We have auth, so it's degraded not unavailable
        if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
          return {
            provider: 'claude',
            status: 'degraded',
            model_available: true,
            error_message: 'Request timed out. Service may be slow.',
          };
        }
        
        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
          return {
            provider: 'claude',
            status: 'degraded',
            model_available: true,
            error_message: 'Cannot reach Anthropic API. Check internet connection.',
          };
        }

        return {
          provider: 'claude',
          status: 'degraded',
          model_available: true,
          error_message: `Health check error: ${errorMessage}`,
        };
      }
    } catch {
      // Profile manager error, fall through
    }

    return {
      provider: 'claude',
      status: 'unavailable',
      model_available: false,
      error_message: `Health check failed: ${errorMessage}`,
    };
  }
}

/**
 * Get recommended settings based on detected hardware
 */
function getRecommendedSettings(hardware: HardwareInfo): RecommendedSettings {
  const recommendations: RecommendedSettings = {
    max_parallel_agents: 12,
    ollama_model: 'llama3.1:8b-instruct-q4_K_M',
    context_window: 8192,
    hardware_profile: null,
    gpu_layers: -1, // Auto-detect
  };

  // Adjust based on RAM
  if (hardware.ram.total_gb < 16) {
    recommendations.max_parallel_agents = 2;
    recommendations.ollama_model = 'llama3.2:3b';
    recommendations.context_window = 4096;
    recommendations.hardware_profile = 'low_memory';
  } else if (hardware.ram.total_gb < 32) {
    recommendations.max_parallel_agents = 4;
    recommendations.context_window = 8192;
  } else if (hardware.ram.total_gb >= 64) {
    recommendations.max_parallel_agents = 12;
    recommendations.context_window = 16384;
    recommendations.hardware_profile = 'high_memory';
  }

  // Adjust based on GPU
  if (hardware.gpus.length > 0) {
    const totalVram = hardware.gpus.reduce((sum, gpu) => sum + gpu.vram_total_gb, 0);
    const gpuName = hardware.gpus[0].name.toLowerCase();

    if (totalVram >= 24) {
      recommendations.ollama_model = 'llama3.1:70b-instruct-q4_K_M';
      recommendations.context_window = 32768;
      recommendations.max_parallel_agents = Math.min(10, recommendations.max_parallel_agents);

      if (gpuName.includes('4090')) {
        recommendations.hardware_profile = 'rtx_4090';
      } else if (gpuName.includes('3090')) {
        recommendations.hardware_profile = 'rtx_3090';
      }
    } else if (totalVram >= 12) {
      recommendations.ollama_model = 'llama3.1:8b-instruct-q4_K_M';
      recommendations.context_window = 8192;
      recommendations.max_parallel_agents = Math.min(6, recommendations.max_parallel_agents);

      if (gpuName.includes('3080')) {
        recommendations.hardware_profile = 'rtx_3080_ti';
      } else if (gpuName.includes('4070')) {
        recommendations.hardware_profile = 'rtx_4070';
      }
    } else if (totalVram >= 8) {
      recommendations.ollama_model = 'qwen2.5-coder:7b';
      recommendations.context_window = 8192;
      recommendations.max_parallel_agents = Math.min(4, recommendations.max_parallel_agents);
    } else {
      recommendations.ollama_model = 'llama3.2:3b';
      recommendations.context_window = 4096;
      recommendations.max_parallel_agents = Math.min(2, recommendations.max_parallel_agents);
    }
  } else {
    // CPU only
    recommendations.hardware_profile = 'cpu_only';
    recommendations.max_parallel_agents = 2;
    recommendations.ollama_model = 'llama3.2:3b';
    recommendations.context_window = 4096;
    recommendations.gpu_layers = 0;
  }

  return recommendations;
}

/**
 * Load provider settings from settings file
 */
function loadProviderSettings(): Partial<ProviderSettings> {
  try {
    const settings = readSettingsFile();
    return {
      primary_provider: settings.aiProvider || 'claude',
      fallback_provider: settings.aiFallbackProvider || 'ollama',
      auto_fallback: settings.aiAutoFallback !== false,
      ollama_model: settings.ollamaModel || 'llama3.1:8b-instruct-q4_K_M',
      max_parallel_agents: settings.maxParallelAgents || 12,
      context_window: settings.ollamaContextWindow || 8192,
    };
  } catch {
    return {};
  }
}

/**
 * Save provider settings to settings file
 */
function saveProviderSettings(providerSettings: Partial<ProviderSettings>): boolean {
  try {
    const settingsPath = getSettingsPath();
    const currentSettings = readSettingsFile();

    const newSettings = {
      ...currentSettings,
      aiProvider: providerSettings.primary_provider,
      aiFallbackProvider: providerSettings.fallback_provider,
      aiAutoFallback: providerSettings.auto_fallback,
      ollamaModel: providerSettings.ollama_model,
      maxParallelAgents: providerSettings.max_parallel_agents,
      ollamaContextWindow: providerSettings.context_window,
    };

    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
    return true;
  } catch (error) {
    console.error('[provider-handlers] Failed to save provider settings:', error);
    return false;
  }
}

/**
 * Register provider management IPC handlers
 */
export function registerProviderHandlers(): void {
  // Get comprehensive provider information
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_INFO,
    async (): Promise<IPCResult<ProviderInfo>> => {
      try {
        const settings = loadProviderSettings();
        const ollamaModel = settings.ollama_model || 'llama3.1:8b-instruct-q4_K_M';

        const [claudeHealth, ollamaHealth] = await Promise.all([
          checkClaudeHealth(),
          checkOllamaHealth(ollamaModel),
        ]);

        // Determine current provider based on health and settings
        const primaryProvider = settings.primary_provider || 'claude';
        const fallbackProvider = settings.fallback_provider || 'ollama';
        const autoFallback = settings.auto_fallback !== false;

        let currentProvider = primaryProvider;
        let fallbackActive = false;

        // Check if we need to use fallback
        if (autoFallback) {
          const primaryHealth = primaryProvider === 'claude' ? claudeHealth : ollamaHealth;
          const fallbackHealth = fallbackProvider === 'claude' ? claudeHealth : ollamaHealth;

          if (primaryHealth.status === 'unavailable' && fallbackHealth.status !== 'unavailable') {
            currentProvider = fallbackProvider;
            fallbackActive = true;
          }
        }

        const result: ProviderInfo = {
          current_provider: currentProvider,
          fallback_active: fallbackActive,
          primary_provider: primaryProvider,
          fallback_provider: fallbackProvider,
          current_model: currentProvider === 'ollama' ? ollamaModel : 'claude-sonnet-4-20250514',
          max_parallel_agents: settings.max_parallel_agents || 12,
          context_window: settings.context_window || 8192,
          hardware_profile: null,
          auto_fallback_enabled: autoFallback,
          health: {
            claude: claudeHealth,
            ollama: ollamaHealth,
          },
        };

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get provider info',
        };
      }
    }
  );

  // Switch provider
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_SWITCH,
    async (_event, provider: Provider): Promise<IPCResult<void>> => {
      try {
        const currentSettings = loadProviderSettings();
        saveProviderSettings({
          ...currentSettings,
          primary_provider: provider,
        });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to switch provider',
        };
      }
    }
  );

  // Get hardware information
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_HARDWARE,
    async (): Promise<IPCResult<HardwareInfo>> => {
      try {
        const gpus = await detectGPUs();
        const cpu = getCPUInfo();
        const ram = getRAMInfo();

        const hardware: HardwareInfo = {
          cpu,
          ram,
          gpus,
          platform: os.platform(),
          arch: os.arch(),
        };

        return { success: true, data: hardware };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get hardware info',
        };
      }
    }
  );

  // Get recommended settings
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_RECOMMENDED_SETTINGS,
    async (): Promise<IPCResult<RecommendedSettings>> => {
      try {
        const gpus = await detectGPUs();
        const cpu = getCPUInfo();
        const ram = getRAMInfo();

        const hardware: HardwareInfo = {
          cpu,
          ram,
          gpus,
          platform: os.platform(),
          arch: os.arch(),
        };

        const recommendations = getRecommendedSettings(hardware);
        return { success: true, data: recommendations };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get recommended settings',
        };
      }
    }
  );

  // Save provider settings
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_SAVE_SETTINGS,
    async (_event, newSettings: Partial<ProviderSettings>): Promise<IPCResult<void>> => {
      try {
        const currentSettings = loadProviderSettings();
        saveProviderSettings({
          ...currentSettings,
          ...newSettings,
        });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save settings',
        };
      }
    }
  );

  // Get execution mode
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_MODE,
    async (): Promise<IPCResult<{ mode: string; config: Record<string, unknown> }>> => {
      try {
        const settings = readSettingsFile();
        return {
          success: true,
          data: {
            mode: settings.executionMode || 'hybrid',
            config: {
              preferLocal: settings.hybridPreferLocal !== false,
              fallbackEnabled: settings.hybridFallbackEnabled !== false,
              complexityThreshold: settings.hybridComplexityThreshold || 'moderate',
              autoSelectModel: settings.autoSelectModel !== false,
            },
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get execution mode',
        };
      }
    }
  );

  // Update execution mode
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_UPDATE_MODE,
    async (_event, mode: string): Promise<IPCResult<void>> => {
      try {
        const settingsPath = getSettingsPath();
        const currentSettings = readSettingsFile();
        const newSettings = {
          ...currentSettings,
          executionMode: mode,
        };
        fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update execution mode',
        };
      }
    }
  );

  // Update mode configuration
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_UPDATE_MODE_CONFIG,
    async (_event, config: Record<string, unknown>): Promise<IPCResult<void>> => {
      try {
        const settingsPath = getSettingsPath();
        const currentSettings = readSettingsFile();
        const newSettings = {
          ...currentSettings,
          hybridPreferLocal: config.preferLocal,
          hybridFallbackEnabled: config.fallbackEnabled,
          hybridComplexityThreshold: config.complexityThreshold,
          autoSelectModel: config.autoSelectModel,
        };
        fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update mode config',
        };
      }
    }
  );

  // Get installed Ollama models
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_OLLAMA_MODELS,
    async (): Promise<IPCResult<Array<{ name: string; size: string; modified: string }>>> => {
      try {
        const response = await fetch('http://localhost:11434/api/tags', {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          return {
            success: false,
            error: `Ollama returned status ${response.status}`,
          };
        }

        const data = await response.json();
        const models = (data.models || []).map((m: { name: string; size: number; modified_at: string }) => ({
          name: m.name,
          size: `${(m.size / (1024 ** 3)).toFixed(1)}GB`,
          modified: m.modified_at,
        }));

        return { success: true, data: models };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get Ollama models',
        };
      }
    }
  );

  // Analyze task complexity (placeholder - would need actual implementation)
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_ANALYZE_TASK_COMPLEXITY,
    async (_event, taskDescription: string): Promise<IPCResult<{ complexity: string; score: number; factors: string[] }>> => {
      try {
        // Simple heuristic-based complexity analysis
        const factors: string[] = [];
        let score = 0;

        // Check for complexity indicators
        if (taskDescription.length > 500) {
          score += 2;
          factors.push('Long description');
        }
        if (/multi[- ]?file|multiple files/i.test(taskDescription)) {
          score += 3;
          factors.push('Multi-file changes');
        }
        if (/architect|design|refactor/i.test(taskDescription)) {
          score += 4;
          factors.push('Architecture work');
        }
        if (/database|migration|schema/i.test(taskDescription)) {
          score += 3;
          factors.push('Database changes');
        }
        if (/api|endpoint|integration/i.test(taskDescription)) {
          score += 2;
          factors.push('API work');
        }
        if (/test|spec|coverage/i.test(taskDescription)) {
          score += 1;
          factors.push('Testing required');
        }
        if (/bug|fix|error/i.test(taskDescription)) {
          score -= 1;
          factors.push('Bug fix (simpler)');
        }

        let complexity: string;
        if (score <= 0) complexity = 'trivial';
        else if (score <= 2) complexity = 'simple';
        else if (score <= 5) complexity = 'moderate';
        else if (score <= 8) complexity = 'complex';
        else complexity = 'expert';

        return {
          success: true,
          data: { complexity, score, factors },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to analyze task',
        };
      }
    }
  );

  // Auto-select model based on task and hardware
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_AUTO_SELECT_MODEL,
    async (_event, taskComplexity: string): Promise<IPCResult<{ provider: string; model: string; reason: string }>> => {
      try {
        const gpus = await detectGPUs();
        const ram = getRAMInfo();
        const settings = loadProviderSettings();
        const executionMode = readSettingsFile().executionMode || 'hybrid';

        // If cloud only, always use Claude
        if (executionMode === 'cloud_only') {
          return {
            success: true,
            data: {
              provider: 'claude',
              model: 'claude-sonnet-4-20250514',
              reason: 'Cloud-only mode enabled',
            },
          };
        }

        // Check Ollama availability
        let ollamaAvailable = false;
        try {
          const response = await fetch('http://localhost:11434/api/tags', {
            method: 'GET',
            signal: AbortSignal.timeout(2000),
          });
          ollamaAvailable = response.ok;
        } catch {
          ollamaAvailable = false;
        }

        // If local only, must use Ollama
        if (executionMode === 'local_only') {
          if (!ollamaAvailable) {
            return {
              success: false,
              error: 'Local-only mode but Ollama is not available',
            };
          }
          
          // Check if task is too complex for local
          if (taskComplexity === 'expert' || taskComplexity === 'complex') {
            return {
              success: false,
              error: `Task complexity (${taskComplexity}) exceeds local model capabilities`,
            };
          }

          return {
            success: true,
            data: {
              provider: 'ollama',
              model: settings.ollama_model || 'llama3.1:8b-instruct-q4_K_M',
              reason: 'Local-only mode enabled',
            },
          };
        }

        // Hybrid or automatic mode - decide based on complexity
        const complexityThreshold = readSettingsFile().hybridComplexityThreshold || 'moderate';
        const complexityOrder = ['trivial', 'simple', 'moderate', 'complex', 'expert'];
        const taskIndex = complexityOrder.indexOf(taskComplexity);
        const thresholdIndex = complexityOrder.indexOf(complexityThreshold);

        // Use local if below threshold and Ollama is available
        if (ollamaAvailable && taskIndex <= thresholdIndex) {
          return {
            success: true,
            data: {
              provider: 'ollama',
              model: settings.ollama_model || 'llama3.1:8b-instruct-q4_K_M',
              reason: `Task complexity (${taskComplexity}) within local capabilities`,
            },
          };
        }

        // Use Claude for complex tasks
        return {
          success: true,
          data: {
            provider: 'claude',
            model: 'claude-sonnet-4-20250514',
            reason: `Task complexity (${taskComplexity}) requires cloud provider`,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to auto-select model',
        };
      }
    }
  );
}
