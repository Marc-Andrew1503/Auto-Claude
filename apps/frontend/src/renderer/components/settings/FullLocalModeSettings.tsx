import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Server, 
  Check, 
  AlertTriangle,
  Info,
  RefreshCw,
  Zap,
  Shield,
  ChevronDown,
  ChevronUp,
  Settings2,
  Cloud,
  CloudOff,
  Code,
  FileText,
  Lightbulb,
  Map,
  GitBranch,
  GitPullRequest,
  Terminal,
  MessageSquare,
  Cpu,
  Sparkles
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '../ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../ui/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../ui/tabs';

interface OllamaModel {
  name: string;
  size: string;
  modified: string;
}

// Task types that can have different models
type TaskType = 
  | 'spec_creation'
  | 'planning'
  | 'coding'
  | 'qa_review'
  | 'insights'
  | 'ideation'
  | 'roadmap'
  | 'github_issues'
  | 'github_prs'
  | 'utility'
  | 'terminal_naming';

interface TaskModelConfig {
  taskType: TaskType;
  name: string;
  description: string;
  icon: React.ElementType;
  defaultModel: string;
  recommendedModels: string[];
  complexity: 'low' | 'medium' | 'high';
}

interface LocalModelSettings {
  enabled: boolean;
  autoSelect: boolean;
  defaultModel: string;
  taskModels: Record<TaskType, string>;
}

interface FullLocalModeSettingsProps {
  className?: string;
}

// Task configurations with recommended models
const TASK_CONFIGS: TaskModelConfig[] = [
  {
    taskType: 'spec_creation',
    name: 'Spec Creation',
    description: 'Discovery, requirements, context gathering',
    icon: FileText,
    defaultModel: 'llama3.1:8b-instruct-q4_K_M',
    recommendedModels: ['llama3.1:8b', 'llama3.1:70b', 'qwen2.5:7b'],
    complexity: 'high',
  },
  {
    taskType: 'planning',
    name: 'Planning',
    description: 'Implementation planning and architecture',
    icon: Map,
    defaultModel: 'llama3.1:8b-instruct-q4_K_M',
    recommendedModels: ['llama3.1:8b', 'llama3.1:70b', 'deepseek-coder-v2:16b'],
    complexity: 'high',
  },
  {
    taskType: 'coding',
    name: 'Coding',
    description: 'Actual code implementation',
    icon: Code,
    defaultModel: 'qwen2.5-coder:7b',
    recommendedModels: ['qwen2.5-coder:7b', 'qwen2.5-coder:14b', 'deepseek-coder-v2:16b', 'codellama:13b'],
    complexity: 'high',
  },
  {
    taskType: 'qa_review',
    name: 'QA Review',
    description: 'Quality assurance and validation',
    icon: Check,
    defaultModel: 'llama3.1:8b-instruct-q4_K_M',
    recommendedModels: ['llama3.1:8b', 'qwen2.5-coder:7b'],
    complexity: 'medium',
  },
  {
    taskType: 'insights',
    name: 'Insights Chat',
    description: 'Ask questions about your codebase',
    icon: MessageSquare,
    defaultModel: 'llama3.1:8b-instruct-q4_K_M',
    recommendedModels: ['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b'],
    complexity: 'medium',
  },
  {
    taskType: 'ideation',
    name: 'Ideation',
    description: 'Generate feature ideas and improvements',
    icon: Lightbulb,
    defaultModel: 'llama3.1:8b-instruct-q4_K_M',
    recommendedModels: ['llama3.1:8b', 'llama3.1:70b'],
    complexity: 'high',
  },
  {
    taskType: 'roadmap',
    name: 'Roadmap',
    description: 'Create strategic feature roadmaps',
    icon: Map,
    defaultModel: 'llama3.1:8b-instruct-q4_K_M',
    recommendedModels: ['llama3.1:8b', 'llama3.1:70b'],
    complexity: 'high',
  },
  {
    taskType: 'github_issues',
    name: 'GitHub Issues',
    description: 'Automated issue triage and labeling',
    icon: GitBranch,
    defaultModel: 'llama3.2:3b',
    recommendedModels: ['llama3.2:3b', 'llama3.1:8b', 'mistral:7b'],
    complexity: 'low',
  },
  {
    taskType: 'github_prs',
    name: 'GitHub PR Review',
    description: 'AI-powered pull request reviews',
    icon: GitPullRequest,
    defaultModel: 'qwen2.5-coder:7b',
    recommendedModels: ['qwen2.5-coder:7b', 'llama3.1:8b', 'deepseek-coder-v2:16b'],
    complexity: 'medium',
  },
  {
    taskType: 'utility',
    name: 'Utility',
    description: 'Commit messages and merge conflict resolution',
    icon: Terminal,
    defaultModel: 'llama3.2:3b',
    recommendedModels: ['llama3.2:3b', 'phi3:mini', 'mistral:7b'],
    complexity: 'low',
  },
  {
    taskType: 'terminal_naming',
    name: 'Terminal Naming',
    description: 'Automatically name terminals based on commands',
    icon: Terminal,
    defaultModel: 'llama3.2:3b',
    recommendedModels: ['llama3.2:3b', 'phi3:mini'],
    complexity: 'low',
  },
];

// Get smart default model based on available models and task complexity
function getSmartDefault(
  taskConfig: TaskModelConfig, 
  availableModels: OllamaModel[],
  vramGb: number
): string {
  const modelNames = availableModels.map(m => m.name);
  
  // Try recommended models in order
  for (const recommended of taskConfig.recommendedModels) {
    const match = modelNames.find(m => 
      m === recommended || 
      m.startsWith(recommended.split(':')[0])
    );
    if (match) {
      // Check if model fits in VRAM (rough estimate)
      const modelSize = parseFloat(availableModels.find(m => m.name === match)?.size || '0');
      if (modelSize <= vramGb * 0.8) { // Leave 20% headroom
        return match;
      }
    }
  }
  
  // Fallback based on complexity and VRAM
  if (taskConfig.complexity === 'low') {
    // Find smallest model
    const small = modelNames.find(m => 
      m.includes('3b') || m.includes('mini') || m.includes('phi')
    );
    if (small) return small;
  }
  
  if (taskConfig.complexity === 'high' && vramGb >= 12) {
    // Find a capable model
    const capable = modelNames.find(m => 
      m.includes('8b') || m.includes('7b') || m.includes('coder')
    );
    if (capable) return capable;
  }
  
  // Return first available model as last resort
  return modelNames[0] || 'llama3.1:8b';
}

export function FullLocalModeSettings({ className }: FullLocalModeSettingsProps) {
  const { t } = useTranslation();
  
  // State
  const [settings, setSettings] = useState<LocalModelSettings>({
    enabled: false,
    autoSelect: true,
    defaultModel: 'llama3.1:8b-instruct-q4_K_M',
    taskModels: {} as Record<TaskType, string>,
  });
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [vramGb, setVramGb] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  
  // Load initial data
  useEffect(() => {
    loadData();
  }, []);
  
  // Auto-select models when switching to auto mode or when models change
  useEffect(() => {
    if (settings.autoSelect && ollamaModels.length > 0) {
      autoSelectModels();
    }
  }, [settings.autoSelect, ollamaModels, vramGb]);
  
  const loadData = async () => {
    setLoading(true);
    try {
      // Load current settings
      const appSettings = await window.electronAPI?.settings?.get?.();
      if (appSettings) {
        setSettings({
          enabled: appSettings.fullLocalMode ?? false,
          autoSelect: appSettings.localModelAutoSelect ?? true,
          defaultModel: appSettings.fullLocalModel ?? appSettings.ollamaModel ?? 'llama3.1:8b-instruct-q4_K_M',
          taskModels: appSettings.localTaskModels ?? {},
        });
        setActiveTab(appSettings.localModelAutoSelect !== false ? 'auto' : 'manual');
      }
      
      // Load hardware info for VRAM
      const hwResult = await window.electronAPI?.provider?.getHardware?.();
      if (hwResult?.success && hwResult.data?.gpus?.[0]) {
        setVramGb(hwResult.data.gpus[0].vram_total_gb || 0);
      }
      
      // Load Ollama models
      const modelsResult = await window.electronAPI?.provider?.getOllamaModels?.();
      if (modelsResult?.success && modelsResult.data) {
        setOllamaModels(modelsResult.data);
        setOllamaAvailable(true);
      } else {
        setOllamaAvailable(false);
      }
    } catch (error) {
      console.error('Failed to load full local mode settings:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const autoSelectModels = () => {
    const newTaskModels: Record<TaskType, string> = {} as Record<TaskType, string>;
    
    for (const config of TASK_CONFIGS) {
      newTaskModels[config.taskType] = getSmartDefault(config, ollamaModels, vramGb);
    }
    
    setSettings(prev => ({
      ...prev,
      taskModels: newTaskModels,
    }));
  };
  
  const handleToggleFullLocalMode = async (enabled: boolean) => {
    setSaving(true);
    try {
      const newSettings = {
        ...settings,
        enabled,
      };
      setSettings(newSettings);
      
      await window.electronAPI?.settings?.set?.({
        fullLocalMode: enabled,
        fullLocalModel: settings.defaultModel,
        localModelAutoSelect: settings.autoSelect,
        localTaskModels: settings.taskModels,
        executionMode: enabled ? 'local_only' : 'hybrid',
      });
    } catch (error) {
      console.error('Failed to toggle full local mode:', error);
    } finally {
      setSaving(false);
    }
  };
  
  const handleAutoSelectChange = async (auto: boolean) => {
    setSettings(prev => ({ ...prev, autoSelect: auto }));
    setActiveTab(auto ? 'auto' : 'manual');
    
    if (auto) {
      autoSelectModels();
    }
    
    try {
      await window.electronAPI?.settings?.set?.({
        localModelAutoSelect: auto,
      });
    } catch (error) {
      console.error('Failed to save auto select setting:', error);
    }
  };
  
  const handleTaskModelChange = async (taskType: TaskType, model: string) => {
    const newTaskModels = {
      ...settings.taskModels,
      [taskType]: model,
    };
    
    setSettings(prev => ({
      ...prev,
      taskModels: newTaskModels,
    }));
    
    try {
      await window.electronAPI?.settings?.set?.({
        localTaskModels: newTaskModels,
      });
    } catch (error) {
      console.error('Failed to save task model:', error);
    }
  };
  
  const handleDefaultModelChange = async (model: string) => {
    setSettings(prev => ({ ...prev, defaultModel: model }));
    
    try {
      await window.electronAPI?.settings?.set?.({
        fullLocalModel: model,
        ollamaModel: model,
      });
    } catch (error) {
      console.error('Failed to save default model:', error);
    }
  };
  
  // Group models by family for dropdown
  const groupedModels = ollamaModels.reduce((acc, model) => {
    const family = model.name.split(':')[0];
    if (!acc[family]) {
      acc[family] = [];
    }
    acc[family].push(model);
    return acc;
  }, {} as Record<string, OllamaModel[]>);
  
  // Get complexity badge color
  const getComplexityColor = (complexity: 'low' | 'medium' | 'high') => {
    switch (complexity) {
      case 'low': return 'bg-green-500/20 text-green-400';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400';
      case 'high': return 'bg-red-500/20 text-red-400';
    }
  };
  
  // Model selector component
  const ModelSelector = ({ 
    value, 
    onChange, 
    taskConfig 
  }: { 
    value: string; 
    onChange: (v: string) => void;
    taskConfig?: TaskModelConfig;
  }) => (
    <Select value={value} onValueChange={onChange} disabled={!ollamaAvailable}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(groupedModels).map(([family, models]) => (
          <SelectGroup key={family}>
            <SelectLabel className="text-xs uppercase text-gray-500">
              {family}
            </SelectLabel>
            {models.map((model) => {
              const isRecommended = taskConfig?.recommendedModels.some(r => 
                model.name === r || model.name.startsWith(r.split(':')[0])
              );
              return (
                <SelectItem key={model.name} value={model.name}>
                  <div className="flex items-center gap-2">
                    <span>{model.name}</span>
                    <span className="text-xs text-gray-500">{model.size}</span>
                    {isRecommended && (
                      <span className="text-xs text-green-400">★</span>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
  
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <CloudOff className="h-5 w-5 text-blue-400" />
            Full Local Mode
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Replace ALL cloud AI models with local Ollama models
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>
      
      {/* Main Toggle */}
      <div className={cn(
        'p-4 rounded-lg border-2 transition-all',
        settings.enabled 
          ? 'bg-blue-500/10 border-blue-500/30' 
          : 'bg-gray-800/50 border-gray-700'
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              settings.enabled ? 'bg-blue-500/20' : 'bg-gray-700'
            )}>
              <Server className={cn(
                'h-5 w-5',
                settings.enabled ? 'text-blue-400' : 'text-gray-400'
              )} />
            </div>
            <div>
              <div className="font-medium text-white">Enable Full Local Mode</div>
              <div className="text-sm text-gray-400">
                All AI operations will use local Ollama models
              </div>
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={handleToggleFullLocalMode}
            disabled={!ollamaAvailable || loading || saving}
          />
        </div>
        
        {!ollamaAvailable && !loading && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Ollama Not Available</AlertTitle>
            <AlertDescription>
              Please start Ollama to enable Full Local Mode.
            </AlertDescription>
          </Alert>
        )}
      </div>
      
      {/* Hardware Info */}
      {vramGb > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
          <Cpu className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-400">
            Detected {vramGb.toFixed(1)} GB VRAM • 
            {vramGb >= 24 ? ' Can run large models (70B)' :
             vramGb >= 12 ? ' Can run medium models (8-14B)' :
             vramGb >= 8 ? ' Can run small models (3-7B)' :
             ' Limited to tiny models'}
          </span>
        </div>
      )}
      
      {/* Model Configuration Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => handleAutoSelectChange(v === 'auto')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="auto" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Smart Auto-Select
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Manual Configuration
          </TabsTrigger>
        </TabsList>
        
        {/* Auto Mode */}
        <TabsContent value="auto" className="mt-4 space-y-4">
          <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-green-400 mt-0.5" />
              <div>
                <div className="font-medium text-white">Smart Model Selection</div>
                <p className="text-sm text-gray-400 mt-1">
                  Models are automatically selected based on task complexity and your 
                  available hardware ({vramGb.toFixed(1)} GB VRAM).
                </p>
              </div>
            </div>
          </div>
          
          {/* Show auto-selected models */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-white">Auto-Selected Models:</div>
            <div className="grid gap-2">
              {TASK_CONFIGS.map((config) => {
                const Icon = config.icon;
                const selectedModel = settings.taskModels[config.taskType] || config.defaultModel;
                return (
                  <div 
                    key={config.taskType}
                    className="flex items-center justify-between p-2 rounded bg-gray-800/50"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-300">{config.name}</span>
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-xs',
                        getComplexityColor(config.complexity)
                      )}>
                        {config.complexity}
                      </span>
                    </div>
                    <span className="text-sm text-blue-400 font-mono">
                      {selectedModel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={autoSelectModels}
            className="w-full"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Re-calculate Optimal Models
          </Button>
        </TabsContent>
        
        {/* Manual Mode */}
        <TabsContent value="manual" className="mt-4 space-y-4">
          <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
            <div className="flex items-start gap-3">
              <Settings2 className="h-5 w-5 text-yellow-400 mt-0.5" />
              <div>
                <div className="font-medium text-white">Manual Configuration</div>
                <p className="text-sm text-gray-400 mt-1">
                  Choose specific models for each task type. 
                  ★ indicates recommended models for that task.
                </p>
              </div>
            </div>
          </div>
          
          {/* Default Model */}
          <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Server className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-white">Default Model</span>
              <span className="text-xs text-gray-500">(fallback for all tasks)</span>
            </div>
            <ModelSelector 
              value={settings.defaultModel} 
              onChange={handleDefaultModelChange}
            />
          </div>
          
          {/* Per-Task Configuration */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Per-Task Model Configuration
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              {/* Agent Phases */}
              <div className="text-xs uppercase text-gray-500 mt-4 mb-2">Agent Phases</div>
              {TASK_CONFIGS.filter(c => 
                ['spec_creation', 'planning', 'coding', 'qa_review'].includes(c.taskType)
              ).map((config) => {
                const Icon = config.icon;
                return (
                  <div key={config.taskType} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-white">{config.name}</span>
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-xs',
                          getComplexityColor(config.complexity)
                        )}>
                          {config.complexity}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{config.description}</p>
                    <ModelSelector
                      value={settings.taskModels[config.taskType] || config.defaultModel}
                      onChange={(v) => handleTaskModelChange(config.taskType, v)}
                      taskConfig={config}
                    />
                  </div>
                );
              })}
              
              {/* Features */}
              <div className="text-xs uppercase text-gray-500 mt-4 mb-2">Features</div>
              {TASK_CONFIGS.filter(c => 
                ['insights', 'ideation', 'roadmap'].includes(c.taskType)
              ).map((config) => {
                const Icon = config.icon;
                return (
                  <div key={config.taskType} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-white">{config.name}</span>
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-xs',
                          getComplexityColor(config.complexity)
                        )}>
                          {config.complexity}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{config.description}</p>
                    <ModelSelector
                      value={settings.taskModels[config.taskType] || config.defaultModel}
                      onChange={(v) => handleTaskModelChange(config.taskType, v)}
                      taskConfig={config}
                    />
                  </div>
                );
              })}
              
              {/* GitHub & Utility */}
              <div className="text-xs uppercase text-gray-500 mt-4 mb-2">GitHub & Utility</div>
              {TASK_CONFIGS.filter(c => 
                ['github_issues', 'github_prs', 'utility', 'terminal_naming'].includes(c.taskType)
              ).map((config) => {
                const Icon = config.icon;
                return (
                  <div key={config.taskType} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-white">{config.name}</span>
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-xs',
                          getComplexityColor(config.complexity)
                        )}>
                          {config.complexity}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{config.description}</p>
                    <ModelSelector
                      value={settings.taskModels[config.taskType] || config.defaultModel}
                      onChange={(v) => handleTaskModelChange(config.taskType, v)}
                      taskConfig={config}
                    />
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>
      </Tabs>
      
      {/* Status indicator */}
      {settings.enabled && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <Shield className="h-4 w-4 text-green-400" />
          <span className="text-sm text-green-400">
            Full Local Mode is active. All AI operations are running locally.
          </span>
        </div>
      )}
    </div>
  );
}

export default FullLocalModeSettings;
