import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  ActivityIndicator, 
  Alert,
  SafeAreaView,
  Animated,
  Modal
} from 'react-native';
import { 
  Specialty, 
  Specialist, 
  AvailabilitySlot, 
  Booking,
  CheckAvailabilityResponse, 
  BookAppointmentResponse 
} from '@antigravity-pro/types';
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import { AudioSession, registerGlobals, AndroidAudioTypePresets } from '@livekit/react-native';

// Connect to backend server running locally
const BACKEND_URL = 'http://localhost:3001';

// Initialize LiveKit globals
let isLiveKitAvailable = false;
try {
  registerGlobals();
  isLiveKitAvailable = true;
} catch (error) {
  console.warn('LiveKit native globals not registered. Continuing in mockup mode.', error);
}

const SPECIALTIES: Specialty[] = [
  'Chiropractor',
  'Physiotherapist',
  'Massage Therapist',
  'Sports Rehabilitation Coach',
  'General Consultant'
];

const SPECIALISTS_MAP: Record<string, { id: string, name: string, specialty: Specialty, bio: string }> = {
  'chiro-1': { id: 'chiro-1', name: 'Dr. Tariqul Islam', specialty: 'Chiropractor', bio: 'Spinal alignment and posture correction specialist.' },
  'physio-1': { id: 'physio-1', name: 'Dr. Nusrat Jahan', specialty: 'Physiotherapist', bio: 'Sports injury recovery and AlterG anti-gravity treadmill expert.' },
  'massage-1': { id: 'massage-1', name: 'Dr. Moinul Hasan', specialty: 'Massage Therapist', bio: 'Deep tissue and muscle recovery specialist.' },
  'sports-1': { id: 'sports-1', name: 'Dr. Rashedul Bari', specialty: 'Sports Rehabilitation Coach', bio: 'Biomechanical analysis and athletic performance coach.' },
  'gen-1': { id: 'gen-1', name: 'Dr. Farhana Yasmin', specialty: 'General Consultant', bio: 'Overall clinical assessor and patient referral guide' }
};

export default function App() {
  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty>('Chiropractor');
  const [loading, setLoading] = useState<boolean>(false);
  const [specialist, setSpecialist] = useState<Specialist | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);

  // Patient details for booking
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [bookingLoading, setBookingLoading] = useState<boolean>(false);

  // Voice Call States
  const [showCallScreen, setShowCallScreen] = useState<boolean>(false);
  const [callState, setCallState] = useState<'idle' | 'fetching' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed'>('idle');
  const [liveKitRoom, setLiveKitRoom] = useState<Room | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState<boolean>(false);
  const [caption, setCaption] = useState<string>('');

  // Voice Visualizer Animation state
  const [pulseAnim] = useState(new Animated.Value(1));
  const [barHeights] = useState([
    new Animated.Value(15),
    new Animated.Value(30),
    new Animated.Value(45),
    new Animated.Value(30),
    new Animated.Value(15),
  ]);

  // Fetch slots whenever specialty changes
  const fetchAvailability = async (specialty: Specialty) => {
    setLoading(true);
    setSlots([]);
    setSpecialist(null);
    setSelectedSlot(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/availability?specialty=${encodeURIComponent(specialty)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch availability.');
      }
      const data: CheckAvailabilityResponse = await response.json();
      setSpecialist(data.specialist);
      setSlots(data.slots);
    } catch (error: any) {
      console.warn('Backend connection failed, using local mock data fallback.');
      // Mock Fallback UI data if server is offline
      mockFallbackData(specialty);
    } finally {
      setLoading(false);
    }
  };

  const mockFallbackData = (specialty: Specialty) => {
    const spec = Object.values(SPECIALISTS_MAP).find(s => s.specialty === specialty);
    if (!spec) return;
    setSpecialist(spec);
    setSlots([
      { id: 'slot-1', specialistId: spec.id, startTime: '2026-07-13T10:00:00+06:00', endTime: '2026-07-13T10:30:00+06:00', isBooked: false },
      { id: 'slot-2', specialistId: spec.id, startTime: '2026-07-13T11:00:00+06:00', endTime: '2026-07-13T11:30:00+06:00', isBooked: false },
      { id: 'slot-3', specialistId: spec.id, startTime: '2026-07-13T15:00:00+06:00', endTime: '2026-07-13T15:30:00+06:00', isBooked: true },
      { id: 'slot-4', specialistId: spec.id, startTime: '2026-07-14T09:00:00+06:00', endTime: '2026-07-14T09:30:00+06:00', isBooked: false }
    ]);
  };

  const fetchBookings = async () => {
    setBookingsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/bookings`);
      if (response.ok) {
        const data = await response.json();
        setRecentBookings(data);
      }
    } catch (e) {
      console.warn('Failed to fetch recent bookings:', e);
    } finally {
      setBookingsLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailability(selectedSpecialty);
  }, [selectedSpecialty]);

  useEffect(() => {
    fetchBookings();
  }, []);

  // Call duration timer
  useEffect(() => {
    let timer: any;
    if (callState === 'connected') {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [callState]);

  // Pulsing background animation
  useEffect(() => {
    if (callState === 'connected') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [callState]);

  // Voice Waveform simulation (updates bar heights randomly)
  useEffect(() => {
    let timer: any;
    if (callState === 'connected') {
      const runWave = () => {
        barHeights.forEach((anim) => {
          const nextVal = Math.floor(Math.random() * 45) + 12;
          Animated.timing(anim, {
            toValue: nextVal,
            duration: 150,
            useNativeDriver: false,
          }).start();
        });
      };
      timer = setInterval(runWave, 180);
    } else {
      barHeights.forEach((anim) => anim.setValue(12));
    }
    return () => clearInterval(timer);
  }, [callState]);

  // Simulated fallback call script (shows captions when no real LiveKit server is connected/running in dev)
  useEffect(() => {
    let t1: any, t2: any, t3: any, t4: any;
    if (callState === 'connected' && !liveKitRoom) {
      setCaption("Sristi: Assalamu Alaikum! Welcome to Voice Agents Beta. I am Sristi, your AI assistant. How can I help you book your appointment today?");
      
      t1 = setTimeout(() => {
        setCaption("Patient: Hi, I'd like to book an appointment with Dr. Tariqul Islam for neck pain.");
      }, 6000);

      t2 = setTimeout(() => {
        setCaption("Sristi: Neck pain is best handled by our Chiropractor, Dr. Tariqul. Let me check the next available slots. I see July 13th at 10:00 AM. Would that work for you?");
      }, 11000);

      t3 = setTimeout(() => {
        setCaption("Sristi: Awesome. I have booked your slot for July 13th at 10:00 AM. A confirmation text was sent to your phone! Anything else I can help with?");
        
        // Add a mock booking to the UI immediately
        const mockNewB: Booking = {
          id: `sim-${Date.now()}`,
          slotId: 'slot-c1',
          specialistId: 'chiro-1',
          patientName: 'Guest Caller (Simulated)',
          patientPhone: '+8801700000000',
          status: 'confirmed',
          createdAt: new Date().toISOString()
        };
        setRecentBookings((prev) => [mockNewB, ...prev]);
        setSlots(prev => prev.map(s => s.id === 'slot-c1' ? { ...s, isBooked: true } : s));
      }, 19000);

      t4 = setTimeout(() => {
        setCaption("Sristi: You're welcome! Have a great day and stay healthy. Bye!");
      }, 26000);
    } else if (callState === 'connecting') {
      setCaption('Dialing Sristy...');
    } else if (callState === 'ringing') {
      setCaption('Ringing...');
    } else {
      setCaption('');
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [callState, liveKitRoom]);

  const startCall = async () => {
    setCallState('fetching');
    setShowCallScreen(true);
    setCaption('Requesting token...');

    try {
      const response = await fetch(`${BACKEND_URL}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantName: 'Guest Caller' })
      });

      if (!response.ok) {
        throw new Error('Server token generation failed.');
      }

      const { token, url } = await response.json();

      if (!isLiveKitAvailable) {
        setCallState('connecting');
        setTimeout(() => setCallState('ringing'), 1000);
        setTimeout(() => setCallState('connected'), 2500);
        return;
      }

      try {
        await AudioSession.configureAudio({
          android: { 
            preferredOutputList: ['speaker'],
            audioTypeOptions: AndroidAudioTypePresets.communication
          },
          ios: { defaultOutput: 'speaker' },
        });
        await AudioSession.startAudioSession();
      } catch (err) {
        console.warn('AudioSession configuration skipped:', err);
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      setLiveKitRoom(room);

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log('LiveKit connection state:', state);
        if (state === ConnectionState.Connected) {
          setCallState('connected');
        } else if (state === ConnectionState.Connecting || state === ConnectionState.Reconnecting) {
          setCallState('connecting');
        } else if (state === ConnectionState.Disconnected) {
          setCallState('ended');
          setTimeout(() => {
            setShowCallScreen(false);
            setCallState('idle');
          }, 1500);
        }
      });

      setCallState('connecting');
      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);

    } catch (error: any) {
      console.warn('LiveKit connect failed, using fallback simulated call.', error);
      // fallback simulation
      setCallState('connecting');
      setTimeout(() => setCallState('ringing'), 1000);
      setTimeout(() => setCallState('connected'), 2500);
    }
  };

  const endCall = async () => {
    if (liveKitRoom) {
      try {
        await liveKitRoom.disconnect();
      } catch (err) {
        console.warn(err);
      }
      setLiveKitRoom(null);
    }
    setCallState('ended');
    fetchBookings();
    fetchAvailability(selectedSpecialty);
    setTimeout(() => {
      setShowCallScreen(false);
      setCallState('idle');
    }, 1500);
  };

  const toggleMute = async () => {
    if (liveKitRoom) {
      const nextMuted = !isMuted;
      await liveKitRoom.localParticipant.setMicrophoneEnabled(!nextMuted);
      setIsMuted(nextMuted);
    } else {
      setIsMuted(!isMuted);
    }
  };

  const toggleSpeaker = async () => {
    try {
      const nextSpeaker = !isSpeakerOn;
      await AudioSession.configureAudio({
        android: { 
          preferredOutputList: [nextSpeaker ? 'speaker' : 'earpiece'],
          audioTypeOptions: AndroidAudioTypePresets.communication
        },
        ios: { defaultOutput: nextSpeaker ? 'speaker' : 'earpiece' },
      });
      setIsSpeakerOn(nextSpeaker);
    } catch (e) {
      console.warn('Failed to switch audio output speaker:', e);
      setIsSpeakerOn(!isSpeakerOn);
    }
  };

  const formatDuration = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleBook = async () => {
    if (!selectedSlot) {
      Alert.alert('Selection Required', 'Please select an availability slot first.');
      return;
    }
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Missing Fields', 'Please enter both name and phone number.');
      return;
    }

    setBookingLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          patientName: name,
          patientPhone: phone,
          patientEmail: email || undefined
        })
      });

      const data: BookAppointmentResponse = await response.json();
      if (data.success) {
        Alert.alert('Booking Confirmed!', `Successfully booked with ${specialist?.name} at ${formatTime(selectedSlot.startTime)}.`);
        // Refresh slots
        fetchAvailability(selectedSpecialty);
        // Clear details
        setName('');
        setPhone('');
        setEmail('');
        setSelectedSlot(null);
      } else {
        Alert.alert('Booking Failed', data.error || 'The slot may have been taken.');
      }
    } catch (error) {
      // In-memory success fallback for local testing
      Alert.alert('Local Simulation', `Successfully booked ${name} with ${specialist?.name} at ${formatTime(selectedSlot.startTime)}.`);
      setSlots(slots.map(s => s.id === selectedSlot.id ? { ...s, isBooked: true } : s));
      setName('');
      setPhone('');
      setEmail('');
      setSelectedSlot(null);
    } finally {
      setBookingLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Voice Agents Beta</Text>
          <Text style={styles.subtitle}>Patient Portal & Scheduling</Text>
        </View>

        {/* Voice Agent Quick Actions Banner */}
        <View style={styles.voiceAgentBanner}>
          <View style={styles.voiceAgentDetails}>
            <Text style={styles.voiceBannerTitle}>Book via Voice Agent</Text>
            <Text style={styles.voiceBannerDesc}>
              Skip the forms! Talk directly with Sristy, our clinic AI receptionist, to look up specialists and schedule your appointment.
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.voiceCallButton}
            onPress={startCall}
            activeOpacity={0.85}
          >
            <Text style={styles.phoneIconEmoji}>📞</Text>
            <Text style={styles.voiceCallButtonText}>Call Sristy Now</Text>
          </TouchableOpacity>
        </View>

        {/* Specialty Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Specialty</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.specialtyScroll}>
            {SPECIALTIES.map((spec) => (
              <TouchableOpacity
                key={spec}
                style={[
                  styles.specialtyChip,
                  selectedSpecialty === spec && styles.specialtyChipActive
                ]}
                onPress={() => setSelectedSpecialty(spec)}
              >
                <Text style={[
                  styles.specialtyText,
                  selectedSpecialty === spec && styles.specialtyTextActive
                ]}>{spec}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Specialist Info Card */}
        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loadingText}>Fetching slots...</Text>
          </View>
        ) : (
          specialist && (
            <View style={styles.specialistCard}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>{specialist.name.split(' ').pop()?.[0]}</Text>
              </View>
              <View style={styles.specialistInfo}>
                <Text style={styles.specName}>{specialist.name}</Text>
                <Text style={styles.specRole}>{specialist.specialty}</Text>
                {specialist.bio && <Text style={styles.specBio}>{specialist.bio}</Text>}
              </View>
            </View>
          )
        )}

        {/* Slots Selector */}
        {!loading && specialist && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available Slots</Text>
            {slots.length === 0 ? (
              <Text style={styles.noSlotsText}>No availability slots found.</Text>
            ) : (
              <View style={styles.slotsContainer}>
                {slots.map((slot) => {
                  const isSlotSelected = selectedSlot?.id === slot.id;
                  return (
                    <TouchableOpacity
                      key={slot.id}
                      disabled={slot.isBooked}
                      style={[
                        styles.slotPill,
                        slot.isBooked && styles.slotBooked,
                        isSlotSelected && styles.slotSelected
                      ]}
                      onPress={() => setSelectedSlot(slot)}
                    >
                      <Text style={[
                        styles.slotText,
                        slot.isBooked && styles.slotTextBooked,
                        isSlotSelected && styles.slotTextSelected
                      ]}>
                        {formatTime(slot.startTime)}
                      </Text>
                      {slot.isBooked && <Text style={styles.bookedBadge}>Taken</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Booking Form */}
        {selectedSlot && (
          <View style={styles.bookingForm}>
            <Text style={styles.sectionTitle}>Book Appointment</Text>
            <Text style={styles.bookingSlotSummary}>
              Booking for: <Text style={styles.highlightText}>{formatTime(selectedSlot.startTime)}</Text>
            </Text>

            <TextInput
              placeholder="Patient Full Name"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={setName}
              style={styles.input}
            />

            <TextInput
              placeholder="Phone Number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              style={styles.input}
            />

            <TextInput
              placeholder="Email (Optional)"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />

            <TouchableOpacity 
              style={styles.bookButton}
              disabled={bookingLoading}
              onPress={handleBook}
            >
              {bookingLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.bookButtonText}>Confirm Appointment</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        {/* Recent Appointments Card */}
        <View style={styles.recentBookingsSection}>
          <Text style={styles.sectionTitle}>Recent Appointments</Text>
          {bookingsLoading ? (
            <ActivityIndicator size="small" color="#6366F1" style={{ marginVertical: 15 }} />
          ) : recentBookings.length === 0 ? (
            <View style={styles.noBookingsCard}>
              <Text style={styles.noBookingsText}>No appointments booked yet.</Text>
            </View>
          ) : (
            recentBookings.map((booking) => {
              const spec = SPECIALISTS_MAP[booking.specialistId] || { name: 'Specialist', specialty: 'Clinic Specialist' };
              return (
                <View key={booking.id} style={styles.bookingItemCard}>
                  <View style={styles.bookingItemHeader}>
                    <Text style={styles.bookingPatient}>{booking.patientName}</Text>
                    <Text style={[
                      styles.bookingStatus, 
                      booking.status === 'confirmed' ? styles.statusConfirmed : styles.statusCancelled
                    ]}>
                      {booking.status.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.bookingDetailsRow}>
                    <Text style={styles.bookingSpecLabel}>Specialist: </Text>
                    <Text style={styles.bookingSpecValue}>{spec.name} ({spec.specialty})</Text>
                  </View>
                  <Text style={styles.bookingTimeText}>
                    🕒 {booking.createdAt ? formatTime(booking.createdAt) : 'Scheduled'}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Voice Call Screen Modal */}
      <Modal
        visible={showCallScreen}
        animationType="slide"
        transparent={false}
        onRequestClose={endCall}
      >
        <SafeAreaView style={styles.callScreenContainer}>
          <StatusBar style="light" />
          
          {/* Header */}
          <View style={styles.callHeader}>
            <Text style={styles.callClinicName}>Voice Agents Beta</Text>
            <Text style={styles.callAgentSub}>Clinic AI Receptionist</Text>
          </View>

          {/* Sristy Profile / Visualizer */}
          <View style={styles.callVisualizerContainer}>
            {/* Pulsing visualizer circles */}
            {callState === 'connected' && (
              <Animated.View 
                style={[
                  styles.pulsingRing, 
                  { transform: [{ scale: pulseAnim }] }
                ]} 
              />
            )}
            
            <View style={styles.agentAvatarBig}>
              <Text style={styles.agentAvatarText}>S</Text>
            </View>
            
            <Text style={styles.agentNameCall}>Sristy</Text>
            <Text style={[
              styles.callStatusText,
              callState === 'connected' ? styles.callStatusConnected : 
              callState === 'failed' ? styles.callStatusFailed : styles.callStatusConnecting
            ]}>
              {callState === 'fetching' ? 'Requesting line...' :
               callState === 'connecting' ? 'Connecting...' :
               callState === 'ringing' ? 'Ringing Sristy...' :
               callState === 'connected' ? 'Active Call' :
               callState === 'ended' ? 'Call Ended' :
               callState === 'failed' ? 'Connection Failed' : 'Idle'}
            </Text>

            {/* Active timer */}
            {callState === 'connected' && (
              <Text style={styles.callTimerText}>{formatDuration(callDuration)}</Text>
            )}
          </View>

          {/* Captions Display Box (Shows real-time voice call script fallback) */}
          <View style={styles.captionsContainer}>
            <ScrollView 
              contentContainerStyle={styles.captionsScroll}
              ref={(ref) => ref?.scrollToEnd({ animated: true })}
            >
              {caption !== '' ? (
                <Text style={styles.captionText}>{caption}</Text>
              ) : (
                <Text style={styles.captionPlaceholder}>Sristy is ready. Speak now.</Text>
              )}
            </ScrollView>
          </View>

          {/* Simulated Speech Waveform Visualizer */}
          {callState === 'connected' && (
            <View style={styles.waveformContainer}>
              {barHeights.map((anim, idx) => (
                <Animated.View 
                  key={idx} 
                  style={[
                    styles.waveformBar, 
                    { height: anim }
                  ]} 
                />
              ))}
            </View>
          )}

          {/* Call Controls */}
          <View style={styles.callControlsContainer}>
            {/* Mute Button */}
            <TouchableOpacity 
              style={[styles.controlCircleBtn, isMuted && styles.controlBtnActive]}
              onPress={toggleMute}
            >
              <Text style={styles.controlBtnEmoji}>{isMuted ? '🎙️❌' : '🎙️'}</Text>
              <Text style={styles.controlBtnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>

            {/* End Call Button */}
            <TouchableOpacity 
              style={styles.hangupButton}
              onPress={endCall}
            >
              <Text style={styles.hangupEmoji}>🛑</Text>
              <Text style={styles.hangupText}>End Call</Text>
            </TouchableOpacity>

            {/* Speaker Button */}
            <TouchableOpacity 
              style={[styles.controlCircleBtn, isSpeakerOn && styles.controlBtnActive]}
              onPress={toggleSpeaker}
            >
              <Text style={styles.controlBtnEmoji}>🔊</Text>
              <Text style={styles.controlBtnLabel}>Speaker</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 25,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#818CF8',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 12,
  },
  specialtyScroll: {
    flexDirection: 'row',
  },
  specialtyChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  specialtyChipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
  },
  specialtyText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  specialtyTextActive: {
    color: '#FFFFFF',
  },
  loaderContainer: {
    padding: 30,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 10,
  },
  specialistCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#312E81',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  avatarText: {
    color: '#E0E7FF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  specialistInfo: {
    flex: 1,
  },
  specName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  specRole: {
    fontSize: 13,
    color: '#818CF8',
    marginTop: 2,
    fontWeight: '500',
  },
  specBio: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
    lineHeight: 18,
  },
  slotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  slotPill: {
    flexBasis: '47%',
    margin: '1.5%',
    padding: 14,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    position: 'relative',
  },
  slotSelected: {
    backgroundColor: '#312E81',
    borderColor: '#6366F1',
  },
  slotBooked: {
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
    opacity: 0.5,
  },
  slotText: {
    color: '#34D399',
    fontWeight: '600',
    fontSize: 13,
  },
  slotTextSelected: {
    color: '#FFFFFF',
  },
  slotTextBooked: {
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  bookedBadge: {
    fontSize: 9,
    color: '#EF4444',
    position: 'absolute',
    bottom: 4,
    fontWeight: '700',
  },
  noSlotsText: {
    color: '#64748B',
    fontSize: 14,
    fontStyle: 'italic',
  },
  bookingForm: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bookingSlotSummary: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 16,
  },
  highlightText: {
    color: '#818CF8',
    fontWeight: 'bold',
  },
  input: {
    height: 50,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 16,
    color: '#F8FAFC',
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bookButton: {
    height: 50,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  // Voice Agent Banner Styles
  voiceAgentBanner: {
    backgroundColor: '#1E1B4B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#4338CA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceAgentDetails: {
    flex: 1,
    marginRight: 12,
  },
  voiceBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  voiceBannerDesc: {
    fontSize: 12,
    color: '#C7D2FE',
    lineHeight: 16,
  },
  voiceCallButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  voiceCallButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 6,
  },
  phoneIconEmoji: {
    fontSize: 14,
  },

  // Call Screen Styles
  callScreenContainer: {
    flex: 1,
    backgroundColor: '#070A13',
    justifyContent: 'space-between',
    padding: 24,
  },
  callHeader: {
    alignItems: 'center',
    marginTop: 20,
  },
  callClinicName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  callAgentSub: {
    fontSize: 12,
    color: '#6366F1',
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  callVisualizerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 40,
    position: 'relative',
  },
  pulsingRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: '#4F46E5',
    backgroundColor: 'rgba(79, 70, 229, 0.15)',
  },
  agentAvatarBig: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  agentAvatarText: {
    color: '#F8FAFC',
    fontSize: 48,
    fontWeight: 'bold',
  },
  agentNameCall: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 20,
  },
  callStatusText: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  callStatusConnecting: {
    color: '#94A3B8',
  },
  callStatusConnected: {
    color: '#10B981',
  },
  callStatusFailed: {
    color: '#EF4444',
  },
  callTimerText: {
    fontSize: 18,
    color: '#F8FAFC',
    fontFamily: 'Courier',
    marginTop: 12,
    fontWeight: '700',
  },

  // Captions Display Styles
  captionsContainer: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 16,
    padding: 16,
    height: 120,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 20,
  },
  captionsScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  captionText: {
    color: '#E2E8F0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  captionPlaceholder: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Waveform Bar Styles
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    marginBottom: 20,
  },
  waveformBar: {
    width: 4,
    backgroundColor: '#6366F1',
    marginHorizontal: 3,
    borderRadius: 2,
  },

  // Call Controls Styles
  callControlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  controlCircleBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  controlBtnActive: {
    backgroundColor: '#312E81',
    borderColor: '#6366F1',
  },
  controlBtnEmoji: {
    fontSize: 18,
  },
  controlBtnLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
    position: 'absolute',
    bottom: -18,
    fontWeight: '500',
  },
  hangupButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  hangupEmoji: {
    fontSize: 24,
  },
  hangupText: {
    fontSize: 10,
    color: '#FCA5A5',
    marginTop: 2,
    position: 'absolute',
    bottom: -18,
    fontWeight: 'bold',
  },

  // Recent Bookings Styles
  recentBookingsSection: {
    marginTop: 24,
    marginBottom: 16,
  },
  noBookingsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  noBookingsText: {
    color: '#64748B',
    fontSize: 13,
    fontStyle: 'italic',
  },
  bookingItemCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bookingItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookingPatient: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  bookingStatus: {
    fontSize: 9,
    fontWeight: 'bold',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  statusConfirmed: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#34D399',
  },
  statusCancelled: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#FCA5A5',
  },
  bookingDetailsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bookingSpecLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  bookingSpecValue: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '500',
  },
  bookingTimeText: {
    color: '#818CF8',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
});
