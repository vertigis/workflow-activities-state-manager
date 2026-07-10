import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Graphic from "@arcgis/core/Graphic";

export type EngineMode = "INSTANCE" | "TOKEN";

export type RuntimeStatus = "Running" | "Waiting" | "Completed" | "Failed" | "Cancelled" | "Active"; // token uses Active

export interface HandlerResult {
    result: {
        output: {
            outcome: string;
            vars?: Record<string, any>; // shared vars delta
            branchVars?: Record<string, any>; // token-local vars delta (stored in token delta json)
            wait?: { reasonCode?: string; details?: any; resumeHint?: any };
            nextState?: string | null;
            errors?: any[];
        }
    }
}

export interface StateDef {
    type: "handler" | "join" | "terminal";
    handler?: string;
    url: string;
    parameters?: Record<string, any>;
    transitions?: Record<string, any>; // string or object {type:..., ...}
    // join-only:
    joinGroup?: string;
    mode?: "all" | "any" | "quorum";
    quorumN?: number;
    onComplete?: string;
    // optional scope (recommended, but not required):
    scope?: "instance" | "token" | "both";
}

export interface EngineConfig {
    processKey: string;
    version?: string;
    startState: string;
    states: Record<string, StateDef>;
}

//
// Table/field mapping – adjust once and keep engine generic.
//
export interface TableMapping {
    // Instance fields (defaults match earlier pseudocode)
    instanceIdField?: string; // default: "InstanceId"
    processKeyField?: string; // default: "ProcessKey"
    currentStateField?: string; // default: "CurrentState"
    statusField?: string; // default: "Status"
    varsJsonField?: string; // default: "VarsJson"

    // Token fields (defaults aligned to your sample)
    tokenIdField?: string; // default: "TokenId"
    tokenInstanceIdField?: string; // default: "InstanceId"
    branchKeyField?: string; // default: "BranchKey"
    tokenStateField?: string; // default: "State"
    tokenStatusField?: string; // default: "Status"
    joinGroupField?: string; // default: "JoinGroup"
    tokenDeltaJsonField?: string; // default: "ParamsDeltaJson" (your sample) or "VarsDeltaJson"

    // History fields
    historyInstanceIdField?: string; // default: "InstanceId"
    historyTokenIdField?: string; // default: "TokenId"
    historyTimestampField?: string; // default: "TimestampUtc"
    historyStateField?: string; // default: "State"
    historyEventTypeField?: string; // default: "EventType"
    historyDetailsJsonField?: string; // default: "DetailsJson"

    // Target Fields
    targetInstanceIdField?: string; // default: "WorkflowInstanceId"
}

export interface EngineRunArgs {
    processKey: string;
    instanceId?: string | null;
    tokenId?: string | null;
    initialVars?: Record<string, any> | null;
    maxSteps?: number;

    // Config can be object or string (optionally with comments)
    config: EngineConfig | string;
    tokenLayer: FeatureLayer;
    instanceLayer: FeatureLayer;
    historyLayer: FeatureLayer;
    tables: TableMapping;
    // Handler invoker must be provided by the activity (SDK-dependent).
    // It should execute the handler workflow/subworkflow by name and return the HandlerResult.
    invokeHandler: (
        url: string,
        handlerInputs: Record<string, any>
    ) => Promise<HandlerResult>;
    // optional runtime context for diagnostics
    context?: any;
    persistState?: boolean; // default true

}

export interface EngineRunResult {
    instanceId: string;
    tokenId: string | null;
    mode: EngineMode;
    status: string; // instance Status or token Status
    state: string; // current state name
    outcome: string | null;
    stepsExecuted: number;
}

//
// Utility helpers
//

function guid(): string {
    // Works in modern runtimes. If not available, replace with a UUID library.
    const g = (globalThis as any)?.crypto?.randomUUID?.();
    return g ? `{${g.toUpperCase()}}` : `{${Math.random().toString(16).slice(2)}-${Date.now()}}`;
}

function nowUtc(): number {
    return new Date().getTime();
}

/** Strip // and /* *\/ comments from JSON-ish strings. */
function stripJsonComments(json: string): string {
    // remove /* ... */ first
    const noBlock = json.replace(/\/\*[\s\S]*?\*\//g, "");
    // remove //... to end of line
    return noBlock.replace(/(^|\s)\/\/.*$/gm, "");
}

function parseConfig(config: EngineConfig | string): EngineConfig {
    if (typeof config === "string") {
        const cleaned = stripJsonComments(config).trim();
        return JSON.parse(cleaned) as EngineConfig;
    }
    return config;
}

function isPlainObject(val: any): val is Record<string, any> {
    if (val === null || typeof val !== "object") return false;
    const proto = Object.getPrototypeOf(val);
    return proto === Object.prototype || proto === null;
}

/** Deep merge objects recursively. Arrays & non-objects replace. */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = { ...target };
    if (!isPlainObject(source)) return result;

    for (const key of Object.keys(source)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        const s = source[key];
        const t = target[key];
        if (isPlainObject(s) && isPlainObject(t)) {
            result[key] = deepMerge(t, s);
        } else {
            result[key] = s;
        }
    }
    return result;
}

function normalizeScope(def: StateDef): "instance" | "token" | "both" {
    if (def.scope) {
        return def.scope.toLowerCase() as any;
    }
    // sensible defaults:
    if (def.type === "join") {
        return "instance";
    }
    return "both";
}

function scopeAllowed(mode: EngineMode, scope: "instance" | "token" | "both"): boolean {
    if (scope === "both") {
        return true;
    }
    return (mode === "INSTANCE" && scope === "instance") || (mode === "TOKEN" && scope === "token");
}

//
// Engine persistence helpers
//

function defaults(tables: TableMapping) {
    return {
        instanceIdField: tables.instanceIdField ?? "InstanceId",
        processKeyField: tables.processKeyField ?? "ProcessKey",
        currentStateField: tables.currentStateField ?? "CurrentState",
        statusField: tables.statusField ?? "Status",
        varsJsonField: tables.varsJsonField ?? "ParamsJson",

        tokenIdField: tables.tokenIdField ?? "TokenId",
        tokenInstanceIdField: tables.tokenInstanceIdField ?? "InstanceId",
        branchKeyField: tables.branchKeyField ?? "BranchKey",
        tokenStateField: tables.tokenStateField ?? "State",
        tokenStatusField: tables.tokenStatusField ?? "Status",
        joinGroupField: tables.joinGroupField ?? "JoinGroup",
        tokenDeltaJsonField: tables.tokenDeltaJsonField ?? "ParamsDeltaJson", // matches your sample

        historyInstanceIdField: tables.historyInstanceIdField ?? "InstanceId",
        historyTokenIdField: tables.historyTokenIdField ?? "TokenId",
        historyTimestampField: tables.historyTimestampField ?? "TimestampUtc",
        historyStateField: tables.historyStateField ?? "State",
        historyEventTypeField: tables.historyEventTypeField ?? "EventType",
        historyDetailsJsonField: tables.historyDetailsJsonField ?? "DetailsJson",

        targetInstanceIdField: tables.targetInstanceIdField ?? "InstanceId",
    };
}


async function logHistorySafe(
    persist: boolean,
    historyLayer: FeatureLayer | undefined,
    fields: ReturnType<typeof defaults>,
    instanceId: string,
    tokenId: string | null,
    state: string,
    eventType: string,
    details: any
) {
    if (!persist || !historyLayer) return;
    await logHistory(historyLayer, fields, instanceId, tokenId, state, eventType, details);
}

async function logHistory(
    logLayer: FeatureLayer,
    fields: ReturnType<typeof defaults>,
    instanceId: string,
    tokenId: string | null,
    state: string,
    eventType: string,
    details: any
) {
    const attrs: any = {};
    attrs[fields.historyInstanceIdField] = instanceId;
    attrs[fields.historyTokenIdField] = tokenId;
    attrs[fields.historyTimestampField] = nowUtc();
    attrs[fields.historyStateField] = state;
    attrs[fields.historyEventTypeField] = eventType;
    attrs[fields.historyDetailsJsonField] = JSON.stringify(details ?? {});

    const historyGraphic = new Graphic({ attributes: attrs });

    await logLayer.applyEdits({ addFeatures: [historyGraphic] });
}


async function loadInstanceSafe(
    persist: boolean,
    instanceLayer: FeatureLayer | undefined,
    fields: ReturnType<typeof defaults>,
    instanceId: string,
    memory: any
) {
    if (!persist) {
        if (!memory) throw new Error("Instance not initialized (in-memory).");
        return memory;
    }
    return loadInstance(instanceLayer, fields, instanceId);
}


async function loadInstance(instanceLayer: FeatureLayer, fields: ReturnType<typeof defaults>, instanceId: string) {
    const rows = await instanceLayer.queryFeatures({
        where: `${fields.instanceIdField}='${instanceId}'`,
        outFields: ["*"],
    });
    return rows.features[0]?.attributes ?? null;
}

async function loadTokenSafe(
    persist: boolean,
    tokenLayer: FeatureLayer | undefined,
    fields: ReturnType<typeof defaults>,
    tokenId: string,
    memory: any
) {
    if (!persist) {
        if (!memory) throw new Error("Token not initialized (in-memory).");
        return memory;
    }
    return loadToken(tokenLayer, fields, tokenId);
}



async function loadToken(tokenLayer: FeatureLayer, fields: ReturnType<typeof defaults>, tokenId: string) {
    const rows = await tokenLayer.queryFeatures({
        where: `${fields.tokenIdField}='${tokenId}'`,
        outFields: ["*"]
    });
    return rows.features[0]?.attributes ?? null;
}


async function updateInstanceSafe(
    persist: boolean,
    instanceLayer: FeatureLayer | undefined,
    instanceObj: any,
    updates: any
) {
    Object.assign(instanceObj, updates);
    if (!persist) return;
    await updateInstance(instanceLayer, instanceObj, updates);
}


async function updateInstance(instanceLayer: FeatureLayer, instanceObj: any, updates: any) {
    const updateGraphic = new Graphic(
        {
            attributes: { OBJECTID: instanceObj.OBJECTID, ...updates }
        });
    await instanceLayer.applyEdits(
        {
            updateFeatures: [updateGraphic]
        });
}


async function updateTokenSafe(
    persist: boolean,
    tokenLayer: FeatureLayer | undefined,
    tokenObj: any,
    updates: any
) {
    Object.assign(tokenObj, updates);
    if (!persist) return;
    await updateToken(tokenLayer, tokenObj, updates);
}


async function updateToken(tokenLayer: FeatureLayer, tokenObj: any, updates: any) {
    const updateGraphic = new Graphic(
        {
            attributes: { OBJECTID: tokenObj.OBJECTID, ...updates }
        });
    await tokenLayer.applyEdits(
        {
            updateFeatures: [updateGraphic]
        });
}

async function spawnTokens(
    persist: boolean,
    tokenLayer: FeatureLayer,
    historyLayer: FeatureLayer,

    fields: ReturnType<typeof defaults>,
    instanceId: string,
    joinStateName: string,
    branches: Array<{ branchKey: string; state: string; varsDelta?: Record<string, any> }>
) {
    
    if (!persist) {
        throw new Error(
            "Invariant violation: spawnTokens called with persistState=false."
        );
    }

    for (const b of branches) {
        const attrs: any = {};
        attrs[fields.tokenIdField] = guid();
        attrs[fields.tokenInstanceIdField] = instanceId;
        attrs[fields.branchKeyField] = b.branchKey;
        attrs[fields.tokenStateField] = b.state;
        attrs[fields.tokenStatusField] = "Active";
        attrs[fields.joinGroupField] = joinStateName; // CRITICAL: join group must be join state name
        attrs[fields.tokenDeltaJsonField] = JSON.stringify(b.varsDelta ?? {});
        attrs["Outcome"] = null;
        attrs["LastError"] = null;

        await tokenLayer.applyEdits(
            {
                addFeatures: [new Graphic({ attributes: attrs })]
            });

        await logHistorySafe(persist, historyLayer, fields, instanceId, null, b.state, "TOKEN_SPAWN", {
            joinGroup: joinStateName,
            branchKey: b.branchKey,
            startState: b.state,
        });
    }
}

async function evaluateJoin(
    tokenLayer: FeatureLayer,

    fields: ReturnType<typeof defaults>,
    instanceId: string,
    joinGroup: string,
    mode: "all" | "any" | "quorum",
    quorumN?: number
) {
    const rows = await tokenLayer.queryFeatures({
        where: `${fields.tokenInstanceIdField}='${instanceId}' AND ${fields.joinGroupField}='${joinGroup}'`,
        outFields: ["*"],
    });
    const tokens = rows.features.map(r => r.attributes);

    const total = tokens.length;
    const completed = tokens.filter(t => t[fields.tokenStatusField] === "Completed").length;
    const failed = tokens.filter(t => t[fields.tokenStatusField] === "Failed").length;
    const cancelled = tokens.filter(t => t[fields.tokenStatusField] === "Cancelled").length;
    const waiting = tokens.filter(t => t[fields.tokenStatusField] === "Waiting").length;
    const active = tokens.filter(t => t[fields.tokenStatusField] === "Active").length;

    let joinSatisfied = false;
    if (mode === "all") {
        joinSatisfied = total > 0 && completed === total;
    } else if (mode === "any") {
        joinSatisfied = completed >= 1;
    } else if (mode === "quorum") {
        joinSatisfied = completed >= (quorumN ?? 1);
    }

    return { total, completed, failed, cancelled, waiting, active, joinSatisfied };
}

//
// The Engine
//

export async function runEngineOnce(args: EngineRunArgs): Promise<EngineRunResult> {
    const {
        processKey,
        tokenId: tokenIdInput,
        maxSteps = 50,
        initialVars,
        tokenLayer,
        instanceLayer,
        historyLayer,
        tables,
        invokeHandler,
        context,
        persistState
    } = args;

    const persist = args.persistState !== false;
    const cfg = parseConfig(args.config);

    if (!persist) {
        for (const [stateName, stateDef] of Object.entries(cfg.states)) {
            if (!stateDef.transitions) continue;

            for (const t of Object.values(stateDef.transitions)) {
                if (typeof t === "object" && t.type === "parallel") {
                    throw new Error(
                        `Parallel transitions are not supported for short-lived workflows. ` +
                        `State '${stateName}' defines a parallel transition.`
                    );
                }
            }
        }
    }


    let memoryInstance: any = null;
    let memoryToken: any = null;


    if (!cfg?.states) {
        throw new Error(`Invalid config for processKey=${processKey}`);
    }

    const fields = defaults(tables);

    let instanceId = args.instanceId ?? null;
    const tokenId = tokenIdInput ?? null;
    const mode: EngineMode = tokenId ? "TOKEN" : "INSTANCE";

    //
    // 1) Load or create instance (only creates in instance mode)
    //
    let instanceObj: any = null;


    if (!instanceId) {
        if (mode !== "INSTANCE") {
            throw new Error("Cannot create instance in TOKEN mode (instanceId required).");
        }

        instanceId = guid();

        memoryInstance = {
            [fields.instanceIdField]: instanceId,
            [fields.processKeyField]: processKey,
            [fields.currentStateField]: cfg.startState,
            [fields.statusField]: "Running",
            [fields.varsJsonField]: JSON.stringify(initialVars ?? {}),
            Iteration: 0,
        };

        if (persist) {
            await instanceLayer.applyEdits({
                addFeatures: [new Graphic({ attributes: memoryInstance })]
            });
            memoryInstance = await loadInstance(instanceLayer, fields, instanceId);
        }

        instanceObj = memoryInstance;

        await logHistorySafe(
            persist,
            historyLayer,
            fields,
            instanceId,
            tokenId,
            cfg.startState,
            "INSTANCE_CREATED",
            { processKey }
        );
    }
    else {

        instanceObj = await loadInstanceSafe(
            persist,
            instanceLayer,
            fields,
            instanceId,
            memoryInstance
        );
        memoryInstance = instanceObj;
        if (!instanceObj) {
            throw new Error(`Instance not found: ${instanceId}`);
        }
    }

    //
    // 2) Load token if token mode
    //
    let tokenObj: any = null;
    if (mode === "TOKEN") {

        tokenObj = await loadTokenSafe(
            persist,
            tokenLayer,
            fields,
            tokenId,
            memoryToken
        );
        memoryToken = tokenObj;

        if (!tokenObj) {
            throw new Error(`Token not found: ${tokenId}`);
        }
        // sanity: align instanceId from token
        const tokInst = tokenObj[fields.tokenInstanceIdField];
        if (tokInst && tokInst !== instanceId) {
            // prefer token's instanceId (avoids caller errors)
            instanceId = tokInst;
            instanceObj = await loadInstanceSafe(
                persist,
                instanceLayer,
                fields,
                instanceId,
                memoryInstance
            );
            memoryInstance = instanceObj; if (!instanceObj) {
                throw new Error(`Instance not found (from token): ${instanceId}`);
            }
        }
    }

    //
    // 3) Main execution loop
    //
    let stepsExecuted = 0;
    let lastOutcome: string | null = null;

    while (stepsExecuted < maxSteps) {
        stepsExecuted++;

        // Refresh persisted state each iteration
        instanceObj = await loadInstanceSafe(
            persist,
            instanceLayer,
            fields,
            instanceId,
            memoryInstance
        );
        memoryInstance = instanceObj; if (!instanceObj) {
            throw new Error(`Instance missing during run: ${instanceId}`);
        }

        if (mode === "INSTANCE" && instanceObj[fields.statusField] === "Waiting") {
            await updateInstanceSafe(persist, instanceLayer, instanceObj, {
                [fields.statusField]: "Running",
            });

            await logHistorySafe(persist, historyLayer, fields, instanceId, null, instanceObj[fields.currentStateField] as string, "INSTANCE_RESUME", {});
        }

        if (mode === "TOKEN" && tokenObj[fields.tokenStatusField] === "Waiting") {
            await updateTokenSafe(persist, tokenLayer, tokenObj, {
                [fields.tokenStatusField]: "Active",
            });
            await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, tokenObj[fields.tokenStateField] as string, "TOKEN_RESUME", {});
        }

        let varsObj: Record<string, any>;
        try {
            varsObj = JSON.parse((instanceObj[fields.varsJsonField] as string) || "{}");
        } catch {
            varsObj = {};
        }

        let currentState: string;
        let currentStatus: string;

        if (mode === "TOKEN") {

            tokenObj = await loadTokenSafe(
                persist,
                tokenLayer,
                fields,
                tokenId,
                memoryToken
            );
            memoryToken = tokenObj;

            if (!tokenObj) {
                throw new Error(`Token missing during run: ${tokenId}`);
            }

            currentState = tokenObj[fields.tokenStateField];
            currentStatus = tokenObj[fields.tokenStatusField];

            // STOP CONDITIONS (critical): Waiting is terminal for this run
            if (["Completed", "Failed", "Cancelled"].includes(currentStatus)) {
                await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, currentState, "TOKEN_STOP", {
                    status: currentStatus,
                });
                break;
            }
        } else {
            currentState = instanceObj[fields.currentStateField];
            currentStatus = instanceObj[fields.statusField];

            if (["Completed", "Failed", "Cancelled"].includes(currentStatus)) {
                await logHistorySafe(persist, historyLayer, fields, instanceId, null, currentState, "INSTANCE_STOP", {
                    status: currentStatus,
                });
                break;
            }
        }

        const stateDef = cfg.states[currentState];
        if (!stateDef) {
            throw new Error(`State not defined: ${currentState}`);
        }

        // Scope enforcement (optional but recommended)
        const scope = normalizeScope(stateDef);
        if (!scopeAllowed(mode, scope)) {
            // fail fast: prevents token entering join etc.
            if (mode === "TOKEN") {
                await updateTokenSafe(persist, tokenLayer, tokenObj, {
                    [fields.tokenStatusField]: "Failed",
                    Outcome: "FAILED",
                    LastError: `Scope mismatch: TOKEN cannot execute ${currentState} (${scope})`,
                });
            } else {
                await updateInstanceSafe(persist, instanceLayer, instanceObj, { [fields.statusField]: "Failed" });
            }
            await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, currentState, "ERROR", {
                message: "Scope mismatch",
                mode,
                scope,
            });
            break;
        }

        await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, currentState, "STATE_ENTER", { mode, scope });

        //
        // TERMINAL
        //
        if (stateDef.type === "terminal") {
            if (mode === "TOKEN") {
                await updateTokenSafe(persist, tokenLayer, tokenObj, {
                    [fields.tokenStateField]: currentState,
                    [fields.tokenStatusField]: "Completed",
                    Outcome: "DONE",
                    LastError: null,
                });
                await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, currentState, "TOKEN_COMPLETED", {});
            } else {
                await updateInstanceSafe(persist, instanceLayer, instanceObj, { [fields.statusField]: "Failed" });

                await logHistorySafe(persist, historyLayer, fields, instanceId, null, currentState, "INSTANCE_COMPLETED", {});
            }
            break;
        }

        //
        // JOIN (instance-only)
        //
        if (stateDef.type === "join") {
            if (mode !== "INSTANCE") {
                // Hard guard: join must never run in token mode
                await updateTokenSafe(persist, tokenLayer, tokenObj, {
                    [fields.tokenStatusField]: "Failed",
                    Outcome: "FAILED",
                    LastError: `Token entered join state ${currentState} (invalid configuration)`,
                });
                await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, currentState, "ERROR", {
                    message: "Join executed in token mode",
                    state: currentState,
                });
                break;
            }

            const joinGroup = stateDef.joinGroup ?? currentState; // recommended: omit joinGroup and use state name
            const joinMode = stateDef.mode ?? "all";
            const joinInfo = await evaluateJoin(
                tokenLayer,
                fields,
                instanceId,
                joinGroup,
                joinMode,
                stateDef.quorumN
            );

            await logHistorySafe(persist, historyLayer, fields, instanceId, null, currentState, "JOIN_EVAL", joinInfo);

            if (joinInfo.failed > 0) {
                // policy: fail instance; you can route to ERROR state if desired
                await updateInstanceSafe(persist, instanceLayer, instanceObj, { [fields.statusField]: "Failed" });
                await logHistorySafe(persist, historyLayer, fields, instanceId, null, currentState, "JOIN_FAILED", joinInfo);
                break;
            }

            if (joinInfo.joinSatisfied) {
                const nextState = stateDef.onComplete;
                if (!nextState) throw new Error(`Join state missing onComplete: ${currentState}`);
                await updateInstanceSafe(persist, instanceLayer, instanceObj, {
                    [fields.currentStateField]: nextState,
                    [fields.statusField]: "Running",
                });

                await logHistorySafe(persist, historyLayer, fields, instanceId, null, currentState, "JOIN_SATISFIED", { nextState });
                // continue loop to execute next state in same call
                continue;
            } else {
                // Not satisfied -> wait and exit
                await updateInstanceSafe(persist, instanceLayer, instanceObj, { [fields.statusField]: "Waiting" });
                await logHistorySafe(persist, historyLayer, fields, instanceId, null, currentState, "JOIN_WAIT", { joinGroup });
                break;
            }
        }

        //
        // HANDLER
        //
        if (stateDef.type !== "handler") throw new Error(`Unsupported state type: ${stateDef.type as string}`);

        if (!stateDef.handler) throw new Error(`Handler missing for state: ${currentState}`);

        const handlerInput = {
            processKey,
            instanceId,
            tokenId: mode === "TOKEN" ? tokenId : null,
            state: currentState,
            vars: varsObj,
            parameters: stateDef.parameters ?? {},
            context,
        };

        const handlerResult = await invokeHandler(stateDef.url, handlerInput);
        if (!handlerResult?.result?.output?.outcome) {
            throw new Error(`Handler did not return outcome for state: ${currentState}`);
        }

        lastOutcome = handlerResult.result.output.outcome;

        // merge shared vars into instance VarsJson
        if (handlerResult.result.output.vars && isPlainObject(handlerResult.result.output.vars)) {
            const merged = deepMerge(varsObj, handlerResult.result.output.vars);
            await updateInstanceSafe(persist, instanceLayer, instanceObj, { [fields.varsJsonField]: JSON.stringify(merged) });
            varsObj = merged;
        }

        // merge branch vars into token delta json
        if (mode === "TOKEN" && handlerResult.result.output.branchVars && isPlainObject(handlerResult.result.output.branchVars)) {
            const existing = tokenObj![fields.tokenDeltaJsonField];
            let existingObj: any = {};
            try {
                existingObj = JSON.parse((typeof existing === "string" ? existing : "") || "{}");
            } catch {
                existingObj = {};
            }
            const mergedDelta = deepMerge(existingObj as Record<string, any>, handlerResult.result.output.branchVars);
            await updateTokenSafe(persist, tokenLayer, tokenObj, { [fields.tokenDeltaJsonField]: JSON.stringify(mergedDelta) });
        }

        // persist token outcome/errors for troubleshooting
        if (mode === "TOKEN") {
            await updateTokenSafe(persist, tokenLayer, tokenObj, {
                Outcome: handlerResult.result.output.outcome,
                LastError: handlerResult.result.output.errors ? JSON.stringify(handlerResult.result.output.errors) : null,
            });
        }

        await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, currentState, "STATE_EXIT", {
            outcome: handlerResult.result.output.outcome,
            wait: !!handlerResult.result.output.wait,
            nextStateOverride: handlerResult.result.output.nextState ?? null,
        });

        //
        // WAIT stops execution immediately (token or instance)
        //
        if (handlerResult.result.output.wait) {
            if (mode === "TOKEN") {
                await updateTokenSafe(persist, tokenLayer, tokenObj, { [fields.tokenStatusField]: "Waiting" });
                await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, currentState, "TOKEN_WAIT", handlerResult.result.output.wait);
            } else {
                await updateInstanceSafe(persist, instanceLayer, instanceObj, { [fields.statusField]: "Waiting" });
                await logHistorySafe(persist, historyLayer, fields, instanceId, null, currentState, "INSTANCE_WAIT", handlerResult.result.output.wait);
            }
            break;
        }

        //
        // Resolve transition
        //
        let resolved: any = null;

        if (handlerResult.result.output.nextState) {
            resolved = { type: "single", nextState: handlerResult.result.output.nextState };
        } else {
            const tdef = stateDef.transitions?.[handlerResult.result.output.outcome];
            if (!tdef) {
                throw new Error(`No transition for outcome=${handlerResult.result.output.outcome} in state=${currentState}`);
            }
            resolved = typeof tdef === "string" ? { type: "single", nextState: tdef } : tdef;
        }

        //
        // Apply transition
        //
        if (!resolved.type || resolved.type === "single") {
            const nextState = resolved.nextState as string;
            const nextDef = cfg.states[nextState];
            if (!nextDef) {
                throw new Error(`Transition to undefined state: ${nextState}`);
            }

            // guard: token must never transition to join state
            if (mode === "TOKEN" && nextDef.type === "join") {
                await updateTokenSafe(persist, tokenLayer, tokenObj, {
                    [fields.tokenStatusField]: "Failed",
                    Outcome: "FAILED",
                    LastError: `Token transition to join state ${nextState} is invalid (configure token to end at TOKEN_DONE)`,
                });
                await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, currentState, "ERROR", {
                    message: "Token attempted to transition to join",
                    nextState,
                });
                break;
            }

            // terminal semantics: if next is terminal, set Completed (token) or Completed (instance)
            if (nextDef.type === "terminal") {
                if (mode === "TOKEN") {
                    await updateTokenSafe(persist, tokenLayer, tokenObj, {
                        [fields.tokenStateField]: nextState,
                        [fields.tokenStatusField]: "Completed",
                        Outcome: "DONE",
                        LastError: null,
                    });
                    await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, nextState, "TOKEN_COMPLETED", {
                        from: currentState,
                    });
                } else {
                    await updateInstanceSafe(persist, instanceLayer, instanceObj, {
                        [fields.currentStateField]: nextState,
                        [fields.statusField]: "Completed",
                    });
                    await logHistorySafe(persist, historyLayer, fields, instanceId, null, nextState, "INSTANCE_COMPLETED", {
                        from: currentState,
                    });
                }
                break;
            }

            if (mode === "TOKEN") {
                await updateTokenSafe(persist, tokenLayer, tokenObj, {
                    [fields.tokenStateField]: nextState,
                    [fields.tokenStatusField]: "Active",
                });
                await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, currentState, "TOKEN_TRANSITION", {
                    to: nextState,
                    outcome: lastOutcome,
                });
            } else {
                await updateInstanceSafe(persist, instanceLayer, instanceObj, {
                    [fields.currentStateField]: nextState,
                    [fields.statusField]: "Running",
                });
                await logHistorySafe(persist, historyLayer, fields, instanceId, null, currentState, "INSTANCE_TRANSITION", {
                    to: nextState,
                    outcome: lastOutcome,
                });
            }

            continue;
        }

        if (resolved.type === "parallel") {
            if (mode !== "INSTANCE") throw new Error("Parallel transition not supported in TOKEN mode");

            const joinState = resolved.join as string;
            const branches = resolved.branches as Array<{ branchKey: string; state: string; varsDelta?: any }>;
            if (!cfg.states[joinState] || cfg.states[joinState].type !== "join") {
                throw new Error(`Parallel join target must be a join state: ${joinState}`);
            }

            // Validate that branch start states exist and are NOT join states
            for (const b of branches) {
                const bDef = cfg.states[b.state];
                if (!bDef) throw new Error(`Branch state undefined: ${b.state}`);
                if (bDef.type === "join") throw new Error(`Branch state cannot be join: ${b.state}`);
            }

            // Spawn tokens tagged to the join state name (critical)
            await spawnTokens(persist, tokenLayer, historyLayer, fields, instanceId, joinState, branches);

            // Move instance to join and wait
            await updateInstanceSafe(persist, instanceLayer, instanceObj, {
                [fields.currentStateField]: joinState,
                [fields.statusField]: "Waiting",
            });
            await logHistorySafe(persist, historyLayer, fields, instanceId, null, currentState, "PARALLEL_SPAWN", {
                joinState,
                branchCount: branches.length,
            });

            break; // stop until resumed (tokens run independently)
        }

        throw new Error(`Unsupported transition type: ${resolved.type}`);
    }

    //
    // Max steps guard
    //
    if (stepsExecuted >= maxSteps) {
        const state =
            mode === "TOKEN"
                ? ((tokenObj?.[fields.tokenStateField] as string) ?? "UNKNOWN")
                : ((instanceObj?.[fields.currentStateField] as string) ?? "UNKNOWN");
        await logHistorySafe(persist, historyLayer, fields, instanceId, tokenId, state, "MAX_STEPS_REACHED", { maxSteps });

        if (mode === "TOKEN") {

            tokenObj = await loadTokenSafe(
                persist,
                tokenLayer,
                fields,
                tokenId,
                memoryToken
            );
            memoryToken = tokenObj;

            if (tokenObj) {
                await updateTokenSafe(persist, tokenLayer, tokenObj, {
                    [fields.tokenStatusField]: "Failed",
                    Outcome: "FAILED",
                    LastError: "Max steps reached",
                });
            }
        } else {
            instanceObj = await loadInstanceSafe(
                persist,
                instanceLayer,
                fields,
                instanceId,
                memoryInstance
            );
            memoryInstance = instanceObj;
            if (instanceObj) await updateInstanceSafe(persist, instanceLayer, instanceObj, { [fields.statusField]: "Failed" });
        }
    }

    //
    // Return snapshot
    //
    instanceObj = await loadInstanceSafe(persist, instanceLayer, fields, instanceId, memoryInstance);
    if (!instanceObj) throw new Error(`Instance missing at end: ${instanceId}`);

    if (mode === "TOKEN") {

        tokenObj = await loadTokenSafe(
            persist,
            tokenLayer,
            fields,
            tokenId,
            memoryToken
        );
        memoryToken = tokenObj;
        if (!tokenObj) {
            throw new Error(`Token missing at end: ${tokenId}`);
        }

        return {
            instanceId: instanceId,
            tokenId: tokenId,
            mode,
            status: tokenObj[fields.tokenStatusField],
            state: tokenObj[fields.tokenStateField],
            outcome: tokenObj.Outcome ?? lastOutcome,
            stepsExecuted,
        };
    }

    return {
        instanceId: instanceId,
        tokenId: null,
        mode,
        status: instanceObj[fields.statusField],
        state: instanceObj[fields.currentStateField],
        outcome: lastOutcome,
        stepsExecuted,
    };
}
