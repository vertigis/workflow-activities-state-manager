import Graphic from "@arcgis/core/Graphic";

import {
    EngineRunArgs,
    EngineRunResult,
    EngineRuntime,
    EngineMode,
} from "./types";

import { EngineContext } from "./context";
import { guid } from "./utils/ids";
import { logHistorySafe } from "./history";

import {
    loadInstance,
    loadToken,
    updateInstance,
    updateToken,
} from "./persistence";

/**
 * Mutable workflow runtime state.
 */
export interface RuntimeState extends EngineRuntime {
    joinSatisfied: boolean;
    tokenCompleted?: boolean;

}

/**
 * Initializes workflow execution.
 *
 * Supports:
 * - creating a new instance
 * - resuming an existing instance
 * - resuming a token branch
 */
export async function initializeRuntime(
    args: EngineRunArgs,
    ctx: EngineContext
): Promise<RuntimeState> {

    const {
        cfg,
        fields,
        persist,
        instanceLayer,
    } = ctx;

    const runtimeMode: EngineMode =
        args.tokenId ? "TOKEN" : "INSTANCE";

    let instanceId = args.instanceId;
    const tokenId = args.tokenId;

    let instanceObj: any;
    let tokenObj: any;

    //
    // Create a new workflow instance.
    //
    if (!instanceId) {

        if (runtimeMode === "TOKEN") {
            throw new Error(
                "Cannot create instance in TOKEN mode."
            );
        }

        instanceId = guid();

        instanceObj = {
            [fields.instanceIdField]: instanceId,
            [fields.processKeyField]: args.processKey,
            [fields.currentStateField]: cfg.startState,
            [fields.statusField]: "Running",
            [fields.varsJsonField]: JSON.stringify(
                args.initialVars ?? {}
            ),
        };

        ctx.memoryInstance = instanceObj;

        if (persist && instanceLayer) {

            await instanceLayer.applyEdits({
                addFeatures: [
                    new Graphic({
                        attributes: instanceObj,
                    }),
                ],
            });

            instanceObj =
                await loadInstance(
                    ctx,
                    instanceId
                );

            ctx.memoryInstance = instanceObj;
        }

        await logHistorySafe(
            ctx,
            instanceId,
            undefined,
            cfg.startState,
            "INSTANCE_CREATED",
            {
                processKey: args.processKey,
            }
        );
    }

    //
    // Load existing instance.
    //
    else {

        instanceObj =
            await loadInstance(
                ctx,
                instanceId
            );

        ctx.memoryInstance = instanceObj;

        if (!instanceObj) {
            throw new Error(
                `Instance not found: ${instanceId}`
            );
        }
    }

    //
    // Load token execution.
    //
    if (runtimeMode === "TOKEN") {

        tokenObj =
            await loadToken(
                ctx,
                tokenId
            );

        ctx.memoryToken = tokenObj;

        if (!tokenObj) {
            throw new Error(
                `Token not found: ${tokenId}`
            );
        }

        //
        // Token controls which instance is executed.
        //
        const tokenInstanceId =
            tokenObj[
                fields.tokenInstanceIdField
            ];

        if (
            tokenInstanceId &&
            tokenInstanceId !== instanceId
        ) {

            instanceId = tokenInstanceId;

            instanceObj =
                await loadInstance(
                    ctx,
                    instanceId
                );

            ctx.memoryInstance = instanceObj;

            if (!instanceObj) {
                throw new Error(
                    `Instance not found: ${instanceId}`
                );
            }
        }
    }

    const currentState =
        runtimeMode === "TOKEN"
            ? tokenObj[fields.tokenStateField]
            : instanceObj[fields.currentStateField];

    const currentStatus =
        runtimeMode === "TOKEN"
            ? tokenObj[fields.tokenStatusField]
            : instanceObj[fields.statusField];

    return {
        instanceId,
        tokenId,
        runtimeMode,
        instanceObj,
        tokenObj,

        varsObj: parseVars(
            instanceObj[fields.varsJsonField] as string
        ),

        currentState,
        currentStatus,

        stateDef:
            cfg.states[currentState],

        stepsExecuted: 0,
        joinSatisfied: false,
        tokenCompleted: false
    };
}

/**
 * Refreshes runtime state from persistence.
 */
export async function refreshRuntime(
    runtime: RuntimeState,
    ctx: EngineContext
): Promise<void> {

    const { fields } = ctx;

    runtime.instanceObj =
        await loadInstance(
            ctx,
            runtime.instanceId
        );

    ctx.memoryInstance =
        runtime.instanceObj;

    if (!runtime.instanceObj) {
        throw new Error(
            `Instance missing: ${runtime.instanceId}`
        );
    }

    if (runtime.runtimeMode === "TOKEN") {

        runtime.tokenObj =
            await loadToken(
                ctx,
                runtime.tokenId
            );

        ctx.memoryToken =
            runtime.tokenObj;

        if (!runtime.tokenObj) {
            throw new Error(
                `Token missing: ${runtime.tokenId}`
            );
        }
    }

    //
    // Resume waiting instance.
    //
    if (
        runtime.runtimeMode === "INSTANCE" &&
        runtime.instanceObj[
            fields.statusField
        ] === "Waiting"
    ) {

        await updateInstance(
            ctx,
            runtime.instanceObj,
            {
                [fields.statusField]:
                    "Running",
            }
        );

        await logHistorySafe(
            ctx,
            runtime.instanceId,
            undefined,
            runtime.instanceObj[
                fields.currentStateField
            ] as string,
            "INSTANCE_RESUME",
            {}
        );
    }

    //
    // Resume waiting token.
    //
    if (
        runtime.runtimeMode === "TOKEN" &&
        runtime.tokenObj[
            fields.tokenStatusField
        ] === "Waiting"
    ) {

        await updateToken(
            ctx,
            runtime.tokenObj,
            {
                [fields.tokenStatusField]:
                    "Active",
            }
        );

        await logHistorySafe(
            ctx,
            runtime.instanceId,
            runtime.tokenId,
            runtime.tokenObj[
                fields.tokenStateField
            ] as string,
            "TOKEN_RESUME",
            {}
        );
    }

    runtime.varsObj = parseVars(
        runtime.instanceObj[
            fields.varsJsonField
        ] as string
    );

    runtime.currentState =
        runtime.runtimeMode === "TOKEN"
            ? runtime.tokenObj[
                  fields.tokenStateField
              ]
            : runtime.instanceObj[
                  fields.currentStateField
              ];

    runtime.currentStatus =
        runtime.runtimeMode === "TOKEN"
            ? runtime.tokenObj[
                  fields.tokenStatusField
              ]
            : runtime.instanceObj[
                  fields.statusField
              ];

    runtime.stateDef =
        ctx.cfg.states[
            runtime.currentState
        ];

    if (!runtime.stateDef) {
        throw new Error(
            `State not defined: ${runtime.currentState}`
        );
    }
}

/**
 * Builds the final execution result.
 */
export function buildResult(
    runtime: RuntimeState,
    ctx: EngineContext
): EngineRunResult {

    const { fields } = ctx;

    return {
        instanceId: runtime.instanceId,
        tokenId: runtime.tokenId,
        mode: runtime.runtimeMode,

        status:
            runtime.runtimeMode === "TOKEN"
                ? runtime.tokenObj[
                      fields.tokenStatusField
                  ]
                : runtime.instanceObj[
                      fields.statusField
                  ],

        state:
            runtime.runtimeMode === "TOKEN"
                ? runtime.tokenObj[
                      fields.tokenStateField
                  ]
                : runtime.instanceObj[
                      fields.currentStateField
                  ],

        stepsExecuted:
            runtime.stepsExecuted,

        joinSatisfied:
            runtime.joinSatisfied,
    };
}


/**
 * Safely parses workflow variables.
 */
function parseVars(
    json?: string
): Record<string, any> {

    try {
        return JSON.parse(
            json ?? "{}"
        );
    }
    catch {
        return {};
    }
}