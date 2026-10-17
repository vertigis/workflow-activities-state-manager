import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

/**
 * Workflow execution mode.
 */
export type EngineMode =
    | "INSTANCE"
    | "TOKEN";

/**
 * Valid instance/token statuses.
 */
export type RuntimeStatus =
    | "Running"
    | "Waiting"
    | "Completed"
    | "Failed"
    | "Cancelled"
    | "Active";

export type TokenOutcome =
    | "SUCCESS"
    | "FAILED"
    | "CANCELLED"
    | "SKIPPED";

/**
 * Supported workflow state types.
 */
export type StateType =
    | "handler"
    | "join"
    | "terminal"
    | "parallel";

/**
 * Controls whether a state may execute in
 * instance mode, token mode, or both.
 */
export type StateScope =
    | "instance"
    | "token"
    | "both";

/**
 * Generic variable collection used throughout
 * the workflow engine.
 */
export type WorkflowVars =
    Record<string, any>;

/**
 * Handler wait information.
 */
export interface WaitResult {
    reasonCode?: string;
    details?: any;
    resumeHint?: any;
}

/**
 * Handler response contract.
 */
export interface HandlerResult {
    result: {
        output: {
            outcome: string;
            vars?: WorkflowVars;
            wait?: WaitResult;
            nextState?: string;
            completed?: boolean;
            errors?: any[];
        };
    };
}

export type HandlerInvoker = (
    url: string,
    handlerInputs: WorkflowVars
) => Promise<HandlerResult>;

/**
 * Parallel branch definition.
 */
export interface BranchDef {
    branchKey: string;
    state: string;
    varsDelta?: WorkflowVars;
}

/**
 * Transition definitions.
 */
export interface SingleTransition {
    type?: "single";
    nextState: string;
}

export interface ParallelTransition {
    type: "parallel";
}

export type TransitionDef =
    | string
    | SingleTransition
    | ParallelTransition;

/**
 * Workflow state definition.
 */
export interface StateDef {
    type: StateType;

    url?: string;
    parameters?: WorkflowVars;

    transitions?: Record<string, TransitionDef>;

    // Join state
    join?: string;
    mode?: "all" | "any" | "quorum";
    quorumN?: number;
    onComplete?: string;

    // Execution scope
    scope?: StateScope;

    // Parallel state
    branches?: BranchDef[];
}

/**
 * Workflow configuration.
 */
export interface EngineConfig {
    processKey: string;
    version?: string;
    startState: string;
    states: Record<string, StateDef>;
}

/**
 * Database/layer field mappings.
 */
export interface TableMapping {

    // Instance fields
    instanceIdField?: string;
    processKeyField?: string;
    currentStateField?: string;
    statusField?: string;
    varsJsonField?: string;

    // Token fields
    tokenIdField?: string;
    tokenInstanceIdField?: string;
    branchKeyField?: string;
    tokenStateField?: string;
    tokenStatusField?: string;
    tokenOutcomeField?: string;
    joinGroupField?: string;

    // History fields
    historyInstanceIdField?: string;
    historyTokenIdField?: string;
    historyTimestampField?: string;
    historyStateField?: string;
    historyEventTypeField?: string;
    historyDetailsJsonField?: string;

    // Business record fields
    targetInstanceIdField?: string;
}




/**
 * Active runtime state.
 */
export interface EngineRuntime {

    instanceId: string;
    tokenId?: string;

    runtimeMode: EngineMode;

    instanceObj: Record<string, any>;
    tokenObj?: Record<string, any>;

    varsObj: WorkflowVars;

    currentState: string;
    currentStatus: RuntimeStatus;

    stateDef: StateDef;

    stepsExecuted: number;
}



/**
 * Result returned by a handler state.
 */
export interface ExecuteHandlerResult {
    continueExecution: boolean;
    joinSatisfied: boolean;
}

/**
 * Join evaluation summary.
 */
export interface JoinEvaluationResult {
    total: number;
    joined: number;
    failed: number;
    cancelled: number;
    waiting: number;
    active: number;
    joinSatisfied: boolean;
}

/**
 * Engine execution arguments.
 */
export interface EngineRunArgs {

    processKey: string;

    instanceId?: string;
    tokenId?: string;

    initialVars?: WorkflowVars;
    maxSteps?: number;

    config: EngineConfig | string;

    tokenLayer?: FeatureLayer;
    instanceLayer?: FeatureLayer;
    historyLayer?: FeatureLayer;

    tables: TableMapping;

    invokeHandler: HandlerInvoker;

    context?: any;

    persistState?: boolean;
}

/**
 * Engine execution result.
 */
export interface EngineRunResult {

    instanceId: string;
    tokenId?: string;

    mode: EngineMode;

    status: RuntimeStatus;
    state: string;

    stepsExecuted: number;

    joinSatisfied?: boolean;
}

/**
 * History event names.
 */
export type HistoryEventType =
    | "INSTANCE_CREATED"
    | "STATE_ENTER"
    | "STATE_EXIT"
    | "INSTANCE_TRANSITION"
    | "TOKEN_TRANSITION"
    | "INSTANCE_COMPLETED"
    | "TOKEN_COMPLETED"
    | "INSTANCE_WAIT"
    | "TOKEN_WAIT"
    | "INSTANCE_RESUME"
    | "TOKEN_RESUME"
    | "PARALLEL_SPAWN"
    | "TOKEN_SPAWN"
    | "JOIN_EVAL"
    | "JOIN_SATISFIED"
    | "TOKEN_STOP"
    | "INSTANCE_STOP"
    | "MAX_STEPS_REACHED"
    | "SCOPE_MISMATCH";