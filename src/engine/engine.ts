import {
    EngineRunArgs,
    EngineRunResult,
} from "./types";

import { EngineContext } from "./context";

import {
    defaults,
    parseConfig,
} from "./config";

import {
    initializeRuntime,
    refreshRuntime,
    buildResult,
} from "./runtime";

import {
    normalizeScope,
    scopeAllowed,
    failForScopeMismatch,
} from "./scope";

import { logHistorySafe } from "./history";

import { executeHandlerState } from "./states/handler";
import { executeJoinState } from "./states/join";
import { executeParallelState } from "./states/parallel";
import { executeTerminalState } from "./states/terminal";

/**
 * Executes a workflow instance or token until:
 * - execution completes
 * - execution blocks
 * - a stop condition is reached
 * - the maximum step count is exceeded
 */
export async function runEngineOnce(
    args: EngineRunArgs
): Promise<EngineRunResult> {

    const {
        processKey,
        invokeHandler,
        maxSteps = 50,
    } = args;

    //
    // Parse and validate workflow configuration.
    //
    const cfg =
        parseConfig(args.config);

    if (!cfg?.states) {
        throw new Error(
            `Invalid config for processKey=${processKey}`
        );
    }

    //
    // Build shared execution context.
    //
    const ctx: EngineContext = {
        cfg,

        fields:
            defaults(args.tables),

        persist:
            args.persistState !== false,

        tokenLayer:
            args.tokenLayer,

        instanceLayer:
            args.instanceLayer,

        historyLayer:
            args.historyLayer,
    };

    //
    // Parallel execution requires persisted state.
    //
    if (!ctx.persist) {

        for (const [stateName, stateDef] of Object.entries(cfg.states)) {

            if (!stateDef.transitions) {
                continue;
            }

            for (const transition of Object.values(stateDef.transitions)) {

                if (
                    transition &&
                    typeof transition === "object" &&
                    transition.type === "parallel"
                ) {
                    throw new Error(
                        "Parallel transitions are not supported for short-lived workflows. " +
                        `State '${stateName}' defines a parallel transition.`
                    );
                }
            }
        }
    }

    //
    // Load or create runtime state.
    //
    const runtime =
        await initializeRuntime(
            args,
            ctx,
        );

    //
    // Main execution loop.
    //
    while (
        runtime.stepsExecuted < maxSteps
    ) {

        runtime.stepsExecuted++;

        //
        // Refresh persisted state before each iteration.
        //
        await refreshRuntime(
            runtime,
            ctx,
        );

        //
        // Stop execution if already terminal.
        //
        if (
            [
                "Completed",
                "Failed",
                "Cancelled",
            ].includes(
                runtime.currentStatus,
            )
        ) {

            await logHistorySafe(
                ctx,
                runtime.instanceId,
                runtime.tokenId,
                runtime.currentState,
                runtime.runtimeMode === "TOKEN"
                    ? "TOKEN_STOP"
                    : "INSTANCE_STOP",
                {
                    status:
                        runtime.currentStatus,
                },
            );

            break;
        }

        //
        // Verify the current runtime is allowed
        // to execute this state's scope.
        //
        const scope =
            normalizeScope(
                runtime.stateDef,
            );

        if (
            !scopeAllowed(
                runtime.runtimeMode,
                scope,
            )
        ) {

            await failForScopeMismatch(
                runtime,
                ctx,
            );

            break;
        }

        //
        // Record state entry.
        //
        await logHistorySafe(
            ctx,
            runtime.instanceId,
            runtime.tokenId,
            runtime.currentState,
            "STATE_ENTER",
            {
                mode:
                    runtime.runtimeMode,
                scope,
            },
        );

        //
        // Execute the current state.
        //
        switch (
            runtime.stateDef.type
        ) {

            case "handler": {

                const result =
                    await executeHandlerState(
                        runtime,
                        ctx,
                        invokeHandler,
                    );

                runtime.joinSatisfied =
                    result.joinSatisfied;

                if (
                    result.continueExecution
                ) {
                    continue;
                }

                break;
            }

            case "join": {

                const continueExecution =
                    await executeJoinState(
                        runtime,
                        ctx,
                    );

                if (
                    continueExecution
                ) {
                    continue;
                }

                break;
            }

            case "parallel":

                await executeParallelState(
                    runtime,
                    ctx,
                );

                break;

            case "terminal":

                await executeTerminalState(
                    runtime,
                    ctx,
                );

                break;

            default:

                throw new Error(
                    `Unsupported state type '${runtime.stateDef.type as string}' for state '${runtime.currentState}'`
                );
        }

        //
        // State execution completed for this invocation.
        //
        break;
    }

    //
    // Reload final state before returning results.
    //
    await refreshRuntime(
        runtime,
        ctx,
    );

    return buildResult(
        runtime,
        ctx,
    );
}