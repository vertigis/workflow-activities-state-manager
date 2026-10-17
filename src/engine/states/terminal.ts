import { EngineRuntime } from "../types";
import { EngineContext } from "../context";

import {
    updateInstance,
    updateToken,
} from "../persistence";

import { logHistorySafe } from "../history";

/**
 * Executes a terminal state.
 *
 * A terminal state completes either:
 * - a token execution, or
 * - an instance execution.
 */
export async function executeTerminalState(
    runtime: EngineRuntime,
    ctx: EngineContext
): Promise<void> {

    const {
        runtimeMode,
        currentState,
        instanceId,
        instanceObj,
        tokenId,
        tokenObj,
    } = runtime;

    //
    // Complete token execution.
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
                [ctx.fields.tokenStateField]:
                    currentState,

                [ctx.fields.tokenStatusField]:
                    "Completed",

                Outcome: "DONE",

                LastError: undefined,
            }
        );

        await logHistorySafe(
            ctx,
            instanceId,
            tokenId,
            currentState,
            "TOKEN_COMPLETED",
            {}
        );

        return;
    }

    //
    // Complete instance execution.
    //
    await updateInstance(
        ctx,
        instanceObj,
        {
            [ctx.fields.statusField]:
                "Completed",
        }
    );

    await logHistorySafe(
        ctx,
        instanceId,
        undefined,
        currentState,
        "INSTANCE_COMPLETED",
        {}
    );
}