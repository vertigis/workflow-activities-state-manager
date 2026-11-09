import type { IActivityHandler } from "@vertigis/workflow";
import { IActivityContext } from "@vertigis/workflow/IActivityHandler";
import { MapProvider } from "@vertigis/workflow/activities/arcgis/MapProvider";
import { activate } from "@vertigis/workflow/Hooks";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import WebMap from "@arcgis/core/WebMap";


export interface GetTokensInputs {
    /**
     * @description The ID of the instance to resume.
     * @required
     */
    instanceId: string;
    /**
     * @description The ID of the token table.
     */
    tokenTableId: string;

}

/** An interface that defines the outputs of the activity. */
interface GetTokensOutputs {
    /**
     * @description The result of the activity.
     */
    result: any;
}

/**
 * @displayName GetTokens
 * @category State Engine
 * @description Returns the persisted tokens for a given instance of the State Engine.
 * 
 * @clientOnly
 * @supportedApps GWV
 */
@activate(MapProvider)
export default class GetTokensActivity implements IActivityHandler {
    /** Perform the execution logic of the activity. */
    async execute(inputs: GetTokensInputs, context: IActivityContext,
        MapProviderType: typeof MapProvider): Promise<GetTokensOutputs> {
        const { instanceId, tokenTableId } = inputs;
        if (!instanceId) {
            throw new Error("instanceId is required");
        }
        if (!tokenTableId) {
            throw new Error("tokenTableId is required");
        }
        const mapProvider = MapProviderType.create();
        await mapProvider.load();
        const map = mapProvider.map as WebMap;

        if (!map) {
            throw new Error("map is required");
        }

        const tokenLayer = map.findTableById(inputs.tokenTableId) as FeatureLayer;

        const tokenFeatures = await tokenLayer.queryFeatures({
            where: `instanceId = '${inputs.instanceId}'`,
            outFields: ["*"]
        });

        const result = tokenFeatures?.features.map(feature => feature.attributes);


        return {
            result
        };
    }
}
