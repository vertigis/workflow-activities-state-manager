import {
    EngineMode,
    EngineRuntime,
    StateDef,
    StateScope,
} from "./types";

import { EngineContext } from "./context";

import { logHistorySafe } from "./history";

import {
    updateInstance,
    updateToken,
} from "./persistence";

/**
 * Resolves the effective scope for a state.
 *
 * Defaults:
 * - join states => instance
 * - all other states => both
 */
export function normalizeScope(
    stateDef: StateDef
): StateScope {

    if (stateDef.scope) {
        return stateDef.scope;
    }

    return stateDef.type === "join"
        ? "instance"
        : "both";
}

/**
 * Determines whether a runtime mode is allowed
 * to execute a state with the specified scope.
 */
export function scopeAllowed(
    mode: EngineMode,
    scope: StateScope
): boolean {

    return (
        scope === "both" ||
        (mode === "INSTANCE" && scope === "instance") ||
        (mode === "TOKEN" && scope === "token")
    );
}

/**
 * Handles execution of a state that is not valid
 * for the current runtime mode.
 *
 * The current instance or token is failed and a
 * history record is written for diagnostics.
 */
export async function failForScopeMismatch(
    runtime: EngineRuntime,
    ctx: EngineContext
): Promise<void> {

    const {
        runtimeMode,
        currentState,
        stateDef,
        tokenId,
        tokenObj,
        instanceObj,
        instanceId,
    } = runtime;

    const scope =
        normalizeScope(stateDef);

    const errorMessage =
        `Scope mismatch: ${runtimeMode} cannot execute '${currentState}' (${scope})`;

    //
    // Fail the current execution.
    //
    if (runtimeMode === "TOKEN") {

        if (!tokenObj) {
            throw new Error(
                "Token runtime missing token object."
            );
        }

        await updateToken(
            ctx,
            tokenObj,
            {
                [ctx.fields.tokenStatusField]:
                    "Failed",

                Outcome: "FAILED",

                LastError: errorMessage,
            }
        );
    }
    else {

        await updateInstance(
            ctx,
            instanceObj,
            {
                [ctx.fields.statusField]:
                    "Failed",
            }
        );
    }

    //
    // Record the scope violation.
    //
    await logHistorySafe(
        ctx,
        instanceId,
        tokenId,
        currentState,
        "SCOPE_MISMATCH",
        {
            runtimeMode,
            state: currentState,
            scope,
            stateType: stateDef.type,
        }
    );
}