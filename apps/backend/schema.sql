-- SQL Schema setup for Supabase Database
-- Run this in the SQL Editor of your Supabase project.

-- 1. Create Specialists Table
CREATE TABLE IF NOT EXISTS specialists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    bio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Create Availability Slots Table
CREATE TABLE IF NOT EXISTS availability_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specialist_id UUID REFERENCES specialists(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_booked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Create Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID REFERENCES availability_slots(id) ON DELETE CASCADE,
    specialist_id UUID REFERENCES specialists(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    patient_phone TEXT NOT NULL,
    patient_email TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Enable Row Level Security (RLS) - For local dev and simplicity, you can disable this
-- or configure policies. For a public booking form, we'll allow public reads and inserts.
ALTER TABLE specialists ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Create Policies to allow public read on specialists and slots, and public insert/read on bookings
CREATE POLICY "Allow public read on specialists" ON specialists
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow public read on availability_slots" ON availability_slots
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow public read and insert on bookings" ON bookings
    FOR ALL TO public USING (true);

CREATE POLICY "Allow public update on availability_slots" ON availability_slots
    FOR UPDATE TO public USING (true);

-- 5. Insert Mock Data for Testing
INSERT INTO specialists (name, specialty, bio) VALUES
('Dr. Tariqul Islam', 'Chiropractor', 'Spinal alignment and posture correction specialist.'),
('Dr. Nusrat Jahan', 'Physiotherapist', 'Sports injury recovery and AlterG anti-gravity treadmill expert.'),
('Dr. Moinul Hasan', 'Massage Therapist', 'Deep tissue and muscle recovery specialist.'),
('Dr. Rashedul Bari', 'Sports Rehabilitation Coach', 'Biomechanical analysis and athletic performance coach.'),
('Dr. Farhana Yasmin', 'General Consultant', 'Overall clinical assessor and patient referral guide')
ON CONFLICT DO NOTHING;

-- Add availability slots starting from July 13, 2026 onwards
-- We select the specialist IDs dynamically in the mock data script
DO $$
DECLARE
    chiro_id UUID;
    physio_id UUID;
    massage_id UUID;
    sports_id UUID;
    gen_id UUID;
BEGIN
    SELECT id INTO chiro_id FROM specialists WHERE specialty = 'Chiropractor' LIMIT 1;
    SELECT id INTO physio_id FROM specialists WHERE specialty = 'Physiotherapist' LIMIT 1;
    SELECT id INTO massage_id FROM specialists WHERE specialty = 'Massage Therapist' LIMIT 1;
    SELECT id INTO sports_id FROM specialists WHERE specialty = 'Sports Rehabilitation Coach' LIMIT 1;
    SELECT id INTO gen_id FROM specialists WHERE specialty = 'General Consultant' LIMIT 1;

    -- Chiropractor slots
    INSERT INTO availability_slots (specialist_id, start_time, end_time, is_booked) VALUES
    (chiro_id, '2026-07-13T10:00:00+06:00', '2026-07-13T10:30:00+06:00', false),
    (chiro_id, '2026-07-13T11:00:00+06:00', '2026-07-13T11:30:00+06:00', false),
    (chiro_id, '2026-07-13T15:00:00+06:00', '2026-07-13T15:30:00+06:00', false),
    (chiro_id, '2026-07-14T09:00:00+06:00', '2026-07-14T09:30:00+06:00', false);

    -- Physiotherapist slots
    INSERT INTO availability_slots (specialist_id, start_time, end_time, is_booked) VALUES
    (physio_id, '2026-07-13T11:30:00+06:00', '2026-07-13T12:00:00+06:00', false),
    (physio_id, '2026-07-13T14:00:00+06:00', '2026-07-13T14:30:00+06:00', false),
    (physio_id, '2026-07-13T16:30:00+06:00', '2026-07-13T17:00:00+06:00', false);

    -- Massage Therapist slots
    INSERT INTO availability_slots (specialist_id, start_time, end_time, is_booked) VALUES
    (massage_id, '2026-07-13T12:00:00+06:00', '2026-07-13T13:00:00+06:00', false),
    (massage_id, '2026-07-13T15:00:00+06:00', '2026-07-13T16:00:00+06:00', false);

    -- Sports Rehabilitation Coach slots
    INSERT INTO availability_slots (specialist_id, start_time, end_time, is_booked) VALUES
    (sports_id, '2026-07-13T10:30:00+06:00', '2026-07-13T11:30:00+06:00', false),
    (sports_id, '2026-07-13T14:30:00+06:00', '2026-07-13T15:30:00+06:00', false);

    -- General Consultant slots
    INSERT INTO availability_slots (specialist_id, start_time, end_time, is_booked) VALUES
    (gen_id, '2026-07-13T09:00:00+06:00', '2026-07-13T09:30:00+06:00', false),
    (gen_id, '2026-07-13T13:00:00+06:00', '2026-07-13T13:30:00+06:00', false);
END $$;
