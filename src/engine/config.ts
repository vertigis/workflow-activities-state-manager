import { EngineConfig, TableMapping } from "./types";
import { EngineFields } from "./context";

/**
 * Removes JavaScript-style comments from JSON configuration.
 *
 * Supports:
 * - // single-line comments
 * - /* block comments *\/
 */
export function stripJsonComments(
    json: string
): string {

    return json
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "");
}

/**
 * Parses the workflow configuration.
 *
 * Accepts either:
 * - an EngineConfig object
 * - a JSON string (comments allowed)
 */
export function parseConfig(
    config: EngineConfig | string
): EngineConfig {

    if (typeof config !== "string") {
        return config;
    }

    return JSON.parse(
        stripJsonComments(config)
    );
}

/**
 * Builds the effective field mapping used by the engine.
 *
 * Any field not supplied in TableMapping falls back to the
 * engine's default field name.
 */
export function defaults(
    tables: TableMapping
): EngineFields {

    return {
        //
        // Instance fields
        //
        instanceIdField:
            tables.instanceIdField ?? "InstanceId",

        processKeyField:
            tables.processKeyField ?? "ProcessKey",

        currentStateField:
            tables.currentStateField ?? "CurrentState",

        statusField:
            tables.statusField ?? "Status",

        varsJsonField:
            tables.varsJsonField ?? "ParamsJson",

        //
        // Token fields
        //
        tokenIdField:
            tables.tokenIdField ?? "TokenId",

        tokenInstanceIdField:
            tables.tokenInstanceIdField ?? "InstanceId",

        branchKeyField:
            tables.branchKeyField ?? "BranchKey",

        tokenStateField:
            tables.tokenStateField ?? "State",

        tokenOutcomeField:
            tables.tokenOutcomeField ?? "Outcome",

        joinGroupField:
            tables.joinGroupField ?? "JoinGroup",
        
        tokenStatusField:
            tables.tokenStatusField ?? "Status",

        //
        // History fields
        //
        historyInstanceIdField:
            tables.historyInstanceIdField ?? "InstanceId",

        historyTokenIdField:
            tables.historyTokenIdField ?? "TokenId",

        historyTimestampField:
            tables.historyTimestampField ?? "TimestampUtc",

        historyStateField:
            tables.historyStateField ?? "State",

        historyEventTypeField:
            tables.historyEventTypeField ?? "EventType",

        historyDetailsJsonField:
            tables.historyDetailsJsonField ?? "DetailsJson",

        //
        // Target fields
        //
        targetInstanceIdField:
            tables.targetInstanceIdField ?? "InstanceId",
    };
}