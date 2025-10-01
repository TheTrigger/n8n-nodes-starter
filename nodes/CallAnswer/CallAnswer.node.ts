import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class CallAnswer implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Call: Answer',
		name: 'callAnswer',
		icon: 'fa:phone',
		group: ['transform'],
		version: 1,
		subtitle: 'Answer incoming call',
		description: 'Answers an incoming call',
		defaults: {
			name: 'Call: Answer',
		},
		inputs: ['main'],
		outputs: ['main', 'main'],
		outputNames: ['Answered', 'Error'],
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
				description: 'The ID of the call to answer',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials = await this.getCredentials('voiceNetApi');

		const answeredItems: INodeExecutionData[] = [];
		const errorItems: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const callId = this.getNodeParameter('callId', itemIndex) as string;

			try {
				// TODO: Add idempotency key for retries
				const idempotencyKey = `answer-${callId}-${Date.now()}`;

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'voiceNetApi',
					{
						method: 'POST',
						url: `${credentials.baseUrl}/calls/${callId}/answer`,
						headers: {
							'X-Idempotency-Key': idempotencyKey,
						},
						body: {},
						returnFullResponse: false,
					}
				);

				answeredItems.push({
					json: {
						status: 'answered',
						callId,
						response,
						call: items[itemIndex].json.call || { callId },
					},
					pairedItem: itemIndex,
				});
			} catch (error) {
				// Handle error but don't throw to allow continuing with other items
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';

				errorItems.push({
					json: {
						status: 'error',
						callId,
						error: errorMessage,
						call: items[itemIndex].json.call || { callId },
					},
					pairedItem: itemIndex,
				});

				// TODO: Implement retry logic for transient failures
				// if (isRetriableError(error)) {
				//   // Retry with exponential backoff
				// }
			}
		}

		// Return two outputs: [Answered, Error]
		return [answeredItems, errorItems];
	}
}