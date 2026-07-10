import type { IActivityHandler } from "@vertigis/workflow";
import { IActivityContext } from "@vertigis/workflow/IActivityHandler";
import { MapProvider } from "@vertigis/workflow/activities/arcgis/MapProvider";
import { activateTwo } from "@vertigis/workflow/Hooks";

import { EngineConfig, runEngineOnce } from "../engine/engine";
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
 * @description Resumes execution of a TOKEN-based state-machine.
 * @clientOnly
 * @supportedApps GWV
 */
@activateTwo(ChannelProvider, MapProvider)
export class ResumeToken implements IActivityHandler {

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
        if (!inputs.tokenId) {
            throw new Error("tokenId is required to resume a token");
        }
        const persistState = inputs.persistState !== false;

        if (!persistState) {
            throw new Error("ResumeToken requires persistState=true");
        }

        if (!inputs.instanceLayerId || !inputs.tokenLayerId || !inputs.historyLayerId) {
            throw new Error(
                "instanceLayerId, tokenLayerId, and historyLayerId are required when resuming a token"
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

        const invokeHandlerByName = async (
            url: string,
            handlerInputs: Record<string, any>,
        ) => {
            const runner = new InvokeHandler();

            return runner.execute(
                {
                    url,
                    handlerInputs,
                },
                context,
                ChannelProviderType
            );
        };

        const result = await runEngineOnce({
            processKey: inputs.processKey,
            instanceId: inputs.instanceId ?? null,
            tokenId: inputs.tokenId,
            initialVars: inputs.initialVars ?? null,
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

export default ResumeToken;