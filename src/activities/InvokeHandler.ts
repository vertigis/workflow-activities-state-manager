import { IActivityContext } from "@vertigis/workflow/IActivityHandler";
import { RunWorkflow } from "@vertigis/workflow/activities/arcgis/RunWorkflow";
import { ChannelProvider } from "@vertigis/workflow/activities/core/ChannelProvider";
import type { IActivityHandler } from "@vertigis/workflow";

export interface InvokeHandlerInputs {
    /**
     * @description The URL of the Workflow to invoke.
     * @required
     */
    url: string,
    /**
     * @description The inputs to pass to the invoked Workflow.
     * @required
     */
    handlerInputs: Record<string, any>,
}

export default class InvokeHandler implements IActivityHandler {
    async execute(
        args: InvokeHandlerInputs,
        context: IActivityContext,
        ChannelProviderType: typeof ChannelProvider
    ): Promise<any> {
        const { url, handlerInputs } = args;
        const runner = new RunWorkflow();
        return await runner.execute(
            {
                url: url,
                arguments: handlerInputs,
            },
            context,
            ChannelProviderType
        );
    }
}