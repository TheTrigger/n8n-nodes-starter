import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';

export class TransferCallTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Transfer Call Tool',
		name: 'transferCallTool',
		icon: 'fa:exchange-alt',
		group: ['transform'],
		version: 1,
		subtitle: 'Tool for Voice Agent',
		description: 'Transfer call tool compatible with Voice Agent tool port',
		defaults: {
			name: 'Transfer Call Tool',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Make this node usable as an AI tool
		usableAsTool: true,
		credentials: [
			{
				name: 'voiceNetApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Call ID',
				name: 'callId',
				type: 'string',
				required: true,
				default: '={{$json.call.callId}}',
				description: 'The ID of the call to transfer',
			},
			{
				displayName: 'Tool Descriptor',
				name: 'toolDescriptor',
				type: 'hidden',
				default: JSON.stringify({
					type: 'function',
					name: 'transfer_call',
					description: 'Transfer the current call to another extension or phone number',
					parameters: {
						type: 'object',
						properties: {
							target: {
								type: 'string',
								description: 'The extension or phone number to transfer to',
							},
							announceText: {
								type: 'string',
								description: 'Optional text to speak before transferring',
							},
						},
						required: ['target'],
					},
				}),
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('voiceNetApi');

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const callId = this.getNodeParameter('callId', itemIndex) as string;

			// Check if this is a tool invocation from Voice Agent
			const toolCall = items[itemIndex].json;
			if (toolCall.toolCallId && toolCall.name === 'transfer_call') {
				const args = toolCall.args as IDataObject;
				const target = args.target as string;
				const announceText = args.announceText as string | undefined;

				try {
					// Optionally announce before transfer
					if (announceText) {
						await this.helpers.httpRequestWithAuthentication.call(
							this,
							'voiceNetApi',
							{
								method: 'POST',
								url: `${credentials.baseUrl}/calls/${callId}/say`,
								body: {
									text: announceText,
								},
								returnFullResponse: false,
							}
						);
					}

					// Execute transfer
					await this.helpers.httpRequestWithAuthentication.call(
						this,
						'voiceNetApi',
						{
							method: 'POST',
							url: `${credentials.baseUrl}/calls/${callId}/transfer`,
							body: {
								target,
							},
							returnFullResponse: false,
						}
					);

					// Return tool result for Voice Agent
					returnData.push({
						json: {
							toolResult: {
								toolCallId: toolCall.toolCallId,
								name: 'transfer_call',
								result: {
									ok: true,
									status: 'transferred',
									target,
								},
							},
							call: { callId },
						},
						pairedItem: itemIndex,
					});
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';

					// Return error result
					returnData.push({
						json: {
							toolResult: {
								toolCallId: toolCall.toolCallId,
								name: 'transfer_call',
								result: {
									ok: false,
									error: errorMessage,
								},
							},
							call: { callId },
						},
						pairedItem: itemIndex,
					});
				}
			} else {
				// If not a tool call, just pass through the descriptor
				returnData.push({
					json: {
						type: 'function',
						name: 'transfer_call',
						description: 'Transfer the current call to another extension or phone number',
						parameters: {
							type: 'object',
							properties: {
								target: {
									type: 'string',
									description: 'The extension or phone number to transfer to',
								},
								announceText: {
									type: 'string',
									description: 'Optional text to speak before transferring',
								},
							},
							required: ['target'],
						},
					},
					pairedItem: itemIndex,
				});
			}
		}

		return [returnData];
	}
}