import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class VoiceNetApi implements ICredentialType {
	name = 'voiceNetApi';
	displayName = 'VoiceNet API';
	documentationUrl = 'https://github.com/voicenet/n8n-nodes-voicenet';
	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.voicenet.local',
			placeholder: 'https://api.voicenet.com',
			description: 'The base URL of your VoiceNet backend API',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'API key for authenticating with the VoiceNet backend',
		},
		{
			displayName: 'Signing Secret',
			name: 'signingSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Secret for HMAC signature verification of webhooks (optional)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/health',
			method: 'GET',
		},
	};
}