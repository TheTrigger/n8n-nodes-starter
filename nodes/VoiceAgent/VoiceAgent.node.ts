import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import WebSocket from 'ws';

export class VoiceAgent implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Voice Agent',
		name: 'voiceAgent',
		icon: 'fa:robot',
		group: ['transform'],
		version: 1,
		subtitle: 'AI Voice Agent',
		description: 'Voice agent with tool orchestration and WebSocket event handling',
		defaults: {
			name: 'Voice Agent',
		},
		inputs: [
			'main',
			{
				// @ts-ignore - Tool port for AI tools
				type: 'ai_tool',
				displayName: 'Tools',
				maxConnections: 10,
			},
		],
		outputs: [
			{ type: 'main', displayName: 'Tool Call' },
			{ type: 'main', displayName: 'Call Transferred' },
			{ type: 'main', displayName: 'Call Ended' },
			{ type: 'main', displayName: 'Error' },
		],
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
				description: 'The ID of the call to handle',
			},
			{
				displayName: 'Runtime Base URL',
				name: 'runtimeBase',
				type: 'string',
				default: '',
				placeholder: 'wss://api.voicenet.com/realtime',
				description: 'WebSocket URL for real-time communication. Leave empty to auto-derive from credentials',
			},
			{
				displayName: 'Base Prompt',
				name: 'promptBase',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: 'You are a helpful voice assistant. Be concise and friendly.',
				description: 'System prompt for the AI agent',
			},
			{
				displayName: 'User Instructions',
				name: 'userInstr',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder: 'Additional context-specific instructions...',
				description: 'Additional instructions for this session',
			},
			{
				displayName: 'Locale',
				name: 'locale',
				type: 'string',
				default: 'it-IT',
				description: 'Language locale for the conversation',
			},
			{
				displayName: 'Barge-In',
				name: 'bargeIn',
				type: 'boolean',
				default: true,
				description: 'Whether the caller can interrupt the AI while speaking',
			},
			{
				displayName: 'Tools Strategy',
				name: 'toolsStrategy',
				type: 'hidden',
				default: 'fromToolPort',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials = await this.getCredentials('voiceNetApi');

		// Initialize outputs: [Tool Call, Call Transferred, Call Ended, Error]
		const outputs: INodeExecutionData[][] = [[], [], [], []];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const callId = this.getNodeParameter('callId', itemIndex) as string;
			let runtimeBase = this.getNodeParameter('runtimeBase', itemIndex) as string;
			const promptBase = this.getNodeParameter('promptBase', itemIndex) as string;
			const userInstr = this.getNodeParameter('userInstr', itemIndex) as string;
			const locale = this.getNodeParameter('locale', itemIndex) as string;
			const bargeIn = this.getNodeParameter('bargeIn', itemIndex) as boolean;

			// Auto-derive WebSocket URL from credentials if not specified
			if (!runtimeBase) {
				const baseUrl = credentials.baseUrl as string;
				// Convert http(s) to ws(s)
				runtimeBase = baseUrl
					.replace('https://', 'wss://')
					.replace('http://', 'ws://') + '/realtime';
			}

			// Check if this is a tool result coming back
			if (items[itemIndex].json.toolResult) {
				// Send tool result back via WebSocket (if connection exists)
				// TODO: Maintain WebSocket connection across executions
				const toolResult = items[itemIndex].json.toolResult as IDataObject;
				await sendToolResult(callId, toolResult, runtimeBase);
				continue;
			}

			// Collect tool descriptors from tool port
			const tools = await collectTools.call(this);

			try {
				// Create session on backend
				await this.helpers.httpRequestWithAuthentication.call(
					this,
					'voiceNetApi',
					{
						method: 'POST',
						url: `${credentials.baseUrl}/session.create`,
						body: {
							callId,
							tools,
							promptBase,
							userInstr,
							locale,
							bargeIn,
						},
						returnFullResponse: false,
					}
				);

				// Connect WebSocket and listen for events
				await connectWebSocket(
					runtimeBase,
					callId,
					credentials.apiKey as string,
					outputs,
					itemIndex
				);
			} catch (error) {
				outputs[3].push({
					json: {
						code: 'SESSION_CREATE_ERROR',
						message: error instanceof Error ? error.message : 'Unknown error',
						callId,
					},
					pairedItem: itemIndex,
				});
			}
		}

		return outputs;
	}
}

async function collectTools(this: IExecuteFunctions): Promise<IDataObject[]> {
	const tools: IDataObject[] = [];

	try {
		// Get tools from second input (ai_tool port)
		// @ts-ignore - Tool port access
		const toolInputData = this.getInputData(1);

		if (toolInputData && toolInputData.length > 0) {
			for (const toolItem of toolInputData) {
				if (toolItem.json) {
					// Tool descriptor format
					if (toolItem.json.type === 'function' && toolItem.json.name) {
						tools.push({
							type: toolItem.json.type,
							name: toolItem.json.name,
							description: toolItem.json.description,
							parameters: toolItem.json.parameters,
						});
					}
					// Alternative format with 'tool' wrapper
					else if (toolItem.json.tool) {
						tools.push(toolItem.json.tool as IDataObject);
					}
				}
			}
		}
	} catch (error) {
		// No tools connected or error accessing tool port
		console.log('No tools connected or available');
	}

	return tools;
}

async function connectWebSocket(
	runtimeBase: string,
	callId: string,
	apiKey: string,
	outputs: INodeExecutionData[][],
	itemIndex: number
): Promise<void> {
	return new Promise((resolve, reject) => {
		const wsUrl = `${runtimeBase}?callId=${callId}&apiKey=${apiKey}`;
		const ws = new WebSocket(wsUrl);

		let heartbeatInterval: NodeJS.Timeout;

		ws.on('open', () => {
			// Send initial subscription message
			ws.send(JSON.stringify({
				type: 'subscribe',
				callId,
			}));

			// TODO: Implement heartbeat/keepalive
			heartbeatInterval = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) {
					ws.ping();
				}
			}, 30000);
		});

		ws.on('message', (data: Buffer) => {
			try {
				const message = JSON.parse(data.toString()) as IDataObject;

				switch (message.type) {
					case 'tool.call':
						const toolCall = message.toolCall as IDataObject;
						outputs[0].push({
							json: {
								toolCallId: toolCall?.id,
								name: toolCall?.name,
								args: toolCall?.args,
								callId,
							},
							pairedItem: itemIndex,
						});
						break;

					case 'call.transferred':
						outputs[1].push({
							json: {
								callId,
								target: message.target,
							},
							pairedItem: itemIndex,
						});
						break;

					case 'call.ended':
						outputs[2].push({
							json: {
								callId,
								reason: message.reason,
							},
							pairedItem: itemIndex,
						});
						// Close WebSocket on call end
						ws.close();
						break;

					case 'error':
						outputs[3].push({
							json: {
								code: message.code,
								message: message.message,
								callId,
							},
							pairedItem: itemIndex,
						});
						break;

					// TODO: Handle additional event types as needed
					// case 'play.finished':
					//   // Optional fifth output for play completion
					//   break;
				}
			} catch (error) {
				console.error('Failed to parse WebSocket message:', error);
			}
		});

		ws.on('error', (error: Error) => {
			outputs[3].push({
				json: {
					code: 'WEBSOCKET_ERROR',
					message: error.message,
					callId,
				},
				pairedItem: itemIndex,
			});
		});

		ws.on('close', () => {
			if (heartbeatInterval) {
				clearInterval(heartbeatInterval);
			}
			resolve();
		});

		// TODO: Implement reconnection logic with exponential backoff
		// TODO: Implement connection timeout
	});
}

async function sendToolResult(
	callId: string,
	toolResult: IDataObject,
	runtimeBase: string
): Promise<void> {
	// TODO: Maintain WebSocket connection across workflow executions
	// For now, create temporary connection to send result
	const ws = new WebSocket(`${runtimeBase}?callId=${callId}`);

	ws.on('open', () => {
		ws.send(JSON.stringify({
			type: 'tool.result',
			toolCallId: toolResult.toolCallId,
			name: toolResult.name,
			result: toolResult.result,
			callId,
		}));
		ws.close();
	});

	// TODO: Better error handling for tool result submission
}
