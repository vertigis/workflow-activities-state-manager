import {
    EngineRuntime,
    JoinEvaluationResult,
} from "./types";

import { EngineContext } from "./context";

import {
    loadInstance,
    queryTokensForJoin,
    updateInstance,
    updateToken,
} from "./persistence";

import { logHistorySafe } from "./history";

/**
 * Evaluates the current state of a join group.
 */
export async function evaluateJoin(
    ctx: EngineContext,
    instanceId: string,
    joinGroup: string,
    mode: "all" | "any" | "quorum",
    quorumN?: number
): Promise<JoinEvaluationResult> {

    const { fields } = ctx;

    const tokens =
        await queryTokensForJoin(
            ctx,
            instanceId,
            joinGroup
        );

    let joined = 0;
    let failed = 0;
    let cancelled = 0;
    let waiting = 0;
    let active = 0;

    //
    // Count token states in a single pass.
    //
    for (const token of tokens) {

        const status =
            token[
                fields.tokenStatusField
            ];

        switch (status) {

            case "Completed":

                if (
                    token[
                        fields.joinGroupField
                    ] === joinGroup
                ) {
                    joined++;
                }

                break;

            case "Failed":
                failed++;
                break;

            case "Cancelled":
                cancelled++;
                break;

            case "Waiting":
                waiting++;
                break;

            case "Active":
                active++;
                break;
        }
    }

    const total =
        tokens.length;

    let joinSatisfied = false;

    switch (mode) {

        case "all":

            joinSatisfied =
                total > 0 &&
                joined === total;

            break;

        case "any":

            joinSatisfied =
                joined >= 1;

            break;

        case "quorum":

            joinSatisfied =
                joined >= (quorumN ?? 1);

            break;
    }

    return {
        total,
        joined,
        failed,
        cancelled,
        waiting,
        active,
        joinSatisfied,
    };
}

/**
 * Re-evaluates a join after token completion.
 *
 * If the join is now satisfied and the instance is
 * waiting at the join state, execution is resumed.
 */
export async function evaluateAndResumeJoin(
    ctx: EngineContext,
    joinGroup: string,
    instanceId: string
): Promise<boolean> {

    const joinDef =
        ctx.cfg.states[
            joinGroup
        ];

    if (
        !joinDef ||
        joinDef.type !== "join"
    ) {
        return false;
    }

    const joinInfo =
        await evaluateJoin(
            ctx,
            instanceId,
            joinGroup,
            joinDef.mode ?? "all",
            joinDef.quorumN,
        );

    if (!joinInfo.joinSatisfied) {
        return false;
    }

    const instance =
        await loadInstance(
            ctx,
            instanceId
        );

    if (!instance) {
        return false;
    }

    const { fields } = ctx;

    //
    // Resume the instance if it is currently
    // waiting at the join state.
    //
    if (
        instance[
            fields.currentStateField
        ] === joinGroup &&
        instance[
            fields.statusField
        ] === "Waiting"
    ) {

        await updateInstance(
            ctx,
            instance,
            {
                [fields.statusField]:
                    "Running",
            }
        );

        await logHistorySafe(
            ctx,
            instanceId,
            undefined,
            joinGroup,
            "JOIN_SATISFIED",
            joinInfo
        );
    }

    return true;
}

/**
 * Completes the current token and triggers
 * evaluation of its associated join group.
 */
export async function completeToken(
    ctx: EngineContext,
    runtime: EngineRuntime,
    outcome: string,
    state: string
): Promise<boolean> {

    const { fields } = ctx;

    const tokenObj =
        runtime.tokenObj;

    if (!tokenObj) {
        throw new Error(
            "Token runtime missing token object."
        );
    }

    await updateToken(
        ctx,
        tokenObj,
        {
            [fields.tokenStateField]:
                state,

            [fields.tokenStatusField]:
                "Completed",

            Outcome:
                outcome,

            LastError:
                undefined,
        }
    );

    await logHistorySafe(
        ctx,
        runtime.instanceId,
        runtime.tokenId,
        state,
        "TOKEN_COMPLETED",
        {}
    );

    //
    // Tokens not participating in a join
    // simply complete.
    //
    const joinGroup: string =
        tokenObj[
            fields.joinGroupField
        ];

    if (!joinGroup) {
        return false;
    }

    return evaluateAndResumeJoin(
        ctx,
        joinGroup,
        runtime.instanceId
    );
}