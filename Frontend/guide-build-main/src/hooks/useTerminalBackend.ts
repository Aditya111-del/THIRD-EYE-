import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AIAnalysisResult,
  AIErrorDetectedEvent,
  TerminalSessionInfo,
  TerminalSpawnConfig,
} from '../types/electron';

export interface UseTerminalBackendOptions {
  autoSpawn?: boolean;
  spawnConfig?: TerminalSpawnConfig;
  onData?: (data: string) => void;
  onExit?: (info: { exitCode: number; signal?: number | undefined }) => void;
  onErrorDetected?: (event: AIErrorDetectedEvent) => void;
}

export function useTerminalBackend(options: UseTerminalBackendOptions = {}) {
  const { autoSpawn = true, spawnConfig, onData, onExit, onErrorDetected } = options;

  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [lastErrorDetected, setLastErrorDetected] = useState<AIErrorDetectedEvent | null>(null);
  const [isElectron, setIsElectron] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = terminalId;

  // Check if running inside Electron desktop environment
  useEffect(() => {
    const hasElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
    setIsElectron(hasElectron);

    if (!hasElectron) {
      console.warn(
        '[useTerminalBackend] window.electronAPI not found. Running in browser preview/mock mode.'
      );
    }
  }, []);

  // Spawn terminal session
  const spawnTerminal = useCallback(
    async (config?: TerminalSpawnConfig) => {
      if (!window.electronAPI) {
        // Mock session in browser environment (standalone preview)
        const mockId = `mock-term-${Date.now()}`;
        setTerminalId(mockId);
        setIsReady(true);
        return { success: true, id: mockId, shell: 'mock-sh', cwd: '/workspace' };
      }

      try {
        const res = await window.electronAPI.terminal.spawn(config || spawnConfig);
        if (res.success && res.id) {
          setTerminalId(res.id);
          setIsReady(true);
          // Refresh sessions list
          const activeSessions = await window.electronAPI.terminal.list();
          setSessions(activeSessions);
          return res;
        } else {
          console.error('[useTerminalBackend] Spawn failed:', res.error);
          return res;
        }
      } catch (err: any) {
        console.error('[useTerminalBackend] Spawn error:', err);
        return { success: false, error: err.message };
      }
    },
    [spawnConfig]
  );

  // Send keystrokes or input text to active terminal
  const write = useCallback(
    (data: string, targetId?: string) => {
      const id = targetId || activeIdRef.current;
      if (!id) return;

      if (window.electronAPI) {
        window.electronAPI.terminal.write(id, data);
      } else {
        // Browser mock: echo if needed
        console.log('[Mock Terminal Write]:', data);
      }
    },
    []
  );

  // Convenience helper to write a command and press Enter
  const runCommand = useCallback(
    (cmd: string, targetId?: string) => {
      write(`${cmd.trim()}\r`, targetId);
    },
    [write]
  );

  // Resize active terminal
  const resize = useCallback(
    (cols: number, rows: number, targetId?: string) => {
      const id = targetId || activeIdRef.current;
      if (!id || !window.electronAPI) return;
      window.electronAPI.terminal.resize(id, cols, rows);
    },
    []
  );

  // Kill terminal session
  const kill = useCallback(
    async (targetId?: string) => {
      const id = targetId || activeIdRef.current;
      if (!id) return false;

      if (window.electronAPI) {
        const res = await window.electronAPI.terminal.kill(id);
        const activeSessions = await window.electronAPI.terminal.list();
        setSessions(activeSessions);
        if (id === activeIdRef.current) {
          setTerminalId(activeSessions[0]?.id || null);
        }
        return res.success;
      } else {
        setTerminalId(null);
        return true;
      }
    },
    []
  );

  // Trigger AI root cause log analysis
  const analyze = useCallback(
    async (customPrompt?: string, targetId?: string) => {
      const id = targetId || activeIdRef.current;
      if (!id) {
        return null;
      }

      setIsAnalyzing(true);

      if (!window.electronAPI) {
        // Browser mock response for UI design preview
        const mockResult: AIAnalysisResult = {
          success: true,
          explanation:
            'Mock Analysis: Detected port conflict on 8080. The service failed to bind socket.',
          suggested_command: 'kill -9 $(lsof -t -i:8080)',
          severity: 'high',
          root_cause: 'Port 8080 already occupied',
          timestamp: Date.now(),
        };
        setTimeout(() => {
          setAiAnalysis(mockResult);
          setIsAnalyzing(false);
        }, 800);
        return mockResult;
      }

      try {
        const result = await window.electronAPI.ai.analyze({
          terminalId: id,
          customPrompt,
          logCount: 150,
        });

        setAiAnalysis(result);
        return result;
      } catch (err: any) {
        const errResult: AIAnalysisResult = {
          success: false,
          explanation: `Analysis failed: ${err.message}`,
          suggested_command: '',
          severity: 'high',
          timestamp: Date.now(),
        };
        setAiAnalysis(errResult);
        return errResult;
      } finally {
        setIsAnalyzing(false);
      }
    },
    []
  );

  // Send an interactive chat message with terminal context
  const chatWithAI = useCallback(
    async (
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
      targetId?: string
    ) => {
      const id = targetId || activeIdRef.current;
      if (!id || !window.electronAPI) {
        return { success: false, reply: 'AI chat unavailable in preview mode.' };
      }
      return await window.electronAPI.ai.chat({ terminalId: id, messages });
    },
    []
  );

  // Clear current AI analysis
  const clearAnalysis = useCallback(() => {
    setAiAnalysis(null);
  }, []);

  // Dismiss error notification alert
  const dismissErrorAlert = useCallback(() => {
    setLastErrorDetected(null);
  }, []);

  // Setup IPC listeners when running in Electron
  useEffect(() => {
    if (!window.electronAPI) return;

    // Listen to incoming terminal data
    const unsubscribeData = window.electronAPI.terminal.onData((payload) => {
      if (payload.id === activeIdRef.current) {
        if (onData) onData(payload.data);
      }
    });

    // Listen to terminal exit
    const unsubscribeExit = window.electronAPI.terminal.onExit((payload) => {
      if (onExit && payload.id === activeIdRef.current) {
        onExit({
          exitCode: payload.exitCode,
          ...(payload.signal !== undefined ? { signal: payload.signal } : {}),
        });
      }
      // Refresh active sessions
      window.electronAPI?.terminal.list().then((list) => setSessions(list));
    });

    // Listen to AI automated error detection
    const unsubscribeError = window.electronAPI.ai.onErrorDetected((event) => {
      setLastErrorDetected(event);
      if (onErrorDetected) onErrorDetected(event);
    });

    return () => {
      unsubscribeData();
      unsubscribeExit();
      unsubscribeError();
    };
  }, [onData, onExit, onErrorDetected]);

  // Initial Auto-spawn
  useEffect(() => {
    if (autoSpawn && !terminalId) {
      spawnTerminal();
    }
  }, [autoSpawn, terminalId, spawnTerminal]);

  return {
    terminalId,
    setTerminalId,
    sessions,
    isReady,
    isElectron,
    isAnalyzing,
    aiAnalysis,
    lastErrorDetected,
    spawnTerminal,
    write,
    runCommand,
    resize,
    kill,
    analyze,
    chatWithAI,
    clearAnalysis,
    dismissErrorAlert,
  };
}
