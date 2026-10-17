import Graphic from "@arcgis/core/Graphic";

import { EngineContext } from "./context";
import { BranchDef } from "./types";

import {
    mapAttributes,
    mapUpdates,
} from "./utils/fieldMapping";

import { guid } from "./utils/ids";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

/**
 * Loads an instance record.
 *
 * Supports both persisted and in-memory execution.
 */
export async function loadInstance(
    ctx: EngineContext,
    instanceId: string
): Promise<Record<string, any> | undefined> {

    const {
        persist,
        memoryInstance,
        instanceLayer,
        fields,
    } = ctx;

    if (!persist) {

        if (!memoryInstance) {
            throw new Error(
                "Instance not initialized."
            );
        }

        return memoryInstance;
    }

    if (!instanceLayer) {
        return undefined;
    }

    const rows =
        await instanceLayer.queryFeatures({
            where:
                `${fields.instanceIdField}='${instanceId}'`,
            outFields: ["*"],
        });

    return mapAttributes(
        (rows.features[0]?.attributes ?? {}) as Record<string, any>,
        fields
    );
}

/**
 * Loads a token record.
 *
 * Supports both persisted and in-memory execution.
 */
export async function loadToken(
    ctx: EngineContext,
    tokenId: string
): Promise<Record<string, any> | undefined> {

    const {
        persist,
        memoryToken,
        tokenLayer,
        fields,
    } = ctx;

    if (!persist) {

        if (!memoryToken) {
            throw new Error(
                "Token not initialized."
            );
        }

        return memoryToken;
    }

    if (!tokenLayer) {
        return undefined;
    }

    const rows =
        await tokenLayer.queryFeatures({
            where:
                `${fields.tokenIdField}='${tokenId}'`,
            outFields: ["*"],
        });

    return mapAttributes(
        (rows.features[0]?.attributes ?? {}) as Record<string, any>,
        fields
    );
}

/**
 * Updates an instance record.
 */
export async function updateInstance(
    ctx: EngineContext,
    instanceObj: Record<string, any>,
    updates: Record<string, any>
): Promise<void> {

    Object.assign(
        instanceObj,
        updates
    );

    if (!ctx.persist) {
        ctx.memoryInstance =
            instanceObj;

        return;
    }

    if (!ctx.instanceLayer) {
        return;
    }

    await applyFeatureUpdate(
        ctx.instanceLayer,
        instanceObj,
        updates
    );
}

/**
 * Updates a token record.
 */
export async function updateToken(
    ctx: EngineContext,
    tokenObj: Record<string, any>,
    updates: Record<string, any>
): Promise<void> {

    Object.assign(
        tokenObj,
        updates
    );

    if (!ctx.persist) {
        ctx.memoryToken =
            tokenObj;

        return;
    }

    if (!ctx.tokenLayer) {
        return;
    }

    await applyFeatureUpdate(
        ctx.tokenLayer,
        tokenObj,
        updates
    );
}

/**
 * Creates an instance record.
 */
export async function createInstance(
    ctx: EngineContext,
    attributes: Record<string, any>
): Promise<Record<string, any>> {

    if (!ctx.persist) {

        ctx.memoryInstance =
            attributes;

        return attributes;
    }

    if (!ctx.instanceLayer) {
        throw new Error(
            "Instance layer is required."
        );
    }

    await ctx.instanceLayer.applyEdits({
        addFeatures: [
            new Graphic({
                attributes,
            }),
        ],
    });

    return loadInstance(
        ctx,
        attributes[
            ctx.fields.instanceIdField
        ] as string
    );
}

/**
 * Creates a token record.
 */
export async function createToken(
    ctx: EngineContext,
    attributes: Record<string, any>
): Promise<any> {

    if (!ctx.persist) {

        ctx.memoryToken =
            attributes;

        return attributes;
    }

    if (!ctx.tokenLayer) {
        throw new Error(
            "Token layer is required."
        );
    }

    await ctx.tokenLayer.applyEdits({
        addFeatures: [
            new Graphic({
                attributes,
            }),
        ],
    });

    return loadToken(
        ctx,
        attributes[
            ctx.fields.tokenIdField
        ] as string
    );
}

/**
 * Creates a token for each branch of a parallel state.
 */
export async function spawnTokens(
    ctx: EngineContext,
    instanceId: string,
    joinState: string,
    branches: BranchDef[]
): Promise<void> {

    const {
        persist,
        tokenLayer,
        fields,
    } = ctx;

    if (!persist) {
        throw new Error(
            "Parallel execution requires persisted state."
        );
    }

    if (!tokenLayer) {
        throw new Error(
            "Token layer is required."
        );
    }

    const addFeatures = branches.map(
        branch =>
            new Graphic({
                attributes: {
                    [fields.tokenIdField]:
                        guid(),

                    [fields.tokenInstanceIdField]:
                        instanceId,

                    [fields.branchKeyField]:
                        branch.branchKey,

                    [fields.tokenStateField]:
                        branch.state,

                    [fields.tokenStatusField]:
                        "Active",

                    [fields.joinGroupField]:
                        joinState,

                    Outcome: undefined,
                    LastError: undefined,
                },
            })
    );

    if (addFeatures.length > 0) {

        await tokenLayer.applyEdits({
            addFeatures,
        });
    }
}

/**
 * Returns all tokens participating in a join group.
 */
export async function queryTokensForJoin(
    ctx: EngineContext,
    instanceId: string,
    joinGroup: string
): Promise<Record<string, any>[]> {

    const {
        tokenLayer,
        fields,
    } = ctx;

    if (!tokenLayer) {
        return [];
    }

    const rows =
        await tokenLayer.queryFeatures({
            where:
                `${fields.tokenInstanceIdField}='${instanceId}' ` +
                `AND ${fields.joinGroupField}='${joinGroup}'`,
            outFields: ["*"],
        });

    return rows.features.map(
        feature =>
            mapAttributes(
                feature.attributes as Record<string, any>,
                fields
            )
    );
}

/**
 * Applies attribute updates to a layer record.
 */
async function applyFeatureUpdate(
    layer: FeatureLayer,
    current: Record<string, any>,
    updates: Record<string, any>
): Promise<void> {

    const mapped =
        mapUpdates(
            updates,
            layer
        );

    await layer.applyEdits({
        updateFeatures: [
            new Graphic({
                attributes: {
                    OBJECTID:
                        current[
                            layer.objectIdField
                        ],
                    ...mapped,
                },
            }),
        ],
    });
}