import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AccessToken } from 'livekit-server-sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { 
  Specialty, 
  Specialist, 
  AvailabilitySlot, 
  Booking, 
  CheckAvailabilityResponse, 
  BookAppointmentPayload, 
  BookAppointmentResponse 
} from '@antigravity-pro/types';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Connected to Supabase client successfully.');
} else {
  console.warn(
    'SUPABASE_URL and SUPABASE_KEY environment variables not found. Falling back to in-memory mock database.'
  );
}

// ==========================================
// In-Memory Mock Database (Fallback Mode)
// ==========================================
let mockSpecialists: Specialist[] = [
  { id: 'chiro-1', name: 'Dr. Tariqul Islam', specialty: 'Chiropractor', bio: 'Spinal alignment and posture correction specialist.' },
  { id: 'physio-1', name: 'Dr. Nusrat Jahan', specialty: 'Physiotherapist', bio: 'Sports injury recovery and AlterG anti-gravity treadmill expert.' },
  { id: 'massage-1', name: 'Dr. Moinul Hasan', specialty: 'Massage Therapist', bio: 'Deep tissue and muscle recovery specialist.' },
  { id: 'sports-1', name: 'Dr. Rashedul Bari', specialty: 'Sports Rehabilitation Coach', bio: 'Biomechanical analysis and athletic performance coach.' },
  { id: 'gen-1', name: 'Dr. Farhana Yasmin', specialty: 'General Consultant', bio: 'Overall clinical assessor and patient referral guide' }
];

let mockSlots: AvailabilitySlot[] = [
  // Chiropractor
  { id: 'slot-c1', specialistId: 'chiro-1', startTime: '2026-07-13T10:00:00+06:00', endTime: '2026-07-13T10:30:00+06:00', isBooked: false },
  { id: 'slot-c2', specialistId: 'chiro-1', startTime: '2026-07-13T11:00:00+06:00', endTime: '2026-07-13T11:30:00+06:00', isBooked: false },
  { id: 'slot-c3', specialistId: 'chiro-1', startTime: '2026-07-13T15:00:00+06:00', endTime: '2026-07-13T15:30:00+06:00', isBooked: false },
  { id: 'slot-c4', specialistId: 'chiro-1', startTime: '2026-07-14T09:00:00+06:00', endTime: '2026-07-14T09:30:00+06:00', isBooked: false },

  // Physiotherapist
  { id: 'slot-p1', specialistId: 'physio-1', startTime: '2026-07-13T11:30:00+06:00', endTime: '2026-07-13T12:00:00+06:00', isBooked: false },
  { id: 'slot-p2', specialistId: 'physio-1', startTime: '2026-07-13T14:00:00+06:00', endTime: '2026-07-13T14:30:00+06:00', isBooked: false },
  { id: 'slot-p3', specialistId: 'physio-1', startTime: '2026-07-13T16:30:00+06:00', endTime: '2026-07-13T17:00:00+06:00', isBooked: false },

  // Massage Therapist
  { id: 'slot-m1', specialistId: 'massage-1', startTime: '2026-07-13T12:00:00+06:00', endTime: '2026-07-13T13:00:00+06:00', isBooked: false },
  { id: 'slot-m2', specialistId: 'massage-1', startTime: '2026-07-13T15:00:00+06:00', endTime: '2026-07-13T16:00:00+06:00', isBooked: false },

  // Sports Rehab
  { id: 'slot-s1', specialistId: 'sports-1', startTime: '2026-07-13T10:30:00+06:00', endTime: '2026-07-13T11:30:00+06:00', isBooked: false },
  { id: 'slot-s2', specialistId: 'sports-1', startTime: '2026-07-13T14:30:00+06:00', endTime: '2026-07-13T15:30:00+06:00', isBooked: false },

  // General Consultant
  { id: 'slot-g1', specialistId: 'gen-1', startTime: '2026-07-13T09:00:00+06:00', endTime: '2026-07-13T09:30:00+06:00', isBooked: false },
  { id: 'slot-g2', specialistId: 'gen-1', startTime: '2026-07-13T13:00:00+06:00', endTime: '2026-07-13T13:30:00+06:00', isBooked: false }
];

let mockBookings: Booking[] = [];

// ==========================================
// API Endpoint handlers
// ==========================================

/**
 * GET /api/availability
 * Params:
 *  - specialty: e.g. "Chiropractor", "Physiotherapist"
 */
app.get('/api/availability', async (req: Request, res: Response) => {
  const { specialty } = req.query;

  if (!specialty) {
    return res.status(400).json({ error: 'Specialty parameter is required' });
  }

  // Normalize specialty capitalization
  const searchSpecialty = String(specialty).trim();

  try {
    if (supabase) {
      // 1. Fetch the specialist for the specialty
      const { data: specialists, error: specError } = await supabase
        .from('specialists')
        .select('*')
        .eq('specialty', searchSpecialty)
        .limit(1);

      if (specError || !specialists || specialists.length === 0) {
        return res.status(404).json({ error: `No specialist found for specialty: ${searchSpecialty}` });
      }

      const specialist: Specialist = {
        id: specialists[0].id,
        name: specialists[0].name,
        specialty: specialists[0].specialty as Specialty,
        bio: specialists[0].bio
      };

      // 2. Fetch unbooked slots for this specialist
      const { data: slots, error: slotError } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('specialist_id', specialist.id)
        .eq('is_booked', false)
        .order('start_time', { ascending: true });

      if (slotError) {
        return res.status(500).json({ error: 'Database error fetching slots' });
      }

      const mappedSlots: AvailabilitySlot[] = (slots || []).map((s: any) => ({
        id: s.id,
        specialistId: s.specialist_id,
        startTime: s.start_time,
        endTime: s.end_time,
        isBooked: s.is_booked
      }));

      const response: CheckAvailabilityResponse = {
        slots: mappedSlots,
        specialist
      };

      return res.json(response);
    } else {
      // In-memory fallback
      const specialist = mockSpecialists.find(
        (s) => s.specialty.toLowerCase() === searchSpecialty.toLowerCase()
      );

      if (!specialist) {
        return res.status(404).json({ error: `No specialist found for specialty: ${searchSpecialty}` });
      }

      const slots = mockSlots.filter(
        (s) => s.specialistId === specialist.id && !s.isBooked
      );

      const response: CheckAvailabilityResponse = {
        slots,
        specialist
      };

      return res.json(response);
    }
  } catch (error) {
    console.error('Error getting availability:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/book
 * Body: BookAppointmentPayload
 */
app.post('/api/book', async (req: Request, res: Response) => {
  const { slotId, patientName, patientPhone, patientEmail } = req.body as BookAppointmentPayload;

  if (!slotId || !patientName || !patientPhone) {
    return res.status(400).json({ error: 'slotId, patientName, and patientPhone are required' });
  }

  try {
    if (supabase) {
      // 1. Verify slot exists and is not already booked
      const { data: slots, error: slotError } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('id', slotId)
        .limit(1);

      if (slotError || !slots || slots.length === 0) {
        return res.status(404).json({ error: 'Slot not found' });
      }

      const slot = slots[0];
      if (slot.is_booked) {
        const errResponse: BookAppointmentResponse = {
          success: false,
          error: 'Slot is already booked. Please choose another slot.'
        };
        return res.status(409).json(errResponse);
      }

      // 2. Transactional Update: Book the slot (atomic update check)
      const { data: updatedSlots, error: updateError } = await supabase
        .from('availability_slots')
        .update({ is_booked: true })
        .eq('id', slotId)
        .eq('is_booked', false) // Ensures double booking prevention
        .select();

      if (updateError || !updatedSlots || updatedSlots.length === 0) {
        const errResponse: BookAppointmentResponse = {
          success: false,
          error: 'Slot was just taken by someone else. Please re-check availability.'
        };
        return res.status(409).json(errResponse);
      }

      // 3. Create the booking entry
      const { data: newBookings, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          slot_id: slotId,
          specialist_id: slot.specialist_id,
          patient_name: patientName,
          patient_phone: patientPhone,
          patient_email: patientEmail || null,
          status: 'confirmed'
        })
        .select();

      if (bookingError || !newBookings || newBookings.length === 0) {
        // Rollback the slot booking
        await supabase
          .from('availability_slots')
          .update({ is_booked: false })
          .eq('id', slotId);

        return res.status(500).json({ error: 'Failed to create booking entry' });
      }

      const b = newBookings[0];
      const response: BookAppointmentResponse = {
        success: true,
        booking: {
          id: b.id,
          slotId: b.slot_id,
          specialistId: b.specialist_id,
          patientName: b.patient_name,
          patientPhone: b.patient_phone,
          patientEmail: b.patient_email || undefined,
          status: b.status as 'confirmed' | 'cancelled',
          createdAt: b.created_at
        }
      };

      console.log(`Successfully booked slot ${slotId} for ${patientName}`);
      return res.json(response);
    } else {
      // In-memory fallback
      const slotIndex = mockSlots.findIndex((s) => s.id === slotId);
      if (slotIndex === -1) {
        return res.status(404).json({ error: 'Slot not found' });
      }

      const slot = mockSlots[slotIndex];
      if (slot.isBooked) {
        const errResponse: BookAppointmentResponse = {
          success: false,
          error: 'Slot is already booked. Please choose another slot.'
        };
        return res.status(409).json(errResponse);
      }

      // Update slot status
      mockSlots[slotIndex].isBooked = true;

      // Create new booking
      const newBooking: Booking = {
        id: `book-${Date.now()}`,
        slotId,
        specialistId: slot.specialistId,
        patientName,
        patientPhone,
        patientEmail,
        status: 'confirmed',
        createdAt: new Date().toISOString()
      };

      mockBookings.push(newBooking);

      const response: BookAppointmentResponse = {
        success: true,
        booking: newBooking
      };

      console.log(`[Fallback] Successfully booked slot ${slotId} for ${patientName}`);
      return res.json(response);
    }
  } catch (error) {
    console.error('Error creating booking:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/bookings
 * Returns all bookings from Supabase, or in-memory fallback list
 */
app.get('/api/bookings', async (req: Request, res: Response) => {
  try {
    if (supabase) {
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ error: 'Database error fetching bookings' });
      }

      const mappedBookings: Booking[] = (bookings || []).map((b: any) => ({
        id: b.id,
        slotId: b.slot_id,
        specialistId: b.specialist_id,
        patientName: b.patient_name,
        patientPhone: b.patient_phone,
        patientEmail: b.patient_email || undefined,
        status: b.status,
        createdAt: b.created_at
      }));

      return res.json(mappedBookings);
    } else {
      return res.json(mockBookings);
    }
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/token
 * Body: { participantName: string }
 */
app.post('/api/token', async (req: Request, res: Response) => {
  const { participantName } = req.body;
  if (!participantName) {
    return res.status(400).json({ error: 'participantName is required' });
  }

  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'LiveKit API key or secret not configured on server' });
    }

    const roomName = `sristi-call-${Date.now()}`;
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      ttl: '1h', // 1 hour duration — long enough for extended booking calls
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return res.json({
      token,
      roomName,
      url: process.env.LIVEKIT_URL || 'wss://voice-agent-v8o3meg4.livekit.cloud'
    });
  } catch (error: any) {
    console.error('Error generating LiveKit token:', error);
    return res.status(500).json({ error: `Failed to generate token: ${error.message}` });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
