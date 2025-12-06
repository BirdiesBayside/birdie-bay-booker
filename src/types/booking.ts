// Core types for the Birdies booking platform

export type MembershipTier = 'visitor' | 'par' | 'birdie' | 'eagle' | 'albatross';

export interface MembershipPricing {
  tier: MembershipTier;
  name: string;
  weeklyFee: number;
  hourlyRate: number;
  description: string;
  features: string[];
}

export const MEMBERSHIP_TIERS: Record<MembershipTier, MembershipPricing> = {
  visitor: {
    tier: 'visitor',
    name: 'Visitor',
    weeklyFee: 0,
    hourlyRate: 15,
    description: 'Pay as you play',
    features: ['No commitment', 'Standard pricing', 'Book up to 1 week ahead'],
  },
  par: {
    tier: 'par',
    name: 'Par Member',
    weeklyFee: 15,
    hourlyRate: 12,
    description: 'Great value for casual players',
    features: ['$12/hr rate', 'Book 2 weeks ahead', 'Member events access'],
  },
  birdie: {
    tier: 'birdie',
    name: 'Birdie Member',
    weeklyFee: 20,
    hourlyRate: 10,
    description: 'Perfect for regular players',
    features: ['$10/hr rate', 'Book 3 weeks ahead', 'Priority booking', '10% pro shop discount'],
  },
  eagle: {
    tier: 'eagle',
    name: 'Eagle Member',
    weeklyFee: 25,
    hourlyRate: 9,
    description: 'For the dedicated golfer',
    features: ['$9/hr rate', 'Book 4 weeks ahead', 'Priority booking', '15% pro shop discount', 'Guest passes'],
  },
  albatross: {
    tier: 'albatross',
    name: 'Albatross Member',
    weeklyFee: 35,
    hourlyRate: 8,
    description: 'Ultimate golfing experience',
    features: ['$8/hr rate', 'Book 6 weeks ahead', 'VIP priority', '20% pro shop discount', 'Unlimited guest passes', 'Exclusive events'],
  },
};

export interface Bay {
  id: string;
  number: number;
  name: string;
  locationId: string;
  isActive: boolean;
}

export interface Location {
  id: string;
  name: string;
  slug: string;
  address: string;
  timezone: string;
  isActive: boolean;
}

export interface TimeSlot {
  time: string; // HH:MM format
  isAvailable: boolean;
  price?: number;
}

export interface Booking {
  id: string;
  bayId: string;
  customerId: string;
  locationId: string;
  startTime: Date;
  endTime: Date;
  duration: number; // in hours
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: Date;
}

export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  membershipTier: MembershipTier;
  locationId: string; // Primary location
  createdAt: Date;
}

// Booking grid configuration
export const BOOKING_CONFIG = {
  slotDuration: 30, // minutes
  minBookingDuration: 60, // 1 hour minimum
  maxBookingDuration: 240, // 4 hours maximum
  bookingIncrements: [1, 2, 3, 4], // hours
  openingHour: 8, // 8 AM
  closingHour: 22, // 10 PM
  totalBays: 6,
} as const;