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

// Tool Definition: check_availability
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

// Tool Definition: book_appointment
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

// Tool Definition: end_call
const end_call = llm.tool({
  name: 'end_call',
  description: 'Politely close/terminate the call with the caller when the conversation is finished or if the caller hangs up.',
  parameters: z.object({}),
  execute: async (_, opts) => {
    console.log('LLM requested to end call. Shutting down context...');
    setTimeout(async () => {
      try {
        const runCtx = opts.ctx;
        // Accessing job context or room to disconnect
        console.log('Initiating job shutdown...');
        process.exit(0);
      } catch (err) {
        console.error('Failed to end call process:', err);
      }
    }, 1500); // Small buffer to let the agent speak its final close sentence.
    return JSON.stringify({ status: 'Call ending initiated.' });
  }
});

const toolsList = [check_availability, book_appointment, end_call];

const agentDefinition = defineAgent({
  entry: async (ctx: JobContext) => {
    console.log(`Agent starting job: ${ctx.job.id} for room: ${ctx.room.name}`);
    await ctx.connect();

    // Authenticate with Google Vertex AI using Service Account
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'google-credentials.json';
    const absoluteCredsPath = path.isAbsolute(credentialsPath)
      ? credentialsPath
      : path.resolve(__dirname, '..', credentialsPath);

    console.log(`Authenticating using Google Service Account credentials at: ${absoluteCredsPath}`);
    const auth = new GoogleAuth({
      keyFile: absoluteCredsPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error('Failed to generate Google Cloud OAuth token from service account credentials.');
    }

    const apiKey = tokenResponse.token;
    const credentialsJson = JSON.parse(readFileSync(absoluteCredsPath, 'utf8'));
    const projectId = credentialsJson.project_id || 'speed-star-beta';
    const region = process.env.GOOGLE_CLOUD_REGION || 'global';
    const host = region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`;
    const baseURL = `https://${host}/v1/projects/${projectId}/locations/${region}/endpoints/openapi`;
    const model = 'google/gemini-3.5-flash';
    console.log(`Authenticated with Service Account. Using Vertex AI Endpoint: ${baseURL} and model: ${model}`);

    const geminiLLM = new openai.LLM({
      apiKey,
      baseURL,
      model
    });

    const agent = new voice.Agent({
      instructions: systemPrompt,
      llm: geminiLLM,
      tools: toolsList
    });

    // Configure STT and TTS using Cartesia
    const session = new voice.AgentSession({
      stt: new cartesia.STT({ model: 'ink-2', language: 'bn' }),
      llm: geminiLLM,
      tts: new cartesia.TTS({
        model: 'sonic-3.5',
        language: 'bn',
        voice: process.env.CARTESIA_VOICE_ID || 'd16e0c03-51cf-4d7a-b286-53c82d335607'
      }),
      tools: toolsList
    });

    console.log('Starting Agent Session...');
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
