import type { IActivityHandler } from "@vertigis/workflow";
import { IActivityContext } from "@vertigis/workflow/IActivityHandler";
import { MapProvider } from "@vertigis/workflow/activities/arcgis/MapProvider";
import { activateTwo } from "@vertigis/workflow/Hooks";

import { HandlerResult, runEngineOnce } from "../engine/engine";
import InvokeHandler from "./InvokeHandler";

import WebMap from "@arcgis/core/WebMap";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import { ChannelProvider } from "@vertigis/workflow/activities/core/ChannelProvider";
export interface RunStateEngineInputs {
    processKey: string;
    instanceId?: string;
    tokenId?: string;
    initialVars?: any;
    maxSteps?: number;
    configJson: any;
    instanceLayerId?: string;
    tokenLayerId?: string;
    historyLayerId?: string;
    persistState?: boolean;
    instanceVarsJsonField?: string;
    tokenDeltaJsonField?: string;
}
export interface RunStateEngineOutputs {
    instanceId: string;
    tokenId?: string;
    mode: string;
    status: string;
    state: string;
    outcome?: string;
    stepsExecuted: number;
}

/**
 * @category State Engine
 * @description Runs the configured state-machine for an instance or token.
 * @clientOnly
 * @supportedApps GWV
 */
@activateTwo(ChannelProvider, MapProvider)
export class RunStateEngine implements IActivityHandler {

    async execute(
        inputs: RunStateEngineInputs,
        context: IActivityContext,
        ChannelProviderType: typeof ChannelProvider,
        MapProviderType: typeof MapProvider
    ): Promise<RunStateEngineOutputs> {

        if (!inputs.processKey) {
            throw new Error("processKey is required");
        }
        if (!inputs.configJson) {
            throw new Error("configJson is required");
        }

        const persistState = inputs.persistState !== false;
        let instanceLayer: FeatureLayer | undefined;
        let tokenLayer: FeatureLayer | undefined;
        let historyLayer: FeatureLayer | undefined;

        if (persistState) {
            if (!inputs.instanceLayerId || !inputs.tokenLayerId || !inputs.historyLayerId) {
                throw new Error(
                    "instanceLayerId, tokenLayerId, and historyLayerId are required when persistState=true"
                );
            }

            const mapProvider = MapProviderType.create();
            await mapProvider.load();
            const map = mapProvider.map as WebMap;

            if (!map) {
                throw new Error("map is required");
            }

            instanceLayer = map.findTableById(inputs.instanceLayerId) as FeatureLayer;
            tokenLayer = map.findTableById(inputs.tokenLayerId) as FeatureLayer;
            historyLayer = map.findTableById(inputs.historyLayerId) as FeatureLayer;

            if (!instanceLayer) {
                throw new Error(`Instance layer not found: ${inputs.instanceLayerId}`);
            }
            if (!tokenLayer) {
                throw new Error(`Token layer not found: ${inputs.tokenLayerId}`);
            }
            if (!historyLayer) {
                throw new Error(`History layer not found: ${inputs.historyLayerId}`);
            }
        }

        const invokeHandlerByName: (url: string, handlerInputs: Record<string, any>) => Promise<HandlerResult> = async (
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
        }

        const result = await runEngineOnce({
            processKey: inputs.processKey,
            instanceId: inputs.instanceId ?? undefined,
            tokenId: inputs.tokenId ?? undefined,
            initialVars: inputs.initialVars ?? undefined,
            maxSteps: inputs.maxSteps ?? 50,
            config: inputs.configJson,
            instanceLayer,
            tokenLayer,
            historyLayer,
            persistState,
            tables: {
                varsJsonField: inputs.instanceVarsJsonField ?? "VarsJson",
                tokenDeltaJsonField: inputs.tokenDeltaJsonField ?? "ParamsDeltaJson",
            },
            invokeHandler: invokeHandlerByName,
            context,
        });

        return {
            instanceId: result.instanceId,
            tokenId: result.tokenId ?? undefined,
            mode: result.mode,
            status: result.status,
            state: result.state,
            outcome: result.outcome ?? undefined,
            stepsExecuted: result.stepsExecuted,
        };
    }
}

export default RunStateEngine;
