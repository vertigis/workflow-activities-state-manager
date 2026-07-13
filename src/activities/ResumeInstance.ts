import type { IActivityHandler } from "@vertigis/workflow";
import { IActivityContext } from "@vertigis/workflow/IActivityHandler";
import { MapProvider } from "@vertigis/workflow/activities/arcgis/MapProvider";
import { activateTwo } from "@vertigis/workflow/Hooks";

import { runEngineOnce } from "../engine/engine";
import InvokeHandler from "./InvokeHandler";

import WebMap from "@arcgis/core/WebMap";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Graphic from "@arcgis/core/Graphic";
import { ChannelProvider } from "@vertigis/workflow/activities/core/ChannelProvider";

export interface ResumeInstanceInputs {
    processKey: string;
    instanceId: string;
    configJson: any;
    instanceLayerId?: string;
    tokenLayerId?: string;
    historyLayerId?: string;
    maxSteps?: number;
    instanceVarsJsonField?: string;
    tokenDeltaJsonField?: string;
    persistState?: boolean;
}

export interface ResumeInstanceOutputs {
    resumed: boolean;
    status: string;
    state: string;
    stepsExecuted: number;
}


/**
 * @category State Engine
 * @description Resumes a Waiting instance and runs the engine in INSTANCE mode
 *              (e.g. to re-evaluate JOIN conditions).
 * @clientOnly
 * @supportedApps GWV
 */
@activateTwo(ChannelProvider, MapProvider)
export class ResumeInstance implements IActivityHandler {

    async execute(
        inputs: ResumeInstanceInputs,
        context: IActivityContext,
        ChannelProviderType: typeof ChannelProvider,
        MapProviderType: typeof MapProvider
    ): Promise<ResumeInstanceOutputs> {

        if (!inputs.processKey) {
            throw new Error("processKey is required");
        }
        if (!inputs.instanceId) {
            throw new Error("instanceId is required");
        }
        if (!inputs.configJson) {
            throw new Error("configJson is required");
        }
        const persistState = inputs.persistState !== false;

        if (!persistState) {
            throw new Error("ResumeInstance requires persistState=true");
        }

        if (!inputs.instanceLayerId || !inputs.tokenLayerId || !inputs.historyLayerId) {
            throw new Error(
                "instanceLayerId, tokenLayerId, and historyLayerId are required to resume an instance"
            );
        }

        const mapProvider = MapProviderType.create();
        await mapProvider.load();

        const map = mapProvider.map as WebMap;
        if (!map) {
            throw new Error("map is required");
        }

        const instanceLayer = map.findTableById(inputs.instanceLayerId) as FeatureLayer;
        const tokenLayer = map.findTableById(inputs.tokenLayerId) as FeatureLayer;
        const historyLayer = map.findTableById(inputs.historyLayerId) as FeatureLayer;

        if (!instanceLayer) {
            throw new Error(`Instance layer not found: ${inputs.instanceLayerId}`);
        }
        if (!tokenLayer) {
            throw new Error(`Token layer not found: ${inputs.tokenLayerId}`);
        }
        if (!historyLayer) {
            throw new Error(`History layer not found: ${inputs.historyLayerId}`);
        }

        const instQuery = await instanceLayer.queryFeatures({
            where: `InstanceId='${inputs.instanceId}'`,
            outFields: ["*"],
        });

        const instRow = instQuery.features[0]?.attributes;
        if (!instRow) {
            throw new Error(`Instance not found: ${inputs.instanceId}`);
        }

        if (instRow.Status !== "Waiting") {
            return {
                resumed: false,
                status: instRow.Status,
                state: instRow.CurrentState,
                stepsExecuted: 0,
            };
        }

        await instanceLayer.applyEdits({
            updateFeatures: [
                new Graphic({
                    attributes: {
                        OBJECTID: instRow.OBJECTID,
                        Status: "Running",
                    },
                }),
            ],
        });

        const invokeHandlerByName = async (
            url: string,
            handlerInputs: Record<string, any>,
        ) => {
            const runner = new InvokeHandler();

            return runner.execute(
                {
                    url,
                    handlerInputs
                },
                context,
                ChannelProviderType
            );
        };

        const result = await runEngineOnce({
            processKey: inputs.processKey,
            instanceId: inputs.instanceId,
            tokenId: undefined,
            initialVars: undefined,
            maxSteps: inputs.maxSteps ?? 50,
            config: inputs.configJson,

            persistState,

            instanceLayer,
            tokenLayer,
            historyLayer,

            tables: {
                varsJsonField: inputs.instanceVarsJsonField ?? "VarsJson",
                tokenDeltaJsonField: inputs.tokenDeltaJsonField ?? "ParamsDeltaJson",
            },
            invokeHandler: invokeHandlerByName,
            context,
        });

        return {
            resumed: true,
            status: result.status,
            state: result.state,
            stepsExecuted: result.stepsExecuted,
        };
    }
}

export default ResumeInstance;