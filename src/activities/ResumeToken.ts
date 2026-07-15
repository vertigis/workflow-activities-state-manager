import type { IActivityHandler } from "@vertigis/workflow";
import { IActivityContext } from "@vertigis/workflow/IActivityHandler";
import { MapProvider } from "@vertigis/workflow/activities/arcgis/MapProvider";
import { activateTwo } from "@vertigis/workflow/Hooks";

import { runEngineOnce } from "../engine/engine";
import InvokeHandler from "./InvokeHandler";

import WebMap from "@arcgis/core/WebMap";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import { ChannelProvider } from "@vertigis/workflow/activities/core/ChannelProvider";

export interface RunStateEngineInputs {
    /**
     * @description The process key of the instance to resume.
     * @required
     */
    processKey: string;
    /**
     * @description The ID of the instance to resume.
     * @required
     */
    instanceId?: string;
    /**
     * @description The ID of the token to resume.
     * @required
     */
    tokenId?: string;
    /**
     * @description The initial variables for the state engine.
     */
    initialVars?: any;
    /**
     * @description The maximum number of steps to execute before returning.
     */
    maxSteps?: number;
    /**
     * @description The configuration JSON for the state engine.
     * @required
     */
    configJson: any;
    /**
     * @description The ID of the instance table.
     */
    instanceTableId?: string;
    /**
     * @description The ID of the token table.
     */
    tokenTableId?: string;
    /**
     * @description The ID of the history table.
     */
    historyTableId?: string;
    /**
     * @description Whether to persist the state of the instance after resuming.
     */
    persistState?: boolean;
    /**
     * @description The name of the field in the instance table that contains the instance variables JSON.
     */
    instanceVarsJsonField?: string;
    /**
     * @description The name of the field in the token table that contains the token delta JSON.
     */
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

        if (!inputs.instanceTableId || !inputs.tokenTableId || !inputs.historyTableId) {
            throw new Error(
                "instanceTableId, tokenTableId, and historyTableId are required when resuming a token"
            );
        }

        const mapProvider = MapProviderType.create();
        await mapProvider.load();

        const map = mapProvider.map as WebMap;
        if (!map) {
            throw new Error("map is required");
        }

        const instanceLayer = map.findTableById(inputs.instanceTableId) as FeatureLayer;
        const tokenLayer = map.findTableById(inputs.tokenTableId) as FeatureLayer;
        const historyLayer = map.findTableById(inputs.historyTableId) as FeatureLayer;

        if (!instanceLayer) {
            throw new Error(`Instance table not found: ${inputs.instanceTableId}`);
        }
        if (!tokenLayer) {
            throw new Error(`Token table not found: ${inputs.tokenTableId}`);
        }
        if (!historyLayer) {
            throw new Error(`History table not found: ${inputs.historyTableId}`);
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
            instanceId: inputs.instanceId ?? undefined,
            tokenId: inputs.tokenId,
            initialVars: inputs.initialVars ?? undefined,
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