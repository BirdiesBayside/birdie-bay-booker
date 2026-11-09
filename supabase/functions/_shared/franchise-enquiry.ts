import { z } from "zod";

export const investmentBudgets = ["$250k – $300k", "$300k - $500k", "$500k - $1M", "Over $1M"] as const;
export const franchiseEnquirySchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(30).regex(/^[+\d\s().-]+$/, "Enter a valid phone number"),
  region: z.string().trim().min(1, "Enter your state or region").max(100),
  location: z.string().trim().min(1, "Enter your desired location").max(200),
  budget: z.enum(investmentBudgets),
});

export const franchiseRecipient = "franchising@birdiesbayside.com.au";