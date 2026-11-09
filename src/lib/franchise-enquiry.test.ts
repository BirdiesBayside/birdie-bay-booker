import { test } from "node:test";
import assert from "node:assert/strict";
import { franchiseEnquirySchema, investmentBudgets, franchiseRecipient } from "../../supabase/functions/_shared/franchise-enquiry";

const enquiry = { name: "Test Owner", email: "owner@example.com", phone: "0400000000", region: "QLD", location: "Brisbane", budget: "$250k – $300k" };
test("accepts precisely the four requested investment ranges", () => {
  assert.deepEqual(investmentBudgets, ["$250k – $300k", "$300k - $500k", "$500k - $1M", "Over $1M"]);
  for (const budget of investmentBudgets) assert.equal(franchiseEnquirySchema.safeParse({ ...enquiry, budget }).success, true);
  assert.equal(franchiseEnquirySchema.safeParse({ ...enquiry, budget: "$100k" }).success, false);
});
test("requires all six enquiry fields", () => {
  for (const field of Object.keys(enquiry)) assert.equal(franchiseEnquirySchema.safeParse({ ...enquiry, [field]: "" }).success, false);
});
test("notifications go to the requested franchise inbox", () => {
  assert.equal(franchiseRecipient, "franchising@birdiesbayside.com.au");
});