import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

import { EngineFields } from "../context";

/**
 * Normalizes feature attributes to use canonical field names.
 *
 * Example:
 *
 * Layer field:
 *   processkey
 *
 * Canonical field:
 *   ProcessKey
 *
 * Result:
 *   ProcessKey will exist in the returned object.
 */
export function mapAttributes(
    attrs: Record<string, any>,
    fields: EngineFields
): Record<string, any> {

    const result = { ...attrs };

    for (const fieldName of Object.values(fields)) {

        const actualFieldName =
            Object.keys(result).find(
                key =>
                    key.toLowerCase() ===
                    fieldName.toLowerCase()
            );

        if (!actualFieldName) {
            continue;
        }

        //
        // Replace the actual field name with the
        // canonical engine field name.
        //
        if (actualFieldName !== fieldName) {

            result[fieldName] =
                result[actualFieldName];

            delete result[actualFieldName];
        }
    }

    return result;
}

/**
 * Maps canonical engine field names to the actual
 * field names defined in the target layer.
 *
 * Matching is case-insensitive.
 */
export function mapUpdates(
    updates: Record<string, any>,
    layer: FeatureLayer
): Record<string, any> {

    const fieldLookup = new Map(
        layer.fields.map(field => [
            field.name.toLowerCase(),
            field.name,
        ])
    );

    const mapped: Record<string, any> = {};

    for (const [key, value] of Object.entries(updates)) {

        const actualFieldName =
            fieldLookup.get(key.toLowerCase())
            ?? key;

        mapped[actualFieldName] = value;
    }

    return mapped;
}