import { EngineRuntime } from "../types";
import { EngineContext } from "../context";

import { evaluateJoin } from "../joins";
import { logHistorySafe } from "../history";
import { updateInstance } from "../persistence";

/**
 * Evaluates a join state.
 *
 * Returns:
 * - true  => join satisfied, continue engine execution
 * - false => instance should stop for now
 */
export async function executeJoinState(
    runtime: EngineRuntime,
    ctx: EngineContext
): Promise<boolean> {

    const {
        currentState,
        instanceId,
        instanceObj,
        stateDef,
    } = runtime;

    //
    // Evaluate the current join group.
    //
    const joinInfo =
        await evaluateJoin(
            ctx,
            instanceId,
            currentState,
            stateDef.mode ?? "all",
            stateDef.quorumN,
        );

    await logHistorySafe(
        ctx,
        instanceId,
        undefined,
        currentState,
        "JOIN_EVAL",
        joinInfo,
    );

    //
    // Any failed branch causes the join to fail.
    //
    if (joinInfo.failed > 0) {

        await updateInstance(
            ctx,
            instanceObj,
            {
                [ctx.fields.statusField]:
                    "Failed",
            }
        );

        return false;
    }

    //
    // Not enough branches have completed yet.
    // Leave the instance waiting until another
    // token completes and re-evaluates the join.
    //
    if (!joinInfo.joinSatisfied) {

        await updateInstance(
            ctx,
            instanceObj,
            {
                [ctx.fields.statusField]:
                    "Waiting",
            }
        );

        return false;
    }

    //
    // Join is satisfied. Advance to the
    // configured onComplete state.
    //
    const nextState =
        stateDef.onComplete;

    if (!nextState) {
        throw new Error(
            `Join state '${currentState}' is missing onComplete`
        );
    }

    await updateInstance(
        ctx,
        instanceObj,
        {
            [ctx.fields.currentStateField]:
                nextState,

            [ctx.fields.statusField]:
                "Running",
        }
    );

    await logHistorySafe(
        ctx,
        instanceId,
        undefined,
        currentState,
        "JOIN_SATISFIED",
        {
            nextState,
            ...joinInfo,
        }
    );

    //
    // Continue immediately so the engine can
    // process the next state in the same run.
    //
    return true;
}