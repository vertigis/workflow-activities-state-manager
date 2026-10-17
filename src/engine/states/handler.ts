import {
    EngineConfig,
    EngineRuntime,
    ExecuteHandlerResult,
    HandlerInvoker,
    TransitionDef,
} from "../types";

import { EngineContext } from "../context";
import { completeToken } from "../joins";
import { logHistorySafe } from "../history";

import {
    updateInstance,
    updateToken,
} from "../persistence";

import { executeParallelState } from "./parallel";

/**
 * Executes a handler state.
 *
 * Responsibilities:
 * - Invoke the configured handler
 * - Merge variable updates
 * - Process WAIT responses
 * - Resolve transitions
 * - Complete tokens when appropriate
 */
export async function executeHandlerState(
    runtime: EngineRuntime,
    ctx: EngineContext,
    invokeHandler: HandlerInvoker
): Promise<ExecuteHandlerResult> {

    const {
        instanceId,
        tokenId,
        runtimeMode,
        currentState,
        stateDef,
        varsObj,
    } = runtime;

    const {
        fields,
        cfg,
    } = ctx;

    //
    // Validate state definition.
    //
    if (!stateDef.url) {
        throw new Error(
            `Handler state '${currentState}' is missing url`
        );
    }

    //
    // Invoke the external handler.
    //
    const output = (
        await invokeHandler(
            stateDef.url,
            {
                instanceId,

                tokenId:
                    runtimeMode === "TOKEN"
                        ? tokenId
                        : undefined,

                state: currentState,

                vars: varsObj,

                parameters:
                    stateDef.parameters ?? {},
            }
        )
    )?.result?.output;

    //
    // Every handler must return an outcome.
    //
    if (!output?.outcome) {
        throw new Error(
            `Handler did not return outcome for state '${currentState}'`
        );
    }

    //
    // Merge returned variables into the instance variable set.
    //
    if (output.vars) {

        const merged = {
            ...varsObj,
            ...output.vars,
        };

        await updateInstance(
            ctx,
            runtime.instanceObj,
            {
                [fields.varsJsonField]:
                    JSON.stringify(merged),
            }
        );

        runtime.varsObj = merged;
    }

    //
    // Persist token-specific outcome information.
    //
    if (runtimeMode === "TOKEN") {

        await updateToken(
            ctx,
            runtime.tokenObj,
            {
                Outcome: output.outcome,

                LastError:
                    output.errors
                        ? JSON.stringify(output.errors)
                        : undefined,
            }
        );
    }

    //
    // Record handler completion.
    //
    await logHistorySafe(
        ctx,
        instanceId,
        tokenId,
        currentState,
        "STATE_EXIT",
        {
            outcome: output.outcome,
            wait: !!output.wait,
            nextState: output.nextState,
        }
    );

    //
    // WAIT responses suspend execution.
    //
    if (output.wait) {

        await handleWait(
            runtime,
            ctx,
            output.wait
        );

        return {
            continueExecution: false,
            joinSatisfied: false,
        };
    }

    //
    // Explicit completion from token handlers.
    //
    if (
        runtimeMode === "TOKEN" &&
        output.completed
    ) {

        return completeAndStop(
            ctx,
            runtime,
            output.outcome,
            currentState
        );
    }

    //
    // Resolve transition.
    //
    const transition = resolveTransition(
        stateDef.transitions,
        output.outcome,
        output.nextState
    );

    //
    // No transition:
    // - token => complete
    // - instance => configuration error
    //
    if (!transition) {

        if (runtimeMode === "TOKEN") {

            if(!output.completed) {
                return { continueExecution: false, joinSatisfied: false, };
            }

            return completeAndStop(
                ctx,
                runtime,
                output.outcome,
                currentState
            );
        }

        throw new Error(
            `No transition defined for outcome '${output.outcome}' in state '${currentState}'`
        );
    }

    //
    // Parallel transition.
    //
    if (transition.type === "parallel") {

        await executeParallelState(
            runtime,
            ctx
        );

        return {
            continueExecution: false,
            joinSatisfied: false,
        };
    }

    //
    // Standard transition.
    //
    return executeSingleTransition(
        runtime,
        ctx,
        cfg,
        output.outcome,
        transition.nextState
    );
}

/**
 * Places the current execution into a waiting state.
 */
async function handleWait(
    runtime: EngineRuntime,
    ctx: EngineContext,
    waitInfo: any
): Promise<void> {

    const { fields } = ctx;

    //
    // Token wait.
    //
    if (runtime.runtimeMode === "TOKEN") {

        await updateToken(
            ctx,
            runtime.tokenObj,
            {
                [fields.tokenStatusField]:
                    "Waiting",
            }
        );

        await logHistorySafe(
            ctx,
            runtime.instanceId,
            runtime.tokenId,
            runtime.currentState,
            "TOKEN_WAIT",
            waitInfo
        );

        return;
    }

    //
    // Instance wait.
    //
    await updateInstance(
        ctx,
        runtime.instanceObj,
        {
            [fields.statusField]:
                "Waiting",
        }
    );

    await logHistorySafe(
        ctx,
        runtime.instanceId,
        undefined,
        runtime.currentState,
        "INSTANCE_WAIT",
        waitInfo
    );
}

/**
 * Resolves the next transition.
 *
 * Priority:
 * 1. Explicit nextState from handler output.
 * 2. Outcome-based transition mapping.
 */
function resolveTransition(
    transitions: Record<string, TransitionDef> | undefined,
    outcome: string,
    nextState?: string
) {

    //
    // Handler explicitly selected next state.
    //
    if (nextState) {
        return {
            type: "single" as const,
            nextState,
        };
    }

    //
    // Use transition map.
    //
    const transition =
        transitions?.[outcome];

    if (!transition) {
        return undefined;
    }

    //
    // String shorthand.
    //
    if (typeof transition === "string") {
        return {
            type: "single" as const,
            nextState: transition,
        };
    }

    return transition;
}

/**
 * Completes a token and stops execution.
 */
async function completeAndStop(
    ctx: EngineContext,
    runtime: EngineRuntime,
    outcome: string,
    state: string
): Promise<ExecuteHandlerResult> {

    const joinSatisfied =
        await completeToken(
            ctx,
            runtime,
            outcome,
            state
        );

    return {
        continueExecution: false,
        joinSatisfied,
    };
}




/**
 * Executes a resolved single transition.
 */
async function executeSingleTransition(
    runtime: EngineRuntime,
    ctx: EngineContext,
    cfg: EngineConfig,
    outcome: string,
    nextState: string
): Promise<ExecuteHandlerResult> {

    const { fields } = ctx;

    const {
        runtimeMode,
        currentState,
        instanceId,
        tokenId,
    } = runtime;

    //
    // Validate target state.
    //
    const nextDef =
        cfg.states[nextState];

    if (!nextDef) {
        throw new Error(
            `Transition references undefined state '${nextState}'`
        );
    }

    //
    // TOKEN -> JOIN
    //
    if (
        runtimeMode === "TOKEN" &&
        nextDef.type === "join"
    ) {

        return completeAndStop(
            ctx,
            runtime,
            outcome,
            nextState
        );
    }

    //
    // TOKEN -> TERMINAL
    //
    if (
        runtimeMode === "TOKEN" &&
        nextDef.type === "terminal"
    ) {

        return completeAndStop(
            ctx,
            runtime,
            outcome,
            currentState
        );
    }

    //
    // INSTANCE -> TERMINAL
    //
    if (
        runtimeMode === "INSTANCE" &&
        nextDef.type === "terminal"
    ) {

        await updateInstance(
            ctx,
            runtime.instanceObj,
            {
                [fields.currentStateField]:
                    nextState,

                [fields.statusField]:
                    "Completed",
            }
        );

        await logHistorySafe(
            ctx,
            instanceId,
            undefined,
            nextState,
            "INSTANCE_COMPLETED",
            {
                from: currentState,
            }
        );

        return {
            continueExecution: false,
            joinSatisfied: false,
        };
    }

    //
    // Standard token transition.
    //
    if (runtimeMode === "TOKEN") {

        await updateToken(
            ctx,
            runtime.tokenObj,
            {
                [fields.tokenStateField]:
                    nextState,

                [fields.tokenStatusField]:
                    "Active",
            }
        );

        await logHistorySafe(
            ctx,
            instanceId,
            tokenId,
            currentState,
            "TOKEN_TRANSITION",
            {
                to: nextState,
                outcome,
            }
        );
    }

    //
    // Standard instance transition.
    //
    else {

        await updateInstance(
            ctx,
            runtime.instanceObj,
            {
                [fields.currentStateField]:
                    nextState,

                [fields.statusField]:
                    "Running",
            }
        );

        await logHistorySafe(
            ctx,
            instanceId,
            undefined,
            currentState,
            "INSTANCE_TRANSITION",
            {
                to: nextState,
                outcome,
            }
        );
    }

    return {
        continueExecution: true,
        joinSatisfied: false,
    };
}