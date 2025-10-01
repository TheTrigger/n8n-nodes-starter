# n8n-nodes-voicenet

VoiceNet nodes for n8n - Build AI-powered voice call workflows with OpenAI Realtime API integration.

## Features

- 🎙️ **Voice Agent**: AI voice agent with tool calling capabilities
- 📞 **Call Management**: Answer, play audio, and transfer calls
- 🔧 **Tool Integration**: Connect any n8n AI tool to your voice agent
- 🌐 **WebSocket Events**: Real-time call event handling
- 🔐 **Secure Webhooks**: HMAC signature verification

## Installation

Install in your n8n instance:

```bash
npm install n8n-nodes-voicenet
```

Or for development:

```bash
git clone https://github.com/yourusername/n8n-nodes-voicenet.git
cd n8n-nodes-voicenet
npm install
npm run build
npm link
```

Then in your n8n installation:
```bash
npm link n8n-nodes-voicenet
n8n start
```

## Configuration

### Credentials
Create a `VoiceNet API` credential with:
- **Base URL**: Your VoiceNet backend API endpoint (e.g., `https://api.voicenet.com`)
- **API Key**: Your API key for authentication
- **Signing Secret**: (Optional) For HMAC webhook verification

### Backend URL Configuration
The WebSocket URL for real-time communication is automatically derived from the Base URL in credentials:
- `https://api.voicenet.com` → `wss://api.voicenet.com/realtime`
- `http://localhost:8080` → `ws://localhost:8080/realtime`

You can override this by setting the Runtime Base URL field in the Voice Agent node if needed.

## Nodes

### 1. Call Inbound Trigger
Webhook trigger for incoming calls.

**Configuration:**
- **DID Filter**: Optional phone number filter (e.g., +1234567890)

**Outputs:**
- Call metadata including callId, from, to, and custom data

### 2. Call: Answer
Answers an incoming call.

**Inputs:**
- **Call ID**: The ID of the call to answer

**Outputs:**
- **Answered**: Success response
- **Error**: Error details if failed

### 3. Call: Play
Play audio in an active call (non-blocking).

**Inputs:**
- **Call ID**: The call to play audio in
- **Source Type**: URL, File Upload, or Library Asset
- **Audio URL**: Direct URL to audio file (WAV, MP3)
- **Barge-In**: Allow caller to interrupt

**Outputs:**
- **Play Started**: Confirmation with playId
- **Error**: Error details if failed

### 4. Voice Agent
AI-powered voice agent with tool orchestration.

**Inputs:**
- **Main**: Call data with callId
- **Tools**: AI tools connected via tool port

**Configuration:**
- **Base Prompt**: System instructions for the AI
- **User Instructions**: Additional context
- **Locale**: Language locale (e.g., it-IT)
- **Barge-In**: Allow interruptions

**Outputs:**
1. **Tool Call**: When AI invokes a tool
2. **Call Transferred**: When call is transferred
3. **Call Ended**: When call ends
4. **Error**: Error events

### 5. Transfer Call Tool
AI tool for transferring calls.

**Features:**
- Compatible with Voice Agent tool port
- Optional announcement before transfer
- Returns tool result to Voice Agent

## Example Workflow

```
[Call Inbound Trigger]
         ↓
    [Call: Answer]
         ↓
    [Voice Agent] ←→ [Transfer Call Tool]
         ↓              [Google Calendar Tool]
    (4 outputs)         [Custom API Tool]
```

## Backend Requirements

The VoiceNet backend must implement:

### Webhook Endpoints
- `POST /webhook/register` - Register webhook subscription
- `DELETE /webhook/unregister` - Remove subscription

### Call Control API
- `POST /calls/{callId}/answer` - Answer call
- `POST /calls/{callId}/play` - Play audio
- `POST /calls/{callId}/say` - Text-to-speech
- `POST /calls/{callId}/transfer` - Transfer call
- `GET /media/assets` - List library assets

### Real-time WebSocket
- `wss://backend/realtime` - WebSocket endpoint
- Event types: `tool.call`, `call.transferred`, `call.ended`, `error`

### Session Management
- `POST /session.create` - Create AI session with tools

## Development

### Build from source
```bash
npm install
npm run build
```

### Run tests
```bash
npm test
```

### Lint code
```bash
npm run lint
npm run lintfix
```

## TODOs

- [ ] HMAC signature verification in trigger
- [ ] File upload support in Call: Play
- [ ] WebSocket reconnection with exponential backoff
- [ ] Persistent WebSocket across workflow executions
- [ ] Event deduplication in trigger
- [ ] Additional call control operations (hold, mute, record)

## License

MIT

## Support

- [GitHub Issues](https://github.com/yourusername/n8n-nodes-voicenet/issues)
- [Documentation](https://docs.voicenet.com)