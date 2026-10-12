/**
 * Agent Execution Permission Decision Contracts and Auto-Allow Policies
 */
import { ToolRiskLevel } from './tools';
export type PermissionAction = 'allow_once' | 'allow_session' | 'reject';
export interface PermissionRequest {
    id: string;
    sessionId: string;
    toolName: string;
    description: string;
    command?: string;
    riskLevel: ToolRiskLevel;
    autoAllowEligible?: boolean;
    timestamp: number;
}
export interface PermissionDecision {
    requestId: string;
    decision: PermissionAction;
    reason?: string;
}
export interface AutoAllowPolicy {
    allowedCommands: string[];
    sessionGrantedCommands: Set<string> | string[];
}
export declare const DEFAULT_AUTO_ALLOW_COMMANDS: readonly string[];
export declare function isCommandAutoAllowed(command: string, customAllowedList?: string[]): boolean;
