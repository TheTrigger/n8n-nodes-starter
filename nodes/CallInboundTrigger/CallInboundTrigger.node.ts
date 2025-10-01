import type {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	IDataObject,
} from 'n8n-workflow';

export class CallInboundTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Call Inbound Trigger',
		name: 'callInboundTrigger',
		icon: 'fa:phone-volume',
		group: ['trigger'],
		version: 1,
		subtitle: 'DID: {{$parameter["did"]}}',
		description: 'Triggers workflow when an incoming call arrives for a specific DID',
		defaults: {
			name: 'Call Inbound Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'voiceNetApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'voice-inbound',
			},
		],
		properties: [
			{
				displayName: 'DID (Direct Inward Dialing)',
				name: 'did',
				type: 'string',
				required: true,
				default: '',
				placeholder: '+391234567890',
				description: 'The phone number (DID) to listen for incoming calls',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				return staticData.subscriptionId !== undefined;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const credentials = await this.getCredentials('voiceNetApi');
				const webhookUrl = this.getNodeWebhookUrl('default');
				const did = this.getNodeParameter('did') as string;

				const workflowId = this.getWorkflow().id;
				const nodeId = this.getNode().id;

				const body: IDataObject = {
					workflowId,
					nodeId,
					callbackUrl: webhookUrl,
					rule: { did },
					events: ['incoming-call'],
				};

				// TODO: Implement actual HTTP request to backend
				// POST /integrations/n8n/dispatch/register
				try {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'voiceNetApi',
						{
							method: 'POST',
							url: `${credentials.baseUrl}/integrations/n8n/dispatch/register`,
							body,
							returnFullResponse: false,
						}
					);

					// Save subscription ID for later deletion
					const staticData = this.getWorkflowStaticData('node');
					staticData.subscriptionId = (response as IDataObject).subscriptionId;

					return true;
				} catch (error) {
					// TODO: Better error handling
					console.error('Failed to register webhook:', error);
					return false;
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const credentials = await this.getCredentials('voiceNetApi');
				const staticData = this.getWorkflowStaticData('node');

				if (!staticData.subscriptionId) {
					return true;
				}

				// TODO: Implement actual HTTP request to backend
				// POST /integrations/n8n/dispatch/unregister
				try {
					await this.helpers.httpRequestWithAuthentication.call(
						this,
						'voiceNetApi',
						{
							method: 'POST',
							url: `${credentials.baseUrl}/integrations/n8n/dispatch/unregister`,
							body: {
								subscriptionId: staticData.subscriptionId,
							},
							returnFullResponse: false,
						}
					);

					delete staticData.subscriptionId;
					return true;
				} catch (error) {
					// TODO: Better error handling
					console.error('Failed to unregister webhook:', error);
					return false;
				}
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		// const req = this.getRequestObject();
		// const credentials = await this.getCredentials('voiceNetApi');

		// TODO: Implement HMAC signature verification using req and credentials
		// const signature = req.headers['x-voice-signature'] as string;
		// const timestamp = req.headers['x-voice-timestamp'] as string;
		// if (credentials.signingSecret) {
		//   // Verify HMAC signature
		//   const expectedSignature = crypto
		//     .createHmac('sha256', credentials.signingSecret)
		//     .update(`${timestamp}.${JSON.stringify(body)}`)
		//     .digest('hex');
		//   if (signature !== expectedSignature) {
		//     return {
		//       webhookResponse: { status: 401, body: { error: 'Invalid signature' } },
		//     };
		//   }
		// }

		const body = this.getBodyData() as IDataObject;

		// Validate incoming event type
		if (body.type !== 'incoming-call') {
			return {
				webhookResponse: { status: 200, body: { message: 'Event ignored' } },
			};
		}

		// TODO: Optional deduplication based on eventId
		// const eventId = body.eventId as string;
		// if (eventId && isEventProcessed(eventId)) {
		//   return {
		//     webhookResponse: { status: 200, body: { message: 'Duplicate event' } },
		//   };
		// }

		// Extract call data
		const call = body.call as IDataObject;

		// Return call data to workflow
		return {
			workflowData: [
				this.helpers.returnJsonArray({
					call: {
						callId: call.callId,
						from: call.from,
						to: call.to,
						timestamp: new Date().toISOString(),
					},
				}),
			],
		};
	}
}