import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  defineAgent,
  JobContext,
  voice,
  llm,
  cli,
  WorkerOptions
} from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import { z } from 'zod';
import dotenv from 'dotenv';
import { GoogleAuth } from 'google-auth-library';

dotenv.config();

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the system prompt
const systemPromptPath = path.resolve(__dirname, '../clinic-voice-agent-system-prompt.md');
let systemPrompt = '';
try {
  systemPrompt = readFileSync(systemPromptPath, 'utf-8');
} catch (err) {
  console.error(`Failed to load system prompt from ${systemPromptPath}:`, err);
  systemPrompt = `You are Sristi, the AI phone receptionist for Voice Agents Beta. Greet callers, check availability, book appointments, and end calls.`;
}

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// ============================================================
// Google OAuth2 Token Manager — auto-refreshes before expiry
// ============================================================
class TokenManager {
  private auth: GoogleAuth;
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;
  // Refresh 5 minutes before actual expiry to avoid mid-request failures
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  constructor(keyFile: string) {
    this.auth = new GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
  }

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt - this.REFRESH_BUFFER_MS) {
      return this.cachedToken;
    }

    console.log('Refreshing Google Cloud OAuth2 token...');
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error('Failed to generate Google Cloud OAuth token from service account credentials.');
    }

    this.cachedToken = tokenResponse.token;
    // Google OAuth2 tokens typically expire in 1 hour (3600s)
    this.tokenExpiresAt = now + 3600 * 1000;
    console.log('Google Cloud OAuth2 token refreshed successfully.');
    return this.cachedToken;
  }
}

// ============================================================
// Tool Definitions
// ============================================================

// Tool: check_availability
const check_availability = llm.tool({
  name: 'check_availability',
  description: 'Check availability slots for a given specialty (e.g., Chiropractor, Physiotherapist, Massage Therapist, Sports Rehabilitation Coach, General Consultant).',
  parameters: z.object({
    specialty: z.enum([
      'Chiropractor',
      'Physiotherapist',
      'Massage Therapist',
      'Sports Rehabilitation Coach',
      'General Consultant'
    ]).describe('The specialty or practitioner role to check availability for.')
  }),
  execute: async ({ specialty }) => {
    try {
      console.log(`Checking availability for: ${specialty}`);
      const response = await fetch(`${BACKEND_URL}/api/availability?specialty=${encodeURIComponent(specialty)}`);
      if (!response.ok) {
        return JSON.stringify({ error: `Could not retrieve availability. Specialty might be invalid.` });
      }
      const data = await response.json();
      return JSON.stringify(data);
    } catch (err: any) {
      console.error('Error in check_availability tool:', err);
      return JSON.stringify({ error: `Server error while checking availability: ${err.message}` });
    }
  }
});

// Tool: book_appointment
const book_appointment = llm.tool({
  name: 'book_appointment',
  description: 'Book an appointment for a confirmed availability slot with the patient details.',
  parameters: z.object({
    slotId: z.string().describe('The UUID of the availability slot selected by the caller.'),
    patientName: z.string().describe('The full name of the patient.'),
    patientPhone: z.string().describe('The contact phone number of the patient.'),
    patientEmail: z.string().optional().describe('The optional email address of the patient.')
  }),
  execute: async ({ slotId, patientName, patientPhone, patientEmail }) => {
    try {
      console.log(`Booking slot: ${slotId} for patient: ${patientName}`);
      const response = await fetch(`${BACKEND_URL}/api/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, patientName, patientPhone, patientEmail })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (err: any) {
      console.error('Error in book_appointment tool:', err);
      return JSON.stringify({ error: `Server error while booking appointment: ${err.message}` });
    }
  }
});

// Tool: end_call — graceful disconnect instead of process.exit
const end_call = llm.tool({
  name: 'end_call',
  description: 'Politely close/terminate the call with the caller when the conversation is finished or if the caller hangs up.',
  parameters: z.object({}),
  execute: async (_, opts) => {
    console.log('LLM requested to end call. Initiating graceful disconnect...');
    const runCtx = opts.ctx;
    // Give the agent 2 seconds to speak its final closing sentence before disconnecting
    setTimeout(async () => {
      try {
        console.log('Disconnecting from LiveKit room gracefully...');
        if (runCtx.session) {
          await runCtx.session.close();
        }
      } catch (err) {
        console.error('Failed to close session gracefully:', err);
      }
    }, 2000);
    return JSON.stringify({ status: 'Call ending initiated.' });
  }
});

const toolsList = [check_availability, book_appointment, end_call];

// ============================================================
// Agent Definition
// ============================================================
const agentDefinition = defineAgent({
  entry: async (ctx: JobContext) => {
    console.log(`Agent starting job: ${ctx.job.id} for room: ${ctx.room.name}`);
    await ctx.connect();

    // ── Authenticate with Google Vertex AI ──
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'google-credentials.json';
    const absoluteCredsPath = path.isAbsolute(credentialsPath)
      ? credentialsPath
      : path.resolve(__dirname, '..', credentialsPath);

    console.log(`Authenticating using Google Service Account credentials at: ${absoluteCredsPath}`);
    const tokenManager = new TokenManager(absoluteCredsPath);
    const apiKey = await tokenManager.getToken();

    const credentialsJson = JSON.parse(readFileSync(absoluteCredsPath, 'utf8'));
    const projectId = credentialsJson.project_id || 'speed-star-beta';
    const region = process.env.GOOGLE_CLOUD_REGION || 'global';
    const host = region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`;
    const baseURL = `https://${host}/v1/projects/${projectId}/locations/${region}/endpoints/openapi`;
    const model = 'google/gemini-2.5-flash-lite';
    console.log(`Authenticated with Service Account. Using Vertex AI Endpoint: ${baseURL} and model: ${model}`);

    const geminiLLM = new openai.LLM({
      apiKey,
      baseURL,
      model
    });

    // Periodically refresh the OAuth2 token so the LLM connection survives past 1 hour
    const tokenRefreshInterval = setInterval(async () => {
      try {
        const freshToken = await tokenManager.getToken();
        // Update the LLM's API key with the fresh token
        (geminiLLM as any).apiKey = freshToken;
        console.log('LLM API key refreshed with new OAuth2 token.');
      } catch (err) {
        console.error('Failed to refresh OAuth2 token:', err);
      }
    }, 45 * 60 * 1000); // Refresh every 45 minutes

    const agent = new voice.Agent({
      instructions: systemPrompt,
      llm: geminiLLM as any,
      tools: toolsList
    });

    // ── Configure STT (Deepgram Nova-3) and TTS (Cartesia Sonic-3.5) ──
    const session = new voice.AgentSession({
      // Deepgram Nova-3: native Bengali support with high accuracy for Bangladeshi dialect
      stt: new deepgram.STT({
        model: 'nova-3',
        language: 'bn',
      }),
      llm: geminiLLM as any,
      // Cartesia Sonic-3.5: strong Bengali TTS with sub-90ms latency
      tts: new cartesia.TTS({
        model: 'sonic-3.5',
        language: 'bn',
        voice: process.env.CARTESIA_VOICE_ID || 'd16e0c03-51cf-4d7a-b286-53c82d335607'
      }) as any,
      tools: toolsList,

      // ── Turn Handling Configuration ──
      turnHandling: {
        // Dynamic endpointing: waits for the user to truly finish speaking
        endpointing: {
          mode: 'dynamic',
          minDelay: 500,   // Min silence before agent responds (ms)
          maxDelay: 3000,  // Max wait before forcing a turn (ms)
        },
        // Adaptive interruption: distinguishes real interruptions from filler words/backchannels
        interruption: {
          enabled: true,
          mode: 'adaptive',
          minDuration: 600,   // Minimum speech to count as interruption (ms)
          minWords: 2,        // At least 2 words before interrupting agent
          resumeFalseInterruption: true,  // Resume agent speech if it was a false alarm
          falseInterruptionTimeout: 2500, // Wait 2.5s before deciding it was false
        },
      },

      // Increase user-away timeout: don't mark user as "away" for 2 minutes of silence
      userAwayTimeout: 120,

      // Allow up to 5 sequential tool calls per turn (e.g. check availability then book)
      maxToolSteps: 5,
    });

    // ── Session Event Logging for Observability ──
    const sessionEmitter = session as any;
    sessionEmitter.on('user_input_transcribed', (ev: any) => {
      console.log(`[STT] User said: "${ev.transcript}" (final: ${ev.isFinal})`);
    });

    sessionEmitter.on('conversation_item_added', (ev: any) => {
      console.log(`[Chat] New conversation item added. Role: ${ev.item?.role ?? 'unknown'}`);
    });

    sessionEmitter.on('agent_state_changed', (ev: any) => {
      console.log(`[Agent] State changed: ${ev.oldState} → ${ev.state}`);
    });

    sessionEmitter.on('error', (ev: any) => {
      console.error(`[Session Error]`, ev);
    });

    sessionEmitter.on('close', (ev: any) => {
      console.log(`[Session] Closed. Reason: ${ev.reason}`);
      clearInterval(tokenRefreshInterval);
    });

    console.log('Starting Agent Session with Deepgram STT (Nova-3) + Cartesia TTS (Sonic-3.5)...');
    await session.start({ agent, room: ctx.room });
    console.log('Agent Session started successfully.');
  }
});

export default agentDefinition;

// Guard to ensure it runs only when the file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new WorkerOptions({
    agent: fileURLToPath(import.meta.url)
  }));
}
