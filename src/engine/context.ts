import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

import { EngineConfig } from "./types";

/**
 * Canonical field names used by the engine.
 *
 * These names are resolved from TableMapping and then used
 * internally throughout the engine to avoid hard-coding
 * database-specific field names.
 */
export interface EngineFields {

    //
    // Instance fields
    //
    instanceIdField: string;
    processKeyField: string;
    currentStateField: string;
    statusField: string;
    varsJsonField: string;

    //
    // Token fields
    //
    tokenIdField: string;
    tokenInstanceIdField: string;
    branchKeyField: string;
    tokenStateField: string;
    tokenStatusField: string;
    tokenOutcomeField: string;
    joinGroupField: string;

    //
    // History fields
    //
    historyInstanceIdField: string;
    historyTokenIdField: string;
    historyTimestampField: string;
    historyStateField: string;
    historyEventTypeField: string;
    historyDetailsJsonField: string;

    //
    // Target/business record fields
    //
    targetInstanceIdField: string;
}

/**
 * Shared execution context passed throughout the engine.
 *
 * Centralizes access to:
 * - workflow configuration
 * - resolved field mappings
 * - persistence settings
 * - ArcGIS layers
 * - in-memory runtime objects
 */
export interface EngineContext {

    /**
     * Parsed workflow configuration.
     */
    cfg: EngineConfig;

    /**
     * Effective field mappings used by the engine.
     */
    fields: EngineFields;

    /**
     * Indicates whether state should be persisted to
     * ArcGIS layers or kept entirely in memory.
     */
    persist: boolean;

    //
    // Persistence layers
    //
    tokenLayer?: FeatureLayer;
    instanceLayer?: FeatureLayer;
    historyLayer?: FeatureLayer;

    //
    // In-memory state used when persistence is disabled.
    //
    memoryInstance?: any;
    memoryToken?: any;
}