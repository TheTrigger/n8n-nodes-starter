import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';

export class CallPlay implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Call: Play',
		name: 'callPlay',
		icon: 'fa:play',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["sourceType"]}}',
		description: 'Play audio in an active call (non-blocking)',
		defaults: {
			name: 'Call: Play',
		},
		inputs: ['main'],
		outputs: ['main', 'main'],
		outputNames: ['Play Started', 'Error'],
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
				description: 'The ID of the call to play audio in',
			},
			{
				displayName: 'Source Type',
				name: 'sourceType',
				type: 'options',
				options: [
					{
						name: 'URL',
						value: 'url',
						description: 'Play audio from a URL',
					},
					{
						name: 'File Upload',
						value: 'fileBinary',
						description: 'Upload an audio file',
					},
					{
						name: 'Library Asset',
						value: 'libraryAsset',
						description: 'Use a pre-uploaded asset from the library',
					},
				],
				default: 'url',
				description: 'Source of the audio to play',
			},
			// URL source
			{
				displayName: 'Audio URL',
				name: 'audioUrl',
				type: 'string',
				displayOptions: {
					show: {
						sourceType: ['url'],
					},
				},
				default: '',
				placeholder: 'https://example.com/audio/welcome.wav',
				description: 'URL of the audio file to play',
			},
			// File upload source
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: {
					show: {
						sourceType: ['fileBinary'],
					},
				},
				default: 'audio',
				description: 'Name of the binary property containing the audio file',
			},
			// Library asset source
			{
				displayName: 'Asset',
				name: 'assetId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getLibraryAssets',
				},
				displayOptions: {
					show: {
						sourceType: ['libraryAsset'],
					},
				},
				default: '',
				description: 'Select an asset from the library',
			},
			{
				displayName: 'Barge-In',
				name: 'bargeIn',
				type: 'boolean',
				default: false,
				description: 'Whether the caller can interrupt the audio by speaking',
			},
		],
	};

	methods = {
		loadOptions: {
			async getLibraryAssets(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('voiceNetApi');

				try {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'voiceNetApi',
						{
							method: 'GET',
							url: `${credentials.baseUrl}/media/assets`,
							returnFullResponse: false,
						}
					);

					const assets = response as IDataObject[];
					return assets.map((asset) => ({
						name: asset.name as string,
						value: asset.id as string,
						description: asset.description as string,
					}));
				} catch (error) {
					// Return empty list if fetch fails
					return [];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials = await this.getCredentials('voiceNetApi');

		const startedItems: INodeExecutionData[] = [];
		const errorItems: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const callId = this.getNodeParameter('callId', itemIndex) as string;
			const sourceType = this.getNodeParameter('sourceType', itemIndex) as string;
			const bargeIn = this.getNodeParameter('bargeIn', itemIndex) as boolean;

			try {
				let playRequest: IDataObject = { bargeIn };
				let playUrl = `${credentials.baseUrl}/calls/${callId}/play`;

				if (sourceType === 'url') {
					const audioUrl = this.getNodeParameter('audioUrl', itemIndex) as string;
					playRequest.assetUrl = audioUrl;
				} else if (sourceType === 'fileBinary') {
					// TODO: Implement file upload
					// Options:
					// 1. Use presigned URL from backend
					// 2. Direct multipart upload
					// 3. Two-step: upload to /media/upload, then play

					// const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
					// const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);

					// For now, stub implementation
					throw new Error('File upload not yet implemented');

					// const uploadResponse = await this.helpers.httpRequestWithAuthentication.call(
					//   this,
					//   'voiceNetApi',
					//   {
					//     method: 'POST',
					//     url: `${credentials.baseUrl}/media/upload`,
					//     body: binaryData.data,
					//     headers: {
					//       'Content-Type': binaryData.mimeType,
					//     },
					//   }
					// );
					// playRequest.assetId = uploadResponse.assetId;
				} else if (sourceType === 'libraryAsset') {
					const assetId = this.getNodeParameter('assetId', itemIndex) as string;
					playRequest.assetId = assetId;
				}

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'voiceNetApi',
					{
						method: 'POST',
						url: playUrl,
						body: playRequest,
						returnFullResponse: false,
					}
				);

				startedItems.push({
					json: {
						started: true,
						callId,
						playId: (response as IDataObject).playId || undefined,
						call: items[itemIndex].json.call || { callId },
					},
					pairedItem: itemIndex,
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';

				errorItems.push({
					json: {
						started: false,
						callId,
						error: errorMessage,
						call: items[itemIndex].json.call || { callId },
					},
					pairedItem: itemIndex,
				});
			}
		}

		// Note: Play completion events arrive via WebSocket to Voice Agent, not here
		return [startedItems, errorItems];
	}
}