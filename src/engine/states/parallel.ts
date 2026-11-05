import { EngineRuntime } from "../types";
import { EngineContext } from "../context";

import {
    spawnTokens,
    updateInstance,
} from "../persistence";

import { logHistorySafe } from "../history";

/**
 * Executes a parallel state.
 *
 * Creates a token for each configured branch, then moves the
 * instance into the configured join state and waits for all
 * branch tokens to complete.
 */
export async function executeParallelState(
    runtime: EngineRuntime,
    ctx: EngineContext
): Promise<void> {

    const {
        instanceId,
        instanceObj,
        currentState,
        stateDef,
    } = runtime;

    const joinState = stateDef.join;

    if (!joinState) {
        throw new Error(
            `Parallel state '${currentState}' is missing join`
        );
    }

    const branches =
        stateDef.branches ?? [];

    //
    // Spawn a token for each branch.
    //
    await spawnTokens(
        ctx,
        instanceId,
        joinState,
        branches,
    );

    //
    // Move the instance to the join state and wait
    // for branch completion.
    //
    await updateInstance(
        ctx,
        instanceObj,
        {
            [ctx.fields.currentStateField]:
                joinState,

            [ctx.fields.statusField]:
                "Waiting",
        }
    );

    //
    // Record the fan-out operation.
    //
    await logHistorySafe(
        ctx,
        instanceId,
        undefined,
        currentState,
        "PARALLEL_SPAWN",
        {
            joinState,
            branchCount: branches.length,

            branches: branches.map(
                branch => ({
                    branchKey: branch.branchKey,
                    state: branch.state,
                })
            ),
        }
    );
}