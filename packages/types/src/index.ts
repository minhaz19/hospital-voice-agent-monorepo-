export type Specialty =
  | 'Chiropractor'
  | 'Physiotherapist'
  | 'Massage Therapist'
  | 'Sports Rehabilitation Coach'
  | 'General Consultant';

export interface Specialist {
  id: string;
  name: string;
  specialty: Specialty;
  bio?: string;
}

export interface AvailabilitySlot {
  id: string;
  specialistId: string;
  startTime: string; // ISO String (UTC)
  endTime: string;   // ISO String (UTC)
  isBooked: boolean;
}

export interface Booking {
  id: string;
  slotId: string;
  specialistId: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface CheckAvailabilityResponse {
  slots: AvailabilitySlot[];
  specialist: Specialist;
}

export interface BookAppointmentPayload {
  slotId: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
}

export interface BookAppointmentResponse {
  success: boolean;
  booking?: Booking;
  error?: string;
}
