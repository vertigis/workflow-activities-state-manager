import Graphic from "@arcgis/core/Graphic";

import { EngineContext } from "./context";

import { nowUtc } from "./utils/ids";

/**
 * Writes a history record when persistence is enabled.
 *
 * Callers should generally use this helper instead of
 * calling logHistory() directly.
 */
export async function logHistorySafe(
    ctx: EngineContext,
    instanceId: string,
    tokenId: string | undefined,
    state: string,
    eventType: string,
    details: any
): Promise<void> {

    if (!ctx.persist || !ctx.historyLayer) {
        return;
    }

    await logHistory(
        ctx,
        instanceId,
        tokenId,
        state,
        eventType,
        details
    );
}

/**
 * Writes a history record to the configured history layer.
 */
export async function logHistory(
    ctx: EngineContext,
    instanceId: string,
    tokenId: string | undefined,
    state: string,
    eventType: string,
    details: any
): Promise<void> {

    const {
        historyLayer,
        fields,
    } = ctx;

    //
    // Nothing to write.
    //
    if (!historyLayer || !instanceId) {
        return;
    }

    //
    // Create the history record.
    //
    await historyLayer.applyEdits({
        addFeatures: [
            new Graphic({
                attributes: {
                    [fields.historyInstanceIdField]:
                        instanceId,

                    [fields.historyTokenIdField]:
                        tokenId,

                    [fields.historyTimestampField]:
                        nowUtc(),

                    [fields.historyStateField]:
                        state,

                    [fields.historyEventTypeField]:
                        eventType,

                    [fields.historyDetailsJsonField]:
                        JSON.stringify(
                            details ?? {}
                        ),
                },
            }),
        ],
    });
}