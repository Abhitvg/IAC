/**
 * Temporal Workflow & Unattended Scheduler Domain Types
 */

import { SprintChannel, SprintConfig, SprintMetrics, SprintReport, SprintRun } from '../sprint/types';

export interface SprintWorkflowInput {
  tenantId: string;
  sprintId: string;
  config: SprintConfig;
  targetDurationHours: number;
}

export interface WaveExecutionResult {
  waveType: 'discovery' | 'apply' | 'outreach' | 'inbox' | 'rebalance';
  success: boolean;
  itemsProcessed: number;
  itemsFailed: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface SprintWorkflowState {
  sprintId: string;
  tenantId: string;
  status: 'active' | 'paused' | 'completed' | 'aborted';
  elapsedHours: number;
  remainingHours: number;
  wavesExecuted: number;
  activePausedChannels: SprintChannel[];
  lastAutoPauseCheck?: string;
  report?: SprintReport;
}

